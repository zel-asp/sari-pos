import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { AppLayout } from '@/components/navigation/app-layout';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StockMovementRepository,
  type StockMovementFilter,
  type StockMovementStats,
} from '@/database/repositories/stock-movement-repository';
import { supabase } from '@/lib/supabase';
import { type StockMovementWithProduct, type MovementType } from '@/types/database';
import { formatPHP } from '@/utils/currency';

const PAGE_SIZE = 15;

export default function StockHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<StockMovementWithProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [directionTab, setDirectionTab] = useState<'all' | 'in' | 'out'>('all');
  const [selectedType, setSelectedType] = useState<'all' | MovementType>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [page, setPage] = useState(1);

  // Fetch stock movements
  const loadMovements = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const filter: StockMovementFilter = {
          search: searchQuery,
          direction: directionTab,
          movementType: selectedType,
          datePeriod: timeFilter,
        };
        const data = await StockMovementRepository.getAll(filter);
        setMovements(data);
      } catch (err) {
        console.error('[StockHistory] Error loading movements:', err);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [searchQuery, directionTab, selectedType, timeFilter]
  );

  useEffect(() => {
    loadMovements(true);
  }, [loadMovements]);

  const loadMovementsRef = useRef(loadMovements);
  useEffect(() => {
    loadMovementsRef.current = loadMovements;
  }, [loadMovements]);

  // Real-time synchronization for stock movements
  useEffect(() => {
    const channelId = `stock-history-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          loadMovementsRef.current(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          loadMovementsRef.current(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, directionTab, selectedType, timeFilter]);

  // Compute summary stats
  const stats: StockMovementStats = useMemo(() => {
    return StockMovementRepository.computeStats(movements);
  }, [movements]);

  // Paginated movements
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return movements.slice(start, start + PAGE_SIZE);
  }, [movements, page]);

  // Format date helper
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const datePart = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timePart = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${datePart} • ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  const getMovementMeta = (m: StockMovementWithProduct) => {
    const isPositive = Number(m.quantity) > 0;
    const isZero = Number(m.quantity) === 0;

    let badgeColor = '#059669';
    let badgeBg = '#ecfdf5';
    let badgeLabel = 'Restock';
    let iconName = 'arrow-down';

    switch (m.movement_type) {
      case 'initial':
        badgeColor = '#0284c7';
        badgeBg = '#f0f9ff';
        badgeLabel = 'Initial Stock';
        iconName = 'box';
        break;
      case 'restock':
        badgeColor = '#059669';
        badgeBg = '#ecfdf5';
        badgeLabel = 'Restock (IN)';
        iconName = 'arrow-down';
        break;
      case 'sale':
        badgeColor = '#64748b';
        badgeBg = '#f1f5f9';
        badgeLabel = 'POS Sale (OUT)';
        iconName = 'shopping-bag';
        break;
      case 'damage':
        badgeColor = '#e11d48';
        badgeBg = '#fff1f2';
        badgeLabel = 'Loss / Damaged';
        iconName = 'exclamation-triangle';
        break;
      case 'return':
        badgeColor = '#8b5cf6';
        badgeBg = '#f5f3ff';
        badgeLabel = 'Returned';
        iconName = 'undo';
        break;
      case 'adjustment':
      default:
        badgeColor = isPositive ? '#059669' : '#d97706';
        badgeBg = isPositive ? '#ecfdf5' : '#fffbeb';
        badgeLabel = isPositive ? 'Adjustment (+)' : 'Adjustment (-)';
        iconName = 'sliders-h';
        break;
    }

    return {
      isPositive,
      isZero,
      badgeColor,
      badgeBg,
      badgeLabel,
      iconName,
    };
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLayout
        activeTab="stock-history"
        title="Stock History"
        headerRight={
          <Pressable
            onPress={() => router.push('/inventory')}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          >
            <FontAwesome5 name="boxes" size={13} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.headerBtnText}>Inventory</Text>
          </Pressable>
        }
      >
        <View style={styles.safeArea}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => loadMovements(true)}
                colors={['#059669']}
              />
            }
          >
            {/* 1. Header Banner & Stats */}
            <View style={styles.bannerCard}>
              <View style={styles.bannerTopRow}>
                <View>
                  <View style={styles.liveBadgeRow}>
                    <Text style={styles.bannerSubtitle}>Stock Movements</Text>
                  </View>
                  <Text style={styles.bannerTitle}>In & Out History</Text>
                </View>

                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>{movements.length} Records</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                {/* Comes In */}
                <View style={[styles.statBox, styles.statBoxIn]}>
                  <View style={styles.statLabelRow}>
                    <FontAwesome5 name="arrow-down" size={11} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={styles.statLabelIn}>Comes In</Text>
                  </View>
                  <Text style={styles.statNumberIn}>+{stats.totalInUnits.toLocaleString()}</Text>
                  <Text style={styles.statCountText}>{stats.totalInCount} arrivals</Text>
                </View>

                {/* Comes Out */}
                <View style={[styles.statBox, styles.statBoxOut]}>
                  <View style={styles.statLabelRow}>
                    <FontAwesome5 name="arrow-up" size={11} color="#e11d48" style={{ marginRight: 4 }} />
                    <Text style={styles.statLabelOut}>Comes Out</Text>
                  </View>
                  <Text style={styles.statNumberOut}>-{stats.totalOutUnits.toLocaleString()}</Text>
                  <Text style={styles.statCountText}>{stats.totalOutCount} departures</Text>
                </View>

                {/* Net Change */}
                <View style={[styles.statBox, styles.statBoxNet]}>
                  <View style={styles.statLabelRow}>
                    <FontAwesome5 name="balance-scale" size={11} color="#0284c7" style={{ marginRight: 4 }} />
                    <Text style={styles.statLabelNet}>Net Change</Text>
                  </View>
                  <Text style={[styles.statNumberNet, { color: stats.netUnits >= 0 ? '#0284c7' : '#e11d48' }]}>
                    {stats.netUnits > 0 ? `+${stats.netUnits.toLocaleString()}` : stats.netUnits.toLocaleString()}
                  </Text>
                  <Text style={styles.statCountText}>Units balance</Text>
                </View>
              </View>
            </View>

            {/* 2. Direction Tabs (Comes In vs Comes Out vs All) */}
            <View style={styles.directionTabRow}>
              <Pressable
                onPress={() => setDirectionTab('all')}
                style={[styles.directionTab, directionTab === 'all' && styles.directionTabActive]}
              >
                <FontAwesome5
                  name="list"
                  size={12}
                  color={directionTab === 'all' ? '#ffffff' : '#64748b'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.directionTabText, directionTab === 'all' && styles.directionTabTextActive]}>
                  All Movements
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setDirectionTab('in')}
                style={[styles.directionTab, directionTab === 'in' && styles.directionTabActiveIn]}
              >
                <FontAwesome5
                  name="arrow-down"
                  size={12}
                  color={directionTab === 'in' ? '#ffffff' : '#059669'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.directionTabText, directionTab === 'in' && styles.directionTabTextActive]}>
                  Comes In ({stats.totalInCount})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setDirectionTab('out')}
                style={[styles.directionTab, directionTab === 'out' && styles.directionTabActiveOut]}
              >
                <FontAwesome5
                  name="arrow-up"
                  size={12}
                  color={directionTab === 'out' ? '#ffffff' : '#e11d48'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.directionTabText, directionTab === 'out' && styles.directionTabTextActive]}>
                  Comes Out ({stats.totalOutCount})
                </Text>
              </Pressable>
            </View>

            {/* 3. Search and Type/Time Filters */}
            <View style={styles.searchBar}>
              <FontAwesome5 name="search" size={14} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search product, barcode, or reason..."
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                  <FontAwesome name="times-circle" size={16} color="#94a3b8" />
                </Pressable>
              )}
            </View>

            {/* Filter Pills Row (Time Period) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterPillsScroll}
              contentContainerStyle={styles.filterPillsContent}
            >
              <Text style={styles.filterGroupLabel}>Period:</Text>
              {(['all', 'today', 'week', 'month'] as const).map((period) => (
                <Pressable
                  key={period}
                  onPress={() => setTimeFilter(period)}
                  style={[styles.filterPill, timeFilter === period && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, timeFilter === period && styles.filterPillTextActive]}>
                    {period === 'all'
                      ? 'All Time'
                      : period === 'today'
                      ? 'Today'
                      : period === 'week'
                      ? 'Past 7 Days'
                      : 'This Month'}
                  </Text>
                </Pressable>
              ))}

              <View style={styles.pillDivider} />

              <Text style={styles.filterGroupLabel}>Type:</Text>
              {(['all', 'restock', 'sale', 'damage', 'adjustment', 'initial'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setSelectedType(type)}
                  style={[styles.filterPill, selectedType === type && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, selectedType === type && styles.filterPillTextActive]}>
                    {type === 'all'
                      ? 'All Types'
                      : type === 'restock'
                      ? 'Restock'
                      : type === 'sale'
                      ? 'Sale'
                      : type === 'damage'
                      ? 'Damage / Loss'
                      : type === 'adjustment'
                      ? 'Adjustment'
                      : 'Initial'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* 4. Movements List */}
            {loading ? (
              <View style={styles.loadingContainer}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={styles.skeletonCard}>
                    <Skeleton width="60%" height={18} borderRadius={4} style={{ marginBottom: 8 }} />
                    <Skeleton width="40%" height={14} borderRadius={4} style={{ marginBottom: 12 }} />
                    <Skeleton width="100%" height={24} borderRadius={4} />
                  </View>
                ))}
              </View>
            ) : paginatedMovements.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <FontAwesome5 name="history" size={28} color="#059669" />
                </View>
                <Text style={styles.emptyTitle}>No Stock Movements Found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? `No movements matching "${searchQuery}".`
                    : 'Stock movements recorded via restock, sales, or adjustments will appear here.'}
                </Text>
                <Pressable
                  onPress={() => {
                    setSearchQuery('');
                    setDirectionTab('all');
                    setSelectedType('all');
                    setTimeFilter('all');
                  }}
                  style={styles.resetFilterBtn}
                >
                  <Text style={styles.resetFilterBtnText}>Reset Filters</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.movementsList}>
                {paginatedMovements.map((item) => {
                  const meta = getMovementMeta(item);
                  const qty = Number(item.quantity);
                  const isPositive = qty > 0;
                  const unitStr = item.product?.unit || 'pcs';

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        if (item.product?.id) {
                          router.push({
                            pathname: '/products/[id]',
                            params: { id: item.product.id.toString() },
                          });
                        }
                      }}
                      style={({ pressed }) => [styles.movementCard, pressed && styles.cardPressed]}
                    >
                      {/* Card Top: Direction Icon, Product Name, and Delta */}
                      <View style={styles.movementCardTop}>
                        <View style={[styles.iconCircle, isPositive ? styles.iconCircleIn : styles.iconCircleOut]}>
                          <FontAwesome5
                            name={isPositive ? 'arrow-down' : 'arrow-up'}
                            size={14}
                            color={isPositive ? '#059669' : '#e11d48'}
                          />
                        </View>

                        <View style={styles.productDetails}>
                          <Text style={styles.productName} numberOfLines={1}>
                            {item.product?.name || `Product #${item.product_id}`}
                          </Text>
                          <View style={styles.productMetaRow}>
                            {item.product?.category && (
                              <View style={styles.categoryBadge}>
                                <Text style={styles.categoryBadgeText}>{item.product.category}</Text>
                              </View>
                            )}
                            <Text style={styles.timestampText}>{formatDateTime(item.created_at)}</Text>
                          </View>
                        </View>

                        {/* Large Delta Number */}
                        <View style={styles.deltaBox}>
                          <Text style={[styles.deltaText, isPositive ? styles.deltaTextIn : styles.deltaTextOut]}>
                            {isPositive ? `+${qty}` : `${qty}`}
                          </Text>
                          <Text style={styles.deltaUnit}>{unitStr}</Text>
                        </View>
                      </View>

                      {/* Card Middle: Transition Flow (Previous -> New) */}
                      <View style={styles.transitionRow}>
                        <View style={styles.transitionBox}>
                          <Text style={styles.transitionLabel}>Previous</Text>
                          <Text style={styles.transitionValue}>
                            {item.previous_quantity} {unitStr}
                          </Text>
                        </View>

                        <FontAwesome5 name="long-arrow-alt-right" size={14} color="#94a3b8" />

                        <View style={styles.transitionBox}>
                          <Text style={styles.transitionLabel}>New Stock</Text>
                          <Text style={[styles.transitionValue, { fontWeight: '800', color: '#0f172a' }]}>
                            {item.new_quantity} {unitStr}
                          </Text>
                        </View>

                        {/* Movement Type Pill */}
                        <View style={[styles.typePill, { backgroundColor: meta.badgeBg }]}>
                          <Text style={[styles.typePillText, { color: meta.badgeColor }]}>
                            {meta.badgeLabel}
                          </Text>
                        </View>
                      </View>

                      {/* Card Bottom: Reason & Reference note */}
                      <View style={styles.reasonRow}>
                        <FontAwesome5 name="info-circle" size={11} color="#64748b" style={{ marginRight: 6 }} />
                        <Text style={styles.reasonText} numberOfLines={2}>
                          {item.reason || 'Stock recorded via system'}
                          {item.reference_id ? ` (Ref: #${item.reference_id})` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {/* 5. Pagination */}
                <Pagination
                  currentPage={page}
                  totalItems={movements.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setPage(p)}
                  itemName="movements"
                />
              </View>
            )}
          </ScrollView>
        </View>
      </AppLayout>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },

  // 1. Banner Card
  bannerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  bannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.4,
  },
  totalBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  totalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  statBoxIn: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statBoxOut: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  statBoxNet: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statLabelIn: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
  },
  statLabelOut: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e11d48',
    textTransform: 'uppercase',
  },
  statLabelNet: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
    textTransform: 'uppercase',
  },
  statNumberIn: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  statNumberOut: {
    fontSize: 16,
    fontWeight: '900',
    color: '#e11d48',
  },
  statNumberNet: {
    fontSize: 16,
    fontWeight: '900',
  },
  statCountText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },

  // 2. Direction Tabs
  directionTabRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  directionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  directionTabActive: {
    backgroundColor: '#0f172a',
  },
  directionTabActiveIn: {
    backgroundColor: '#059669',
  },
  directionTabActiveOut: {
    backgroundColor: '#e11d48',
  },
  directionTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  directionTabTextActive: {
    color: '#ffffff',
  },

  // 3. Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    height: '100%',
  },

  // Filter Pills Scroll
  filterPillsScroll: {
    marginBottom: 16,
  },
  filterPillsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginRight: 6,
    textTransform: 'uppercase',
  },
  filterPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    marginRight: 6,
  },
  filterPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  pillDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 8,
  },

  // 4. Movement Card
  movementsList: {
    gap: 10,
  },
  movementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  movementCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconCircleIn: {
    backgroundColor: '#ecfdf5',
  },
  iconCircleOut: {
    backgroundColor: '#fff1f2',
  },
  productDetails: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 3,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  timestampText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  deltaBox: {
    alignItems: 'flex-end',
  },
  deltaText: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  deltaTextIn: {
    color: '#059669',
  },
  deltaTextOut: {
    color: '#e11d48',
  },
  deltaUnit: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },

  // Transition Row
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  transitionBox: {
    alignItems: 'center',
  },
  transitionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  transitionValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Reason Row
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  reasonText: {
    fontSize: 12,
    color: '#64748b',
    flex: 1,
    fontStyle: 'italic',
  },

  // Empty / Skeleton
  skeletonCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingContainer: {
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  resetFilterBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFilterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
});
