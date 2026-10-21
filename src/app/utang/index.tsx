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
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { CustomerRepository } from '@/database/repositories/customer-repository';
import { supabase } from '@/lib/supabase';
import { AppButton } from '@/components/ui/app-button';
import { AppLayout } from '@/components/navigation/app-layout';
import { Pagination } from '@/components/ui/pagination';
import { formatPHP } from '@/utils/currency';
import { type Customer } from '@/types/database';

const PAGE_SIZE = 15;

export default function UtangListScreen() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'balance' | 'paid'>('all');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const loadCustomers = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const data = await CustomerRepository.getAll({
          search: searchQuery,
          hasBalanceOnly: filterTab === 'balance',
          sortBy: 'balance',
        });
        if (filterTab === 'paid') {
          setCustomers(data.filter((c) => c.outstanding_balance === 0));
        } else {
          setCustomers(data);
        }
      } catch (err) {
        console.error('[UtangList] Failed to load customers:', err);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [searchQuery, filterTab]
  );

  useEffect(() => {
    loadCustomers(true);
  }, [loadCustomers, reloadKey]);

  const loadCustomersRef = useRef(loadCustomers);
  useEffect(() => {
    loadCustomersRef.current = loadCustomers;
  }, [loadCustomers]);

  // Supabase Real-time Listener for Customers, Credit Transactions & Payments
  useEffect(() => {
    const channelId = `utang-realtime-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        () => {
          loadCustomersRef.current(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_transactions' },
        () => {
          loadCustomersRef.current(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_payments' },
        () => {
          loadCustomersRef.current(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Reset page when search or tab filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterTab]);

  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return customers.slice(start, start + PAGE_SIZE);
  }, [customers, page]);

  // Totals across all customers
  const totalOutstanding = customers.reduce((sum, c) => sum + c.outstanding_balance, 0);
  const totalBorrowed = customers.reduce((sum, c) => sum + c.total_credit_amount, 0);
  const totalPaid = customers.reduce((sum, c) => sum + c.total_paid_amount, 0);
  const unpaidCount = customers.filter((c) => c.outstanding_balance > 0).length;


  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppLayout
        activeTab="utang"
        title="Customer Utang"
        headerRight={
          <Pressable
            onPress={() => router.push('/utang/new')}
            style={({ pressed }) => [styles.headerAddBtn, pressed && { opacity: 0.7 }]}
          >
            <FontAwesome5 name="plus" size={13} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.headerAddText}>New Utang</Text>
          </Pressable>
        }
      >
        <View style={styles.safeArea}>
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <FontAwesome5 name="search" size={14} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search customer name or phone..."
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
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setFilterTab('all')}
            style={[styles.tabBtn, filterTab === 'all' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, filterTab === 'all' && styles.tabBtnTextActive]}>
              All ({customers.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFilterTab('balance')}
            style={[styles.tabBtn, filterTab === 'balance' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, filterTab === 'balance' && styles.tabBtnTextActive]}>
              Unpaid Balance ({unpaidCount})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFilterTab('paid')}
            style={[styles.tabBtn, filterTab === 'paid' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, filterTab === 'paid' && styles.tabBtnTextActive]}>
              Fully Paid
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => setReloadKey((k) => k + 1)}
              colors={['#059669']}
            />
          }
        >
          {/* Summary Banner Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View>
                <View style={styles.liveBadgeRow}>
                  <Text style={styles.summarySubtitle}>Total Outstanding Utang</Text>
                </View>
                <Text style={styles.summaryBigAmount}>{formatPHP(totalOutstanding)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <FontAwesome5 name="users" size={12} color="#be123c" style={{ marginRight: 6 }} />
                <Text style={styles.summaryPillText}>{unpaidCount} With Balance</Text>
              </View>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryStatsRow}>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatLabel}>Total Borrowed</Text>
                <Text style={styles.summaryStatValue}>{formatPHP(totalBorrowed)}</Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatLabel}>Total Repaid</Text>
                <Text style={[styles.summaryStatValue, { color: '#059669' }]}>
                  {formatPHP(totalPaid)}
                </Text>
              </View>
            </View>
          </View>

          {/* Customer List Header */}
          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeaderTitle}>Customers ({customers.length})</Text>
            <Pressable
              onPress={() => router.push('/utang/new')}
              style={({ pressed }) => [styles.linkAction, pressed && { opacity: 0.6 }]}
            >
              <FontAwesome5 name="plus-circle" size={13} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.linkActionText}>Add Utang</Text>
            </Pressable>
          </View>

          {/* Customer Cards */}
          {paginatedCustomers.map((customer) => {
            const hasBalance = customer.outstanding_balance > 0;
            return (
              <Pressable
                key={customer.id}
                onPress={() =>
                  router.push({
                    pathname: '/utang/[id]',
                    params: { id: customer.id.toString() },
                  })
                }
                style={({ pressed }) => [styles.customerCard, pressed && styles.cardPressed]}
              >
                <View style={styles.customerCardTop}>
                  <View style={styles.customerAvatar}>
                    <FontAwesome5 name="user" size={15} color="#059669" />
                  </View>

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer.name}
                    </Text>
                    {customer.contact_number ? (
                      <View style={styles.phoneRow}>
                        <FontAwesome name="phone" size={11} color="#64748b" style={{ marginRight: 4 }} />
                        <Text style={styles.phoneText}>{customer.contact_number}</Text>
                      </View>
                    ) : (
                      <Text style={styles.txCountText}>
                        {customer.transaction_count} {customer.transaction_count === 1 ? 'transaction' : 'transactions'}
                      </Text>
                    )}
                  </View>

                  {/* Outstanding Balance Badge */}
                  <View style={[styles.balanceBadge, hasBalance ? styles.balanceBadgeRed : styles.balanceBadgeGreen]}>
                    <Text style={[styles.balanceBadgeLabel, hasBalance ? styles.balanceBadgeLabelRed : styles.balanceBadgeLabelGreen]}>
                      {hasBalance ? 'Balance' : 'Fully Paid'}
                    </Text>
                    <Text style={[styles.balanceBadgeAmount, hasBalance ? styles.balanceBadgeAmountRed : styles.balanceBadgeAmountGreen]}>
                      {formatPHP(customer.outstanding_balance)}
                    </Text>
                  </View>
                </View>

                {/* Items preview if available */}
                {customer.recent_items && (
                  <View style={styles.recentItemsBox}>
                    <FontAwesome5 name="shopping-basket" size={10} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.recentItemsText} numberOfLines={1}>
                      {customer.recent_items}
                    </Text>
                  </View>
                )}

                <View style={styles.customerCardBottom}>
                  <View style={styles.customerMetaCol}>
                    <Text style={styles.metaLabel}>Borrowed</Text>
                    <Text style={styles.metaValue}>{formatPHP(customer.total_credit_amount)}</Text>
                  </View>

                  <View style={styles.customerMetaCol}>
                    <Text style={styles.metaLabel}>Repaid</Text>
                    <Text style={[styles.metaValue, { color: '#059669' }]}>
                      {formatPHP(customer.total_paid_amount)}
                    </Text>
                  </View>

                  <View style={[styles.customerMetaCol, { alignItems: 'flex-end' }]}>
                    <Text style={styles.metaLabel}>Last Activity</Text>
                    <Text style={styles.metaValue}>
                      {customer.last_transaction_date
                        ? new Date(customer.last_transaction_date).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'None'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {customers.length > 0 && (
            <Pagination
              currentPage={page}
              totalItems={customers.length}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              itemName="customers"
            />
          )}

          {/* Empty State */}
          {customers.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome5 name="book-open" size={32} color="#059669" />
              </View>
              <Text style={styles.emptyTitle}>No Utang Records Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No customers found matching "${searchQuery}".`
                  : 'Track customer credit, borrowings, and repayments easily.'}
              </Text>
              <AppButton
                onPress={() => router.push('/utang/new')}
                title="Record New Utang"
                icon={<FontAwesome5 name="plus" size={14} color="#ffffff" />}
                size="md"
                style={{ minWidth: 200 }}
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
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 12,
  },
  headerAddText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    padding: 0,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  tabBtnActive: {
    backgroundColor: '#059669',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBigAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#be123c',
    letterSpacing: -0.5,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  summaryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#be123c',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 14,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e2e8f0',
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  linkAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  customerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    fontSize: 12,
    color: '#64748b',
  },
  txCountText: {
    fontSize: 12,
    color: '#64748b',
  },
  balanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  balanceBadgeRed: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  balanceBadgeGreen: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  balanceBadgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceBadgeLabelRed: {
    color: '#be123c',
  },
  balanceBadgeLabelGreen: {
    color: '#059669',
  },
  balanceBadgeAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  balanceBadgeAmountRed: {
    color: '#be123c',
  },
  balanceBadgeAmountGreen: {
    color: '#059669',
  },
  recentItemsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  recentItemsText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  customerCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  customerMetaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
});
