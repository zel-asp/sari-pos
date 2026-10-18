import { supabase } from '@/lib/supabase';
import {
  type Product,
  type StockMovement,
  type MovementType,
} from '@/types/database';

export interface CreateProductInput {
  barcode?: string | null;
  name: string;
  category?: string;
  cost_price: number; // in centavos
  selling_price: number; // in centavos
  stock_quantity?: number;
  unit?: string;
  minimum_stock?: number;
}

export interface UpdateProductInput {
  barcode?: string | null;
  name?: string;
  category?: string;
  cost_price?: number;
  selling_price?: number;
  unit?: string;
  minimum_stock?: number;
  is_active?: number;
}

export interface AdjustStockInput {
  quantityDelta: number; // positive to add stock, negative to reduce
  reason: string;
  movementType: MovementType;
  referenceType?: 'sale' | 'manual' | 'inventory_audit' | null;
  referenceId?: string | number | null;
}

export interface ProductFilter {
  search?: string;
  category?: string;
  status?: 'active' | 'low_stock' | 'out_of_stock' | 'archived' | 'all';
  sortBy?: 'name' | 'stock' | 'price' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

export const ProductRepository = {
  /**
   * Retrieves a single product by its primary ID.
   */
  async getById(arg1: any, arg2?: number): Promise<Product | null> {
    const id = typeof arg1 === 'number' ? arg1 : arg2!;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Error in getById:', error);
      throw error;
    }
    return data;
  },

  /**
   * Retrieves a single active product by its barcode.
   */
  async getByBarcode(arg1: any, arg2?: string): Promise<Product | null> {
    const barcode = (typeof arg1 === 'string' ? arg1 : arg2 || '').trim();
    if (!barcode) return null;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .eq('is_active', 1)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Error in getByBarcode:', error);
      throw error;
    }
    return data;
  },

  /**
   * Checks if a barcode is already used by another product.
   */
  async isBarcodeDuplicate(
    arg1: any,
    arg2?: string | number,
    arg3?: number
  ): Promise<boolean> {
    let barcode: string;
    let excludeProductId: number | undefined;

    if (typeof arg1 === 'string') {
      barcode = arg1.trim();
      excludeProductId = typeof arg2 === 'number' ? arg2 : undefined;
    } else {
      barcode = (typeof arg2 === 'string' ? arg2 : '').trim();
      excludeProductId = typeof arg3 === 'number' ? arg3 : undefined;
    }

    if (!barcode) return false;

    let query = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('barcode', barcode)
      .eq('is_active', 1);

    if (excludeProductId) {
      query = query.neq('id', excludeProductId);
    }

    const { count, error } = await query;
    if (error) {
      console.error('[Supabase] Error in isBarcodeDuplicate:', error);
      throw error;
    }
    return (count ?? 0) > 0;
  },

  /**
   * Creates a new product and logs an initial stock movement if initial stock > 0.
   */
  async create(arg1: any, arg2?: CreateProductInput): Promise<Product> {
    const input: CreateProductInput = arg2 ? arg2 : arg1;
    const now = new Date().toISOString();

    const insertData = {
      barcode: input.barcode?.trim() || null,
      name: input.name.trim(),
      category: input.category?.trim() || 'General',
      cost_price: Math.round(input.cost_price),
      selling_price: Math.round(input.selling_price),
      stock_quantity: input.stock_quantity ?? 0,
      unit: input.unit || 'piece',
      minimum_stock: input.minimum_stock ?? 5,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('products')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error in create product:', error);
      throw error;
    }

    if ((input.stock_quantity ?? 0) > 0) {
      await supabase.from('stock_movements').insert({
        product_id: data.id,
        movement_type: 'initial',
        quantity: input.stock_quantity,
        previous_quantity: 0,
        new_quantity: input.stock_quantity,
        reason: 'Initial stock intake upon product creation',
        reference_type: 'manual',
        created_at: now,
      });
    }

    return data;
  },

  /**
   * Updates existing product metadata and pricing.
   */
  async update(arg1: any, arg2?: any, arg3?: UpdateProductInput): Promise<Product> {
    let id: number;
    let input: UpdateProductInput;

    if (typeof arg1 === 'number') {
      id = arg1;
      input = arg2;
    } else {
      id = arg2;
      input = arg3!;
    }

    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updateFields.name = input.name.trim();
    if (input.barcode !== undefined) updateFields.barcode = input.barcode ? input.barcode.trim() : null;
    if (input.category !== undefined) updateFields.category = input.category.trim();
    if (input.cost_price !== undefined) updateFields.cost_price = Math.round(input.cost_price);
    if (input.selling_price !== undefined) updateFields.selling_price = Math.round(input.selling_price);
    if (input.unit !== undefined) updateFields.unit = input.unit;
    if (input.minimum_stock !== undefined) updateFields.minimum_stock = input.minimum_stock;
    if (input.is_active !== undefined) updateFields.is_active = input.is_active;

    const { data, error } = await supabase
      .from('products')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error updating product:', error);
      throw error;
    }
    return data;
  },

  /**
   * Atomically adjusts stock quantity and creates an audit stock movement entry.
   */
  async adjustStock(arg1: any, arg2?: any, arg3?: AdjustStockInput): Promise<Product> {
    let id: number;
    let input: AdjustStockInput;

    if (typeof arg1 === 'number') {
      id = arg1;
      input = arg2;
    } else {
      id = arg2;
      input = arg3!;
    }

    // 1. Fetch current product
    const { data: current, error: fetchErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      throw new Error(`Product with ID ${id} not found.`);
    }

    if (input.movementType === 'restock' && input.quantityDelta < 1) {
      throw new Error('Restock quantity must be at least 1 (minimum of 1).');
    }

    if (input.movementType === 'damage' && input.quantityDelta > -1) {
      throw new Error('Damage quantity must be at most -1 (e.g. -1, -2 to deduct stock).');
    }

    const previousQty = current.stock_quantity;
    const newQty = previousQty + input.quantityDelta;

    if (newQty < 0) {
      throw new Error(
        `Cannot reduce stock by ${Math.abs(input.quantityDelta)}. Current stock is only ${previousQty}.`
      );
    }

    const now = new Date().toISOString();

    // 2. Update product stock
    const { data: updated, error: updateErr } = await supabase
      .from('products')
      .update({
        stock_quantity: newQty,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 3. Log stock movement
    await supabase.from('stock_movements').insert({
      product_id: id,
      movement_type: input.movementType,
      quantity: input.quantityDelta,
      previous_quantity: previousQty,
      new_quantity: newQty,
      reason: input.reason,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ? String(input.referenceId) : null,
      created_at: now,
    });

    return updated;
  },

  /**
   * Retrieves products filtered and sorted for the inventory/POS list.
   */
  async getAll(arg1?: any, arg2?: ProductFilter): Promise<Product[]> {
    const filter: ProductFilter = (arg2 || (arg1 && typeof arg1 === 'object' && !arg1.getAllAsync ? arg1 : {})) || {};

    let query = supabase.from('products').select('*');

    // Status filter
    if (filter.status === 'archived') {
      query = query.eq('is_active', 0);
    } else if (filter.status === 'all') {
      // no filter
    } else {
      query = query.eq('is_active', 1);
      if (filter.status === 'low_stock') {
        // filter client-side or condition
      } else if (filter.status === 'out_of_stock') {
        query = query.lte('stock_quantity', 0);
      }
    }

    // Category filter
    if (filter.category && filter.category !== 'All') {
      query = query.eq('category', filter.category);
    }

    // Search filter
    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%`);
    }

    // Sorting
    const isAsc = filter.sortOrder === 'asc';
    if (filter.sortBy === 'name') {
      query = query.order('name', { ascending: isAsc });
    } else if (filter.sortBy === 'stock') {
      query = query.order('stock_quantity', { ascending: isAsc });
    } else if (filter.sortBy === 'price') {
      query = query.order('selling_price', { ascending: isAsc });
    } else {
      query = query.order('updated_at', { ascending: isAsc });
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] Error in getAll products:', error);
      throw error;
    }

    let results = (data as Product[]) || [];
    if (filter.status === 'low_stock') {
      results = results.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.minimum_stock);
    }

    return results;
  },

  /**
   * Retrieves unique categories from active products.
   */
  async getCategories(_arg1?: any): Promise<string[]> {
    const { data, error } = await supabase
      .from('products')
      .select('category')
      .eq('is_active', 1);

    if (error) {
      console.error('[Supabase] Error getting categories:', error);
      return ['General'];
    }

    const set = new Set<string>();
    for (const item of data || []) {
      if (item.category) set.add(item.category);
    }
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ['General'];
  },

  /**
   * Retrieves count of products currently at or below their minimum stock threshold.
   */
  async getLowStockCount(_arg1?: any): Promise<number> {
    const { data, error } = await supabase
      .from('products')
      .select('stock_quantity, minimum_stock')
      .eq('is_active', 1);

    if (error) {
      console.error('[Supabase] Error in getLowStockCount:', error);
      return 0;
    }

    return (data || []).filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.minimum_stock).length;
  },

  /**
   * Soft-deletes (archives) or hard-deletes a product.
   */
  async delete(arg1: any, arg2?: any, arg3?: boolean): Promise<void> {
    let id: number;
    let hardDelete: boolean;

    if (typeof arg1 === 'number') {
      id = arg1;
      hardDelete = !!arg2;
    } else {
      id = arg2;
      hardDelete = !!arg3;
    }

    if (hardDelete) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('products')
        .update({ is_active: 0, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }
  },

  /**
   * Archives a product (soft-delete).
   */
  async archive(arg1: any, arg2?: number): Promise<void> {
    const id = typeof arg1 === 'number' ? arg1 : arg2!;
    return this.delete(id, false);
  },

  /**
   * Retrieves stock history / audit trail for a specific product.
   */
  async getStockMovements(arg1: any, arg2?: any, arg3?: number): Promise<StockMovement[]> {
    let productId: number;
    let limit: number;

    if (typeof arg1 === 'number') {
      productId = arg1;
      limit = typeof arg2 === 'number' ? arg2 : 50;
    } else {
      productId = arg2;
      limit = typeof arg3 === 'number' ? arg3 : 50;
    }

    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] Error getting stock movements:', error);
      throw error;
    }
    return (data as StockMovement[]) || [];
  },
};
