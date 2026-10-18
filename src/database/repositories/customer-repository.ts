import { supabase } from '@/lib/supabase';
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
  async getAll(arg1?: any, arg2?: CustomerFilter): Promise<Customer[]> {
    const filter: CustomerFilter = (arg2 || (arg1 && typeof arg1 === 'object' && !arg1.getAllAsync ? arg1 : {})) || {};

    let query = supabase.from('customers').select('*').eq('is_active', 1);

    if (filter.hasBalanceOnly) {
      query = query.gt('outstanding_balance', 0);
    }

    if (filter.search && filter.search.trim()) {
      const searchParam = filter.search.trim();
      query = query.or(`name.ilike.%${searchParam}%,contact_number.ilike.%${searchParam}%`);
    }

    if (filter.sortBy === 'name') {
      query = query.order('name', { ascending: true });
    } else if (filter.sortBy === 'recent') {
      query = query.order('last_transaction_date', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('outstanding_balance', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] Error getting customers:', error);
      throw error;
    }

    return (data as Customer[]) || [];
  },

  /**
   * Retrieves a customer by their ID.
   */
  async getById(arg1: any, arg2?: number): Promise<Customer | null> {
    const id = typeof arg1 === 'number' ? arg1 : arg2!;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Error getting customer by id:', error);
      throw error;
    }
    return data;
  },

  /**
   * Retrieves a customer by exact name (case-insensitive).
   */
  async getByName(arg1: any, arg2?: string): Promise<Customer | null> {
    const name = (typeof arg1 === 'string' ? arg1 : arg2 || '').trim();
    if (!name) return null;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .ilike('name', name)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Error getting customer by name:', error);
      throw error;
    }
    return data;
  },

  /**
   * Gets existing customer by name or creates a new customer record.
   * Prevents creating duplicate records for the same person.
   */
  async createOrGet(
    arg1: any,
    arg2?: string,
    arg3?: string,
    arg4?: string
  ): Promise<Customer> {
    let name: string;
    let contactNumber: string | undefined;
    let notes: string | undefined;

    if (typeof arg1 === 'string') {
      name = arg1;
      contactNumber = arg2;
      notes = arg3;
    } else {
      name = arg2!;
      contactNumber = arg3;
      notes = arg4;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Customer name cannot be empty.');
    }

    const existing = await this.getByName(trimmedName);
    if (existing) {
      if ((contactNumber && !existing.contact_number) || (notes && !existing.notes)) {
        const now = new Date().toISOString();
        const { data: updated } = await supabase
          .from('customers')
          .update({
            contact_number: contactNumber?.trim() || existing.contact_number,
            notes: notes?.trim() || existing.notes,
            updated_at: now,
          })
          .eq('id', existing.id)
          .select()
          .single();

        return updated || existing;
      }
      return existing;
    }

    const now = new Date().toISOString();
    const { data: created, error } = await supabase
      .from('customers')
      .insert({
        name: trimmedName,
        contact_number: contactNumber?.trim() || null,
        notes: notes?.trim() || null,
        total_credit_amount: 0,
        total_paid_amount: 0,
        outstanding_balance: 0,
        transaction_count: 0,
        is_active: 1,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !created) {
      console.error('[Supabase] Failed to create customer:', error);
      throw error || new Error('Failed to create customer');
    }

    return created;
  },

  /**
   * Records a new credit/utang borrowing transaction:
   * 1. Validates available stock for each product.
   * 2. Deducts borrowed quantities from product inventory.
   * 3. Creates stock movement logs.
   * 4. Saves credit transaction and line items snapshots.
   * 5. Updates customer outstanding balance and transaction count.
   */
  async recordCreditTransaction(
    arg1: any,
    arg2?: RecordCreditTransactionInput
  ): Promise<{ transaction: CreditTransaction; customer: Customer }> {
    const input: RecordCreditTransactionInput = arg2 ? arg2 : arg1;
    const { customerId, items, notes } = input;
    const transactionDate = input.transactionDate || new Date().toISOString();

    if (!items || items.length === 0) {
      throw new Error('Credit transaction must contain at least one product item.');
    }

    const customer = await this.getById(customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }

    const productIds = items.map((it) => it.productId);
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, barcode, cost_price, selling_price, stock_quantity')
      .in('id', productIds);

    if (prodErr || !products) {
      throw new Error(`Failed to load products: ${prodErr?.message}`);
    }

    const productMap = new Map<number, (typeof products)[0]>();
    for (const p of products) productMap.set(p.id, p);

    let grandTotal = 0;
    const preparedItems = [];

    for (const it of items) {
      if (it.quantity <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }
      const p = productMap.get(it.productId);
      if (!p) {
        throw new Error(`Product ID ${it.productId} not found.`);
      }
      if (p.stock_quantity < it.quantity) {
        throw new Error(
          `Insufficient stock for "${p.name}". Available: ${p.stock_quantity}, Requested: ${it.quantity}.`
        );
      }
      const subtotal = Math.round(it.quantity * p.selling_price);
      grandTotal += subtotal;

      preparedItems.push({
        productId: p.id,
        name: p.name,
        barcode: p.barcode,
        quantity: it.quantity,
        costPrice: p.cost_price,
        sellingPrice: p.selling_price,
        subtotal,
        currentStock: p.stock_quantity,
        newStock: p.stock_quantity - it.quantity,
      });
    }

    const datePart = transactionDate.slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const txNumber = `CR-${datePart}-${randomSuffix}`;

    // Insert credit transaction
    const { data: tx, error: txErr } = await supabase
      .from('credit_transactions')
      .insert({
        customer_id: customerId,
        transaction_number: txNumber,
        transaction_date: transactionDate,
        total_amount: grandTotal,
        notes: notes?.trim() || null,
        status: 'active',
        created_at: transactionDate,
      })
      .select()
      .single();

    if (txErr || !tx) {
      throw txErr || new Error('Failed to record credit transaction.');
    }

    // Insert line items
    const itemsToInsert = preparedItems.map((item) => ({
      credit_transaction_id: tx.id,
      product_id: item.productId,
      product_name_snapshot: item.name,
      barcode_snapshot: item.barcode,
      quantity: item.quantity,
      unit_cost_snapshot: item.costPrice,
      unit_price_snapshot: item.sellingPrice,
      subtotal: item.subtotal,
    }));
    await supabase.from('credit_transaction_items').insert(itemsToInsert);

    // Deduct stock and log movements
    const movements = [];
    for (const item of preparedItems) {
      await supabase
        .from('products')
        .update({
          stock_quantity: item.newStock,
          updated_at: transactionDate,
        })
        .eq('id', item.productId);

      movements.push({
        product_id: item.productId,
        movement_type: 'sale',
        quantity: -item.quantity,
        previous_quantity: item.currentStock,
        new_quantity: item.newStock,
        reason: `Utang / Credit borrowed by ${customer.name} (Ref: ${txNumber})`,
        reference_type: 'sale',
        reference_id: String(tx.id),
        created_at: transactionDate,
      });
    }
    if (movements.length > 0) {
      await supabase.from('stock_movements').insert(movements);
    }

    // Update customer balance
    const { data: updatedCustomer, error: custUpdateErr } = await supabase
      .from('customers')
      .update({
        total_credit_amount: customer.total_credit_amount + grandTotal,
        outstanding_balance: customer.outstanding_balance + grandTotal,
        transaction_count: customer.transaction_count + 1,
        last_transaction_date: transactionDate,
        updated_at: transactionDate,
      })
      .eq('id', customerId)
      .select()
      .single();

    if (custUpdateErr) {
      console.error('[Supabase] Error updating customer balance:', custUpdateErr);
    }

    return {
      transaction: tx as CreditTransaction,
      customer: (updatedCustomer as Customer) || customer,
    };
  },

  /**
   * Records a customer repayment.
   */
  async recordPayment(
    arg1: any,
    arg2?: RecordPaymentInput
  ): Promise<{ payment: CustomerPayment; customer: Customer }> {
    const input: RecordPaymentInput = arg2 ? arg2 : arg1;
    const { customerId, amount, paymentMethod = 'cash', notes } = input;
    const paymentDate = input.paymentDate || new Date().toISOString();

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const customer = await this.getById(customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }

    if (amount > customer.outstanding_balance) {
      const maxPeso = (customer.outstanding_balance / 100).toFixed(2);
      throw new Error(
        `Payment amount (₱${(amount / 100).toFixed(2)}) cannot exceed outstanding balance of ₱${maxPeso}.`
      );
    }

    const datePart = paymentDate.slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentNumber = `PAY-${datePart}-${randomSuffix}`;

    const { data: payment, error: payErr } = await supabase
      .from('customer_payments')
      .insert({
        customer_id: customerId,
        payment_number: paymentNumber,
        amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: notes?.trim() || null,
        created_at: paymentDate,
      })
      .select()
      .single();

    if (payErr || !payment) {
      throw payErr || new Error('Failed to record payment');
    }

    const newBalance = Math.max(0, customer.outstanding_balance - amount);
    const { data: updatedCustomer, error: updateErr } = await supabase
      .from('customers')
      .update({
        total_paid_amount: customer.total_paid_amount + amount,
        outstanding_balance: newBalance,
        last_transaction_date: paymentDate,
        updated_at: paymentDate,
      })
      .eq('id', customerId)
      .select()
      .single();

    if (updateErr) {
      console.error('[Supabase] Error updating customer payment totals:', updateErr);
    }

    return {
      payment: payment as CustomerPayment,
      customer: (updatedCustomer as Customer) || customer,
    };
  },

  /**
   * Retrieves all credit transactions for a customer along with line items.
   */
  async getCustomerTransactions(
    arg1: any,
    arg2?: number
  ): Promise<CreditTransaction[]> {
    const customerId = typeof arg1 === 'number' ? arg1 : arg2!;

    const { data: txs, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('[Supabase] Error getting customer transactions:', error);
      throw error;
    }

    const transactions = (txs as CreditTransaction[]) || [];

    for (const tx of transactions) {
      const { data: items } = await supabase
        .from('credit_transaction_items')
        .select('*')
        .eq('credit_transaction_id', tx.id)
        .order('id', { ascending: true });

      tx.items = (items as CreditTransactionItem[]) || [];
    }

    return transactions;
  },

  /**
   * Retrieves all payment records for a customer.
   */
  async getCustomerPayments(
    arg1: any,
    arg2?: number
  ): Promise<CustomerPayment[]> {
    const customerId = typeof arg1 === 'number' ? arg1 : arg2!;

    const { data, error } = await supabase
      .from('customer_payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('[Supabase] Error getting customer payments:', error);
      throw error;
    }

    return (data as CustomerPayment[]) || [];
  },
};
