import { supabase } from '@/lib/supabase';
import {
  type StockMovementWithProduct,
  type MovementType,
} from '@/types/database';

export interface StockMovementFilter {
  search?: string;
  direction?: 'all' | 'in' | 'out'; // in: quantity > 0, out: quantity < 0
  movementType?: 'all' | MovementType;
  datePeriod?: 'all' | 'today' | 'week' | 'month';
  productId?: number;
}

export interface StockMovementStats {
  totalCount: number;
  totalInCount: number;
  totalInUnits: number;
  totalOutCount: number;
  totalOutUnits: number;
  netUnits: number;
}

export const StockMovementRepository = {
  /**
   * Retrieves all stock movements with joined product data and optional filtering.
   */
  async getAll(filter: StockMovementFilter = {}): Promise<StockMovementWithProduct[]> {
    let query = supabase
      .from('stock_movements')
      .select('*, product:products(id, name, barcode, unit, category, selling_price, cost_price)')
      .order('created_at', { ascending: false });

    if (filter.productId) {
      query = query.eq('product_id', filter.productId);
    }

    if (filter.direction === 'in') {
      query = query.gt('quantity', 0);
    } else if (filter.direction === 'out') {
      query = query.lt('quantity', 0);
    }

    if (filter.movementType && filter.movementType !== 'all') {
      query = query.eq('movement_type', filter.movementType);
    }

    if (filter.datePeriod && filter.datePeriod !== 'all') {
      const now = new Date();
      let startStr = '';
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      if (filter.datePeriod === 'today') {
        startStr = `${formatDate(now)}T00:00:00.000Z`;
      } else if (filter.datePeriod === 'week') {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startStr = `${formatDate(d)}T00:00:00.000Z`;
      } else if (filter.datePeriod === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        startStr = `${formatDate(d)}T00:00:00.000Z`;
      }

      if (startStr) {
        query = query.gte('created_at', startStr);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Supabase] Error loading stock movements:', error);
      throw error;
    }

    const rawList = (data || []) as any[];

    // Normalize product if returned as array from relation
    const results: StockMovementWithProduct[] = rawList.map((item) => ({
      ...item,
      product: Array.isArray(item.product) ? item.product[0] || null : item.product || null,
    }));

    // Client-side search matching product name, barcode, reason, or reference_id
    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      return results.filter((m) => {
        const pName = m.product?.name?.toLowerCase() || '';
        const barcode = m.product?.barcode?.toLowerCase() || '';
        const reason = m.reason?.toLowerCase() || '';
        const refId = String(m.reference_id || '').toLowerCase();
        return pName.includes(q) || barcode.includes(q) || reason.includes(q) || refId.includes(q);
      });
    }

    return results;
  },

  /**
   * Computes summary metrics for stock movements (Total In, Total Out, Net Units).
   */
  computeStats(movements: StockMovementWithProduct[]): StockMovementStats {
    let totalInCount = 0;
    let totalInUnits = 0;
    let totalOutCount = 0;
    let totalOutUnits = 0;

    for (const m of movements) {
      const qty = Number(m.quantity) || 0;
      if (qty > 0) {
        totalInCount++;
        totalInUnits += qty;
      } else if (qty < 0) {
        totalOutCount++;
        totalOutUnits += Math.abs(qty);
      }
    }

    return {
      totalCount: movements.length,
      totalInCount,
      totalInUnits,
      totalOutCount,
      totalOutUnits,
      netUnits: totalInUnits - totalOutUnits,
    };
  },
};
