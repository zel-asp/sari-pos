import { type SQLiteDatabase } from 'expo-sqlite';
import { type DashboardPeriod, type DashboardSummary } from '@/types/database';

export const DashboardRepository = {
  /**
   * Computes comprehensive dashboard financial and inventory metrics
   * based on actual SQLite database records.
   */
  async getSummary(db: SQLiteDatabase, period: DashboardPeriod = 'today'): Promise<DashboardSummary> {
    const now = new Date();
    let startDateStr = '';
    let endDateStr = '';

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (period === 'today') {
      const todayStr = formatDate(now);
      startDateStr = `${todayStr}T00:00:00.000Z`;
      endDateStr = `${todayStr}T23:59:59.999Z`;
    } else if (period === 'week') {
      // 7 days ago
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDateStr = `${formatDate(startOfWeek)}T00:00:00.000Z`;
      endDateStr = `${formatDate(now)}T23:59:59.999Z`;
    } else {
      // Current month: 1st day of month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDateStr = `${formatDate(startOfMonth)}T00:00:00.000Z`;
      endDateStr = `${formatDate(now)}T23:59:59.999Z`;
    }

    // 1. Inventory Metrics
    const productStats = await db.getFirstAsync<{
      total_count: number;
      in_stock: number;
      low_stock: number;
      out_of_stock: number;
      total_cost_value: number;
    }>(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN stock_quantity > 0 THEN 1 ELSE 0 END), 0) as in_stock,
        COALESCE(SUM(CASE WHEN stock_quantity > 0 AND stock_quantity <= minimum_stock THEN 1 ELSE 0 END), 0) as low_stock,
        COALESCE(SUM(CASE WHEN stock_quantity <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock,
        COALESCE(SUM(ROUND(stock_quantity * cost_price)), 0) as total_cost_value
      FROM products
      WHERE is_active = 1;
    `);

    // 2. Sales in Period (Cash / Normal POS sales)
    const cashSales = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM sales
       WHERE status = 'completed' AND transaction_date >= ? AND transaction_date <= ?;`,
      [startDateStr, endDateStr]
    );

    // 3. Credit / Utang Sales in Period
    const creditSales = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM credit_transactions
       WHERE status = 'active' AND transaction_date >= ? AND transaction_date <= ?;`,
      [startDateStr, endDateStr]
    );

    // 4. Utang Repayments in Period
    const repayments = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM customer_payments
       WHERE payment_date >= ? AND payment_date <= ?;`,
      [startDateStr, endDateStr]
    );

    // 5. Total Outstanding Utang & Unpaid Customers (Current overall balance)
    const utangStats = await db.getFirstAsync<{
      total_balance: number;
      unpaid_count: number;
    }>(`
      SELECT
        COALESCE(SUM(outstanding_balance), 0) as total_balance,
        COALESCE(SUM(CASE WHEN outstanding_balance > 0 THEN 1 ELSE 0 END), 0) as unpaid_count
      FROM customers
      WHERE is_active = 1;
    `);

    // 6. Cost of Goods Sold (COGS) in Period
    // COGS from cash sales
    const cashCogs = await db.getFirstAsync<{ total_cogs: number }>(
      `SELECT COALESCE(SUM(ROUND(si.quantity * si.unit_cost_snapshot)), 0) as total_cogs
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.status = 'completed' AND s.transaction_date >= ? AND s.transaction_date <= ?;`,
      [startDateStr, endDateStr]
    );

    // COGS from credit sales
    const creditCogs = await db.getFirstAsync<{ total_cogs: number }>(
      `SELECT COALESCE(SUM(ROUND(ci.quantity * ci.unit_cost_snapshot)), 0) as total_cogs
       FROM credit_transaction_items ci
       JOIN credit_transactions ct ON ci.credit_transaction_id = ct.id
       WHERE ct.status = 'active' AND ct.transaction_date >= ? AND ct.transaction_date <= ?;`,
      [startDateStr, endDateStr]
    );

    const totalCogs = (cashCogs?.total_cogs ?? 0) + (creditCogs?.total_cogs ?? 0);

    // 7. Operating Expenses in Period
    const expenses = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE status = 'active' AND expense_date >= ? AND expense_date <= ?;`,
      [startDateStr, endDateStr]
    );

    // 8. Inventory Losses in Period (Damaged/Spoiled stock)
    const inventoryLosses = await db.getFirstAsync<{ total_loss: number }>(
      `SELECT COALESCE(SUM(ROUND(ABS(sm.quantity) * p.cost_price)), 0) as total_loss
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       WHERE sm.movement_type IN ('damage', 'loss')
         AND sm.created_at >= ? AND sm.created_at <= ?;`,
      [startDateStr, endDateStr]
    );

    const cashSalesAmount = cashSales?.total ?? 0;
    const creditSalesAmount = creditSales?.total ?? 0;
    const repaymentsAmount = repayments?.total ?? 0;

    // Actual cash collected = Cash sales + customer repayments
    const totalCashReceived = cashSalesAmount + repaymentsAmount;

    // Total sales revenue = Cash sales + Credit sales (borrowing is a sale on credit)
    const salesRevenue = cashSalesAmount + creditSalesAmount;

    // Gross profit = Sales revenue - COGS
    const estimatedGrossProfit = salesRevenue - totalCogs;

    const operatingExpenses = expenses?.total ?? 0;
    const losses = inventoryLosses?.total_loss ?? 0;

    // Net profit = Gross profit - Expenses - Inventory Losses
    const estimatedNetProfit = estimatedGrossProfit - operatingExpenses - losses;

    return {
      period,
      totalProducts: productStats?.total_count ?? 0,
      inStockCount: productStats?.in_stock ?? 0,
      lowStockCount: productStats?.low_stock ?? 0,
      outOfStockCount: productStats?.out_of_stock ?? 0,
      totalInventoryCostValue: productStats?.total_cost_value ?? 0,

      cashSalesAmount,
      creditSalesAmount,
      repaymentsAmount,
      totalCashReceived,
      totalOutstandingUtang: utangStats?.total_balance ?? 0,
      unpaidCustomersCount: utangStats?.unpaid_count ?? 0,

      salesRevenue,
      costOfGoodsSold: totalCogs,
      estimatedGrossProfit,
      operatingExpenses,
      inventoryLosses: losses,
      estimatedNetProfit,
    };
  },
};
