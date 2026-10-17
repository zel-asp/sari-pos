import { type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

export const DATABASE_NAME = 'sari_pos.db';

/**
 * Initializes the SQLite database upon startup:
 * 1. Enables WAL mode & foreign keys
 * 2. Runs pending migrations
 * 3. Sets up initial default store settings if needed
 */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  try {
    await runMigrations(db);

    // Insert default settings if not already present
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, ?, ?);`,
      ['store_name', 'My Sari-Sari Store', now]
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, ?, ?);`,
      ['currency_symbol', '₱', now]
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO store_settings (key, value, updated_at) VALUES (?, ?, ?);`,
      ['low_stock_threshold', '5', now]
    );

    console.log('[DB] Database initialized successfully');

    // Automatically seed sample customers and utang if none exist
    await seedDemoUtangIfEmpty(db);
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Seeds demo products and sample data for testing/demo purposes.
 * Can be triggered from Settings or Developer menu.
 */
export async function seedDemoProducts(db: SQLiteDatabase): Promise<void> {
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM products;');
  if (count && count.count > 0) {
    console.log('[DB] Products already exist, skipping demo seed');
    return;
  }

  const now = new Date().toISOString();
  const sampleProducts = [
    // [barcode, name, category, cost_price (centavos), selling_price (centavos), stock_quantity, unit, minimum_stock]
    ['4800016644819', 'Lucky Me! Pancit Canton Kalamansi', 'Instant Noodles', 1400, 1800, 24, 'pack', 5],
    ['4800016644826', 'Lucky Me! Pancit Canton Chili Mansi', 'Instant Noodles', 1400, 1800, 20, 'pack', 5],
    ['4800016644802', 'Lucky Me! Pancit Canton Original', 'Instant Noodles', 1400, 1800, 18, 'pack', 5],
    ['4801981115174', 'Bear Brand Powdered Milk Drink 33g', 'Beverages', 1350, 1600, 30, 'sachet', 10],
    ['4800361394017', 'Nescafe Classic 2g', 'Beverages', 400, 600, 50, 'sachet', 10],
    ['4800361394123', 'Great Taste White Coffee 30g', 'Beverages', 1100, 1400, 35, 'sachet', 10],
    ['4800016053017', 'San Miguel Pale Pilsen 330ml', 'Beverages', 5500, 6500, 12, 'bottle', 6],
    ['4800049720054', 'Datu Puti Soy Sauce 100ml', 'Condiments', 800, 1200, 15, 'sachet', 5],
    ['4800049720061', 'Datu Puti Vinegar 100ml', 'Condiments', 800, 1200, 15, 'sachet', 5],
    ['4800888139049', 'Surf Powder Detergent Sun Fresh 55g', 'Household', 750, 1000, 25, 'sachet', 8],
    ['4800888185015', 'Palmolive Shampoo Intensive Moisture 15ml', 'Personal Care', 650, 900, 20, 'sachet', 5],
    ['4807770270014', 'Kopiko Blanca 30g', 'Beverages', 1100, 1400, 4, 'sachet', 10], // Low stock sample
    ['4806511011111', 'Eggs (Medium)', 'Fresh Food', 750, 950, 30, 'piece', 12],
    ['4809999000001', 'Sinandomeng Rice (1kg)', 'Rice & Grains', 4800, 5600, 50, 'kg', 10],
  ];

  await db.withTransactionAsync(async () => {
    for (const prod of sampleProducts) {
      await db.runAsync(
        `INSERT INTO products (barcode, name, category, cost_price, selling_price, stock_quantity, unit, minimum_stock, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);`,
        [prod[0], prod[1], prod[2], prod[3], prod[4], prod[5], prod[6], prod[7], now, now]
      );
    }

    // Seed sample customers and utang transactions if no customers exist
    const custCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM customers;'
    );
    if (!custCount || custCount.count === 0) {
      // 1. Customer: Maria Santos
      const resMaria = await db.runAsync(
        `INSERT INTO customers (name, contact_number, notes, total_credit_amount, total_paid_amount, outstanding_balance, transaction_count, last_transaction_date, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 5200, 2000, 3200, 1, ?, 1, ?, ?);`,
        ['Maria Santos', '0917-123-4567', 'Neighbor across the street', now, now, now]
      );
      const mariaId = resMaria.lastInsertRowId;

      // Maria's credit transaction: ₱52.00 (2x Lucky Me! Kalamansi @ ₱18.00, 1x Bear Brand @ ₱16.00)
      const txMaria = await db.runAsync(
        `INSERT INTO credit_transactions (customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at)
         VALUES (?, 'CR-DEMO-001', ?, 5200, 'Initial grocery items', 'active', ?);`,
        [mariaId, now, now]
      );
      const txMariaId = txMaria.lastInsertRowId;

      await db.runAsync(
        `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
         VALUES (?, 1, 'Lucky Me! Pancit Canton Kalamansi', '4800016644819', 2, 1400, 1800, 3600);`,
        [txMariaId]
      );
      await db.runAsync(
        `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
         VALUES (?, 4, 'Bear Brand Powdered Milk Drink 33g', '4801981115174', 1, 1350, 1600, 1600);`,
        [txMariaId]
      );

      // Maria's repayment: ₱20.00
      await db.runAsync(
        `INSERT INTO customer_payments (customer_id, payment_number, amount, payment_date, payment_method, notes, created_at)
         VALUES (?, 'PAY-DEMO-001', 2000, ?, 'cash', 'Partial payment', ?);`,
        [mariaId, now, now]
      );

      // 2. Customer: Kuya Jun
      const resJun = await db.runAsync(
        `INSERT INTO customers (name, contact_number, notes, total_credit_amount, total_paid_amount, outstanding_balance, transaction_count, last_transaction_date, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 6800, 0, 6800, 1, ?, 1, ?, ?);`,
        ['Kuya Jun', '0928-987-6543', 'Tricycle driver', now, now, now]
      );
      const junId = resJun.lastInsertRowId;

      const txJun = await db.runAsync(
        `INSERT INTO credit_transactions (customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at)
         VALUES (?, 'CR-DEMO-002', ?, 6800, 'Rice and condiments', 'active', ?);`,
        [junId, now, now]
      );
      const txJunId = txJun.lastInsertRowId;

      await db.runAsync(
        `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
         VALUES (?, 14, 'Sinandomeng Rice (1kg)', '4809999000001', 1, 4800, 5600, 5600);`,
        [txJunId]
      );
      await db.runAsync(
        `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
         VALUES (?, 8, 'Datu Puti Soy Sauce 100ml', '4800049720054', 1, 800, 1200, 1200);`,
        [txJunId]
      );
    }
  });

  console.log('[DB] Demo products and sample utang data seeded successfully');
}

/**
 * Automatically seeds sample customers and credit transactions if customers table is empty.
 */
export async function seedDemoUtangIfEmpty(db: SQLiteDatabase): Promise<void> {
  const custCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM customers;'
  );
  if (custCount && custCount.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // 1. Customer: Maria Santos (₱32.00 remaining balance)
    const resMaria = await db.runAsync(
      `INSERT INTO customers (name, contact_number, notes, total_credit_amount, total_paid_amount, outstanding_balance, transaction_count, last_transaction_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 5200, 2000, 3200, 1, ?, 1, ?, ?);`,
      ['Maria Santos', '0917-123-4567', 'Neighbor across the street', now, now, now]
    );
    const mariaId = resMaria.lastInsertRowId;

    const txMaria = await db.runAsync(
      `INSERT INTO credit_transactions (customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at)
       VALUES (?, 'CR-DEMO-001', ?, 5200, 'Initial grocery items', 'active', ?);`,
      [mariaId, now, now]
    );
    const txMariaId = txMaria.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 1, 'Lucky Me! Pancit Canton Kalamansi', '4800016644819', 2, 1400, 1800, 3600);`,
      [txMariaId]
    );
    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 4, 'Bear Brand Powdered Milk Drink 33g', '4801981115174', 1, 1350, 1600, 1600);`,
      [txMariaId]
    );

    // Maria's payment of ₱20.00
    await db.runAsync(
      `INSERT INTO customer_payments (customer_id, payment_number, amount, payment_date, payment_method, notes, created_at)
       VALUES (?, 'PAY-DEMO-001', 2000, ?, 'cash', 'Partial payment', ?);`,
      [mariaId, now, now]
    );

    // 2. Customer: Kuya Jun (₱68.00 remaining balance)
    const resJun = await db.runAsync(
      `INSERT INTO customers (name, contact_number, notes, total_credit_amount, total_paid_amount, outstanding_balance, transaction_count, last_transaction_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 6800, 0, 6800, 1, ?, 1, ?, ?);`,
      ['Kuya Jun', '0928-987-6543', 'Tricycle driver', now, now, now]
    );
    const junId = resJun.lastInsertRowId;

    const txJun = await db.runAsync(
      `INSERT INTO credit_transactions (customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at)
       VALUES (?, 'CR-DEMO-002', ?, 6800, 'Rice and condiments', 'active', ?);`,
      [junId, now, now]
    );
    const txJunId = txJun.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 14, 'Sinandomeng Rice (1kg)', '4809999000001', 1, 4800, 5600, 5600);`,
      [txJunId]
    );
    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 8, 'Datu Puti Soy Sauce 100ml', '4800049720054', 1, 800, 1200, 1200);`,
      [txJunId]
    );

    // 3. Customer: Aling Nena (Fully paid sample)
    const resNena = await db.runAsync(
      `INSERT INTO customers (name, contact_number, notes, total_credit_amount, total_paid_amount, outstanding_balance, transaction_count, last_transaction_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 3000, 3000, 0, 1, ?, 1, ?, ?);`,
      ['Aling Nena', '0919-555-8899', 'Suki across the street', now, now, now]
    );
    const nenaId = resNena.lastInsertRowId;

    const txNena = await db.runAsync(
      `INSERT INTO credit_transactions (customer_id, transaction_number, transaction_date, total_amount, notes, status, created_at)
       VALUES (?, 'CR-DEMO-003', ?, 3000, 'Shampoo and vinegar', 'active', ?);`,
      [nenaId, now, now]
    );
    const txNenaId = txNena.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 11, 'Palmolive Shampoo Intensive Moisture 15ml', '4800888185015', 2, 650, 900, 1800);`,
      [txNenaId]
    );
    await db.runAsync(
      `INSERT INTO credit_transaction_items (credit_transaction_id, product_id, product_name_snapshot, barcode_snapshot, quantity, unit_cost_snapshot, unit_price_snapshot, subtotal)
       VALUES (?, 9, 'Datu Puti Vinegar 100ml', '4800049720061', 1, 800, 1200, 1200);`,
      [txNenaId]
    );

    await db.runAsync(
      `INSERT INTO customer_payments (customer_id, payment_number, amount, payment_date, payment_method, notes, created_at)
       VALUES (?, 'PAY-DEMO-003', 3000, ?, 'cash', 'Full payment', ?);`,
      [nenaId, now, now]
    );
  });

  console.log('[DB] Sample demo customers and utang transactions seeded successfully');
}
