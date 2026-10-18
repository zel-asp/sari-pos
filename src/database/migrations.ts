/**
 * Database migrations have been migrated to Supabase.
 * Please use supabase_schema.sql in the project root to set up your database tables in the Supabase Dashboard SQL Editor.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [];

export async function runMigrations(): Promise<void> {
  // No-op for Supabase
}
