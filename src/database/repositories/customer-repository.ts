import { type SQLiteDatabase } from 'expo-sqlite';
import {
  type Customer,
  type CreditTransaction,
  type CreditTransactionItem,
  type CustomerPayment,
} from '@/types/database';

export interface CustomerFilter {
  search?: string;
  hasBalanceOnly?: boolean;
  sortBy?: 'name' | 'balance' | 'recent';
}

export interface CreditItemInput {
  productId: number;
  quantity: number;
}

export interface RecordCreditTransactionInput {
  customerId: number;
  items: CreditItemInput[];
  notes?: string;
  transactionDate?: string;
}

export interface RecordPaymentInput {
  customerId: number;
  amount: number; // in centavos
  paymentMethod?: string;
  notes?: string;
  paymentDate?: string;
}

export const CustomerRepository = {
  /**
   * Retrieves all customers with optional search and filters.
   */
  async getAll(db: SQLiteDatabase, filter: CustomerFilter = {}): Promise<Customer[]> {
    const params: (string | number)[] = [];
    const conditions: string[] = ['is_active = 1'];

    if (filter.search && filter.search.trim()) {
      conditions.push('(name LIKE ? OR contact_number LIKE ?)');
      const searchParam = `%${filter.search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    if (filter.hasBalanceOnly) {
      conditions.push('outstanding_balance > 0');
    }

    let orderBy = 'outstanding_balance DESC, updated_at DESC';
    if (filter.sortBy === 'name') {
      orderBy = 'name ASC';
    } else if (filter.sortBy === 'recent') {
      orderBy = 'last_transaction_date DESC, updated_at DESC';
    } else if (filter.sortBy === 'balance') {
      orderBy = 'outstanding_balance DESC';
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT c.*,
        (
          SELECT GROUP_CONCAT(ci.quantity || 'x ' || ci.product_name_snapshot, ' • ')
          FROM credit_transaction_items ci
          JOIN credit_transactions ct ON ci.credit_transaction_id = ct.id
          WHERE ct.customer_id = c.id
          ORDER BY ci.id DESC
          LIMIT 4
        ) as recent_items
      FROM customers c
      ${whereClause}
      ORDER BY ${orderBy};
    `;

    return await db.getAllAsync<Customer>(query, params);
  },

  /**
   * Retrieves a customer by their ID.
   */
  async getById(db: SQLiteDatabase, id: number): Promise<Customer | null> {
    const row = await db.getFirstAsync<Customer>(
      `SELECT * FROM customers WHERE id = ?;`,
      [id]
    );
    return row ?? null;
  },

  /**
   * Retrieves a customer by exact name (case-insensitive).
   */
  async getByName(db: SQLiteDatabase, name: string): Promise<Customer | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const row = await db.getFirstAsync<Customer>(
      `SELECT * FROM customers WHERE name = ? COLLATE NOCASE;`,
      [trimmed]
    );
    return row ?? null;
  },

  /**
   * Gets existing customer by name or creates a new customer record.
   * Prevents creating duplicate records for the same person.
   */
  async createOrGet(
    db: SQLiteDatabase,
    name: string,
    contactNumber?: string,
    notes?: string
  ): Promise<Customer> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Customer name cannot be empty.');
    }

    // Check if customer already exists
    const existing = await this.getByName(db, trimmedName);
    if (existing) {
      // If contact or notes provided, update them if currently blank
      if ((contactNumber && !existing.contact_number) || (notes && !existing.notes)) {
        const now = new Date().toISOString();
        await db.runAsync(
          `UPDATE customers 
           SET contact_number = COALESCE(?, contact_number),
               notes = COALESCE(?, notes),
               updated_at = ?
           WHERE id = ?;`,
          [contactNumber?.trim() || null, notes?.trim() || null, now, existing.id]
        );
        return (await this.getById(db, existing.id))!;
      }
      return existing;
    }

    // Create new customer
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `INSERT INTO customers (
         name, contact_number, notes, total_credit_amount, total_paid_amount,
         outstanding_balance, transaction_count, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, 0, 0, 0, 0, 1, ?, ?);`,
      [trimmedName, contactNumber?.trim() || null, notes?.trim() || null, now, now]
    );

    const created = await this.getById(db, result.lastInsertRowId);
    if (!created) {
      throw new Error('Failed to retrieve newly created customer.');
    }
    return created;
  },

  /**
   * Records a new credit/utang borrowing transaction atomically:
   * 1. Validates available stock for each product.
   * 2. Deducts borrowed quantities from product inventory.
   * 3. Creates stock movement logs.
   * 4. Saves credit transaction and line items snapshots.
   * 5. Updates customer outstanding balance and transaction count.
   */
  async recordCreditTransaction(
    db: SQLiteDatabase,
    input: RecordCreditTransactionInput
  ): Promise<{ transaction: CreditTransaction; customer: Customer }> {
    const { customerId, items, notes } = input;
    const transactionDate = input.transactionDate || new Date().toISOString();

    if (!items || items.length === 0) {
      throw new Error('Credit transaction must contain at least one product item.');
    }

    let createdTxId = 0;
    let txNumber = '';

    await db.withTransactionAsync(async () => {
      // 1. Fetch customer
      const customer = await db.getFirstAsync<Customer>(
        `SELECT * FROM customers WHERE id = ?;`,
        [customerId]
      );
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found.`);
      }

      // 2. Validate products and stock availability
      type ItemSnapshot = {
        productId: number;
        productName: string;
        barcode: string | null;
        quantity: number;
        unitCost: number;
        unitPrice: number;
        subtotal: number;
        currentStock: number;
      };

      const preparedItems: ItemSnapshot[] = [];
      let grandTotal = 0;

      for (const item of items) {
        if (item.quantity <= 0) {
          throw new Error('Item quantity must be greater than zero.');
        }

        const product = await db.getFirstAsync<{
          id: number;
          name: string;
          barcode: string | null;
          cost_price: number;
          selling_price: number;
          stock_quantity: number;
        }>(
          `SELECT id, name, barcode, cost_price, selling_price, stock_quantity FROM products WHERE id = ?;`,
          [item.productId]
        );

        if (!product) {
          throw new Error(`Product ID ${item.productId} does not exist.`);
        }

        if (product.stock_quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, Requested: ${item.quantity}.`
          );
        }

        const subtotal = Math.round(item.quantity * product.selling_price);
        grandTotal += subtotal;

        preparedItems.push({
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          quantity: item.quantity,
          unitCost: product.cost_price,
          unitPrice: product.selling_price,
          subtotal,
          currentStock: product.stock_quantity,
        });
      }

      // 3. Generate transaction number (e.g. CR-20261018-1234)
      const datePart = transactionDate.slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      txNumber = `CR-${datePart}-${randomSuffix}`;

      // 4. Insert credit transaction
      const txResult = await db.runAsync(
        `INSERT INTO credit_transactions (
           customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at
         ) VALUES (?, ?, ?, ?, ?, 'active', ?);`,
        [customerId, txNumber, transactionDate, grandTotal, notes?.trim() || null, transactionDate]
      );
      createdTxId = txResult.lastInsertRowId;

      // 5. Insert items, deduct inventory, and record stock movements
      for (const pItem of preparedItems) {
        await db.runAsync(
          `INSERT INTO credit_transaction_items (
             credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot,
             quantity, unit_cost_snapshot, unit_price_snapshot, subtotal
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            createdTxId,
            pItem.productId,
            pItem.productName,
            pItem.barcode,
            pItem.quantity,
            pItem.unitCost,
            pItem.unitPrice,
            pItem.subtotal,
          ]
        );

        const newStock = pItem.currentStock - pItem.quantity;

        // Deduct inventory
        await db.runAsync(
          `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?;`,
          [newStock, transactionDate, pItem.productId]
        );

        // Record stock movement
        await db.runAsync(
          `INSERT INTO stock_movements (
             product_id, movement_type, quantity, previous_quantity, new_quantity,
             reason, reference_type, reference_id, created_at
           ) VALUES (?, 'credit_sale', ?, ?, ?, ?, 'credit_transaction', ?, ?);`,
          [
            pItem.productId,
            -pItem.quantity,
            pItem.currentStock,
            newStock,
            `Utang / credit borrowed by ${customer.name}`,
            createdTxId.toString(),
            transactionDate,
          ]
        );
      }

      // 6. Update customer balance and transaction count
      await db.runAsync(
        `UPDATE customers
         SET total_credit_amount = total_credit_amount + ?,
             outstanding_balance = outstanding_balance + ?,
             transaction_count = transaction_count + 1,
             last_transaction_date = ?,
             updated_at = ?
         WHERE id = ?;`,
        [grandTotal, grandTotal, transactionDate, transactionDate, customerId]
      );
    });

    const transaction = await db.getFirstAsync<CreditTransaction>(
      `SELECT * FROM credit_transactions WHERE id = ?;`,
      [createdTxId]
    );
    const updatedCustomer = (await this.getById(db, customerId))!;

    return {
      transaction: transaction!,
      customer: updatedCustomer,
    };
  },

  /**
   * Records a customer repayment atomically:
   * 1. Validates amount is positive and does not exceed outstanding balance.
   * 2. Inserts customer payment record.
   * 3. Deducts amount from customer outstanding balance.
   * 4. Updates total_paid_amount and last_transaction_date.
   * Does NOT touch product inventory or duplicate sales.
   */
  async recordPayment(
    db: SQLiteDatabase,
    input: RecordPaymentInput
  ): Promise<{ payment: CustomerPayment; customer: Customer }> {
    const { customerId, amount, paymentMethod = 'cash', notes } = input;
    const paymentDate = input.paymentDate || new Date().toISOString();

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    let paymentId = 0;

    await db.withTransactionAsync(async () => {
      const customer = await db.getFirstAsync<Customer>(
        `SELECT * FROM customers WHERE id = ?;`,
        [customerId]
      );
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found.`);
      }

      if (amount > customer.outstanding_balance) {
        const maxCentavos = customer.outstanding_balance;
        const maxPeso = (maxCentavos / 100).toFixed(2);
        throw new Error(
          `Payment amount (₱${(amount / 100).toFixed(2)}) cannot exceed outstanding balance of ₱${maxPeso}.`
        );
      }

      const datePart = paymentDate.slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const paymentNumber = `PAY-${datePart}-${randomSuffix}`;

      const res = await db.runAsync(
        `INSERT INTO customer_payments (
           customer_id, payment_number, amount, payment_date, payment_method, notes, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [customerId, paymentNumber, amount, paymentDate, paymentMethod, notes?.trim() || null, paymentDate]
      );
      paymentId = res.lastInsertRowId;

      await db.runAsync(
        `UPDATE customers
         SET total_paid_amount = total_paid_amount + ?,
             outstanding_balance = outstanding_balance - ?,
             last_transaction_date = ?,
             updated_at = ?
         WHERE id = ?;`,
        [amount, amount, paymentDate, paymentDate, customerId]
      );
    });

    const payment = await db.getFirstAsync<CustomerPayment>(
      `SELECT * FROM customer_payments WHERE id = ?;`,
      [paymentId]
    );
    const updatedCustomer = (await this.getById(db, customerId))!;

    return {
      payment: payment!,
      customer: updatedCustomer,
    };
  },

  /**
   * Retrieves all credit transactions for a customer along with line items.
   */
  async getCustomerTransactions(
    db: SQLiteDatabase,
    customerId: number
  ): Promise<CreditTransaction[]> {
    const transactions = await db.getAllAsync<CreditTransaction>(
      `SELECT * FROM credit_transactions WHERE customer_id = ? ORDER BY transaction_date DESC;`,
      [customerId]
    );

    for (const tx of transactions) {
      const items = await db.getAllAsync<CreditTransactionItem>(
        `SELECT * FROM credit_transaction_items WHERE credit_transaction_id = ? ORDER BY id ASC;`,
        [tx.id]
      );
      tx.items = items;
    }

    return transactions;
  },

  /**
   * Retrieves all payment records for a customer.
   */
  async getCustomerPayments(
    db: SQLiteDatabase,
    customerId: number
  ): Promise<CustomerPayment[]> {
    return await db.getAllAsync<CustomerPayment>(
      `SELECT * FROM customer_payments WHERE customer_id = ? ORDER BY payment_date DESC;`,
      [customerId]
    );
  },
};
