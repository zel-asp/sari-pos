import { AppLayout } from "@/components/navigation/app-layout";
import { AppButton } from "@/components/ui/app-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { DashboardRepository } from "@/database/repositories/dashboard-repository";
import { ProductRepository } from "@/database/repositories/product-repository";
import {
  type DashboardPeriod,
  type DashboardSummary,
  type Product,
} from "@/types/database";
import { formatPHP } from "@/utils/currency";
import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DashboardScreen() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("My Sari-Sari Store");
  const [products, setProducts] = useState<Product[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchStoreName = async (): Promise<string> => {
    try {
      const { data } = await supabase
        .from('store_settings')
        .select('value')
        .eq('key', 'store_name')
        .maybeSingle();
      return data?.value || "My Sari-Sari Store";
    } catch {
      return "My Sari-Sari Store";
    }
  };

  const isFetchingRef = useRef(false);

  const fetchDashboardData = useCallback(
    async (showLoading = true) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (showLoading) setLoading(true);
      try {
        const [name, allProducts, summaryData] = await Promise.all([
          fetchStoreName(),
          ProductRepository.getAll({ status: "all" }),
          DashboardRepository.getSummary(period),
        ]);
        if (name) setStoreName(name);
        setProducts(allProducts);
        setSummary(summaryData);
      } catch (err) {
        console.error("[Dashboard] Error loading data:", err);
      } finally {
        isFetchingRef.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData, reloadKey]);

  const fetchDashboardDataRef = useRef(fetchDashboardData);
  useEffect(() => {
    fetchDashboardDataRef.current = fetchDashboardData;
  }, [fetchDashboardData]);

  // Real-time synchronization whenever user returns to Dashboard screen
  useFocusEffect(
    useCallback(() => {
      fetchDashboardDataRef.current(false);
    }, [])
  );

  // Supabase Real-time Channel for Sales, Products, Inventory, Utang, Payments & Expenses
  useEffect(() => {
    const channelId = `dashboard-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sale_items" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transactions" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transaction_items" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_payments" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings" },
        () => {
          fetchDashboardDataRef.current(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDashboardData = useCallback(() => {
    fetchDashboardData(true);
  }, [fetchDashboardData]);

  // Derived stock metrics from local database
  const totalProducts = products.length;
  const lowStockProducts = products.filter(
    (p) => p.stock_quantity <= p.minimum_stock && p.stock_quantity > 0,
  );
  const outOfStockProducts = products.filter((p) => p.stock_quantity <= 0);


  const periodLabel =
    period === "today"
      ? "Today"
      : period === "week"
        ? "This Week"
        : "This Month";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLayout activeTab="dashboard" title={storeName}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadDashboardData}
              colors={["#059669"]}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.badgeRow}>
                <FontAwesome5 name="store" size={12} color="#059669" />
                <Text style={styles.badgeText}>Sari-Sari Store POS</Text>
              </View>
              <Text style={styles.storeName}>{storeName}</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {/* Sell (Export) POS Card */}
            <Pressable
              onPress={() => router.push("/pos")}
              style={({ pressed }) => [
                styles.actionCardEmerald,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxWhite}>
                <FontAwesome5 name="cash-register" size={16} color="#059669" />
              </View>
              <Text style={styles.actionCardTitleWhite}>Sell (Export)</Text>
              <Text style={styles.actionCardSubtitleWhite}>POS Checkout</Text>
            </Pressable>

            {/* Customer Utang Card */}
            <Pressable
              onPress={() => router.push("/utang/index")}
              style={({ pressed }) => [
                styles.actionCardWhite,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxRose}>
                <FontAwesome5 name="book-open" size={18} color="#be123c" />
              </View>
              <Text style={styles.actionCardTitle}>Customer Utang</Text>
              {loading ? (
                <Skeleton
                  width={70}
                  height={16}
                  borderRadius={4}
                  style={{ marginTop: 2 }}
                />
              ) : (
                <Text
                  style={[
                    styles.actionCardSubtitle,
                    { color: "#be123c", fontWeight: "700" },
                  ]}
                >
                  {summary ? formatPHP(summary.totalOutstandingUtang) : "₱0.00"}
                </Text>
              )}
            </Pressable>

            {/* Inventory Card */}
            <Pressable
              onPress={() => router.push("/inventory")}
              style={({ pressed }) => [
                styles.actionCardWhite,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxEmerald}>
                <FontAwesome5 name="boxes" size={18} color="#059669" />
              </View>
              <Text style={styles.actionCardTitle}>Inventory</Text>
              {loading ? (
                <Skeleton
                  width={70}
                  height={16}
                  borderRadius={4}
                  style={{ marginTop: 2 }}
                />
              ) : (
                <Text style={styles.actionCardSubtitle}>
                  {totalProducts} Products
                </Text>
              )}
            </Pressable>

            {/* Add Product Card */}
            <Pressable
              onPress={() => router.push("/products/new")}
              style={({ pressed }) => [
                styles.actionCardWhite,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxBlue}>
                <FontAwesome5 name="plus" size={16} color="#2563eb" />
              </View>
              <Text style={styles.actionCardTitle}>Add Product</Text>
              <Text style={styles.actionCardSubtitle}>New Item</Text>
            </Pressable>

            {/* Record Utang Card */}
            <Pressable
              onPress={() => router.push("/utang/new")}
              style={({ pressed }) => [
                styles.actionCardWhite,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxRose}>
                <FontAwesome5
                  name="hand-holding-usd"
                  size={16}
                  color="#be123c"
                />
              </View>
              <Text style={styles.actionCardTitle}>New Utang</Text>
              <Text style={styles.actionCardSubtitle}>Record Credit</Text>
            </Pressable>

            {/* Overview & Charts Card */}
            <Pressable
              onPress={() => router.push("/overview")}
              style={({ pressed }) => [
                styles.actionCardWhite,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionIconBoxEmerald}>
                <FontAwesome5 name="chart-line" size={16} color="#059669" />
              </View>
              <Text style={styles.actionCardTitle}>Overview & Charts</Text>
              <Text style={styles.actionCardSubtitle}>Capital, Loss & Profit</Text>
            </Pressable>
          </View>

          {/* Period Selector Filter */}
          <View style={styles.periodFilterRow}>
            <Text style={styles.periodSectionLabel}>Performance Period:</Text>
            <View style={styles.periodTabGroup}>
              {(["today", "week", "month"] as DashboardPeriod[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[
                    styles.periodTab,
                    period === p && styles.periodTabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodTabText,
                      period === p && styles.periodTabTextActive,
                    ]}
                  >
                    {p === "today"
                      ? "Today"
                      : p === "week"
                        ? "This Week"
                        : "This Month"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 1. Sales & Collections Summary Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <FontAwesome5
                  name="cash-register"
                  size={14}
                  color="#059669"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.cardHeaderTitle}>
                  Sales & Collections ({periodLabel})
                </Text>
              </View>
              <View style={styles.periodTag}>
                <Text style={styles.periodTagText}>{periodLabel}</Text>
              </View>
            </View>

            {/* Actual Cash Collected Banner */}
            <View style={styles.heroMetricBox}>
              <Text style={styles.heroMetricLabel}>Total Cash Received</Text>
              {loading ? (
                <Skeleton
                  width={180}
                  height={32}
                  borderRadius={6}
                  style={{ marginVertical: 4 }}
                />
              ) : (
                <Text style={styles.heroMetricAmount}>
                  {summary ? formatPHP(summary.totalCashReceived) : "₱0.00"}
                </Text>
              )}
              <Text style={styles.heroMetricSub}>
                Actual cash in hand: Cash Sales + Utang Collected (unpaid credit
                excluded)
              </Text>
            </View>

            {/* Breakdown Grid */}
            <View style={styles.grid2Col}>
              <View style={styles.metricSubCard}>
                <Text style={styles.subCardLabel}>Cash Sales</Text>
                {loading ? (
                  <Skeleton
                    width={80}
                    height={20}
                    borderRadius={4}
                    style={{ marginVertical: 3 }}
                  />
                ) : (
                  <Text style={styles.subCardValue}>
                    {summary ? formatPHP(summary.cashSalesAmount) : "₱0.00"}
                  </Text>
                )}
                <Text style={styles.subCardHint}>Direct POS sales</Text>
              </View>

              <View style={styles.metricSubCard}>
                <Text style={styles.subCardLabel}>Repayments Collected</Text>
                {loading ? (
                  <Skeleton
                    width={80}
                    height={20}
                    borderRadius={4}
                    style={{ marginVertical: 3 }}
                  />
                ) : (
                  <Text style={[styles.subCardValue, { color: "#059669" }]}>
                    {summary ? formatPHP(summary.repaymentsAmount) : "₱0.00"}
                  </Text>
                )}
                <Text style={styles.subCardHint}>Utang paid back</Text>
              </View>
            </View>

            <View style={[styles.grid2Col, { marginTop: 8 }]}>
              {/* Total Losses Card (replacing New Credit Borrowed) */}
              <View style={styles.metricSubCard}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 2,
                  }}
                >
                  <FontAwesome5
                    name="exclamation-circle"
                    size={11}
                    color="#be123c"
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.subCardLabel,
                      { color: "#be123c", fontWeight: "700" },
                    ]}
                  >
                    Total Losses
                  </Text>
                </View>
                {loading ? (
                  <Skeleton
                    width={80}
                    height={20}
                    borderRadius={4}
                    style={{ marginVertical: 3 }}
                  />
                ) : (
                  <Text style={[styles.subCardValue, { color: "#be123c" }]}>
                    {summary ? formatPHP(summary.inventoryLosses) : "₱0.00"}
                  </Text>
                )}
                <Text style={styles.subCardHint}>Damage & spoilage</Text>
              </View>

              {/* Total Utang Owed Card */}
              <Pressable
                onPress={() => router.push("/utang/index")}
                style={({ pressed }) => [
                  styles.metricSubCard,
                  styles.metricSubCardClickable,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={[styles.subCardLabel, { color: "#be123c" }]}>
                    Total Utang Owed
                  </Text>
                  <FontAwesome5
                    name="chevron-right"
                    size={10}
                    color="#be123c"
                  />
                </View>
                {loading ? (
                  <Skeleton
                    width={80}
                    height={20}
                    borderRadius={4}
                    style={{ marginVertical: 3 }}
                  />
                ) : (
                  <Text style={[styles.subCardValue, { color: "#be123c" }]}>
                    {summary
                      ? formatPHP(summary.totalOutstandingUtang)
                      : "₱0.00"}
                  </Text>
                )}
                <Text style={styles.subCardHint}>
                  {summary
                    ? `${summary.unpaidCustomersCount} customers unpaid`
                    : "0 unpaid"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 2. Store Performance Summary Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <FontAwesome5
                  name="chart-line"
                  size={14}
                  color="#0284c7"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.cardHeaderTitle}>
                  Store Performance ({periodLabel})
                </Text>
              </View>
            </View>

            {/* Estimated Net Profit Banner */}
            <View
              style={[
                styles.profitBanner,
                (summary?.estimatedNetProfit ?? 0) >= 0
                  ? styles.profitBannerPositive
                  : styles.profitBannerNegative,
              ]}
            >
              <View>
                <Text style={styles.profitBannerLabel}>
                  Estimated Net Profit
                </Text>
                {loading ? (
                  <Skeleton
                    width={140}
                    height={28}
                    borderRadius={6}
                    style={{ marginVertical: 3 }}
                  />
                ) : (
                  <Text
                    style={[
                      styles.profitBannerValue,
                      (summary?.estimatedNetProfit ?? 0) >= 0
                        ? { color: "#047857" }
                        : { color: "#be123c" },
                    ]}
                  >
                    {summary ? formatPHP(summary.estimatedNetProfit) : "₱0.00"}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.profitBadgePill,
                  (summary?.estimatedNetProfit ?? 0) >= 0
                    ? styles.profitBadgePillPositive
                    : styles.profitBadgePillNegative,
                ]}
              >
                <FontAwesome5
                  name={
                    (summary?.estimatedNetProfit ?? 0) >= 0
                      ? "arrow-up"
                      : "arrow-down"
                  }
                  size={11}
                  color={
                    (summary?.estimatedNetProfit ?? 0) >= 0
                      ? "#047857"
                      : "#be123c"
                  }
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.profitBadgeText,
                    (summary?.estimatedNetProfit ?? 0) >= 0
                      ? { color: "#047857" }
                      : { color: "#be123c" },
                  ]}
                >
                  Net Gain
                </Text>
              </View>
            </View>

            {/* Financial Rows */}
            <View style={styles.financialRowsBox}>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>
                  Total Sales Revenue (Cash + Utang):
                </Text>
                {loading ? (
                  <Skeleton width={70} height={16} borderRadius={4} />
                ) : (
                  <Text style={styles.financialValue}>
                    {summary ? formatPHP(summary.salesRevenue) : "₱0.00"}
                  </Text>
                )}
              </View>

              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>
                  Cost of Goods Sold (COGS):
                </Text>
                {loading ? (
                  <Skeleton width={70} height={16} borderRadius={4} />
                ) : (
                  <Text style={[styles.financialValue, { color: "#64748b" }]}>
                    - {summary ? formatPHP(summary.costOfGoodsSold) : "₱0.00"}
                  </Text>
                )}
              </View>

              <View style={[styles.financialRow, styles.financialRowBorder]}>
                <Text
                  style={[
                    styles.financialLabel,
                    { fontWeight: "800", color: "#0f172a" },
                  ]}
                >
                  Estimated Gross Profit:
                </Text>
                {loading ? (
                  <Skeleton width={70} height={16} borderRadius={4} />
                ) : (
                  <Text
                    style={[
                      styles.financialValue,
                      { fontWeight: "800", color: "#059669" },
                    ]}
                  >
                    {summary
                      ? formatPHP(summary.estimatedGrossProfit)
                      : "₱0.00"}
                  </Text>
                )}
              </View>

              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Operating Expenses:</Text>
                {loading ? (
                  <Skeleton width={70} height={16} borderRadius={4} />
                ) : (
                  <Text style={[styles.financialValue, { color: "#be123c" }]}>
                    - {summary ? formatPHP(summary.operatingExpenses) : "₱0.00"}
                  </Text>
                )}
              </View>

              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>
                  Inventory Losses (Damage/Spoilage):
                </Text>
                {loading ? (
                  <Skeleton width={70} height={16} borderRadius={4} />
                ) : (
                  <Text style={[styles.financialValue, { color: "#be123c" }]}>
                    - {summary ? formatPHP(summary.inventoryLosses) : "₱0.00"}
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.formulaNote}>
              Formula: Net Profit = Gross Profit (Sales - COGS) - Operating
              Expenses - Inventory Losses
            </Text>
          </View>

          {/* 3. Inventory Summary & Capital */}
          <View style={styles.card}>
            <View style={styles.capitalRow}>
              <View>
                <View style={styles.capitalLabelRow}>
                  <FontAwesome5
                    name="chart-pie"
                    size={13}
                    color="#059669"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.capitalLabel}>
                    Total Inventory Capital
                  </Text>
                </View>
                <Text style={styles.capitalExplainer}>
                  Cost value of current stock (Capital = Sum of Stock × Unit
                  Cost)
                </Text>
              </View>
              {loading ? (
                <Skeleton width={130} height={28} borderRadius={6} />
              ) : (
                <Text style={styles.capitalValue}>
                  {summary
                    ? formatPHP(summary.totalInventoryCostValue)
                    : "₱0.00"}
                </Text>
              )}
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                {loading ? (
                  <Skeleton
                    width={32}
                    height={20}
                    borderRadius={4}
                    style={{ marginBottom: 2 }}
                  />
                ) : (
                  <Text style={styles.metricNumber}>{totalProducts}</Text>
                )}
                <Text style={styles.metricLabel}>In Stock</Text>
              </View>

              <Pressable
                onPress={() => router.push("/inventory")}
                style={[
                  styles.metricBox,
                  lowStockProducts.length > 0 && styles.metricBoxWarning,
                ]}
              >
                <View style={styles.metricHeader}>
                  {lowStockProducts.length > 0 && (
                    <FontAwesome5
                      name="exclamation-circle"
                      size={11}
                      color="#b45309"
                      style={{ marginRight: 3 }}
                    />
                  )}
                  {loading ? (
                    <Skeleton
                      width={32}
                      height={20}
                      borderRadius={4}
                      style={{ marginBottom: 2 }}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.metricNumber,
                        lowStockProducts.length > 0 && { color: "#92400e" },
                      ]}
                    >
                      {lowStockProducts.length}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.metricLabel,
                    lowStockProducts.length > 0 && {
                      color: "#b45309",
                      fontWeight: "700",
                    },
                  ]}
                >
                  Low Stock
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/inventory")}
                style={[
                  styles.metricBox,
                  outOfStockProducts.length > 0 && styles.metricBoxDanger,
                ]}
              >
                <View style={styles.metricHeader}>
                  {outOfStockProducts.length > 0 && (
                    <FontAwesome5
                      name="times-circle"
                      size={11}
                      color="#be123c"
                      style={{ marginRight: 3 }}
                    />
                  )}
                  {loading ? (
                    <Skeleton
                      width={32}
                      height={20}
                      borderRadius={4}
                      style={{ marginBottom: 2 }}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.metricNumber,
                        outOfStockProducts.length > 0 && { color: "#9f1239" },
                      ]}
                    >
                      {outOfStockProducts.length}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.metricLabel,
                    outOfStockProducts.length > 0 && {
                      color: "#be123c",
                      fontWeight: "700",
                    },
                  ]}
                >
                  Out of Stock
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Low Stock Alerts */}
          {lowStockProducts.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <View style={styles.alertHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <FontAwesome5
                    name="exclamation-triangle"
                    size={12}
                    color="#b45309"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.alertSectionTitle}>
                    Items Needing Restock ({lowStockProducts.length})
                  </Text>
                </View>
                <Pressable onPress={() => router.push("/inventory")}>
                  <Text style={styles.viewAllLink}>View All</Text>
                </Pressable>
              </View>

              <View style={styles.alertCard}>
                {lowStockProducts.slice(0, 3).map((item, idx) => (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: "/products/[id]",
                        params: { id: item.id.toString() },
                      })
                    }
                    style={[
                      styles.alertItemRow,
                      idx === lowStockProducts.slice(0, 3).length - 1 && {
                        borderBottomWidth: 0,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.alertItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.alertItemSubtitle}>
                        Only {item.stock_quantity} {item.unit} left • Alert
                        threshold: {item.minimum_stock}
                      </Text>
                    </View>
                    <View style={styles.restockPill}>
                      <FontAwesome5
                        name="plus"
                        size={9}
                        color="#ffffff"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.restockPillText}>Restock</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Empty state onboarding */}
          {totalProducts === 0 && !loading && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome5 name="store" size={28} color="#059669" />
              </View>
              <Text style={styles.emptyTitle}>Your Store is Ready!</Text>
              <Text style={styles.emptySubtitle}>
                Your store inventory is empty. Add your products to start selling and tracking sales.
              </Text>

              <AppButton
                onPress={() => router.push("/products/new")}
                title="Add Your First Product"
                icon={<FontAwesome name="plus" size={12} color="#ffffff" />}
                size="md"
                style={{ width: "100%" }}
              />
            </View>
          )}
        </ScrollView>
      </AppLayout>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  dbStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dbStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 5,
  },
  dbStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065f46",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  actionCardWhite: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  actionCardEmerald: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#059669",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  actionIconBoxRose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionIconBoxEmerald: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionIconBoxBlue: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionIconBoxWhite: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  actionCardSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  actionCardTitleWhite: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  actionCardSubtitleWhite: {
    fontSize: 12,
    color: "#d1fae5",
    marginTop: 2,
  },
  periodFilterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  periodSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  periodTabGroup: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    padding: 3,
  },
  periodTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: "#059669",
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  periodTabTextActive: {
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  periodTag: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  periodTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  heroMetricBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  heroMetricLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065f46",
    textTransform: "uppercase",
  },
  heroMetricAmount: {
    fontSize: 26,
    fontWeight: "900",
    color: "#047857",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroMetricSub: {
    fontSize: 11,
    color: "#065f46",
    marginTop: 4,
    lineHeight: 15,
  },
  grid2Col: {
    flexDirection: "row",
    gap: 8,
  },
  metricSubCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  metricSubCardClickable: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  subCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 2,
  },
  subCardValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  subCardHint: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  profitBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  profitBannerPositive: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  profitBannerNegative: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  profitBannerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  profitBannerValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  profitBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  profitBadgePillPositive: {
    backgroundColor: "#d1fae5",
  },
  profitBadgePillNegative: {
    backgroundColor: "#fee2e2",
  },
  profitBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  financialRowsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  financialRowBorder: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 6,
    marginVertical: 4,
  },
  financialLabel: {
    fontSize: 12,
    color: "#475569",
  },
  financialValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  formulaNote: {
    fontSize: 10,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 8,
    lineHeight: 14,
  },
  capitalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  capitalLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  capitalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  capitalExplainer: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
    maxWidth: 200,
  },
  capitalValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#059669",
    letterSpacing: -0.4,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  metricBoxWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  metricBoxDanger: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  alertHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  alertSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400e",
  },
  viewAllLink: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  alertCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  alertItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  alertItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  alertItemSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  restockPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  restockPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
});
