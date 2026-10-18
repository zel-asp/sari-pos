import { supabase } from '@/lib/supabase';
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
   * creates sale items snapshots, and logs stock movements in Supabase.
   */
  async createSale(arg1: any, arg2?: CreateSaleInput): Promise<CreateSaleResult> {
    const input: CreateSaleInput = arg2 ? arg2 : arg1;
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

    // 1. Fetch current product information for all items in the sale
    const productIds = items.map((it) => it.productId);
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, barcode, cost_price, selling_price, stock_quantity')
      .in('id', productIds);

    if (prodErr || !products) {
      throw new Error(`Failed to verify products: ${prodErr?.message || 'Not found'}`);
    }

    const productMap = new Map<number, (typeof products)[0]>();
    for (const p of products) {
      productMap.set(p.id, p);
    }

    let grandTotal = 0;
    const preparedItems = [];

    for (const it of items) {
      if (it.quantity <= 0) {
        throw new Error('Quantity must be greater than zero.');
      }
      const prod = productMap.get(it.productId);
      if (!prod) {
        throw new Error(`Product with ID ${it.productId} not found.`);
      }
      if (prod.stock_quantity < it.quantity) {
        throw new Error(
          `Insufficient stock for "${prod.name}". Available: ${prod.stock_quantity}, Requested: ${it.quantity}.`
        );
      }

      const subtotal = Math.round(it.quantity * prod.selling_price);
      grandTotal += subtotal;

      preparedItems.push({
        productId: prod.id,
        name: prod.name,
        barcode: prod.barcode,
        quantity: it.quantity,
        costPrice: prod.cost_price,
        sellingPrice: prod.selling_price,
        subtotal,
        previousStock: prod.stock_quantity,
        newStock: prod.stock_quantity - it.quantity,
      });
    }

    // Check payment amount for cash
    if (paymentMethod === 'cash' && amountTendered < grandTotal) {
      throw new Error(
        `Amount tendered (₱${(amountTendered / 100).toFixed(2)}) is less than total amount (₱${(grandTotal / 100).toFixed(2)}).`
      );
    }

    const changeAmount = paymentMethod === 'cash' ? amountTendered - grandTotal : 0;
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    // 2. Insert Sale record
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        receipt_number: receiptNumber,
        transaction_date: transactionDate,
        subtotal: grandTotal,
        discount_amount: 0,
        total_amount: grandTotal,
        amount_tendered: amountTendered,
        change_amount: changeAmount,
        payment_method: paymentMethod,
        status: 'completed',
        notes: notes || null,
        created_at: transactionDate,
      })
      .select()
      .single();

    if (saleErr || !sale) {
      console.error('[Supabase] Failed to create sale:', saleErr);
      throw saleErr || new Error('Failed to create sale.');
    }

    const saleId = sale.id;

    // 3. Insert Sale Items
    const saleItemsRows = preparedItems.map((item) => ({
      sale_id: saleId,
      product_id: item.productId,
      product_name_snapshot: item.name,
      barcode_snapshot: item.barcode,
      quantity: item.quantity,
      unit_cost_snapshot: item.costPrice,
      unit_price_snapshot: item.sellingPrice,
      subtotal: item.subtotal,
    }));

    const { error: itemsErr } = await supabase.from('sale_items').insert(saleItemsRows);
    if (itemsErr) {
      console.error('[Supabase] Failed to insert sale items:', itemsErr);
    }

    // 4. Update product stock quantities & record stock movements
    const movementsRows = [];
    for (const item of preparedItems) {
      await supabase
        .from('products')
        .update({
          stock_quantity: item.newStock,
          updated_at: transactionDate,
        })
        .eq('id', item.productId);

      movementsRows.push({
        product_id: item.productId,
        movement_type: 'sale',
        quantity: -item.quantity,
        previous_quantity: item.previousStock,
        new_quantity: item.newStock,
        reason: `Sold via receipt #${receiptNumber}`,
        reference_type: 'sale',
        reference_id: String(saleId),
        created_at: transactionDate,
      });
    }

    if (movementsRows.length > 0) {
      await supabase.from('stock_movements').insert(movementsRows);
    }

    return {
      saleId,
      receiptNumber,
      totalAmount: grandTotal,
      amountTendered,
      changeAmount,
      itemsCount: preparedItems.length,
      transactionDate,
    };
  },

  /**
   * Retrieves the latest sales transactions.
   */
  async getRecentSales(arg1?: any, arg2?: number): Promise<Sale[]> {
    const limit = typeof arg1 === 'number' ? arg1 : typeof arg2 === 'number' ? arg2 : 20;

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('status', 'completed')
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] Error getting recent sales:', error);
      throw error;
    }
    return (data as Sale[]) || [];
  },

  /**
   * Retrieves a sale transaction along with all its snapshot line items.
   */
  async getSaleWithItems(
    arg1: any,
    arg2?: number
  ): Promise<{ sale: Sale; items: SaleItem[] } | null> {
    const saleId = typeof arg1 === 'number' ? arg1 : arg2!;

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();

    if (saleErr || !sale) {
      return null;
    }

    const { data: items, error: itemsErr } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId)
      .order('id', { ascending: true });

    if (itemsErr) {
      console.error('[Supabase] Error getting sale items:', itemsErr);
    }

    return {
      sale: sale as Sale,
      items: (items as SaleItem[]) || [],
    };
  },
};
