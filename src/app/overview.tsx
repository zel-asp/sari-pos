import { MultiLineChart } from "@/components/analytics/multi-line-chart";
import { AppLayout } from "@/components/navigation/app-layout";
import {
  AnalyticsRepository,
  type AnalyticsFilter,
  type AnalyticsPeriod,
  type AnalyticsSummary,
} from "@/database/repositories/analytics-repository";
import { supabase } from "@/lib/supabase";
import { formatPHP } from "@/utils/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { FontAwesome5 } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const PAGE_SIZE = 15;

export default function OverviewScreen() {
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<AnalyticsPeriod>("weekly");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  );

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [velocityTab, setVelocityTab] = useState<"fast" | "slow">("fast");
  const [velocityPage, setVelocityPage] = useState(1);

  const filter: AnalyticsFilter = useMemo(
    () => ({
      period,
      year: selectedYear,
      quarter: selectedQuarter,
    }),
    [period, selectedYear, selectedQuarter],
  );

  // Reset velocity page when switching tab or changing time filter
  useEffect(() => {
    setVelocityPage(1);
  }, [velocityTab, period, selectedYear, selectedQuarter]);

  const activeVelocityList = useMemo(() => {
    if (!summary) return [];
    return velocityTab === "fast" ? summary.fastMovingProducts : summary.slowMovingProducts;
  }, [summary, velocityTab]);

  const paginatedVelocityList = useMemo(() => {
    const start = (velocityPage - 1) * PAGE_SIZE;
    return activeVelocityList.slice(start, start + PAGE_SIZE);
  }, [activeVelocityList, velocityPage]);

  // Load analytics overview
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await AnalyticsRepository.getOverviewData(filter);
      setSummary(data);
    } catch (err) {
      console.error("[Overview] Error loading analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  // Set up real-time subscriptions safely using a unique channel instance
  useEffect(() => {
    const channelId = `analytics-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => {
          loadDataRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => {
          loadDataRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_payments" },
        () => {
          loadDataRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          loadDataRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transactions" },
        () => {
          loadDataRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transaction_items" },
        () => {
          loadDataRef.current();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <AppLayout activeTab="overview" title="Summary & Overview">
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadData}
              colors={["#059669"]}
            />
          }
        >
          {/* 1. Time Filter Tabs */}
          <View style={styles.filterSection}>
            <View style={styles.periodTabsRow}>
              {(
                [
                  "daily",
                  "weekly",
                  "monthly",
                  "quarterly",
                  "yearly",
                ] as AnalyticsPeriod[]
              ).map((p) => (
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
                    {p === "daily"
                      ? "Daily"
                      : p === "weekly"
                        ? "Weekly"
                        : p === "monthly"
                          ? "Monthly"
                          : p === "quarterly"
                            ? "Quarterly"
                            : "Yearly"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Sub-selectors for Quarterly and Yearly */}
            {period === "quarterly" && (
              <View style={styles.subFilterRow}>
                <Text style={styles.subFilterLabel}>Select Quarter:</Text>
                {([1, 2, 3, 4] as const).map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => setSelectedQuarter(q)}
                    style={[
                      styles.subPill,
                      selectedQuarter === q && styles.subPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subPillText,
                        selectedQuarter === q && styles.subPillTextActive,
                      ]}
                    >
                      Q{q}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {period === "yearly" && (
              <View style={styles.subFilterRow}>
                <Text style={styles.subFilterLabel}>Select Year:</Text>
                {yearOptions.map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => setSelectedYear(y)}
                    style={[
                      styles.subPill,
                      selectedYear === y && styles.subPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subPillText,
                        selectedYear === y && styles.subPillTextActive,
                      ]}
                    >
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Active Range Indicator */}
            {summary && (
              <View style={styles.rangeBanner}>
                <FontAwesome5
                  name="calendar-alt"
                  size={12}
                  color="#059669"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.rangeBannerText}>
                  Showing Data for: {summary.dateRange.label}
                </Text>
              </View>
            )}
          </View>

          {/* 2. Key Financial Cards */}
          {summary ? (
            <View style={styles.kpiGrid}>
              {/* Inflows / Total Revenue */}
              <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                <View style={styles.kpiIconCircleEmerald}>
                  <FontAwesome5 name="arrow-down" size={14} color="#059669" />
                </View>
                <Text style={styles.kpiLabel}>Total Inflows (Gain)</Text>
                <Text style={styles.kpiValue}>
                  {formatPHP(summary.totals.totalInflows)}
                </Text>
                <Text style={styles.kpiSub}>
                  Sales: {formatPHP(summary.totals.totalSales)} • Utang Paid:{" "}
                  {formatPHP(summary.totals.totalUtangCollected)}
                </Text>
              </View>

              {/* Capital Added / Restocked */}
              <View style={[styles.kpiCard, styles.kpiCardBlue]}>
                <View style={styles.kpiIconCircleBlue}>
                  <FontAwesome5 name="boxes" size={14} color="#2563eb" />
                </View>
                <Text style={styles.kpiLabel}>Capital Stocked</Text>
                <Text style={styles.kpiValue}>
                  {formatPHP(summary.totals.totalCapitalAdded)}
                </Text>
                <Text style={styles.kpiSub}>
                  Added products & restock cost value
                </Text>
              </View>

              {/* Losses */}
              <View style={[styles.kpiCard, styles.kpiCardRose]}>
                <View style={styles.kpiIconCircleRose}>
                  <FontAwesome5 name="trash-alt" size={14} color="#dc2626" />
                </View>
                <Text style={styles.kpiLabel}>Total Losses</Text>
                <Text style={[styles.kpiValue, { color: "#dc2626" }]}>
                  {formatPHP(summary.totals.totalLosses)}
                </Text>
                <Text style={styles.kpiSub}>
                  Damage, spoilage, expired & theft costs
                </Text>
              </View>

              {/* Net Balance / Gain */}
              <View
                style={[
                  styles.kpiCard,
                  summary.totals.isProfitable
                    ? styles.kpiCardDarkPositive
                    : styles.kpiCardDarkNegative,
                ]}
              >
                <View style={styles.kpiHeaderRow}>
                  <Text style={styles.kpiLabelDark}>Net Financial Gain</Text>
                  <View
                    style={[
                      styles.statusPill,
                      summary.totals.isProfitable
                        ? styles.statusPillPositive
                        : styles.statusPillNegative,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        summary.totals.isProfitable
                          ? { color: "#059669" }
                          : { color: "#dc2626" },
                      ]}
                    >
                      {summary.totals.isProfitable ? "Profitable" : "Deficit"}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.kpiValueDark,
                    summary.totals.isProfitable
                      ? { color: "#10b981" }
                      : { color: "#f87171" },
                  ]}
                >
                  {formatPHP(summary.totals.netGain)}
                </Text>
                <Text style={styles.kpiSubDark}>
                  Formula: Inflows - (Capital Added + Losses)
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                <Skeleton width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
                <Skeleton width={110} height={13} borderRadius={4} style={{ marginBottom: 8 }} />
                <Skeleton width={140} height={22} borderRadius={6} style={{ marginBottom: 8 }} />
                <Skeleton width={180} height={12} borderRadius={4} />
              </View>

              <View style={[styles.kpiCard, styles.kpiCardBlue]}>
                <Skeleton width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
                <Skeleton width={100} height={13} borderRadius={4} style={{ marginBottom: 8 }} />
                <Skeleton width={130} height={22} borderRadius={6} style={{ marginBottom: 8 }} />
                <Skeleton width={170} height={12} borderRadius={4} />
              </View>

              <View style={[styles.kpiCard, styles.kpiCardRose]}>
                <Skeleton width={32} height={32} borderRadius={8} style={{ marginBottom: 10 }} />
                <Skeleton width={90} height={13} borderRadius={4} style={{ marginBottom: 8 }} />
                <Skeleton width={120} height={22} borderRadius={6} style={{ marginBottom: 8 }} />
                <Skeleton width={160} height={12} borderRadius={4} />
              </View>

              <View style={[styles.kpiCard, styles.kpiCardDarkSkeleton]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                  <Skeleton width={120} height={14} borderRadius={4} />
                  <Skeleton width={68} height={18} borderRadius={10} />
                </View>
                <Skeleton width={150} height={26} borderRadius={6} style={{ marginBottom: 8 }} />
                <Skeleton width={210} height={12} borderRadius={4} />
              </View>
            </View>
          )}

          {/* 3. Multi-Line Chart Section */}
          <View style={styles.chartSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Financial Movements & Profit Chart
                </Text>
                <Text style={styles.sectionSub}>
                  Plotting Capital Restocked, Losses (Damage/Spoilage), and
                  Inflow Gains
                </Text>
              </View>
            </View>

            {!summary ? (
              <View style={styles.chartSkeletonCard}>
                <View style={styles.chartSkeletonLegendRow}>
                  <Skeleton width={140} height={26} borderRadius={20} />
                  <Skeleton width={130} height={26} borderRadius={20} />
                  <Skeleton width={120} height={26} borderRadius={20} />
                </View>
                <Skeleton width="100%" height={210} borderRadius={12} />
              </View>
            ) : summary.chartData.length > 0 ? (
              <MultiLineChart data={summary.chartData} height={280} />
            ) : (
              <View style={styles.emptyChartBox}>
                <Text style={styles.emptyChartText}>
                  No recorded transactions for this period.
                </Text>
              </View>
            )}
          </View>

          {/* 4. Product Velocity: Fast-Moving vs Slow-Moving Items */}
          <View style={styles.velocitySection}>
            <View style={styles.velocityHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>
                  Product Movement Analysis
                </Text>
                <Text style={styles.sectionSub}>
                  Identify your best sellers and stagnant capital in stock
                </Text>
              </View>

              {/* Segmented Switcher */}
              <View style={styles.segmentedControl}>
                <Pressable
                  onPress={() => setVelocityTab("fast")}
                  style={[
                    styles.segmentBtn,
                    velocityTab === "fast" && styles.segmentBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="bolt"
                    size={11}
                    color={velocityTab === "fast" ? "#059669" : "#64748b"}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.segmentBtnText,
                      velocityTab === "fast" && styles.segmentBtnTextActive,
                    ]}
                  >
                    Fast Moving
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setVelocityTab("slow")}
                  style={[
                    styles.segmentBtn,
                    velocityTab === "slow" && styles.segmentBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="hourglass-half"
                    size={11}
                    color={velocityTab === "slow" ? "#d97706" : "#64748b"}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.segmentBtnText,
                      velocityTab === "slow" && styles.segmentBtnTextActive,
                    ]}
                  >
                    Slow Moving
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* List Content */}
            {!summary ? (
              <View style={styles.velocityCard}>
                {[1, 2, 3, 4].map((k, idx) => (
                  <View
                    key={`skel-row-${k}`}
                    style={[
                      styles.productRow,
                      idx === 3 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <Skeleton
                      width={28}
                      height={28}
                      borderRadius={14}
                      style={{ marginRight: 12 }}
                    />
                    <View style={styles.productDetails}>
                      <Skeleton
                        width={140}
                        height={16}
                        borderRadius={4}
                        style={{ marginBottom: 6 }}
                      />
                      <Skeleton width={100} height={12} borderRadius={4} />
                    </View>
                    <View style={styles.productStats}>
                      <Skeleton
                        width={60}
                        height={20}
                        borderRadius={8}
                        style={{ marginBottom: 4 }}
                      />
                      <Skeleton width={75} height={14} borderRadius={4} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.velocityCard}>
                {velocityTab === "fast" ? (
                  activeVelocityList.length > 0 ? (
                    paginatedVelocityList.map((p, idx) => {
                      const rank = (velocityPage - 1) * PAGE_SIZE + idx + 1;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() =>
                            router.push({
                              pathname: "/products/[id]",
                              params: { id: p.id.toString() },
                            })
                          }
                          style={[
                            styles.productRow,
                            idx === paginatedVelocityList.length - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                        >
                          <View style={styles.rankCircle}>
                            <Text style={styles.rankText}>#{rank}</Text>
                          </View>
                          <View style={styles.productDetails}>
                            <Text style={styles.productName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.productSub}>
                              {p.category} • Current stock: {p.stock_quantity}{" "}
                              {p.unit}
                            </Text>
                          </View>
                          <View style={styles.productStats}>
                            <Text style={styles.soldBadge}>
                              {p.quantitySold} sold
                            </Text>
                            <Text style={styles.revenueText}>
                              {formatPHP(p.revenueCentavos)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })
                  ) : (
                    <View style={styles.emptyVelocityBox}>
                      <FontAwesome5
                        name="shopping-basket"
                        size={28}
                        color="#cbd5e1"
                      />
                      <Text style={styles.emptyVelocityText}>
                        No products sold in this period yet.
                      </Text>
                    </View>
                  )
                ) : activeVelocityList.length > 0 ? (
                  paginatedVelocityList.map((p, idx) => {
                    const capitalTiedUp = p.stock_quantity * p.cost_price;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() =>
                          router.push({
                            pathname: "/products/[id]",
                            params: { id: p.id.toString() },
                          })
                        }
                        style={[
                          styles.productRow,
                          idx === paginatedVelocityList.length - 1 && {
                            borderBottomWidth: 0,
                          },
                        ]}
                      >
                        <View style={styles.slowIconBox}>
                          <FontAwesome5
                            name="pause-circle"
                            size={16}
                            color="#d97706"
                          />
                        </View>
                        <View style={styles.productDetails}>
                          <Text style={styles.productName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={styles.productSub}>
                            {p.category} •{" "}
                            {p.stock_quantity > 0
                              ? `${p.stock_quantity} ${p.unit} in stock`
                              : "Out of stock (0 in stock)"}
                          </Text>
                        </View>
                        <View style={styles.productStats}>
                          <View style={styles.stagnantPill}>
                            <Text style={styles.stagnantPillText}>
                              {p.quantitySold === 0
                                ? "0 sales"
                                : `${p.quantitySold} sold`}
                            </Text>
                          </View>
                          <Text style={styles.capitalTiedText}>
                            {p.stock_quantity > 0
                              ? `Capital: ${formatPHP(capitalTiedUp)}`
                              : `Cost: ${formatPHP(p.cost_price)}`}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={styles.emptyVelocityBox}>
                    <FontAwesome5
                      name="check-circle"
                      size={28}
                      color="#10b981"
                    />
                    <Text style={styles.emptyVelocityText}>
                      Great job! All products have active sales movement.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {activeVelocityList.length > 0 && (
              <Pagination
                currentPage={velocityPage}
                totalItems={activeVelocityList.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setVelocityPage(p)}
                itemName={velocityTab === "fast" ? "fast-moving items" : "slow-moving items"}
              />
            )}
          </View>
        </ScrollView>
      </AppLayout>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginRight: 6,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  livePulseDotActive: {
    backgroundColor: "#059669",
    transform: [{ scale: 1.4 }],
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065f46",
  },

  // Filter Section
  filterSection: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  periodTabsRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  periodTabTextActive: {
    color: "#0f172a",
    fontWeight: "800",
  },
  subFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  subFilterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginRight: 4,
  },
  subPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  subPillActive: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  subPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  subPillTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  rangeBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  rangeBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065f46",
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: "47%",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  kpiCardEmerald: {
    backgroundColor: "#ffffff",
    borderColor: "#a7f3d0",
  },
  kpiCardBlue: {
    backgroundColor: "#ffffff",
    borderColor: "#bfdbfe",
  },
  kpiCardRose: {
    backgroundColor: "#ffffff",
    borderColor: "#fecaca",
  },
  kpiCardDarkPositive: {
    backgroundColor: "#0f172a",
    borderColor: "#10b981",
    minWidth: "100%",
  },
  kpiCardDarkNegative: {
    backgroundColor: "#0f172a",
    borderColor: "#f87171",
    minWidth: "100%",
  },
  kpiIconCircleEmerald: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiIconCircleBlue: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiIconCircleRose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  kpiLabelDark: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },
  kpiValueDark: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: "#64748b",
  },
  kpiSubDark: {
    fontSize: 11,
    color: "#94a3b8",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillPositive: {
    backgroundColor: "#064e3b",
  },
  statusPillNegative: {
    backgroundColor: "#450a0a",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  kpiCardDarkSkeleton: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    minWidth: "100%",
  },
  chartSkeletonCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chartSkeletonLegendRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },

  // Chart Section
  chartSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  emptyChartBox: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyChartText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },

  // Product Velocity
  velocitySection: {
    marginBottom: 20,
  },
  velocityHeaderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: "#f1f5f9",
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  segmentBtnTextActive: {
    color: "#0f172a",
    fontWeight: "800",
  },
  velocityCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#059669",
  },
  slowIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  productDetails: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2,
  },
  productSub: {
    fontSize: 11,
    color: "#64748b",
  },
  productStats: {
    alignItems: "flex-end",
  },
  soldBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#059669",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 2,
  },
  revenueText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  stagnantPill: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 2,
  },
  stagnantPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b45309",
  },
  capitalTiedText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyVelocityBox: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyVelocityText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
});
