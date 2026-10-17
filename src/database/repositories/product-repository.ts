import { type SQLiteDatabase } from 'expo-sqlite';
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
  async getById(db: SQLiteDatabase, id: number): Promise<Product | null> {
    const row = await db.getFirstAsync<Product>(
      `SELECT * FROM products WHERE id = ?;`,
      [id]
    );
    return row ?? null;
  },

  /**
   * Retrieves a single active product by its barcode.
   */
  async getByBarcode(db: SQLiteDatabase, barcode: string): Promise<Product | null> {
    const trimmed = barcode.trim();
    if (!trimmed) return null;
    const row = await db.getFirstAsync<Product>(
      `SELECT * FROM products WHERE barcode = ? AND is_active = 1;`,
      [trimmed]
    );
    return row ?? null;
  },

  /**
   * Checks if a barcode is already used by another product.
   */
  async isBarcodeDuplicate(
    db: SQLiteDatabase,
    barcode: string,
    excludeProductId?: number
  ): Promise<boolean> {
    const trimmed = barcode.trim();
    if (!trimmed) return false;

    if (excludeProductId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM products WHERE barcode = ? AND id != ? AND is_active = 1;`,
        [trimmed, excludeProductId]
      );
      return (row?.count ?? 0) > 0;
    } else {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM products WHERE barcode = ? AND is_active = 1;`,
        [trimmed]
      );
      return (row?.count ?? 0) > 0;
    }
  },

  /**
   * Creates a new product and logs an initial stock movement if initial stock > 0.
   */
  async create(db: SQLiteDatabase, input: CreateProductInput): Promise<Product> {
    const barcode = input.barcode?.trim() || null;
    const name = input.name.trim();
    const category = input.category?.trim() || 'General';
    const cost_price = Math.max(0, Math.round(input.cost_price));
    const selling_price = Math.max(0, Math.round(input.selling_price));
    const stock_quantity = input.stock_quantity ?? 0;
    const unit = input.unit?.trim() || 'piece';
    const minimum_stock = Math.max(0, input.minimum_stock ?? 5);

    if (!name) {
      throw new Error('Product name is required.');
    }

    if (barcode) {
      const duplicate = await this.isBarcodeDuplicate(db, barcode);
      if (duplicate) {
        throw new Error(`Barcode "${barcode}" is already registered to another active product.`);
      }
    }

    const now = new Date().toISOString();

    let createdId = 0;

    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        `INSERT INTO products (
          barcode, name, category, cost_price, selling_price,
          stock_quantity, unit, minimum_stock, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
        [
          barcode,
          name,
          category,
          cost_price,
          selling_price,
          stock_quantity,
          unit,
          minimum_stock,
          now,
          now,
        ]
      );

      createdId = result.lastInsertRowId;

      // If initial stock is greater than 0, record initial stock movement
      if (stock_quantity > 0) {
        await db.runAsync(
          `INSERT INTO stock_movements (
            product_id, movement_type, quantity, previous_quantity,
            new_quantity, reason, reference_type, reference_id, created_at
          ) VALUES (?, 'initial', ?, 0, ?, 'Initial inventory stock', 'manual', NULL, ?);`,
          [createdId, stock_quantity, stock_quantity, now]
        );
      }
    });

    const product = await this.getById(db, createdId);
    if (!product) {
      throw new Error('Failed to retrieve newly created product.');
    }

    return product;
  },

  /**
   * Updates an existing product's details.
   */
  async update(db: SQLiteDatabase, id: number, input: UpdateProductInput): Promise<Product> {
    const existing = await this.getById(db, id);
    if (!existing) {
      throw new Error(`Product with ID ${id} not found.`);
    }

    const barcode = input.barcode !== undefined ? (input.barcode?.trim() || null) : existing.barcode;
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const category = input.category !== undefined ? input.category.trim() : existing.category;
    const cost_price = input.cost_price !== undefined ? Math.max(0, Math.round(input.cost_price)) : existing.cost_price;
    const selling_price = input.selling_price !== undefined ? Math.max(0, Math.round(input.selling_price)) : existing.selling_price;
    const unit = input.unit !== undefined ? input.unit.trim() : existing.unit;
    const minimum_stock = input.minimum_stock !== undefined ? Math.max(0, input.minimum_stock) : existing.minimum_stock;
    const is_active = input.is_active !== undefined ? input.is_active : existing.is_active;

    if (!name) {
      throw new Error('Product name cannot be empty.');
    }

    if (barcode && barcode !== existing.barcode) {
      const duplicate = await this.isBarcodeDuplicate(db, barcode, id);
      if (duplicate) {
        throw new Error(`Barcode "${barcode}" is already registered to another product.`);
      }
    }

    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE products SET
        barcode = ?,
        name = ?,
        category = ?,
        cost_price = ?,
        selling_price = ?,
        unit = ?,
        minimum_stock = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?;`,
      [
        barcode,
        name,
        category,
        cost_price,
        selling_price,
        unit,
        minimum_stock,
        is_active,
        now,
        id,
      ]
    );

    const updated = await this.getById(db, id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated product ${id}.`);
    }

    return updated;
  },

  /**
   * Adjusts the stock quantity of a product with a required reason.
   * Atomically updates products.stock_quantity and records an entry in stock_movements.
   */
  async adjustStock(
    db: SQLiteDatabase,
    productId: number,
    adjustment: AdjustStockInput
  ): Promise<Product> {
    const reason = adjustment.reason.trim();
    if (!reason) {
      throw new Error('A reason is required when adjusting stock.');
    }

    let updatedProduct: Product | null = null;

    await db.withTransactionAsync(async () => {
      const existing = await this.getById(db, productId);
      if (!existing) {
        throw new Error(`Product with ID ${productId} not found.`);
      }

      const prevStock = existing.stock_quantity;
      const newStock = Math.max(0, prevStock + adjustment.quantityDelta);
      const now = new Date().toISOString();

      // Update product stock
      await db.runAsync(
        `UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?;`,
        [newStock, now, productId]
      );

      // Record stock movement audit entry
      await db.runAsync(
        `INSERT INTO stock_movements (
          product_id, movement_type, quantity, previous_quantity,
          new_quantity, reason, reference_type, reference_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          productId,
          adjustment.movementType,
          adjustment.quantityDelta,
          prevStock,
          newStock,
          reason,
          adjustment.referenceType ?? 'manual',
          adjustment.referenceId?.toString() ?? null,
          now,
        ]
      );
    });

    updatedProduct = await this.getById(db, productId);
    if (!updatedProduct) {
      throw new Error(`Failed to load product after stock adjustment.`);
    }

    return updatedProduct;
  },

  /**
   * Archives a product (soft delete) to preserve historical sales records.
   */
  async archive(db: SQLiteDatabase, id: number): Promise<void> {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?;`,
      [now, id]
    );
  },

  /**
   * Restores an archived product.
   */
  async unarchive(db: SQLiteDatabase, id: number): Promise<void> {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE products SET is_active = 1, updated_at = ? WHERE id = ?;`,
      [now, id]
    );
  },

  /**
   * Queries products with optional search, filtering, and sorting.
   */
  async getAll(db: SQLiteDatabase, filter: ProductFilter = {}): Promise<Product[]> {
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params: (string | number)[] = [];

    // Active / archived filter
    if (filter.status === 'archived') {
      sql += ` AND is_active = 0`;
    } else if (filter.status === 'all') {
      // Show all
    } else {
      sql += ` AND is_active = 1`;
    }

    // Status filter
    if (filter.status === 'low_stock') {
      sql += ` AND stock_quantity <= minimum_stock AND stock_quantity > 0`;
    } else if (filter.status === 'out_of_stock') {
      sql += ` AND stock_quantity <= 0`;
    }

    // Category filter
    if (filter.category && filter.category !== 'All') {
      sql += ` AND category = ?`;
      params.push(filter.category);
    }

    // Search query (matches name or barcode)
    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim()}%`;
      sql += ` AND (name LIKE ? OR barcode LIKE ?)`;
      params.push(term, term);
    }

    // Sorting
    const sortOrder = filter.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    switch (filter.sortBy) {
      case 'stock':
        sql += ` ORDER BY stock_quantity ${sortOrder}, name ASC`;
        break;
      case 'price':
        sql += ` ORDER BY selling_price ${sortOrder}, name ASC`;
        break;
      case 'updated_at':
        sql += ` ORDER BY updated_at ${sortOrder}`;
        break;
      case 'name':
      default:
        sql += ` ORDER BY name ${sortOrder}`;
        break;
    }

    return await db.getAllAsync<Product>(sql, params);
  },

  /**
   * Retrieves all unique categories from products.
   */
  async getCategories(db: SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ category: string }>(
      `SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC;`
    );
    return rows.map((r) => r.category);
  },

  /**
   * Retrieves stock movement history for a specific product.
   */
  async getStockMovements(
    db: SQLiteDatabase,
    productId: number,
    limit = 50
  ): Promise<StockMovement[]> {
    return await db.getAllAsync<StockMovement>(
      `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?;`,
      [productId, limit]
    );
  },
};
