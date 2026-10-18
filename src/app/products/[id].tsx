import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { BarcodeScannerModal } from '@/components/camera/barcode-scanner-modal';
import { Pagination } from '@/components/ui/pagination';
import { useProduct } from '@/hooks/use-products';
import { formatPHP, centavosToPesos, pesosToCentavos } from '@/utils/currency';
import { StockStatusBadge } from '@/components/ui/badge';
import { type MovementType, type Product } from '@/types/database';
import { type UpdateProductInput } from '@/database/repositories/product-repository';

const PAGE_SIZE = 15;

interface EditFormProps {
  product: Product;
  onSave: (data: UpdateProductInput) => Promise<void>;
  onCancel: () => void;
}

function ProductEditForm({ product, onSave, onCancel }: EditFormProps) {
  const [name, setName] = useState(product.name);
  const [barcode, setBarcode] = useState(product.barcode || '');
  const [category, setCategory] = useState(product.category);
  const toast = useToast();
  const [costPriceStr, setCostPriceStr] = useState(centavosToPesos(product.cost_price).toString());
  const [sellingPriceStr, setSellingPriceStr] = useState(centavosToPesos(product.selling_price).toString());
  const [unit, setUnit] = useState(product.unit);
  const [minStockStr, setMinStockStr] = useState(product.minimum_stock.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleUpdate = async () => {
    if (!name.trim()) {
      toast.warning('Product Name Required', 'Product name cannot be empty.');
      return;
    }

    const costNum = parseFloat(costPriceStr || '0');
    const sellingNum = parseFloat(sellingPriceStr || '0');
    if (isNaN(sellingNum) || sellingNum <= 0) {
      toast.error('Invalid Selling Price', 'Selling price must be greater than ₱0.00.');
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        name: name.trim(),
        barcode: barcode.trim() || null,
        category: category.trim() || 'General',
        cost_price: pesosToCentavos(costNum),
        selling_price: pesosToCentavos(sellingNum),
        unit: unit.trim() || 'piece',
        minimum_stock: parseFloat(minStockStr || '5'),
      });
      toast.success('Updated!', 'Product details saved successfully.');
    } catch (err) {
      toast.error('Update Failed', err instanceof Error ? err.message : 'Failed to update product.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.editForm}>
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Product Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Barcode / Code</Text>
        <View style={styles.barcodeRow}>
          <TextInput
            value={barcode}
            onChangeText={setBarcode}
            placeholder="e.g. 4800016644819"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            style={[styles.input, styles.monoInput, styles.barcodeInput]}
          />
          <Pressable
            onPress={() => setShowScanner(true)}
            style={({ pressed }) => [styles.scanButton, pressed && { opacity: 0.85 }]}
          >
            <FontAwesome5 name="camera" size={13} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.scanButtonText}>Scan</Text>
          </Pressable>
        </View>
        {barcode ? (
          <View style={styles.scannedNoticeRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <FontAwesome5 name="check-circle" size={11} color="#059669" style={{ marginRight: 5 }} />
              <Text style={styles.scannedNoticeText} numberOfLines={1}>
                Code: {barcode}
              </Text>
            </View>
            <Pressable onPress={() => setBarcode('')} hitSlop={8}>
              <Text style={styles.clearBarcodeText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Category</Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          style={styles.input}
        />
      </View>

      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={styles.inputLabel}>Cost Price (₱)</Text>
          <TextInput
            value={costPriceStr}
            onChangeText={setCostPriceStr}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.column}>
          <Text style={styles.inputLabel}>Selling Price (₱)</Text>
          <TextInput
            value={sellingPriceStr}
            onChangeText={setSellingPriceStr}
            keyboardType="decimal-pad"
            style={[styles.input, styles.sellingInput]}
          />
        </View>
      </View>

      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={styles.inputLabel}>Unit</Text>
          <TextInput
            value={unit}
            onChangeText={setUnit}
            style={styles.input}
          />
        </View>
        <View style={styles.column}>
          <Text style={styles.inputLabel}>Min Stock Alert</Text>
          <TextInput
            value={minStockStr}
            onChangeText={setMinStockStr}
            keyboardType="numeric"
            style={styles.input}
          />
        </View>
      </View>

      <View style={[styles.columns, { marginTop: 8 }]}>
        <AppButton
          onPress={onCancel}
          title="Cancel"
          variant="secondary"
          size="md"
          style={{ flex: 1 }}
        />
        <AppButton
          onPress={handleUpdate}
          title="Save Changes"
          loading={isSaving}
          loadingText="Saving..."
          icon={<FontAwesome5 name="check" size={12} color="#ffffff" />}
          size="md"
          style={{ flex: 1 }}
        />
      </View>

      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(scannedCode) => {
          setBarcode(scannedCode);
        }}
        title="Scan 1D / 2D Barcode"
      />
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = id ? parseInt(id, 10) : null;
  const { product, stockMovements, loading, error, update, adjustStock, archive } = useProduct(productId);

  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);

  const paginatedMovements = useMemo(() => {
    const start = (movementsPage - 1) * PAGE_SIZE;
    return stockMovements.slice(start, start + PAGE_SIZE);
  }, [stockMovements, movementsPage]);

  // Restock / Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustDeltaStr, setAdjustDeltaStr] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustType, setAdjustType] = useState<MovementType>('restock');
  const [isAdjusting, setIsAdjusting] = useState(false);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.centered}>
        <View style={styles.notFoundCircle}>
          <FontAwesome5 name="exclamation-circle" size={24} color="#e11d48" />
        </View>
        <Text style={styles.notFoundTitle}>Product Not Found</Text>
        <Text style={styles.notFoundSubtitle}>{error || 'This product does not exist.'}</Text>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Go Back to Inventory</Text>
        </Pressable>
      </View>
    );
  }

  const handleAdjustStock = async () => {
    const delta = parseFloat(adjustDeltaStr);
    if (isNaN(delta) || delta === 0) {
      toast.warning('Invalid Quantity', 'Please enter a non-zero quantity to adjust.');
      return;
    }
    if (adjustType === 'restock' && delta < 1) {
      toast.warning('Minimum of 1 Required', 'Restock quantity must be at least 1 (positive number).');
      return;
    }

    if (adjustType === 'damage' && delta > -1) {
      toast.warning('Maximum of -1 Required', 'Damage quantity must be at most -1 (e.g. -1, -2 to deduct damaged stock).');
      return;
    }

    if (!adjustReason.trim()) {
      toast.warning('Reason Required', 'Please provide a reason for adjusting the stock quantity.');
      return;
    }

    try {
      setIsAdjusting(true);
      await adjustStock({
        quantityDelta: delta,
        reason: adjustReason.trim(),
        movementType: adjustType,
      });
      setShowAdjustModal(false);
      setAdjustDeltaStr('');
      setAdjustReason('');
      toast.success('Stock Updated!', `Adjusted by ${delta > 0 ? `+${delta}` : delta} ${product.unit}.`);
    } catch (err) {
      toast.error('Adjustment Failed', err instanceof Error ? err.message : 'Failed to adjust stock.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleArchiveConfirm = async () => {
    try {
      await archive();
      toast.info('Product Archived', `"${product.name}" has been archived.`);
      setTimeout(() => {
        router.back();
      }, 500);
    } catch (err) {
      toast.error('Archive Failed', err instanceof Error ? err.message : 'Failed to archive product.');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Product' : product.name,
          headerShown: true,
          headerBackTitle: 'Inventory',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Top Header Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.productName}>{product.name}</Text>
              <View style={styles.metaRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{product.category}</Text>
                </View>
                {product.barcode ? (
                  <View style={styles.barcodeBadge}>
                    <FontAwesome name="barcode" size={11} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.barcodeBadgeText}>{product.barcode}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <StockStatusBadge
              stock={product.stock_quantity}
              minStock={product.minimum_stock}
              unit={product.unit}
            />
          </View>

          <View style={styles.priceStockRow}>
            <View>
              <Text style={styles.labelMuted}>Selling Price</Text>
              <Text style={styles.priceLarge}>
                {formatPHP(product.selling_price)}
                <Text style={styles.unitSmall}> / {product.unit}</Text>
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.labelMuted}>Current Stock</Text>
              <Text style={styles.stockLarge}>
                {product.stock_quantity}{' '}
                <Text style={styles.unitSmall}>{product.unit}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => {
              setAdjustType('restock');
              setAdjustReason('Restock shipment');
              setAdjustDeltaStr('10');
              setShowAdjustModal(true);
            }}
            style={styles.restockActionBtn}
          >
            <FontAwesome5 name="plus" size={12} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.restockActionText}>Restock Items</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setAdjustType('adjustment');
              setAdjustReason('Physical inventory recount');
              setAdjustDeltaStr('-1');
              setShowAdjustModal(true);
            }}
            style={styles.adjustActionBtn}
          >
            <FontAwesome5 name="sliders-h" size={12} color="#92400e" style={{ marginRight: 6 }} />
            <Text style={styles.adjustActionText}>Adjust Stock</Text>
          </Pressable>
        </View>

        {/* Product Information Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome5 name="info-circle" size={13} color="#64748b" style={{ marginRight: 6 }} />
              <Text style={styles.cardTitle}>Product Information</Text>
            </View>
            <Pressable
              onPress={() => setIsEditing(!isEditing)}
              style={styles.editToggleBtn}
            >
              <FontAwesome name={isEditing ? 'times' : 'pencil'} size={11} color="#475569" style={{ marginRight: 4 }} />
              <Text style={styles.editToggleText}>
                {isEditing ? 'Cancel Edit' : 'Edit Details'}
              </Text>
            </Pressable>
          </View>

          {isEditing ? (
            <ProductEditForm
              product={product}
              onSave={async (data) => {
                await update(data);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <View style={styles.infoTable}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Category</Text>
                <Text style={styles.infoValue}>{product.category}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Cost Price</Text>
                <Text style={styles.infoValue}>{formatPHP(product.cost_price)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Selling Price</Text>
                <Text style={[styles.infoValue, { color: '#047857', fontWeight: '800' }]}>
                  {formatPHP(product.selling_price)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Estimated Profit / Unit</Text>
                <Text style={[styles.infoValue, { color: '#047857', fontWeight: '800' }]}>
                  {formatPHP(product.selling_price - product.cost_price)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Low Stock Alert Threshold</Text>
                <Text style={styles.infoValue}>
                  {product.minimum_stock} {product.unit}s
                </Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.infoLabel}>Status</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: product.is_active ? '#10b981' : '#94a3b8',
                      marginRight: 6,
                    }}
                  />
                  <Text style={styles.infoValue}>
                    {product.is_active ? 'Active' : 'Archived'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Stock Movement History Audit */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <FontAwesome5 name="history" size={13} color="#64748b" style={{ marginRight: 6 }} />
            <Text style={styles.cardTitle}>Stock Movement History</Text>
          </View>
          {stockMovements.length === 0 ? (
            <Text style={styles.emptyHistory}>No stock movements recorded yet.</Text>
          ) : (
            <>
              {paginatedMovements.map((m, idx) => (
                <View
                  key={m.id}
                  style={[
                    styles.movementItem,
                    idx === paginatedMovements.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <FontAwesome5
                        name={
                          m.movement_type === 'restock'
                            ? 'plus-circle'
                            : m.movement_type === 'sale'
                            ? 'shopping-cart'
                            : 'exchange-alt'
                        }
                        size={11}
                        color="#64748b"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.movementType}>{m.movement_type}</Text>
                    </View>
                    <Text
                      style={[
                        styles.movementQuantity,
                        { color: m.quantity > 0 ? '#047857' : '#e11d48' },
                      ]}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {product.unit}
                    </Text>
                  </View>
                  <Text style={styles.movementReason}>{m.reason}</Text>
                  <View style={styles.movementFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.stockTrack}>Stock: {m.previous_quantity}</Text>
                      <FontAwesome5 name="arrow-right" size={8} color="#94a3b8" style={{ marginHorizontal: 4 }} />
                      <Text style={[styles.stockTrack, { color: '#334155', fontWeight: '700' }]}>
                        {m.new_quantity}
                      </Text>
                    </View>
                    <Text style={styles.timestamp}>
                      {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))}
              <Pagination
                currentPage={movementsPage}
                totalItems={stockMovements.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setMovementsPage(p)}
                itemName="movements"
              />
            </>
          )}
        </View>

        {/* Archive Button */}
        <Pressable
          onPress={handleArchiveConfirm}
          style={styles.archiveButton}
        >
          <FontAwesome5 name="archive" size={13} color="#be123c" style={{ marginRight: 6 }} />
          <Text style={styles.archiveButtonText}>Archive Product</Text>
        </Pressable>
      </ScrollView>

      {/* Stock Adjustment Modal */}
      <Modal visible={showAdjustModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>
                {adjustType === 'restock' ? 'Restock Product' : 'Adjust Stock Quantity'}
              </Text>
              <Pressable onPress={() => setShowAdjustModal(false)} style={{ padding: 4 }}>
                <FontAwesome name="times" size={16} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Current stock: {product.stock_quantity} {product.unit}. Every adjustment is saved in the audit log.
            </Text>

            {/* Type selector */}
            <View style={styles.pillsRow}>
              {(['restock', 'adjustment', 'damage', 'return'] as MovementType[]).map((type) => {
                const isSelected = adjustType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => {
                      setAdjustType(type);
                      const currentVal = parseFloat(adjustDeltaStr);
                      if (type === 'restock') {
                        if (isNaN(currentVal) || currentVal < 1) {
                          setAdjustDeltaStr('1');
                        }
                        if (!adjustReason || adjustReason === 'Damaged / expired items' || adjustReason === 'Physical inventory recount') {
                          setAdjustReason('Restock shipment');
                        }
                      } else if (type === 'damage') {
                        if (isNaN(currentVal) || currentVal > -1) {
                          setAdjustDeltaStr('-1');
                        }
                        if (!adjustReason || adjustReason === 'Restock shipment' || adjustReason === 'Physical inventory recount') {
                          setAdjustReason('Damaged / expired items');
                        }
                      }
                    }}
                    style={[styles.typePill, isSelected && styles.typePillSelected]}
                  >
                    <Text style={[styles.typePillText, isSelected && styles.typePillTextSelected]}>
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Delta Input */}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabel}>
                {adjustType === 'restock'
                  ? 'Quantity Change (Minimum: 1) *'
                  : adjustType === 'damage'
                  ? 'Quantity Change (Maximum: -1) *'
                  : 'Quantity Change (+ to add, - to reduce) *'}
              </Text>
              <TextInput
                value={adjustDeltaStr}
                onChangeText={setAdjustDeltaStr}
                placeholder={
                  adjustType === 'restock'
                    ? 'e.g. 1, 5, 10 (minimum 1)'
                    : adjustType === 'damage'
                    ? 'e.g. -1, -2, -5 (maximum -1)'
                    : 'e.g. 10 or -2'
                }
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
                style={[styles.input, { fontWeight: '700', fontSize: 16 }]}
              />
              {adjustType === 'restock' && (
                <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '600' }}>
                  ✓ Restock must be at least 1 (positive number) to add stock.
                </Text>
              )}
              {adjustType === 'damage' && (
                <Text style={{ fontSize: 12, color: '#e11d48', marginTop: 4, fontWeight: '600' }}>
                  ⚠ Damage must be at most -1 (e.g. -1, -2) to deduct stock.
                </Text>
              )}
            </View>

            {/* Reason Input */}
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Reason for adjustment *</Text>
              <TextInput
                value={adjustReason}
                onChangeText={setAdjustReason}
                placeholder="e.g. Bought from wholesale supplier"
                placeholderTextColor="#94a3b8"
                style={styles.input}
              />
            </View>

            {/* Modal Actions */}
            <View style={styles.columns}>
              <AppButton
                onPress={() => setShowAdjustModal(false)}
                title="Cancel"
                variant="secondary"
                size="md"
                style={{ flex: 1 }}
              />
              <AppButton
                onPress={handleAdjustStock}
                title="Save Stock"
                loading={isAdjusting}
                loadingText="Updating..."
                icon={<FontAwesome5 name="check" size={12} color="#ffffff" />}
                size="md"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  productName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  categoryBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  barcodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  barcodeBadgeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#475569',
    fontWeight: '600',
  },
  priceStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  labelMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  priceLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
    marginTop: 2,
  },
  stockLarge: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 2,
  },
  unitSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  restockActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 13,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  restockActionText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  adjustActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    borderRadius: 14,
    paddingVertical: 13,
  },
  adjustActionText: {
    color: '#92400e',
    fontWeight: '800',
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  infoTable: {
    marginTop: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  editForm: {
    marginTop: 10,
  },
  formGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sellingInput: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    fontWeight: '700',
  },
  columns: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyHistory: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  movementItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  movementType: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    textTransform: 'capitalize',
  },
  movementQuantity: {
    fontSize: 13,
    fontWeight: '900',
  },
  movementReason: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  movementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  stockTrack: {
    fontSize: 11,
    color: '#94a3b8',
  },
  timestamp: {
    fontSize: 10,
    color: '#94a3b8',
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1.5,
    borderColor: '#fecdd3',
    borderRadius: 14,
    paddingVertical: 14,
  },
  archiveButtonText: {
    color: '#be123c',
    fontWeight: '800',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f1f5f9',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  notFoundCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#e11d48',
    marginBottom: 4,
  },
  notFoundSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 18,
  },
  backButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typePill: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typePillSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'capitalize',
  },
  typePillTextSelected: {
    color: '#ffffff',
  },
  barcodeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  barcodeInput: {
    flex: 1,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  scannedNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 6,
  },
  scannedNoticeText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '700',
  },
  clearBarcodeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
