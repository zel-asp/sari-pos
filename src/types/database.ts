export type UnitOfMeasurement =
  | 'piece'
  | 'pack'
  | 'bottle'
  | 'sachet'
  | 'box'
  | 'can'
  | 'roll'
  | 'kg'
  | 'g'
  | 'bundle'
  | 'other';

export interface Product {
  id: number;
  barcode: string | null;
  name: string;
  category: string;
  cost_price: number; // Integer in centavos (e.g. 1500 = ₱15.00)
  selling_price: number; // Integer in centavos (e.g. 1800 = ₱18.00)
  stock_quantity: number; // Decimal or integer
  unit: UnitOfMeasurement | string;
  minimum_stock: number;
  is_active: number; // 1 = active, 0 = archived
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'cash' | 'gcash' | 'other';
export type SaleStatus = 'completed' | 'cancelled' | 'refunded';

export interface Sale {
  id: number;
  receipt_number: string;
  transaction_date: string;
  subtotal: number; // Integer in centavos
  discount_amount: number; // Integer in centavos
  total_amount: number; // Integer in centavos
  amount_tendered: number; // Integer in centavos
  change_amount: number; // Integer in centavos
  payment_method: PaymentMethod;
  status: SaleStatus;
  notes?: string | null;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  product_name_snapshot: string;
  barcode_snapshot: string | null;
  quantity: number;
  unit_cost_snapshot: number; // Integer in centavos
  unit_price_snapshot: number; // Integer in centavos
  subtotal: number; // Integer in centavos
}

export type MovementType =
  | 'sale'
  | 'restock'
  | 'adjustment'
  | 'damage'
  | 'return'
  | 'initial';

export interface StockMovement {
  id: number;
  product_id: number;
  movement_type: MovementType;
  quantity: number; // Delta quantity (positive or negative)
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  reference_type: 'sale' | 'manual' | 'inventory_audit' | null;
  reference_id: string | number | null;
  created_at: string;
}

export interface StockMovementWithProduct extends StockMovement {
  product?: {
    id: number;
    name: string;
    barcode?: string | null;
    unit?: string;
    category?: string | null;
    selling_price?: number;
    cost_price?: number;
  } | null;
}

export type ExpenseCategory =
  | 'utilities'
  | 'rent'
  | 'transport'
  | 'supplies'
  | 'permits'
  | 'snacks'
  | 'maintenance'
  | 'other';

export type ExpenseStatus = 'active' | 'voided';

export interface Expense {
  id: number;
  description: string;
  category: ExpenseCategory | string;
  amount: number; // Integer in centavos
  expense_date: string;
  notes: string | null;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
}

export interface StoreSettings {
  store_name: string;
  store_address?: string;
  store_contact?: string;
  receipt_footer?: string;
  currency_symbol: string;
  low_stock_alert_threshold: number;
  security_pin?: string;
}

// Utang & Customer Management
export interface Customer {
  id: number;
  name: string;
  contact_number?: string | null;
  notes?: string | null;
  total_credit_amount: number; // Integer in centavos (total borrowed all time)
  total_paid_amount: number;   // Integer in centavos (total repaid all time)
  outstanding_balance: number; // Integer in centavos (remaining balance owed)
  transaction_count: number;   // Total number of credit transactions
  last_transaction_date?: string | null; // ISO 8601 string of most recent activity
  is_active: number;           // 1 = active, 0 = archived
  created_at: string;
  updated_at: string;
  recent_items?: string | null;
}

export type CreditTransactionStatus = 'active' | 'settled' | 'voided';

export interface CreditTransaction {
  id: number;
  customer_id: number;
  transaction_number: string;
  transaction_date: string;
  total_amount: number; // Integer in centavos
  notes?: string | null;
  status: CreditTransactionStatus;
  created_at: string;
  items?: CreditTransactionItem[];
}

export interface CreditTransactionItem {
  id: number;
  credit_transaction_id: number;
  product_id: number | null;
  product_name_snapshot: string;
  barcode_snapshot?: string | null;
  quantity: number;
  unit_cost_snapshot: number;  // Integer in centavos
  unit_price_snapshot: number; // Integer in centavos
  subtotal: number;            // Integer in centavos
}

export interface CustomerPayment {
  id: number;
  customer_id: number;
  payment_number: string;
  amount: number; // Integer in centavos
  payment_date: string;
  payment_method: string;
  notes?: string | null;
  created_at: string;
}

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface DashboardSummary {
  period: DashboardPeriod;
  // Inventory Summary
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryCostValue: number; // Centavos: sum(stock_quantity * cost_price)
  // Sales & Collections Summary
  cashSalesAmount: number;         // Centavos
  creditSalesAmount: number;       // Centavos
  repaymentsAmount: number;        // Centavos
  totalCashReceived: number;       // Centavos: cashSales + repayments
  totalOutstandingUtang: number;   // Centavos: total unpaid balance across all customers
  unpaidCustomersCount: number;    // Number of customers with balance > 0
  // Store Performance Summary
  salesRevenue: number;            // Centavos: cashSales + creditSales
  costOfGoodsSold: number;         // Centavos: COGS from cash and credit items
  estimatedGrossProfit: number;    // Centavos: salesRevenue - costOfGoodsSold
  operatingExpenses: number;       // Centavos: active expenses in period
  inventoryLosses: number;         // Centavos: stock losses at cost price in period
  estimatedNetProfit: number;      // Centavos: grossProfit - expenses - losses
}
