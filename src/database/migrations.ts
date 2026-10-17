import { type SQLiteDatabase } from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';

export interface Migration {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db: SQLiteDatabase) => {
      // Execute the initial schema creation
      await db.execAsync(CREATE_TABLES_SQL);
    },
  },
  {
    version: 2,
    name: 'create_customer_and_credit_tables',
    up: async (db: SQLiteDatabase) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          contact_number TEXT,
          notes TEXT,
          total_credit_amount INTEGER NOT NULL DEFAULT 0,
          total_paid_amount INTEGER NOT NULL DEFAULT 0,
          outstanding_balance INTEGER NOT NULL DEFAULT 0,
          transaction_count INTEGER NOT NULL DEFAULT 0,
          last_transaction_date TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credit_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          transaction_number TEXT UNIQUE NOT NULL,
          transaction_date TEXT NOT NULL,
          total_amount INTEGER NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS credit_transaction_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          credit_transaction_id INTEGER NOT NULL,
          product_id INTEGER,
          product_name_snapshot TEXT NOT NULL,
          barcode_snapshot TEXT,
          quantity REAL NOT NULL,
          unit_cost_snapshot INTEGER NOT NULL,
          unit_price_snapshot INTEGER NOT NULL,
          subtotal INTEGER NOT NULL,
          FOREIGN KEY (credit_transaction_id) REFERENCES credit_transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS customer_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          payment_number TEXT UNIQUE NOT NULL,
          amount INTEGER NOT NULL,
          payment_date TEXT NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
        );

        CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
        CREATE INDEX IF NOT EXISTS idx_customers_balance ON customers(outstanding_balance);
        CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

        CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer ON credit_transactions(customer_id);
        CREATE INDEX IF NOT EXISTS idx_credit_transactions_date ON credit_transactions(transaction_date);

        CREATE INDEX IF NOT EXISTS idx_credit_items_tx ON credit_transaction_items(credit_transaction_id);
        CREATE INDEX IF NOT EXISTS idx_credit_items_product ON credit_transaction_items(product_id);

        CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
        CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(payment_date);
      `);
    },
  },
];

/**
 * Runs pending database migrations.
 * Uses PRAGMA user_version to track migration version.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Always enable WAL mode and foreign key constraints
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // Check current schema version
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = result?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      console.log(`[DB] Applying migration ${migration.version}: ${migration.name}`);
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
      console.log(`[DB] Migration ${migration.version} applied successfully`);
    }
  }
}
