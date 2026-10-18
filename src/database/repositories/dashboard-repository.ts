import { supabase } from '@/lib/supabase';
import { type DashboardPeriod, type DashboardSummary } from '@/types/database';

export const DashboardRepository = {
  /**
   * Computes comprehensive dashboard financial and inventory metrics
   * based on Supabase database records.
   */
  async getSummary(arg1?: any, arg2?: DashboardPeriod): Promise<DashboardSummary> {
    const period: DashboardPeriod =
      typeof arg1 === 'string'
        ? (arg1 as DashboardPeriod)
        : arg2
        ? arg2
        : 'today';

    const now = new Date();
    let start: Date;
    let end: Date;

    if (period === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      start = new Date(end.getTime() - 6 * 24 * 3600000);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      end = new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth, 23, 59, 59, 999);
    }

    const startDateStr = start.toISOString();
    const endDateStr = end.toISOString();

    // 1. Inventory Metrics from Products
    const { data: products } = await supabase
      .from('products')
      .select('stock_quantity, minimum_stock, cost_price')
      .eq('is_active', 1);

    const prods = products || [];
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalInventoryCostValue = 0;

    for (const p of prods) {
      if (p.stock_quantity > 0) {
        inStockCount++;
        if (p.stock_quantity <= p.minimum_stock) {
          lowStockCount++;
        }
      } else {
        outOfStockCount++;
      }
      totalInventoryCostValue += Math.round((p.stock_quantity || 0) * (p.cost_price || 0));
    }

    // 2. Sales in Period (Cash)
    const { data: sales } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('status', 'completed')
      .gte('transaction_date', startDateStr)
      .lte('transaction_date', endDateStr);

    const cashSalesAmount = (sales || []).reduce((acc, s) => acc + (s.total_amount || 0), 0);

    // 3. Credit / Utang Sales in Period
    const { data: creditTxs } = await supabase
      .from('credit_transactions')
      .select('total_amount')
      .neq('status', 'cancelled')
      .gte('transaction_date', startDateStr)
      .lte('transaction_date', endDateStr);

    const creditSalesAmount = (creditTxs || []).reduce((acc, c) => acc + (c.total_amount || 0), 0);

    // 4. Utang Repayments in Period
    const { data: payments } = await supabase
      .from('customer_payments')
      .select('amount')
      .gte('payment_date', startDateStr)
      .lte('payment_date', endDateStr);

    const repaymentsAmount = (payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);

    // 5. Total Outstanding Utang & Unpaid Customers
    const { data: customers } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('is_active', 1);

    let totalOutstandingUtang = 0;
    let unpaidCustomersCount = 0;
    for (const c of customers || []) {
      const bal = c.outstanding_balance || 0;
      totalOutstandingUtang += bal;
      if (bal > 0) unpaidCustomersCount++;
    }

    // 6. Cost of Goods Sold (COGS)
    // Fetch sale items in period
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('quantity, unit_cost_snapshot, sales!inner(status, transaction_date)')
      .eq('sales.status', 'completed')
      .gte('sales.transaction_date', startDateStr)
      .lte('sales.transaction_date', endDateStr);

    const cashCogs = (saleItems || []).reduce(
      (acc, si) => acc + Math.round((si.quantity || 0) * (si.unit_cost_snapshot || 0)),
      0
    );

    // Fetch credit items in period
    const { data: creditItems } = await supabase
      .from('credit_transaction_items')
      .select('quantity, unit_cost_snapshot, credit_transactions!inner(status, transaction_date)')
      .neq('credit_transactions.status', 'cancelled')
      .gte('credit_transactions.transaction_date', startDateStr)
      .lte('credit_transactions.transaction_date', endDateStr);

    const creditCogs = (creditItems || []).reduce(
      (acc, ci) => acc + Math.round((ci.quantity || 0) * (ci.unit_cost_snapshot || 0)),
      0
    );

    const totalCogs = cashCogs + creditCogs;

    // 7. Operating Expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('status', 'active')
      .gte('expense_date', startDateStr)
      .lte('expense_date', endDateStr);

    const operatingExpenses = (expenses || []).reduce((acc, e) => acc + (e.amount || 0), 0);

    // 8. Inventory Losses
    const { data: damagedMovements } = await supabase
      .from('stock_movements')
      .select('quantity, products!inner(cost_price)')
      .in('movement_type', ['damage', 'loss', 'expired', 'spoilage', 'theft'])
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr);

    const inventoryLosses = (damagedMovements || []).reduce((acc: number, sm: any) => {
      const cost = sm.products?.cost_price || 0;
      return acc + Math.round(Math.abs(sm.quantity || 0) * cost);
    }, 0);

    const totalCashReceived = cashSalesAmount + repaymentsAmount;
    const salesRevenue = cashSalesAmount + creditSalesAmount;
    const estimatedGrossProfit = salesRevenue - totalCogs;
    const estimatedNetProfit = estimatedGrossProfit - operatingExpenses - inventoryLosses;

    return {
      period,
      totalProducts: prods.length,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      totalInventoryCostValue,

      cashSalesAmount,
      creditSalesAmount,
      repaymentsAmount,
      totalCashReceived,
      totalOutstandingUtang,
      unpaidCustomersCount,

      salesRevenue,
      costOfGoodsSold: totalCogs,
      estimatedGrossProfit,
      operatingExpenses,
      inventoryLosses,
      estimatedNetProfit,
    };
  },
};
