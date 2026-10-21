import { AppLayout } from "@/components/navigation/app-layout";
import { ProductCard } from "@/components/products/product-card";
import { AppButton } from "@/components/ui/app-button";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useProducts } from "@/hooks/use-products";
import { formatPHP } from "@/utils/currency";
import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type StatusFilter = "all" | "low_stock" | "out_of_stock";

const PAGE_SIZE = 15;

export default function InventoryScreen() {
  const { products, categories, loading, refresh } =
    useProducts();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [seeding, setSeeding] = useState(false);

  // Compute summary stats
  const stats = useMemo(() => {
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalValuation = 0;

    for (const p of products) {
      if (p.stock_quantity <= 0) {
        outOfStockCount++;
      } else if (p.stock_quantity <= p.minimum_stock) {
        lowStockCount++;
      }
      totalValuation += p.cost_price * p.stock_quantity;
    }

    return {
      totalCount: products.length,
      lowStockCount,
      outOfStockCount,
      totalValuation,
    };
  }, [products]);

  // Client-side filtering for fast responsive typing
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      // Status filter
      if (statusFilter === "low_stock") {
        if (!(p.stock_quantity <= p.minimum_stock && p.stock_quantity > 0))
          return false;
      } else if (statusFilter === "out_of_stock") {
        if (p.stock_quantity > 0) return false;
      }

      // Category filter
      if (selectedCategory !== "All" && p.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (q) {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBarcode = p.barcode ? p.barcode.includes(q) : false;
        if (!matchesName && !matchesBarcode) return false;
      }

      return true;
    });
  }, [products, search, selectedCategory, statusFilter]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, statusFilter]);

  // Paginate products (15 per page)
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, page]);

  const toast = useToast();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLayout
        activeTab="inventory"
        title="Inventory & Products"
        headerRight={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable
              onPress={() => router.push("/stock-history")}
              style={styles.headerHistoryButton}
            >
              <FontAwesome5
                name="history"
                size={11}
                color="#059669"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.headerHistoryButtonText}>History</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/products/new")}
              style={styles.headerButton}
            >
              <FontAwesome5
                name="plus"
                size={10}
                color="#ffffff"
                style={{ marginRight: 5 }}
              />
              <Text style={styles.headerButtonText}>Add Product</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.container}>
          {/* Top Summary Bar */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryTopRow}>
              <View>
                <View style={styles.liveBadgeRow}>
                  <Text style={styles.valuationLabel}>
                    Inventory Valuation (Cost)
                  </Text>
                </View>
                <Text style={styles.valuationValue}>
                  {formatPHP(stats.totalValuation)}
                </Text>
              </View>
              <View style={styles.countPillsRow}>
                <View style={styles.countPill}>
                  <Text style={styles.countPillNumber}>{stats.totalCount}</Text>
                  <Text style={styles.countPillLabel}>Products</Text>
                </View>
                {stats.lowStockCount > 0 && (
                  <View style={[styles.countPill, styles.countPillWarning]}>
                    <Text
                      style={[styles.countPillNumber, { color: "#92400e" }]}
                    >
                      {stats.lowStockCount}
                    </Text>
                    <Text style={[styles.countPillLabel, { color: "#b45309" }]}>
                      Low
                    </Text>
                  </View>
                )}
                {stats.outOfStockCount > 0 && (
                  <View style={[styles.countPill, styles.countPillDanger]}>
                    <Text
                      style={[styles.countPillNumber, { color: "#9f1239" }]}
                    >
                      {stats.outOfStockCount}
                    </Text>
                    <Text style={[styles.countPillLabel, { color: "#be123c" }]}>
                      Out
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Search Box with Search Icon */}
            <View style={styles.searchBox}>
              <FontAwesome
                name="search"
                size={14}
                color="#64748b"
                style={{ marginRight: 8 }}
              />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search product name or barcode..."
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <FontAwesome name="times-circle" size={16} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {/* Status Filter Tabs with Icons */}
            <View style={styles.filterTabsRow}>
              <Pressable
                onPress={() => setStatusFilter("all")}
                style={[
                  styles.filterTab,
                  statusFilter === "all" && styles.filterTabActive,
                ]}
              >
                <FontAwesome5
                  name="boxes"
                  size={11}
                  color={statusFilter === "all" ? "#ffffff" : "#64748b"}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.filterTabText,
                    statusFilter === "all" && styles.filterTabTextActive,
                  ]}
                >
                  All ({stats.totalCount})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setStatusFilter("low_stock")}
                style={[
                  styles.filterTab,
                  statusFilter === "low_stock" && styles.filterTabWarning,
                ]}
              >
                <FontAwesome5
                  name="exclamation-triangle"
                  size={11}
                  color={statusFilter === "low_stock" ? "#ffffff" : "#b45309"}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.filterTabText,
                    statusFilter === "low_stock" && styles.filterTabTextActive,
                  ]}
                >
                  Low Stock ({stats.lowStockCount})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setStatusFilter("out_of_stock")}
                style={[
                  styles.filterTab,
                  statusFilter === "out_of_stock" && styles.filterTabDanger,
                ]}
              >
                <FontAwesome5
                  name="times-circle"
                  size={11}
                  color={
                    statusFilter === "out_of_stock" ? "#ffffff" : "#be123c"
                  }
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.filterTabText,
                    statusFilter === "out_of_stock" &&
                      styles.filterTabTextActive,
                  ]}
                >
                  Out ({stats.outOfStockCount})
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Categories Horizontal Scroll */}
          {categories.length > 0 && (
            <View style={styles.categoriesBar}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={["All", ...categories]}
                keyExtractor={(cat) => cat}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                renderItem={({ item: cat }) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <Pressable
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryPill,
                        isSelected && styles.categoryPillSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryPillText,
                          isSelected && styles.categoryPillTextSelected,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          )}

          {/* Product List */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Loading inventory...</Text>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              {products.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconCircle}>
                    <FontAwesome5 name="boxes" size={28} color="#059669" />
                  </View>
                  <Text style={styles.emptyTitle}>Inventory is Empty</Text>
                  <Text style={styles.emptySubtitle}>
                    Get started by adding your first product or load sample
                    Philippine sari-sari store products.
                  </Text>

                  <AppButton
                    onPress={() => router.push("/products/new")}
                    title="Add New Product"
                    icon={
                      <FontAwesome5 name="plus" size={12} color="#ffffff" />
                    }
                    size="md"
                    style={{ width: "100%" }}
                  />
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <View
                    style={[
                      styles.emptyIconCircle,
                      { backgroundColor: "#f1f5f9" },
                    ]}
                  >
                    <FontAwesome name="search" size={24} color="#94a3b8" />
                  </View>
                  <Text style={styles.emptyTitle}>No Matching Products</Text>
                  <Text style={styles.emptySubtitle}>
                    No products matched your search or filter criteria.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setSearch("");
                      setStatusFilter("all");
                      setSelectedCategory("All");
                    }}
                    style={styles.resetButton}
                  >
                    <Text style={styles.resetButtonText}>Reset Filters</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <FlatList
              data={paginatedProducts}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={refresh}
                  colors={["#059669"]}
                />
              }
              ListFooterComponent={
                <Pagination
                  currentPage={page}
                  totalItems={filteredProducts.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setPage(p)}
                  itemName="products"
                />
              }
              renderItem={({ item }) => (
                <ProductCard
                  product={item}
                  onPress={() =>
                    router.push({
                      pathname: "/products/[id]",
                      params: { id: item.id.toString() },
                    })
                  }
                  onRestockPress={() =>
                    router.push({
                      pathname: "/products/[id]",
                      params: { id: item.id.toString() },
                    })
                  }
                />
              )}
            />
          )}
        </View>
      </AppLayout>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  headerHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  headerHistoryButtonText: {
    color: "#059669",
    fontWeight: "700",
    fontSize: 12,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  headerButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  summaryBar: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  liveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  valuationLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  valuationValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#047857",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  countPillsRow: {
    flexDirection: "row",
    gap: 6,
  },
  countPill: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 44,
  },
  countPillWarning: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
  },
  countPillDanger: {
    backgroundColor: "#ffe4e6",
    borderColor: "#fecdd3",
  },
  countPillNumber: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e293b",
  },
  countPillLabel: {
    fontSize: 9,
    color: "#64748b",
    fontWeight: "600",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "500",
    padding: 0,
  },
  filterTabsRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: "#1e293b",
    borderColor: "#1e293b",
  },
  filterTabWarning: {
    backgroundColor: "#d97706",
    borderColor: "#d97706",
  },
  filterTabDanger: {
    backgroundColor: "#e11d48",
    borderColor: "#e11d48",
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  filterTabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  categoriesBar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 10,
  },
  categoryPill: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryPillSelected: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  categoryPillTextSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 70,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  primaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 20,
    width: "100%",
    marginBottom: 10,
  },
  primaryActionButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    width: "100%",
  },
  secondaryActionButtonText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
  resetButton: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
});
