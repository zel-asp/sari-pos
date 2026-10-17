import { type SQLiteDatabase } from 'expo-sqlite';
import { type Sale, type SaleItem, type PaymentMethod } from '@/types/database';

export interface CreateSaleItemInput {
  productId: number;
  quantity: number;
}

export interface CreateSaleInput {
  items: CreateSaleItemInput[];
  amountTendered: number; // Integer in centavos
  paymentMethod?: PaymentMethod;
  notes?: string;
  transactionDate?: string; // Optional ISO string, defaults to now
}

export interface CreateSaleResult {
  saleId: number;
  receiptNumber: string;
  totalAmount: number; // Centavos
  amountTendered: number; // Centavos
  changeAmount: number; // Centavos
  itemsCount: number;
  transactionDate: string;
}

export const SaleRepository = {
  /**
   * Atomically records a cash or digital sale, deducts product stock,
   * creates sale items snapshots, and logs stock movements.
   */
  async createSale(db: SQLiteDatabase, input: CreateSaleInput): Promise<CreateSaleResult> {
    const {
      items,
      amountTendered,
      paymentMethod = 'cash',
      notes,
      transactionDate = new Date().toISOString(),
    } = input;

    if (!items || items.length === 0) {
      throw new Error('Sale must contain at least one item.');
    }

    let createdSaleId = 0;
    let receiptNumber = '';
    let grandTotal = 0;
    let changeAmount = 0;

    await db.withTransactionAsync(async () => {
      // 1. Validate items and verify available stock
      type ItemPreparation = {
        productId: number;
        name: string;
        barcode: string | null;
        quantity: number;
        costPrice: number;
        sellingPrice: number;
        subtotal: number;
        previousStock: number;
        newStock: number;
      };

      const preparedItems: ItemPreparation[] = [];

      for (const it of items) {
        if (it.quantity <= 0) {
          throw new Error('Quantity must be greater than zero.');
        }

        const product = await db.getFirstAsync<{
          id: number;
          name: string;
          barcode: string | null;
          cost_price: number;
          selling_price: number;
          stock_quantity: number;
        }>(
          `SELECT id, name, barcode, cost_price, selling_price, stock_quantity 
           FROM products WHERE id = ?;`,
          [it.productId]
        );

        if (!product) {
          throw new Error(`Product with ID ${it.productId} not found.`);
        }

        if (product.stock_quantity < it.quantity) {
          throw new Error(
            `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, Requested: ${it.quantity}.`
          );
        }

        const subtotal = Math.round(it.quantity * product.selling_price);
        grandTotal += subtotal;

        preparedItems.push({
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          quantity: it.quantity,
          costPrice: product.cost_price,
          sellingPrice: product.selling_price,
          subtotal,
          previousStock: product.stock_quantity,
          newStock: product.stock_quantity - it.quantity,
        });
      }

      if (amountTendered < grandTotal) {
        throw new Error(
          `Amount tendered (${amountTendered}) cannot be less than the total sale (${grandTotal}).`
        );
      }

      changeAmount = amountTendered - grandTotal;

      // 2. Generate receipt number (e.g. RCP-20261018-8421)
      const datePart = transactionDate.slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      receiptNumber = `RCP-${datePart}-${randomSuffix}`;

      // 3. Insert sale header
      const saleResult = await db.runAsync(
        `INSERT INTO sales (
          receipt_number,
          transaction_date,
          subtotal,
          discount_amount,
          total_amount,
          amount_tendered,
          change_amount,
          payment_method,
          status,
          notes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?);`,
        [
          receiptNumber,
          transactionDate,
          grandTotal,
          0, // discount
          grandTotal,
          amountTendered,
          changeAmount,
          paymentMethod,
          notes?.trim() || null,
          transactionDate,
        ]
      );

      createdSaleId = saleResult.lastInsertRowId;

      // 4. Insert each sale item and deduct inventory stock
      for (const item of preparedItems) {
        await db.runAsync(
          `INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name_snapshot,
            barcode_snapshot,
            quantity,
            unit_cost_snapshot,
            unit_price_snapshot,
            subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            createdSaleId,
            item.productId,
            item.name,
            item.barcode,
            item.quantity,
            item.costPrice,
            item.sellingPrice,
            item.subtotal,
          ]
        );

        // Deduct product stock in products table
        await db.runAsync(
          `UPDATE products 
           SET stock_quantity = ?,
               updated_at = ?
           WHERE id = ?;`,
          [item.newStock, transactionDate, item.productId]
        );

        // Record stock movement
        await db.runAsync(
          `INSERT INTO stock_movements (
            product_id,
            movement_type,
            quantity,
            previous_quantity,
            new_quantity,
            reason,
            reference_type,
            reference_id,
            created_at
          ) VALUES (?, 'sale', ?, ?, ?, ?, 'sale', ?, ?);`,
          [
            item.productId,
            -item.quantity,
            item.previousStock,
            item.newStock,
            `Sale ${receiptNumber}`,
            receiptNumber,
            transactionDate,
          ]
        );
      }
    });

    return {
      saleId: createdSaleId,
      receiptNumber,
      totalAmount: grandTotal,
      amountTendered,
      changeAmount,
      itemsCount: items.length,
      transactionDate,
    };
  },

  /**
   * Fetches recent sales transactions.
   */
  async getRecent(db: SQLiteDatabase, limit = 20): Promise<Sale[]> {
    return await db.getAllAsync<Sale>(
      `SELECT * FROM sales 
       ORDER BY transaction_date DESC, id DESC 
       LIMIT ?;`,
      [limit]
    );
  },

  /**
   * Fetches sale items for a given sale ID.
   */
  async getSaleItems(db: SQLiteDatabase, saleId: number): Promise<SaleItem[]> {
    return await db.getAllAsync<SaleItem>(
      `SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC;`,
      [saleId]
    );
  },
};
