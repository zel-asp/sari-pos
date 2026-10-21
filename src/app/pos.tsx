import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { AppLayout } from '@/components/navigation/app-layout';
import { BarcodeScannerModal } from '@/components/camera/barcode-scanner-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { ProductRepository } from '@/database/repositories/product-repository';
import { SaleRepository, type CreateSaleResult } from '@/database/repositories/sale-repository';
import { supabase } from '@/lib/supabase';
import { formatPHP } from '@/utils/currency';
import { type Product } from '@/types/database';

const PAGE_SIZE = 15;

interface CartItem {
  product: Product;
  quantity: number;
}

export default function PosSaleScreen() {
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tenderedInput, setTenderedInput] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Success Receipt Modal & Confirmation Modal
  const [completedSale, setCompletedSale] = useState<CreateSaleResult | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const loadProducts = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    ProductRepository.getAll({ status: 'active' })
      .then((all) => {
        if (isMounted) {
          setProducts(all);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[POS] Failed to load products:', err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // Real-time synchronization for POS catalog & stock changes
  useEffect(() => {
    const channelId = `pos-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          ProductRepository.getAll({ status: 'active' }).then(setProducts).catch(() => {});
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          ProductRepository.getAll({ status: 'active' }).then(setProducts).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered products for selection
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [products, searchQuery, selectedCategory]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  // Paginated products (15 per page)
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, page]);

  // Cart totals
  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const totalAmountCentavos = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0);
  }, [cart]);

  const tenderedCentavos = useMemo(() => {
    const parsed = parseFloat(tenderedInput);
    if (isNaN(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  }, [tenderedInput]);

  const changeCentavos = useMemo(() => {
    if (tenderedCentavos < totalAmountCentavos) return 0;
    return tenderedCentavos - totalAmountCentavos;
  }, [tenderedCentavos, totalAmountCentavos]);

  // Add product to cart or increment
  const handleAddToCart = useCallback(
    (product: Product): boolean => {
      if (product.stock_quantity <= 0) {
        toast.warning('Out of Stock', `"${product.name}" has 0 stock remaining.`);
        return false;
      }

      const existingItem = cart.find((i) => i.product.id === product.id);
      if (existingItem && existingItem.quantity >= product.stock_quantity) {
        toast.warning(
          'Stock Limit',
          `Cannot add more. Only ${product.stock_quantity} ${product.unit} available.`
        );
        return false;
      }

      setCart((prev) => {
        const existingIndex = prev.findIndex((i) => i.product.id === product.id);
        if (existingIndex >= 0) {
          const currentQty = prev[existingIndex].quantity;
          if (currentQty >= product.stock_quantity) {
            return prev;
          }
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: currentQty + 1,
          };
          return updated;
        } else {
          return [...prev, { product, quantity: 1 }];
        }
      });
      return true;
    },
    [cart, toast]
  );

  const handleUpdateQuantity = useCallback(
    (productId: number, delta: number) => {
      const item = cart.find((i) => i.product.id === productId);
      if (item && delta > 0 && item.quantity + delta > item.product.stock_quantity) {
        toast.warning(
          'Stock Limit',
          `Only ${item.product.stock_quantity} available in stock.`
        );
        return;
      }

      setCart((prev) => {
        return prev
          .map((item) => {
            if (item.product.id === productId) {
              const newQty = item.quantity + delta;
              if (newQty > item.product.stock_quantity) {
                return item;
              }
              return { ...item, quantity: newQty };
            }
            return item;
          })
          .filter((item) => item.quantity > 0);
      });
    },
    [cart, toast]
  );

  const handleRemoveFromCart = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const handleClearCart = useCallback(() => {
    setCart([]);
    setTenderedInput('');
  }, []);

  // Quick cash tender helper
  const handleSetQuickCash = useCallback((amountPesos: number) => {
    setTenderedInput(amountPesos.toString());
  }, []);

  const handleSetExactCash = useCallback(() => {
    setTenderedInput((totalAmountCentavos / 100).toFixed(2));
  }, [totalAmountCentavos]);

  // Handler for scanning via camera OR entering barcode/query and pressing Enter
  const handleScanOrEnterProduct = useCallback(
    (inputCode: string) => {
      const q = inputCode.trim();
      if (!q) return;

      // 1. Search exact barcode match across all active products
      let matched = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === q.toLowerCase()
      );

      // 2. If not matched by barcode, search exact product name (case-insensitive)
      if (!matched) {
        matched = products.find(
          (p) => p.name.trim().toLowerCase() === q.toLowerCase()
        );
      }

      // 3. If still not matched, check if filteredProducts has exactly 1 match
      if (!matched && filteredProducts.length === 1) {
        matched = filteredProducts[0];
      }

      if (matched) {
        setMinimized(false);
        const added = handleAddToCart(matched);
        if (added) {
          toast.success(
            'Added to Current Sale',
            `"${matched.name}" (${formatPHP(matched.selling_price)}) added.`
          );
          setSearchQuery('');
        }
      } else {
        toast.warning(
          'Product Not Found',
          `No product found for "${q}". Check barcode or add product in Inventory.`
        );
      }
    },
    [products, filteredProducts, handleAddToCart, toast]
  );

  // Barcode scanned handler from camera
  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      setScannerVisible(false);
      handleScanOrEnterProduct(barcode);
    },
    [handleScanOrEnterProduct]
  );

  const handleSearchChange = (text: string) => {
    // When handheld barcode scanner sends a newline or user pastes code with newline
    if (text.includes('\n') || text.includes('\r')) {
      const clean = text.replace(/[\r\n]+/g, '').trim();
      setSearchQuery('');
      if (clean) {
        handleScanOrEnterProduct(clean);
      }
      return;
    }
    setSearchQuery(text);
  };

  // Initiate checkout: validate and open confirmation modal with all items
  const handleInitiateCheckout = () => {
    if (cart.length === 0) {
      toast.warning('Cart is Empty', 'Please select at least one product to sell.');
      return;
    }

    if (tenderedCentavos < totalAmountCentavos) {
      toast.warning(
        'Insufficient Cash Tendered',
        `Please collect at least ${formatPHP(totalAmountCentavos)}.`
      );
      return;
    }

    setConfirmModalVisible(true);
  };

  // Confirmed checkout: record sale & deduct inventory
  const handleConfirmSale = async () => {
    try {
      setSubmitting(true);
      const saleResult = await SaleRepository.createSale({
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
        amountTendered: tenderedCentavos,
        paymentMethod: 'cash',
        notes: 'Direct store cash sale',
      });

      setConfirmModalVisible(false);
      setCompletedSale(saleResult);
      handleClearCart();
      // Reload products so stock is updated in real-time
      await loadProducts();
      toast.success(
        'Sale Recorded!',
        `Receipt ${saleResult.receiptNumber} saved and inventory deducted.`
      );
    } catch (err) {
      console.error('[POS] Checkout failed:', err);
      toast.error(
        'Checkout Error',
        err instanceof Error ? err.message : 'Database error recording sale.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <AppLayout
        activeTab="pos"
        title="Sell Products (POS)"
        headerRight={
          <Pressable
            onPress={() => setScannerVisible(true)}
            style={styles.headerScanBtn}
          >
            <FontAwesome5 name="barcode" size={16} color="#059669" />
            <Text style={styles.headerScanText}>Scan</Text>
          </Pressable>
        }
      >
        <View style={styles.container}>
          {/* Top Search & Category Bar */}
          <View style={styles.topBar}>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <FontAwesome name="barcode" size={15} color="#059669" style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  onSubmitEditing={() => handleScanOrEnterProduct(searchQuery)}
                  placeholder="Scan barcode or type & Enter to add..."
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                  returnKeyType="done"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8} style={{ marginRight: 6 }}>
                    <FontAwesome5 name="times-circle" size={14} color="#94a3b8" />
                  </Pressable>
                )}
                {searchQuery.trim().length > 0 && (
                  <Pressable
                    onPress={() => handleScanOrEnterProduct(searchQuery)}
                    style={styles.enterBtn}
                    hitSlop={6}
                  >
                    <FontAwesome5 name="arrow-right" size={10} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={styles.enterBtnText}>Enter</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={() => setScannerVisible(true)}
                style={styles.scanBarcodeBtn}
              >
                <FontAwesome5 name="camera" size={13} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.scanBarcodeBtnText}>Scan</Text>
              </Pressable>
            </View>

            {/* Category pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.catPill,
                    selectedCategory === cat && styles.catPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      selectedCategory === cat && styles.catPillTextActive,
                    ]}
                  >
                    {cat === 'all' ? 'All Items' : cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Main 2-Section Content */}
          <View style={styles.splitLayout}>
            {/* Left/Top: Product Catalog Selection */}
            <View style={styles.catalogSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Available Products ({filteredProducts.length})
                </Text>
                <Text style={styles.sectionHint}>Tap item to add to sale</Text>
              </View>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <Skeleton height={50} borderRadius={8} style={{ marginBottom: 8 }} />
                  <Skeleton height={50} borderRadius={8} style={{ marginBottom: 8 }} />
                  <Skeleton height={50} borderRadius={8} style={{ marginBottom: 8 }} />
                  <Skeleton height={50} borderRadius={8} style={{ marginBottom: 8 }} />
                </View>
              ) : filteredProducts.length === 0 ? (
                <View style={styles.emptyState}>
                  <FontAwesome5 name="box-open" size={32} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>No matching products</Text>
                  <Text style={styles.emptySubtitle}>
                    Try searching another keyword or check inventory.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={paginatedProducts}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={styles.productList}
                  showsVerticalScrollIndicator={false}
                  ListFooterComponent={
                    <Pagination
                      currentPage={page}
                      totalItems={filteredProducts.length}
                      pageSize={PAGE_SIZE}
                      onPageChange={(p) => setPage(p)}
                      itemName="products"
                    />
                  }
                  renderItem={({ item }) => {
                    const inCartItem = cart.find((c) => c.product.id === item.id);
                    const isOutOfStock = item.stock_quantity <= 0;
                    return (
                      <Pressable
                        onPress={() => handleAddToCart(item)}
                        disabled={isOutOfStock}
                        style={({ pressed }) => [
                          styles.productCard,
                          isOutOfStock && styles.productCardDisabled,
                          pressed && styles.cardPressed,
                        ]}
                      >
                        <View style={styles.productInfoCol}>
                          <Text style={styles.productName}>{item.name}</Text>
                          <View style={styles.productMetaRow}>
                            <Text style={styles.productPrice}>
                              {formatPHP(item.selling_price)}
                            </Text>
                            <Text style={styles.productUnit}>/{item.unit}</Text>
                            <View
                              style={[
                                styles.stockBadge,
                                item.stock_quantity <= item.minimum_stock
                                  ? styles.stockBadgeLow
                                  : styles.stockBadgeNormal,
                                isOutOfStock && styles.stockBadgeOut,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.stockBadgeText,
                                  isOutOfStock && { color: '#be123c' },
                                ]}
                              >
                                {isOutOfStock
                                  ? 'Out of Stock'
                                  : `${item.stock_quantity} in stock`}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Add button or cart count pill */}
                        {inCartItem ? (
                          <View style={styles.inCartIndicator}>
                            <Text style={styles.inCartIndicatorText}>
                              {inCartItem.quantity} in cart
                            </Text>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.addBtnCircle,
                              isOutOfStock && styles.addBtnCircleDisabled,
                            ]}
                          >
                            <FontAwesome5
                              name="plus"
                              size={12}
                              color={isOutOfStock ? '#94a3b8' : '#059669'}
                            />
                          </View>
                        )}
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>

            {/* Right/Bottom: Active Sale Cart & Checkout Panel */}
            {minimized ? (
              <Pressable
                onPress={() => setMinimized(false)}
                style={({ pressed }) => [styles.minimizedPanel, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.minimizedLeft}>
                  <View style={styles.cartIconCircle}>
                    <FontAwesome5 name="shopping-cart" size={12} color="#059669" />
                  </View>
                  <Text style={styles.minimizedTitle}>Current Sale</Text>
                  <View style={styles.numberBadge}>
                    <Text style={styles.numberBadgeText}>{totalItemsCount}</Text>
                  </View>
                </View>

                <View style={styles.minimizedRight}>
                  <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                    <Text style={styles.minimizedTotalLabel}>Total Due</Text>
                    <Text style={styles.minimizedTotalValue}>{formatPHP(totalAmountCentavos)}</Text>
                  </View>
                  <View style={styles.expandBtn}>
                    <FontAwesome5 name="chevron-up" size={10} color="#334155" style={{ marginRight: 4 }} />
                    <Text style={styles.expandBtnText}>Open</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.checkoutPanel}>
                <View style={styles.cartHeaderRow}>
                  <Pressable
                    onPress={() => setMinimized(true)}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <FontAwesome5 name="shopping-cart" size={14} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.cartHeaderTitle}>Current Sale</Text>
                    <View style={styles.numberBadge}>
                      <Text style={styles.numberBadgeText}>{totalItemsCount}</Text>
                    </View>
                  </Pressable>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {cart.length > 0 && (
                      <Pressable onPress={handleClearCart}>
                        <Text style={styles.clearCartText}>Clear All</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setMinimized(true)}
                      style={styles.minimizeBtn}
                      hitSlop={6}
                    >
                      <FontAwesome5 name="chevron-down" size={10} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.minimizeBtnText}>Minimize</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Cart Items list */}
                <ScrollView style={styles.cartItemsScroll} showsVerticalScrollIndicator={false}>
                  {cart.length === 0 ? (
                    <View style={styles.cartEmptyBox}>
                      <FontAwesome5 name="receipt" size={24} color="#94a3b8" />
                      <Text style={styles.cartEmptyText}>No items added yet</Text>
                      <Text style={styles.cartEmptySub}>
                        Select products above to build customer order.
                      </Text>
                    </View>
                  ) : (
                    cart.map((item) => (
                      <View key={item.product.id} style={styles.cartItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cartItemName} numberOfLines={1}>
                            {item.product.name}
                          </Text>
                          <Text style={styles.cartItemUnitCost}>
                            {formatPHP(item.product.selling_price)} × {item.quantity} ={' '}
                            <Text style={{ fontWeight: '700', color: '#0f172a' }}>
                              {formatPHP(item.quantity * item.product.selling_price)}
                            </Text>
                          </Text>
                        </View>

                        {/* Stepper */}
                        <View style={styles.stepperWrap}>
                          <Pressable
                            onPress={() => handleUpdateQuantity(item.product.id, -1)}
                            style={styles.stepperBtn}
                            hitSlop={6}
                          >
                            <FontAwesome5 name="minus" size={10} color="#0f172a" />
                          </Pressable>
                          <Text style={styles.stepperCount}>{item.quantity}</Text>
                          <Pressable
                            onPress={() => handleUpdateQuantity(item.product.id, 1)}
                            style={styles.stepperBtn}
                            hitSlop={6}
                          >
                            <FontAwesome5 name="plus" size={10} color="#0f172a" />
                          </Pressable>
                        </View>

                        <Pressable
                          onPress={() => handleRemoveFromCart(item.product.id)}
                          style={styles.cartItemDeleteBtn}
                          hitSlop={6}
                        >
                          <FontAwesome5 name="trash-alt" size={12} color="#94a3b8" />
                        </Pressable>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Calculation & Tender Box */}
                <View style={styles.paymentSummaryBox}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Due:</Text>
                    <Text style={styles.totalValue}>{formatPHP(totalAmountCentavos)}</Text>
                  </View>

                  {/* Cash Tendered Input */}
                  <View style={styles.tenderInputRow}>
                    <Text style={styles.tenderLabel}>Cash Tendered (₱):</Text>
                    <TextInput
                      value={tenderedInput}
                      onChangeText={setTenderedInput}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      style={styles.tenderInput}
                    />
                  </View>

                  {/* Quick Tender Options */}
                  {totalAmountCentavos > 0 && (
                    <View style={styles.quickTenderRow}>
                      <Pressable
                        onPress={handleSetExactCash}
                        style={styles.quickCashBtn}
                      >
                        <Text style={styles.quickCashText}>Exact</Text>
                      </Pressable>
                      {[50, 100, 200, 500].map((amt) => {
                        if (amt * 100 >= totalAmountCentavos) {
                          return (
                            <Pressable
                              key={amt}
                              onPress={() => handleSetQuickCash(amt)}
                              style={styles.quickCashBtn}
                            >
                              <Text style={styles.quickCashText}>₱{amt}</Text>
                            </Pressable>
                          );
                        }
                        return null;
                      })}
                    </View>
                  )}

                  {/* Change amount row */}
                  <View style={styles.changeRow}>
                    <Text style={styles.changeLabel}>Change (Sukli):</Text>
                    <Text
                      style={[
                        styles.changeValue,
                        tenderedCentavos >= totalAmountCentavos && totalAmountCentavos > 0
                          ? { color: '#059669' }
                          : { color: '#64748b' },
                      ]}
                    >
                      {formatPHP(changeCentavos)}
                    </Text>
                  </View>

                  {/* Complete Sale Button */}
                  <AppButton
                    title={
                      submitting
                        ? 'Processing Sale...'
                        : `Complete Sale (${formatPHP(totalAmountCentavos)})`
                    }
                    onPress={handleInitiateCheckout}
                    variant="primary"
                    loading={submitting}
                    disabled={cart.length === 0 || tenderedCentavos < totalAmountCentavos}
                    icon={<FontAwesome5 name="check-circle" size={14} color="#ffffff" style={{ marginRight: 6 }} />}
                    style={styles.checkoutBtn}
                  />
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Barcode Scanner Modal */}
        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={handleBarcodeScanned}
          title="Scan Product to Add"
        />

        {/* Sale Confirmation Modal */}
        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!submitting) setConfirmModalVisible(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.confirmModalCard}>
              {/* Modal Header */}
              <View style={styles.confirmHeader}>
                <View style={styles.confirmHeaderLeft}>
                  <View style={styles.confirmIconCircle}>
                    <FontAwesome5 name="shopping-bag" size={16} color="#059669" />
                  </View>
                  <View>
                    <Text style={styles.confirmTitle}>Confirm Sale</Text>
                    <Text style={styles.confirmSubtitle}>Review items before completing</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setConfirmModalVisible(false)}
                  disabled={submitting}
                  hitSlop={8}
                  style={styles.confirmCloseBtn}
                >
                  <FontAwesome name="times" size={16} color="#94a3b8" />
                </Pressable>
              </View>

              {/* Items List Section */}
              <View style={styles.confirmItemsHeaderRow}>
                <Text style={styles.confirmSectionTitle}>
                  Items to Purchase ({totalItemsCount})
                </Text>
                <Text style={styles.confirmSectionSubtotal}>Subtotal</Text>
              </View>

              <ScrollView
                style={styles.confirmItemsScroll}
                contentContainerStyle={{ paddingVertical: 4 }}
                showsVerticalScrollIndicator={true}
              >
                {cart.map((item, idx) => (
                  <View
                    key={item.product.id}
                    style={[
                      styles.confirmItemRow,
                      idx > 0 && styles.confirmItemBorderTop,
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.confirmItemName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.confirmItemUnit}>
                        {formatPHP(item.product.selling_price)} × {item.quantity} {item.product.unit}
                      </Text>
                    </View>
                    <Text style={styles.confirmItemTotal}>
                      {formatPHP(item.quantity * item.product.selling_price)}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Payment Summary Box */}
              <View style={styles.confirmSummaryBox}>
                <View style={styles.confirmSummaryRow}>
                  <Text style={styles.confirmSummaryLabel}>Total Amount Due:</Text>
                  <Text style={styles.confirmSummaryAmount}>
                    {formatPHP(totalAmountCentavos)}
                  </Text>
                </View>
                <View style={styles.confirmSummaryRow}>
                  <Text style={styles.confirmSummaryLabel}>Cash Tendered:</Text>
                  <Text style={styles.confirmSummaryValue}>
                    {formatPHP(tenderedCentavos)}
                  </Text>
                </View>
                <View style={[styles.confirmSummaryRow, styles.confirmSummaryBorderTop]}>
                  <Text style={[styles.confirmSummaryLabel, { fontWeight: '700', color: '#059669' }]}>
                    Change (Sukli):
                  </Text>
                  <Text style={[styles.confirmSummaryValue, { fontWeight: '800', color: '#059669', fontSize: 16 }]}>
                    {formatPHP(changeCentavos)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.confirmActionsRow}>
                <AppButton
                  title="Edit Order"
                  onPress={() => setConfirmModalVisible(false)}
                  variant="secondary"
                  size="md"
                  disabled={submitting}
                  style={{ flex: 1 }}
                />
                <AppButton
                  title={submitting ? 'Confirming...' : 'Confirm & Complete'}
                  onPress={handleConfirmSale}
                  variant="primary"
                  size="md"
                  loading={submitting}
                  icon={<FontAwesome5 name="check-circle" size={13} color="#ffffff" style={{ marginRight: 6 }} />}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Sale Success Modal */}
        {completedSale && (
          <Modal visible={true} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.successModalCard}>
                <View style={styles.successIconCircle}>
                  <FontAwesome5 name="check" size={24} color="#059669" />
                </View>

                <Text style={styles.successTitle}>Sale Completed!</Text>
                <Text style={styles.successSubtitle}>
                  Inventory stock automatically deducted and cash recorded.
                </Text>

                <View style={styles.receiptSummaryCard}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Receipt Number:</Text>
                    <Text style={styles.receiptValue}>{completedSale.receiptNumber}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Total Paid:</Text>
                    <Text style={[styles.receiptValue, { fontWeight: '800', color: '#0f172a' }]}>
                      {formatPHP(completedSale.totalAmount)}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Amount Tendered:</Text>
                    <Text style={styles.receiptValue}>
                      {formatPHP(completedSale.amountTendered)}
                    </Text>
                  </View>
                  <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                    <Text style={[styles.receiptLabel, { fontWeight: '800', color: '#059669' }]}>
                      Change (Sukli):
                    </Text>
                    <Text style={[styles.receiptValue, { fontWeight: '800', color: '#059669', fontSize: 16 }]}>
                      {formatPHP(completedSale.changeAmount)}
                    </Text>
                  </View>
                </View>

                <AppButton
                  title="Done / Next Customer"
                  onPress={() => setCompletedSale(null)}
                  variant="primary"
                  style={{ width: '100%', marginTop: 8 }}
                />
              </View>
            </View>
          </Modal>
        )}
      </AppLayout>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  headerScanText: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 6,
  },
  topBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 0,
  },
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  enterBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  scanBarcodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  scanBarcodeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryScroll: {
    paddingVertical: 6,
    gap: 6,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 6,
  },
  catPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  catPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  splitLayout: {
    flex: 1,
  },
  catalogSection: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  sectionHint: {
    fontSize: 11,
    color: '#94a3b8',
  },
  loadingContainer: {
    paddingVertical: 12,
  },
  productList: {
    paddingBottom: 8,
    gap: 6,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  productCardDisabled: {
    opacity: 0.5,
    backgroundColor: '#f8fafc',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  productInfoCol: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  productUnit: {
    fontSize: 11,
    color: '#64748b',
  },
  stockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  stockBadgeNormal: {
    backgroundColor: '#f0fdf4',
  },
  stockBadgeLow: {
    backgroundColor: '#fef3c7',
  },
  stockBadgeOut: {
    backgroundColor: '#ffe4e6',
  },
  stockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803d',
  },
  inCartIndicator: {
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inCartIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  addBtnCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnCircleDisabled: {
    backgroundColor: '#f1f5f9',
  },
  checkoutPanel: {
    maxHeight: 290,
    backgroundColor: '#f1f5f9', // soft neutral gray
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 8,
  },
  minimizedPanel: {
    backgroundColor: '#f1f5f9', // soft neutral gray
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 6,
  },
  minimizedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  minimizedRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  minimizedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  minimizedTotalLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  minimizedTotalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  minimizeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  numberBadge: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cartHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  clearCartText: {
    fontSize: 11,
    color: '#be123c',
    fontWeight: '600',
  },
  cartItemsScroll: {
    maxHeight: 80,
    marginBottom: 6,
  },
  cartEmptyBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cartEmptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4,
  },
  cartEmptySub: {
    fontSize: 10,
    color: '#cbd5e1',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  cartItemUnitCost: {
    fontSize: 11,
    color: '#64748b',
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginHorizontal: 8,
  },
  stepperBtn: {
    padding: 4,
  },
  stepperCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    paddingHorizontal: 6,
  },
  cartItemDeleteBtn: {
    padding: 4,
  },
  paymentSummaryBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  tenderInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tenderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tenderInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    width: 90,
    textAlign: 'right',
  },
  quickTenderRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  quickCashBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  quickCashText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  changeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  changeValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  checkoutBtn: {
    marginTop: 2,
    paddingVertical: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  successModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#065f46',
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  receiptSummaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    gap: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    marginTop: 2,
  },
  receiptLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  receiptValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  confirmModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  confirmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  confirmSubtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  confirmCloseBtn: {
    padding: 6,
  },
  confirmItemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  confirmSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmSectionSubtotal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmItemsScroll: {
    maxHeight: 200,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  confirmItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  confirmItemBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  confirmItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  confirmItemUnit: {
    fontSize: 11,
    color: '#64748b',
  },
  confirmItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  confirmSummaryBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginBottom: 14,
  },
  confirmSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmSummaryBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 2,
  },
  confirmSummaryLabel: {
    fontSize: 12,
    color: '#475569',
  },
  confirmSummaryAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  confirmSummaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
