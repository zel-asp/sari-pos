import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { CustomerRepository } from '@/database/repositories/customer-repository';
import { supabase } from '@/lib/supabase';
import { formatPHP } from '@/utils/currency';
import {
  type Customer,
  type CreditTransaction,
  type CustomerPayment,
} from '@/types/database';
import UtangListScreen from './index';

export default function CustomerProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parsedId = id && id !== 'index' ? parseInt(id, 10) : NaN;

  if (!id || id === 'index' || isNaN(parsedId) || parsedId <= 0) {
    return <UtangListScreen />;
  }

  return <CustomerProfileScreen customerId={parsedId} />;
}

function CustomerProfileScreen({ customerId }: { customerId: number }) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [activeTab, setActiveTab] = useState<'utang' | 'payments'>('utang');

  // Payment Modal state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmountStr, setPaymentAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!customerId) return;
    let isMounted = true;

    Promise.all([
      CustomerRepository.getById(customerId),
      CustomerRepository.getCustomerTransactions(customerId),
      CustomerRepository.getCustomerPayments(customerId),
    ])
      .then(([cust, txs, pays]) => {
        if (isMounted) {
          setCustomer(cust);
          setTransactions(txs);
          setPayments(pays);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[CustomerProfile] Load error:', err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [customerId, reloadKey]);

  // Real-time synchronization for customer utang profile, transactions & payments
  useEffect(() => {
    if (!customerId) return;
    const channelId = `customer-profile-live-${customerId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` },
        () => {
          setReloadKey((k) => k + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_transactions', filter: `customer_id=eq.${customerId}` },
        () => {
          setReloadKey((k) => k + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customer_payments', filter: `customer_id=eq.${customerId}` },
        () => {
          setReloadKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  const loadCustomerData = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Open Payment Modal
  const openPaymentModal = () => {
    if (!customer || customer.outstanding_balance <= 0) {
      toast.info('No Balance Owed', `${customer?.name || 'Customer'} has ₱0.00 outstanding balance.`);
      return;
    }
    // Default to full balance
    setPaymentAmountStr((customer.outstanding_balance / 100).toFixed(2));
    setPaymentNotes('');
    setPaymentModalVisible(true);
  };

  // Submit Payment
  const handlePaymentSubmit = async () => {
    if (!customer) return;

    const parsedPesos = parseFloat(paymentAmountStr);
    if (isNaN(parsedPesos) || parsedPesos <= 0) {
      toast.error('Invalid Amount', 'Please enter a valid payment amount greater than ₱0.00.');
      return;
    }

    const centavos = Math.round(parsedPesos * 100);

    if (centavos > customer.outstanding_balance) {
      toast.error(
        'Amount Exceeds Balance',
        `Payment (₱${parsedPesos.toFixed(2)}) cannot exceed outstanding balance of ₱${(
          customer.outstanding_balance / 100
        ).toFixed(2)}.`
      );
      return;
    }

    try {
      setSubmittingPayment(true);
      const result = await CustomerRepository.recordPayment({
        customerId: customer.id,
        amount: centavos,
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      });

      setPaymentModalVisible(false);
      setCustomer(result.customer);
      toast.success(
        'Payment Recorded!',
        `₱${parsedPesos.toFixed(2)} received from ${result.customer.name}. New balance: ${formatPHP(
          result.customer.outstanding_balance
        )}.`
      );
      // Reload history
      loadCustomerData();
    } catch (err) {
      toast.error(
        'Payment Error',
        err instanceof Error ? err.message : 'Failed to record payment.'
      );
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (!customer && !loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <FontAwesome5 name="exclamation-circle" size={40} color="#be123c" />
          <Text style={styles.errorTitle}>Customer Not Found</Text>
          <Text style={styles.errorSubtitle}>
            The customer record could not be located in the database.
          </Text>
          <AppButton
            onPress={() => router.back()}
            title="Go Back"
            variant="outline"
            size="md"
            style={{ marginTop: 16 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const hasBalance = (customer?.outstanding_balance ?? 0) > 0;
  const currentPaymentPesos = parseFloat(paymentAmountStr) || 0;
  const currentPaymentCentavos = Math.round(currentPaymentPesos * 100);
  const remainingAfterPayment = Math.max(
    0,
    (customer?.outstanding_balance ?? 0) - currentPaymentCentavos
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: customer ? customer.name : 'Customer Profile',
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#059669',
          headerTitleStyle: { fontWeight: '900' },
          headerRight: () => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/utang/new',
                  params: { customerId: customer?.id.toString() },
                })
              }
              style={({ pressed }) => [styles.headerAddBtn, pressed && { opacity: 0.7 }]}
            >
              <FontAwesome5 name="plus" size={12} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.headerAddText}>Add Utang</Text>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadCustomerData}
              colors={['#059669']}
            />
          }
        >
          {customer && (
            <>
              {/* Profile Card */}
              <View style={styles.profileCard}>
                <View style={styles.profileTopRow}>
                  <View style={styles.avatarCircle}>
                    <FontAwesome5 name="user" size={24} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{customer.name}</Text>
                    {customer.contact_number && (
                      <View style={styles.profileMetaRow}>
                        <FontAwesome name="phone" size={12} color="#64748b" style={{ marginRight: 6 }} />
                        <Text style={styles.profileMetaText}>{customer.contact_number}</Text>
                      </View>
                    )}
                    {customer.notes && (
                      <Text style={styles.profileNotes} numberOfLines={2}>
                        &ldquo;{customer.notes}&rdquo;
                      </Text>
                    )}
                  </View>
                </View>

                {/* Outstanding Balance Banner */}
                <View
                  style={[
                    styles.balanceBanner,
                    hasBalance ? styles.balanceBannerRed : styles.balanceBannerGreen,
                  ]}
                >
                  <View>
                    <Text
                      style={[
                        styles.balanceBannerLabel,
                        hasBalance ? styles.balanceBannerLabelRed : styles.balanceBannerLabelGreen,
                      ]}
                    >
                      {hasBalance ? 'Remaining Outstanding Balance' : 'Account Status'}
                    </Text>
                    <Text
                      style={[
                        styles.balanceBannerAmount,
                        hasBalance ? styles.balanceBannerAmountRed : styles.balanceBannerAmountGreen,
                      ]}
                    >
                      {hasBalance ? formatPHP(customer.outstanding_balance) : 'Fully Paid (₱0.00)'}
                    </Text>
                  </View>

                  {hasBalance && (
                    <Pressable
                      onPress={openPaymentModal}
                      style={({ pressed }) => [styles.payNowBtn, pressed && { opacity: 0.8 }]}
                    >
                      <FontAwesome5 name="money-bill-wave" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.payNowBtnText}>Pay Now</Text>
                    </Pressable>
                  )}
                </View>

                {/* Stat Breakdown Row */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Total Borrowed</Text>
                    <Text style={styles.statBoxValue}>{formatPHP(customer.total_credit_amount)}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Total Repaid</Text>
                    <Text style={[styles.statBoxValue, { color: '#059669' }]}>
                      {formatPHP(customer.total_paid_amount)}
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Transactions</Text>
                    <Text style={styles.statBoxValue}>{customer.transaction_count}</Text>
                  </View>
                </View>

                {/* Quick Action Buttons */}
                <View style={styles.actionButtonsRow}>
                  <AppButton
                    onPress={openPaymentModal}
                    title="Record Repayment"
                    icon={<FontAwesome5 name="hand-holding-usd" size={14} color="#ffffff" />}
                    size="md"
                    disabled={!hasBalance}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                  <AppButton
                    onPress={() =>
                      router.push({
                        pathname: '/utang/new',
                        params: { customerId: customer.id.toString() },
                      })
                    }
                    title="+ New Utang"
                    variant="secondary"
                    size="md"
                    style={{ flex: 1 }}
                  />
                </View>
              </View>

              {/* History Tabs */}
              <View style={styles.historyTabsRow}>
                <Pressable
                  onPress={() => setActiveTab('utang')}
                  style={[styles.historyTab, activeTab === 'utang' && styles.historyTabActive]}
                >
                  <FontAwesome5
                    name="shopping-bag"
                    size={13}
                    color={activeTab === 'utang' ? '#059669' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.historyTabText,
                      activeTab === 'utang' && styles.historyTabTextActive,
                    ]}
                  >
                    Borrowing History ({transactions.length})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setActiveTab('payments')}
                  style={[styles.historyTab, activeTab === 'payments' && styles.historyTabActive]}
                >
                  <FontAwesome5
                    name="receipt"
                    size={13}
                    color={activeTab === 'payments' ? '#059669' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.historyTabText,
                      activeTab === 'payments' && styles.historyTabTextActive,
                    ]}
                  >
                    Payment History ({payments.length})
                  </Text>
                </Pressable>
              </View>

              {/* Tab 1: Borrowing History */}
              {activeTab === 'utang' && (
                <View>
                  {transactions.map((tx) => (
                    <View key={tx.id} style={styles.historyCard}>
                      <View style={styles.historyCardHeader}>
                        <View>
                          <Text style={styles.historyTxNumber}>{tx.transaction_number}</Text>
                          <Text style={styles.historyDate}>
                            {new Date(tx.transaction_date).toLocaleString('en-PH', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </Text>
                        </View>
                        <Text style={styles.historyAmount}>{formatPHP(tx.total_amount)}</Text>
                      </View>

                      {/* Line Items breakdown */}
                      {tx.items && tx.items.length > 0 && (
                        <View style={styles.lineItemsBox}>
                          {tx.items.map((item) => (
                            <View key={item.id} style={styles.lineItemRow}>
                              <Text style={styles.lineItemName}>
                                {item.quantity}x {item.product_name_snapshot}
                              </Text>
                              <Text style={styles.lineItemSubtotal}>
                                {formatPHP(item.subtotal)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {tx.notes && (
                        <Text style={styles.historyNotes}>Note: {tx.notes}</Text>
                      )}
                    </View>
                  ))}

                  {transactions.length === 0 && (
                    <View style={styles.emptyHistoryBox}>
                      <Text style={styles.emptyHistoryText}>No borrowing records yet.</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Tab 2: Payment History */}
              {activeTab === 'payments' && (
                <View>
                  {payments.map((p) => (
                    <View key={p.id} style={styles.paymentCard}>
                      <View style={styles.historyCardHeader}>
                        <View>
                          <Text style={styles.historyTxNumber}>{p.payment_number}</Text>
                          <Text style={styles.historyDate}>
                            {new Date(p.payment_date).toLocaleString('en-PH', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.paymentAmount}>{formatPHP(p.amount)}</Text>
                          <Text style={styles.paymentMethodBadge}>
                            {p.payment_method.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {p.notes && (
                        <Text style={styles.historyNotes}>Note: {p.notes}</Text>
                      )}
                    </View>
                  ))}

                  {payments.length === 0 && (
                    <View style={styles.emptyHistoryBox}>
                      <Text style={styles.emptyHistoryText}>No repayments recorded yet.</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Record Repayment Modal */}
        <Modal
          visible={paymentModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPaymentModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Record Repayment</Text>
                  <Text style={styles.modalSubtitle}>Customer: {customer?.name}</Text>
                </View>
                <Pressable
                  onPress={() => setPaymentModalVisible(false)}
                  hitSlop={10}
                  style={styles.modalCloseBtn}
                >
                  <FontAwesome name="times" size={18} color="#64748b" />
                </Pressable>
              </View>

              {/* Current Outstanding Balance Display */}
              <View style={styles.modalBalanceBox}>
                <Text style={styles.modalBalanceLabel}>Current Outstanding Balance</Text>
                <Text style={styles.modalBalanceValue}>
                  {formatPHP(customer?.outstanding_balance ?? 0)}
                </Text>
              </View>

              {/* Amount Input */}
              <Text style={styles.inputLabel}>
                Payment Amount (₱) <Text style={{ color: '#be123c' }}>*</Text>
              </Text>
              <TextInput
                value={paymentAmountStr}
                onChangeText={setPaymentAmountStr}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />

              {/* Quick Amount Selector Buttons */}
              <View style={styles.quickButtonsRow}>
                <Pressable
                  onPress={() =>
                    setPaymentAmountStr(
                      ((customer?.outstanding_balance ?? 0) / 100).toFixed(2)
                    )
                  }
                  style={styles.quickBtn}
                >
                  <Text style={styles.quickBtnText}>Full Balance</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaymentAmountStr('100.00')}
                  style={styles.quickBtn}
                >
                  <Text style={styles.quickBtnText}>₱100</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaymentAmountStr('50.00')}
                  style={styles.quickBtn}
                >
                  <Text style={styles.quickBtnText}>₱50</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaymentAmountStr('20.00')}
                  style={styles.quickBtn}
                >
                  <Text style={styles.quickBtnText}>₱20</Text>
                </Pressable>
              </View>

              {/* Preview Remaining Balance */}
              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Remaining balance after payment:</Text>
                <Text
                  style={[
                    styles.previewValue,
                    remainingAfterPayment === 0 ? { color: '#059669' } : { color: '#be123c' },
                  ]}
                >
                  {formatPHP(remainingAfterPayment)}
                </Text>
              </View>

              {/* Payment Method Selector */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Payment Method</Text>
              <View style={styles.methodToggleRow}>
                <Pressable
                  onPress={() => setPaymentMethod('cash')}
                  style={[
                    styles.methodBtn,
                    paymentMethod === 'cash' && styles.methodBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="money-bill"
                    size={13}
                    color={paymentMethod === 'cash' ? '#ffffff' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.methodBtnText,
                      paymentMethod === 'cash' && styles.methodBtnTextActive,
                    ]}
                  >
                    Cash
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setPaymentMethod('gcash')}
                  style={[
                    styles.methodBtn,
                    paymentMethod === 'gcash' && styles.methodBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="mobile-alt"
                    size={13}
                    color={paymentMethod === 'gcash' ? '#ffffff' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.methodBtnText,
                      paymentMethod === 'gcash' && styles.methodBtnTextActive,
                    ]}
                  >
                    GCash
                  </Text>
                </Pressable>
              </View>

              {/* Notes */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Notes (Optional)</Text>
              <TextInput
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                placeholder="e.g. Paid in full, change donated"
                placeholderTextColor="#94a3b8"
                style={styles.notesInput}
              />

              {/* Submit Buttons */}
              <View style={styles.modalActionsRow}>
                <AppButton
                  onPress={() => setPaymentModalVisible(false)}
                  title="Cancel"
                  variant="outline"
                  size="md"
                  style={{ flex: 1, marginRight: 8 }}
                />
                <AppButton
                  onPress={handlePaymentSubmit}
                  title={`Confirm ₱${(currentPaymentPesos || 0).toFixed(2)}`}
                  loading={submittingPayment}
                  loadingText="Recording..."
                  icon={<FontAwesome5 name="check" size={13} color="#ffffff" />}
                  size="md"
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 12,
  },
  headerAddText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  profileCard: {
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
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  profileMetaText: {
    fontSize: 13,
    color: '#64748b',
  },
  profileNotes: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  balanceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  balanceBannerRed: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  balanceBannerGreen: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  balanceBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  balanceBannerLabelRed: {
    color: '#be123c',
  },
  balanceBannerLabelGreen: {
    color: '#059669',
  },
  balanceBannerAmount: {
    fontSize: 22,
    fontWeight: '900',
  },
  balanceBannerAmountRed: {
    color: '#be123c',
  },
  balanceBannerAmountGreen: {
    color: '#059669',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payNowBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e2e8f0',
  },
  statBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statBoxValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  actionButtonsRow: {
    flexDirection: 'row',
  },
  historyTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  historyTabActive: {
    backgroundColor: '#ecfdf5',
  },
  historyTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  historyTabTextActive: {
    color: '#059669',
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  historyTxNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  historyDate: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#be123c',
  },
  lineItemsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  lineItemName: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  lineItemSubtotal: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  historyNotes: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 6,
  },
  paymentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  paymentMethodBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  emptyHistoryBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBalanceBox: {
    backgroundColor: '#fff1f2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  modalBalanceLabel: {
    fontSize: 11,
    color: '#be123c',
    fontWeight: '700',
  },
  modalBalanceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#be123c',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  amountInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#059669',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  quickButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 12,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  previewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  methodToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  methodBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  methodBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  methodBtnTextActive: {
    color: '#ffffff',
  },
  notesInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
