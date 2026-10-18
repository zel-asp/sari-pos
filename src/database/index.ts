import { supabase } from '@/lib/supabase';

export const DATABASE_NAME = 'supabase';

/**
 * Verifies the Supabase connection on startup without inserting any data.
 */
export async function initDatabase(): Promise<void> {
  try {
    const { error } = await supabase.from('store_settings').select('key').limit(1);
    if (error) {
      console.warn('[Supabase] Warning checking store_settings table:', error.message);
    } else {
      console.log('[Supabase] Connected to Supabase successfully');
    }
  } catch (error) {
    console.error('[Supabase] Connection error during init:', error);
  }
}

export { supabase };
