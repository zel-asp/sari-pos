import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { BarcodeScannerModal } from '@/components/camera/barcode-scanner-modal';
import { CustomerRepository } from '@/database/repositories/customer-repository';
import { ProductRepository } from '@/database/repositories/product-repository';
import { formatPHP } from '@/utils/currency';
import { type Customer, type Product } from '@/types/database';

interface CartItem {
  product: Product;
  quantity: number;
}

export default function NewUtangScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const params = useLocalSearchParams<{ customerId?: string }>();

  // Customer state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    params.customerId ? parseInt(params.customerId, 10) : null
  );
  const [isNewCustomerMode, setIsNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Products and Cart state
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Barcode Scanner Modal state
  const [scannerVisible, setScannerVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      CustomerRepository.getAll(db),
      ProductRepository.getAll(db, { status: 'active' }),
    ])
      .then(([custList, prodList]) => {
        if (isMounted) {
          setCustomers(custList);
          setAllProducts(prodList);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[NewUtang] Load error:', err);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [db]);

  // Filtered customers for picker
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_number && c.contact_number.includes(q))
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((c) => c.id === selectedCustomerId) ?? null;
    }
    return null;
  }, [customers, selectedCustomerId]);

  // Filtered products for selection
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase().trim();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
    );
  }, [allProducts, productSearch]);

  // Add product to cart
  const addToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      toast.warning('Out of Stock', `"${product.name}" has 0 stock remaining.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          toast.warning(
            'Maximum Stock Reached',
            `Only ${product.stock_quantity} available for "${product.name}".`
          );
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setProductSearch('');
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.product.stock_quantity) {
              toast.warning(
                'Insufficient Stock',
                `Only ${item.product.stock_quantity} available in inventory.`
              );
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Handle scanned barcode / QR code
  const handleBarcodeScanned = (scannedCode: string, barcodeType: string) => {
    const trimmed = scannedCode.trim();
    const found = allProducts.find((p) => p.barcode?.trim() === trimmed);
    if (found) {
      addToCart(found);
      toast.success(
        'Product Added',
        `${found.name} scanned successfully (${barcodeType}).`
      );
    } else {
      toast.warning(
        'Product Not Found',
        `No inventory item matched barcode "${trimmed}".`
      );
    }
  };

  // Calculate cart totals
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.quantity * item.product.selling_price,
    0
  );
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Submit transaction
  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error('Empty Cart', 'Please add at least one product to the utang transaction.');
      return;
    }

    try {
      setSubmitting(true);
      let targetCustomerId = selectedCustomerId;

      // Handle customer creation/resolution
      if (isNewCustomerMode) {
        if (!newCustomerName.trim()) {
          toast.error('Customer Name Required', 'Please enter the customer name.');
          setSubmitting(false);
          return;
        }
        // createOrGet resolves existing customer if same name exists
        const cust = await CustomerRepository.createOrGet(
          db,
          newCustomerName,
          newCustomerPhone,
          notes
        );
        targetCustomerId = cust.id;
      } else if (!targetCustomerId) {
        toast.error('Select Customer', 'Please choose an existing customer or register a new one.');
        setSubmitting(false);
        return;
      }

      // Record transaction
      const result = await CustomerRepository.recordCreditTransaction(db, {
        customerId: targetCustomerId,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        notes: notes.trim() || undefined,
      });

      toast.success(
        'Utang Saved Successfully',
        `₱${(totalAmount / 100).toFixed(2)} recorded for ${result.customer.name}. Inventory deducted.`
      );

      // Navigate to customer detail screen
      router.replace({
        pathname: '/utang/[id]',
        params: { id: result.customer.id.toString() },
      });
    } catch (err) {
      toast.error(
        'Transaction Failed',
        err instanceof Error ? err.message : 'Failed to record utang transaction.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Record New Utang',
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#059669',
          headerTitleStyle: { fontWeight: '900' },
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Step 1: Customer Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <Text style={styles.sectionTitle}>Customer Information</Text>
              </View>

              {/* Mode Toggle: Existing vs New */}
              <View style={styles.modeToggleRow}>
                <Pressable
                  onPress={() => {
                    setIsNewCustomerMode(false);
                    setCustomerSearch('');
                  }}
                  style={[
                    styles.modeBtn,
                    !isNewCustomerMode && styles.modeBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="user-check"
                    size={12}
                    color={!isNewCustomerMode ? '#ffffff' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      !isNewCustomerMode && styles.modeBtnTextActive,
                    ]}
                  >
                    Select Existing
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setIsNewCustomerMode(true);
                    setSelectedCustomerId(null);
                  }}
                  style={[
                    styles.modeBtn,
                    isNewCustomerMode && styles.modeBtnActive,
                  ]}
                >
                  <FontAwesome5
                    name="user-plus"
                    size={12}
                    color={isNewCustomerMode ? '#ffffff' : '#64748b'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      isNewCustomerMode && styles.modeBtnTextActive,
                    ]}
                  >
                    Register New
                  </Text>
                </Pressable>
              </View>

              {isNewCustomerMode ? (
                /* New Customer Input Form */
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>
                    Customer Name <Text style={{ color: '#be123c' }}>*</Text>
                  </Text>
                  <TextInput
                    value={newCustomerName}
                    onChangeText={setNewCustomerName}
                    placeholder="e.g. Maria Santos, Kuya Jun"
                    placeholderTextColor="#94a3b8"
                    style={styles.textInput}
                  />

                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>
                    Contact Number (Optional)
                  </Text>
                  <TextInput
                    value={newCustomerPhone}
                    onChangeText={setNewCustomerPhone}
                    placeholder="e.g. 0917-123-4567"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    style={styles.textInput}
                  />
                  <Text style={styles.hintText}>
                    Note: If this customer already exists in your records, this transaction will automatically link to their profile.
                  </Text>
                </View>
              ) : (
                /* Existing Customer Picker */
                <View style={styles.formGroup}>
                  {selectedCustomer ? (
                    <View style={styles.selectedCustomerBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selectedCustomerName}>
                          {selectedCustomer.name}
                        </Text>
                        <Text style={styles.selectedCustomerBalance}>
                          Outstanding Balance: {formatPHP(selectedCustomer.outstanding_balance)}
                        </Text>
                        {selectedCustomer.contact_number && (
                          <Text style={styles.selectedCustomerPhone}>
                            {selectedCustomer.contact_number}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() => setSelectedCustomerId(null)}
                        style={styles.changeCustomerBtn}
                      >
                        <Text style={styles.changeCustomerText}>Change</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.searchBar}>
                        <FontAwesome5 name="search" size={13} color="#94a3b8" style={{ marginRight: 6 }} />
                        <TextInput
                          value={customerSearch}
                          onChangeText={setCustomerSearch}
                          placeholder="Search customer by name..."
                          placeholderTextColor="#94a3b8"
                          style={styles.searchInput}
                        />
                      </View>

                      <View style={styles.customerListDropdown}>
                        {filteredCustomers.slice(0, 5).map((cust) => (
                          <Pressable
                            key={cust.id}
                            onPress={() => {
                              setSelectedCustomerId(cust.id);
                              setCustomerSearch('');
                            }}
                            style={styles.customerItemRow}
                          >
                            <View>
                              <Text style={styles.customerItemName}>{cust.name}</Text>
                              <Text style={styles.customerItemBalance}>
                                Balance: {formatPHP(cust.outstanding_balance)}
                              </Text>
                            </View>
                            <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                          </Pressable>
                        ))}
                        {filteredCustomers.length === 0 && (
                          <Text style={styles.noCustomersFoundText}>
                            No customers found. Switch to &quot;Register New&quot; above.
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Step 2: Add Products */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <Text style={styles.sectionTitle}>Add Borrowed Products</Text>
              </View>

              {/* Product Search & Barcode Button */}
              <View style={styles.searchRow}>
                <View style={[styles.searchBar, { flex: 1, marginRight: 8 }]}>
                  <FontAwesome5 name="search" size={13} color="#94a3b8" style={{ marginRight: 6 }} />
                  <TextInput
                    value={productSearch}
                    onChangeText={setProductSearch}
                    placeholder="Search product name or barcode..."
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                  />
                  {productSearch.length > 0 && (
                    <Pressable onPress={() => setProductSearch('')}>
                      <FontAwesome name="times" size={14} color="#94a3b8" />
                    </Pressable>
                  )}
                </View>

                {/* Scan Barcode / QR Code Button */}
                <Pressable
                  onPress={() => setScannerVisible(true)}
                  style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}
                >
                  <FontAwesome5 name="barcode" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.scanBtnText}>Scan</Text>
                </Pressable>
              </View>

              {/* Search Suggestions Dropdown */}
              {productSearch.trim().length > 0 && (
                <View style={styles.productSuggestionsBox}>
                  {filteredProducts.slice(0, 6).map((prod) => (
                    <Pressable
                      key={prod.id}
                      onPress={() => addToCart(prod)}
                      style={styles.suggestionItem}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionName}>{prod.name}</Text>
                        <Text style={styles.suggestionMeta}>
                          {formatPHP(prod.selling_price)} • Stock: {prod.stock_quantity} {prod.unit}
                        </Text>
                      </View>
                      <View style={styles.addPill}>
                        <FontAwesome5 name="plus" size={10} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.addPillText}>Add</Text>
                      </View>
                    </Pressable>
                  ))}
                  {filteredProducts.length === 0 && (
                    <Text style={styles.noProductsFoundText}>No matching products found.</Text>
                  )}
                </View>
              )}

              {/* Cart Items List */}
              <View style={styles.cartSection}>
                <Text style={styles.cartHeaderTitle}>
                  Items to Borrow ({cart.length})
                </Text>

                {cart.map((item) => {
                  const itemSubtotal = item.quantity * item.product.selling_price;
                  return (
                    <View key={item.product.id} style={styles.cartItemRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.cartItemName} numberOfLines={1}>
                          {item.product.name}
                        </Text>
                        <Text style={styles.cartItemPrice}>
                          {formatPHP(item.product.selling_price)} / {item.product.unit} • Stock: {item.product.stock_quantity}
                        </Text>
                      </View>

                      {/* Quantity Controls */}
                      <View style={styles.quantityControls}>
                        <Pressable
                          onPress={() => updateQuantity(item.product.id, -1)}
                          style={styles.qtyBtn}
                        >
                          <FontAwesome name="minus" size={11} color="#64748b" />
                        </Pressable>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <Pressable
                          onPress={() => updateQuantity(item.product.id, 1)}
                          style={styles.qtyBtn}
                        >
                          <FontAwesome name="plus" size={11} color="#64748b" />
                        </Pressable>
                      </View>

                      {/* Subtotal & Delete */}
                      <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                        <Text style={styles.cartItemSubtotal}>{formatPHP(itemSubtotal)}</Text>
                        <Pressable
                          onPress={() => removeFromCart(item.product.id)}
                          hitSlop={8}
                          style={{ marginTop: 2 }}
                        >
                          <FontAwesome name="trash" size={13} color="#be123c" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                {cart.length === 0 && (
                  <View style={styles.emptyCartBox}>
                    <FontAwesome5 name="shopping-basket" size={24} color="#cbd5e1" style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyCartText}>No items added yet</Text>
                    <Text style={styles.emptyCartSub}>Search by name or tap Scan to scan barcode.</Text>
                  </View>
                )}
              </View>

              {/* Transaction Notes */}
              <View style={{ marginTop: 14 }}>
                <Text style={styles.inputLabel}>Notes / Reason (Optional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Will pay on Friday payday, borrowed by daughter"
                  placeholderTextColor="#94a3b8"
                  style={styles.textInput}
                />
              </View>
            </View>

            {/* Step 3: Summary and Save */}
            <View style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Items:</Text>
                <Text style={styles.totalValue}>{totalQuantity} pcs</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.grandTotalLabel}>Total Amount Owed:</Text>
                <Text style={styles.grandTotalValue}>{formatPHP(totalAmount)}</Text>
              </View>

              <Text style={styles.autoDeductNotice}>
                <FontAwesome5 name="info-circle" size={11} color="#059669" /> Inventory will be automatically deducted immediately.
              </Text>

              <AppButton
                onPress={handleSubmit}
                title={`Save Utang (${formatPHP(totalAmount)})`}
                loading={submitting}
                loadingText="Recording Utang..."
                icon={<FontAwesome5 name="check" size={14} color="#ffffff" />}
                size="lg"
                style={{ width: '100%', marginTop: 8 }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Barcode & QR Code Scanner Modal */}
        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={handleBarcodeScanned}
          title="Scan Product Code (1D / 2D)"
        />
      </SafeAreaView>
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
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stepBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#059669',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  formGroup: {
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  hintText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
    fontStyle: 'italic',
  },
  selectedCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    padding: 12,
  },
  selectedCustomerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065f46',
  },
  selectedCustomerBalance: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be123c',
    marginTop: 2,
  },
  selectedCustomerPhone: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  changeCustomerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  changeCustomerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    padding: 0,
  },
  customerListDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  customerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  customerItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerItemBalance: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  noCustomersFoundText: {
    padding: 12,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  scanBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  productSuggestionsBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  suggestionMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  addPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  noProductsFoundText: {
    padding: 12,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  cartSection: {
    marginTop: 8,
  },
  cartHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  cartItemPrice: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    padding: 6,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    minWidth: 20,
    textAlign: 'center',
  },
  cartItemSubtotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptyCartBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
  },
  emptyCartText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  emptyCartSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  totalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#be123c',
  },
  autoDeductNotice: {
    fontSize: 11,
    color: '#059669',
    marginTop: 8,
    marginBottom: 10,
    fontWeight: '600',
  },
});
