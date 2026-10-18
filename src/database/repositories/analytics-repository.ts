import { supabase } from '@/lib/supabase';
import { type Product } from '@/types/database';

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface AnalyticsFilter {
  period: AnalyticsPeriod;
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
}

export interface ChartDataPoint {
  label: string;
  fullDate: string;
  capitalCentavos: number;
  lossesCentavos: number;
  inflowsCentavos: number;
}

export interface ProductVelocityItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock_quantity: number;
  cost_price: number;
  selling_price: number;
  quantitySold: number;
  revenueCentavos: number;
  profitCentavos: number;
  capitalInvestedCentavos: number;
  velocity: 'fast' | 'moderate' | 'slow' | 'stagnant';
}

export interface AnalyticsSummary {
  filter: AnalyticsFilter;
  dateRange: { start: string; end: string; label: string };
  chartData: ChartDataPoint[];
  totals: {
    totalCapitalAdded: number; // Centavos
    totalLosses: number; // Centavos
    totalInflows: number; // Centavos (Sales + Utang repayments)
    totalSales: number; // Centavos
    totalUtangCollected: number; // Centavos
    netGain: number; // Inflows - (Capital + Losses)
    isProfitable: boolean;
  };
  fastMovingProducts: ProductVelocityItem[];
  slowMovingProducts: ProductVelocityItem[];
}

interface BucketDefinition {
  label: string;
  fullDate: string;
  startTime: number;
  endTime: number;
}

function generateBuckets(filter: AnalyticsFilter): {
  buckets: BucketDefinition[];
  rangeStart: Date;
  rangeEnd: Date;
  rangeLabel: string;
} {
  const now = new Date();
  const currentYear = filter.year || now.getFullYear();

  if (filter.period === 'daily') {
    // Today: broken down into 8 3-hour blocks
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const buckets: BucketDefinition[] = [];

    const hours = [0, 3, 6, 9, 12, 15, 18, 21];
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const bStart = new Date(startOfDay.getTime() + h * 3600000);
      const bEnd = new Date(bStart.getTime() + 3 * 3600000 - 1);
      const periodName = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      buckets.push({
        label: periodName,
        fullDate: `Today ${periodName}`,
        startTime: bStart.getTime(),
        endTime: bEnd.getTime(),
      });
    }

    return {
      buckets,
      rangeStart: startOfDay,
      rangeEnd: endOfDay,
      rangeLabel: `Today (${startOfDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`,
    };
  }

  if (filter.period === 'weekly') {
    // Last 7 days
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(end.getTime() - 6 * 24 * 3600000);
    start.setHours(0, 0, 0, 0);

    const buckets: BucketDefinition[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 7; i++) {
      const cur = new Date(start.getTime() + i * 24 * 3600000);
      const bStart = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 0, 0, 0, 0);
      const bEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 23, 59, 59, 999);
      buckets.push({
        label: dayNames[cur.getDay()],
        fullDate: cur.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        startTime: bStart.getTime(),
        endTime: bEnd.getTime(),
      });
    }

    return {
      buckets,
      rangeStart: start,
      rangeEnd: end,
      rangeLabel: `Past 7 Days (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
    };
  }

  if (filter.period === 'monthly') {
    // Current month divided into 4-5 weekly segments
    const start = new Date(currentYear, now.getMonth(), 1, 0, 0, 0, 0);
    const lastDayOfMonth = new Date(currentYear, now.getMonth() + 1, 0).getDate();
    const end = new Date(currentYear, now.getMonth(), lastDayOfMonth, 23, 59, 59, 999);

    const buckets: BucketDefinition[] = [];
    const ranges = [
      { label: 'Day 1-7', startD: 1, endD: 7 },
      { label: 'Day 8-14', startD: 8, endD: 14 },
      { label: 'Day 15-21', startD: 15, endD: 21 },
      { label: 'Day 22-28', startD: 22, endD: 28 },
      { label: `Day 29-${lastDayOfMonth}`, startD: 29, endD: lastDayOfMonth },
    ];

    for (const r of ranges) {
      if (r.startD > lastDayOfMonth) continue;
      const actualEndD = Math.min(r.endD, lastDayOfMonth);
      const bStart = new Date(currentYear, now.getMonth(), r.startD, 0, 0, 0, 0);
      const bEnd = new Date(currentYear, now.getMonth(), actualEndD, 23, 59, 59, 999);
      buckets.push({
        label: r.label,
        fullDate: `${bStart.toLocaleDateString('en-US', { month: 'short' })} ${r.startD} - ${actualEndD}`,
        startTime: bStart.getTime(),
        endTime: bEnd.getTime(),
      });
    }

    return {
      buckets,
      rangeStart: start,
      rangeEnd: end,
      rangeLabel: `${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    };
  }

  if (filter.period === 'quarterly') {
    const q = filter.quarter || (Math.floor(now.getMonth() / 3) + 1 as 1 | 2 | 3 | 4);
    const startMonth = (q - 1) * 3;
    const start = new Date(currentYear, startMonth, 1, 0, 0, 0, 0);
    const endMonth = startMonth + 2;
    const lastDayOfQ = new Date(currentYear, endMonth + 1, 0).getDate();
    const end = new Date(currentYear, endMonth, lastDayOfQ, 23, 59, 59, 999);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const buckets: BucketDefinition[] = [];

    for (let m = startMonth; m <= endMonth; m++) {
      const bStart = new Date(currentYear, m, 1, 0, 0, 0, 0);
      const lastDay = new Date(currentYear, m + 1, 0).getDate();
      const bEnd = new Date(currentYear, m, lastDay, 23, 59, 59, 999);
      buckets.push({
        label: monthNames[m],
        fullDate: `${monthNames[m]} ${currentYear}`,
        startTime: bStart.getTime(),
        endTime: bEnd.getTime(),
      });
    }

    return {
      buckets,
      rangeStart: start,
      rangeEnd: end,
      rangeLabel: `Q${q} ${currentYear} (${monthNames[startMonth]} - ${monthNames[endMonth]})`,
    };
  }

  // filter.period === 'yearly'
  const start = new Date(currentYear, 0, 1, 0, 0, 0, 0);
  const end = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const buckets: BucketDefinition[] = [];

  for (let m = 0; m < 12; m++) {
    const bStart = new Date(currentYear, m, 1, 0, 0, 0, 0);
    const lastDay = new Date(currentYear, m + 1, 0).getDate();
    const bEnd = new Date(currentYear, m, lastDay, 23, 59, 59, 999);
    buckets.push({
      label: monthNames[m],
      fullDate: `${monthNames[m]} ${currentYear}`,
      startTime: bStart.getTime(),
      endTime: bEnd.getTime(),
    });
  }

  return {
    buckets,
    rangeStart: start,
    rangeEnd: end,
    rangeLabel: `Year ${currentYear}`,
  };
}

export const AnalyticsRepository = {
  /**
   * Fetches financial movements (capital stocked, losses, cash inflows) and
   * product velocity (fast and slow movers) for the selected period.
   */
  async getOverviewData(filter: AnalyticsFilter): Promise<AnalyticsSummary> {
    const { buckets, rangeStart, rangeEnd, rangeLabel } = generateBuckets(filter);
    const startIso = rangeStart.toISOString();
    const endIso = rangeEnd.toISOString();

    // 1. Fetch products map for cost lookup
    const { data: productsData } = await supabase
      .from('products')
      .select('*');

    const products = (productsData || []) as Product[];
    const productMap = new Map<number, Product>();
    for (const p of products) {
      productMap.set(p.id, p);
    }

    // 2. Fetch Stock Movements (Capital added vs Losses) in range
    const { data: movementsData, error: movErr } = await supabase
      .from('stock_movements')
      .select('*')
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (movErr) console.error('[Analytics] Error fetching movements:', movErr);
    const movements = movementsData || [];

    // 3. Fetch Sales in range
    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select('id, total_amount, transaction_date, status')
      .neq('status', 'cancelled')
      .gte('transaction_date', startIso)
      .lte('transaction_date', endIso);

    if (salesErr) console.error('[Analytics] Error fetching sales:', salesErr);
    const sales = salesData || [];

    // 4. Fetch Utang Customer Payments in range
    const { data: paymentsData, error: payErr } = await supabase
      .from('customer_payments')
      .select('id, amount, payment_date')
      .gte('payment_date', startIso)
      .lte('payment_date', endIso);

    if (payErr) console.error('[Analytics] Error fetching payments:', payErr);
    const payments = paymentsData || [];

    // 5. Fetch Sale Items in range for product velocity (POS cash sales)
    const saleIds = sales.map((s) => s.id);
    let saleItems: any[] = [];
    if (saleIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);
      if (itemsErr) console.error('[Analytics] Error fetching sale items:', itemsErr);
      saleItems = itemsData || [];
    }

    // 5b. Fetch Credit Transactions & Items in range (Utang / Credit sales)
    const { data: creditTxsData, error: creditErr } = await supabase
      .from('credit_transactions')
      .select('id, transaction_date, status')
      .neq('status', 'cancelled')
      .gte('transaction_date', startIso)
      .lte('transaction_date', endIso);

    if (creditErr) console.error('[Analytics] Error fetching credit transactions:', creditErr);
    const creditTxs = creditTxsData || [];
    const creditTxIds = creditTxs.map((ct) => ct.id);

    let creditItems: any[] = [];
    if (creditTxIds.length > 0) {
      const { data: cItemsData, error: cItemsErr } = await supabase
        .from('credit_transaction_items')
        .select('*')
        .in('credit_transaction_id', creditTxIds);
      if (cItemsErr) console.error('[Analytics] Error fetching credit items:', cItemsErr);
      creditItems = cItemsData || [];
    }

    // 6. Aggregate into Buckets for the Line Chart
    const chartData: ChartDataPoint[] = buckets.map((b) => ({
      label: b.label,
      fullDate: b.fullDate,
      capitalCentavos: 0,
      lossesCentavos: 0,
      inflowsCentavos: 0,
    }));

    let totalCapitalAdded = 0;
    let totalLosses = 0;
    let totalSales = 0;
    let totalUtangCollected = 0;

    // Track capital invested per product from initial and restock movements
    const productCapitalInvested = new Map<number, number>();

    // Process Stock Movements:
    for (const m of movements) {
      const mTime = new Date(m.created_at).getTime();
      const prod = productMap.get(m.product_id);
      const unitCost = prod ? prod.cost_price : 0;

      // Find matching bucket
      const bucket = chartData.find((_, idx) => {
        const b = buckets[idx];
        return mTime >= b.startTime && mTime <= b.endTime;
      });

      // Capital Added (restock / initial stock creation)
      if (['initial', 'restock'].includes(m.movement_type) && m.quantity > 0) {
        const costValue = Math.round(m.quantity * unitCost);
        totalCapitalAdded += costValue;
        const prevCap = productCapitalInvested.get(m.product_id) || 0;
        productCapitalInvested.set(m.product_id, prevCap + costValue);
        if (bucket) {
          bucket.capitalCentavos += costValue;
        }
      }

      // Losses (damage, spoilage, expired, theft, lost)
      const isLossType = ['damage', 'spoilage', 'expired', 'loss', 'theft'].includes(m.movement_type);
      const isNegativeAdjustment = m.movement_type === 'adjustment' && m.quantity < 0;
      if (isLossType || isNegativeAdjustment) {
        const lossCost = Math.round(Math.abs(m.quantity) * unitCost);
        totalLosses += lossCost;
        if (bucket) {
          bucket.lossesCentavos += lossCost;
        }
      }
    }

    // Process Sales Inflow:
    for (const s of sales) {
      const sTime = new Date(s.transaction_date).getTime();
      const bucket = chartData.find((_, idx) => {
        const b = buckets[idx];
        return sTime >= b.startTime && sTime <= b.endTime;
      });

      totalSales += s.total_amount;
      if (bucket) {
        bucket.inflowsCentavos += s.total_amount;
      }
    }

    // Process Utang Repayments Inflow:
    for (const p of payments) {
      const pTime = new Date(p.payment_date).getTime();
      const bucket = chartData.find((_, idx) => {
        const b = buckets[idx];
        return pTime >= b.startTime && pTime <= b.endTime;
      });

      totalUtangCollected += p.amount;
      if (bucket) {
        bucket.inflowsCentavos += p.amount;
      }
    }

    const totalInflows = totalSales + totalUtangCollected;
    const netGain = totalInflows - (totalCapitalAdded + totalLosses);

    // 7. Calculate Product Movement (Fast-Moving vs Slow-Moving)
    // Combines POS Cash Sales + Utang Credit Sales
    const productSalesAgg = new Map<number, { quantity: number; revenue: number; profit: number }>();

    // A. Add cash sale items
    for (const it of saleItems) {
      if (!it.product_id) continue;
      const prev = productSalesAgg.get(it.product_id) || { quantity: 0, revenue: 0, profit: 0 };
      const itemProfit = it.subtotal - Math.round(it.quantity * (it.unit_cost_snapshot || 0));
      productSalesAgg.set(it.product_id, {
        quantity: prev.quantity + Number(it.quantity),
        revenue: prev.revenue + Number(it.subtotal),
        profit: prev.profit + itemProfit,
      });
    }

    // B. Add credit / utang sale items
    for (const it of creditItems) {
      if (!it.product_id) continue;
      const prev = productSalesAgg.get(it.product_id) || { quantity: 0, revenue: 0, profit: 0 };
      const unitCost = it.unit_cost_snapshot || productMap.get(it.product_id)?.cost_price || 0;
      const itemProfit = it.subtotal - Math.round(it.quantity * unitCost);
      productSalesAgg.set(it.product_id, {
        quantity: prev.quantity + Number(it.quantity),
        revenue: prev.revenue + Number(it.subtotal),
        profit: prev.profit + itemProfit,
      });
    }

    const velocityList: ProductVelocityItem[] = products.map((p) => {
      const stats = productSalesAgg.get(p.id) || { quantity: 0, revenue: 0, profit: 0 };
      let velocity: 'fast' | 'moderate' | 'slow' | 'stagnant' = 'stagnant';
      if (stats.quantity >= 10) {
        velocity = 'fast';
      } else if (stats.quantity >= 3) {
        velocity = 'moderate';
      } else if (stats.quantity > 0) {
        velocity = 'slow';
      } else {
        velocity = 'stagnant';
      }

      const capitalInvested =
        productCapitalInvested.get(p.id) ||
        (p.stock_quantity > 0 ? Math.round(p.stock_quantity * p.cost_price) : p.cost_price);

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        stock_quantity: p.stock_quantity,
        cost_price: p.cost_price,
        selling_price: p.selling_price,
        quantitySold: stats.quantity,
        revenueCentavos: stats.revenue,
        profitCentavos: stats.profit,
        capitalInvestedCentavos: capitalInvested,
        velocity,
      };
    });

    // Fast-Moving: sorted by units sold descending
    const fastMovingProducts = [...velocityList]
      .filter((p) => p.quantitySold > 0)
      .sort((a, b) => b.quantitySold - a.quantitySold);

    // Slow-Moving: products with 0 or very few sales
    // Prioritize products with actual capital tied up on shelves
    const slowMovingProducts = [...velocityList]
      .filter((p) => p.quantitySold === 0 || p.velocity === 'slow')
      .sort((a, b) => {
        const aTiedUp = a.stock_quantity * a.cost_price;
        const bTiedUp = b.stock_quantity * b.cost_price;
        if (bTiedUp !== aTiedUp) {
          return bTiedUp - aTiedUp;
        }
        return a.quantitySold - b.quantitySold;
      });

    return {
      filter,
      dateRange: {
        start: startIso,
        end: endIso,
        label: rangeLabel,
      },
      chartData,
      totals: {
        totalCapitalAdded,
        totalLosses,
        totalInflows,
        totalSales,
        totalUtangCollected,
        netGain,
        isProfitable: netGain >= 0,
      },
      fastMovingProducts,
      slowMovingProducts,
    };
  },
};
