import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/ui/pagination';
import { ProductRepository } from '@/database/repositories/product-repository';
import { pesosToCentavos } from '@/utils/currency';
import { type ScannedReceiptItem, type ReceiptScanResult } from '@/lib/gemini';
import { type UnitOfMeasurement } from '@/types/database';

const PAGE_SIZE = 15;

interface ReceiptReviewModalProps {
  visible: boolean;
  onClose: () => void;
  scanResult: ReceiptScanResult | null;
  onApplySingleItem: (item: ScannedReceiptItem) => void;
  onBatchSaved: (count: number) => void;
}

const COMMON_UNITS: UnitOfMeasurement[] = [
  'piece',
  'pack',
  'bottle',
  'sachet',
  'box',
  'can',
  'kg',
  'g',
];

const COMMON_CATEGORIES = [
  'Beverages',
  'Instant Noodles',
  'Canned Goods',
  'Snacks & Candies',
  'Condiments',
  'Rice & Grains',
  'Personal Care',
  'Household',
  'Fresh Food',
  'General',
];

export function ReceiptReviewModal({
  visible,
  onClose,
  scanResult,
  onApplySingleItem,
  onBatchSaved,
}: ReceiptReviewModalProps) {
  const toast = useToast();
  const [items, setItems] = useState<ScannedReceiptItem[]>([]);
  const [page, setPage] = useState(1);
  const [isSavingAll, setIsSavingAll] = useState(false);

  useEffect(() => {
    if (scanResult?.items) {
      setItems(JSON.parse(JSON.stringify(scanResult.items)));
      setPage(1);
    } else {
      setItems([]);
      setPage(1);
    }
  }, [scanResult]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  const updateItem = (id: string, updates: Partial<ScannedReceiptItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const calculateTotalCost = () => {
    return items.reduce((acc, it) => acc + (it.costPrice || 0) * (it.quantity || 1), 0);
  };

  const handleSaveAll = async () => {
    if (items.length === 0) {
      toast.warning('No Items', 'There are no items left in the receipt to import.');
      return;
    }

    // Validate all items
    for (const it of items) {
      if (!it.name.trim()) {
        toast.error('Missing Name', 'All products must have a valid name.');
        return;
      }
      if (it.sellingPrice <= 0) {
        toast.error('Invalid Selling Price', `Please enter a valid selling price for "${it.name}".`);
        return;
      }
    }

    try {
      setIsSavingAll(true);
      let savedCount = 0;

      for (const item of items) {
        await ProductRepository.create({
          name: item.name.trim(),
          barcode: item.barcode || null,
          category: item.category || 'General',
          cost_price: pesosToCentavos(item.costPrice || 0),
          selling_price: pesosToCentavos(item.sellingPrice || 0),
          stock_quantity: item.quantity || 1,
          unit: item.unit || 'piece',
          minimum_stock: 5,
        });
        savedCount++;
      }

      toast.success(
        'Batch Import Complete!',
        `Successfully added ${savedCount} products into your inventory!`
      );
      onBatchSaved(savedCount);
      onClose();
    } catch (err) {
      toast.error('Save Failed', err instanceof Error ? err.message : 'Failed to import products.');
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.aiBadge}>
              <FontAwesome5 name="robot" size={11} color="#059669" />
              <Text style={styles.aiBadgeText}>AI RECEIPT SCANNER</Text>
            </View>
            <Text style={styles.headerTitle}>Review Scanned Receipt</Text>
            {scanResult?.storeName ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                {scanResult.storeName}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#64748b" />
          </Pressable>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoBannerRow}>
            <FontAwesome5 name="receipt" size={16} color="#059669" />
            <Text style={styles.infoBannerText}>
              Review items, quantities, and selling prices. You can edit any field or fill the main form with 1 item.
            </Text>
          </View>
          {scanResult?.totalAmount ? (
            <View style={styles.receiptSummaryRow}>
              <Text style={styles.receiptSummaryLabel}>Receipt Total:</Text>
              <Text style={styles.receiptSummaryValue}>₱{scanResult.totalAmount.toFixed(2)}</Text>
              <Text style={styles.receiptSummaryCount}>({items.length} items parsed)</Text>
            </View>
          ) : null}
        </View>

        {/* Scanned Items List */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {paginatedItems.map((item, index) => {
            const overallIndex = (page - 1) * PAGE_SIZE + index;
            const cost = item.costPrice || 0;
            const selling = item.sellingPrice || 0;
            const margin = cost > 0 ? (((selling - cost) / cost) * 100).toFixed(0) : '0';

            return (
              <View key={item.id} style={styles.itemCard}>
                {/* Item Card Header */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.itemIndexBadge}>
                    <Text style={styles.itemIndexText}>{overallIndex + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 8 }}>
                    <Text style={styles.fieldLabel}>Product Name</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={item.name}
                      onChangeText={(val) => updateItem(item.id, { name: val })}
                      placeholder="Product name"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                  <Pressable
                    onPress={() => removeItem(item.id)}
                    style={styles.deleteButton}
                    hitSlop={8}
                  >
                    <FontAwesome5 name="trash-alt" size={14} color="#ef4444" />
                  </Pressable>
                </View>

                {/* Pricing & Stock Row */}
                <View style={styles.columnsRow}>
                  {/* Quantity */}
                  <View style={[styles.column, { flex: 0.9 }]}>
                    <Text style={styles.fieldLabel}>Qty (Stock)</Text>
                    <View style={styles.qtyContainer}>
                      <Pressable
                        onPress={() =>
                          updateItem(item.id, { quantity: Math.max(1, (item.quantity || 1) - 1) })
                        }
                        style={styles.qtyButton}
                      >
                        <Text style={styles.qtyButtonText}>-</Text>
                      </Pressable>
                      <TextInput
                        style={styles.qtyInput}
                        value={String(item.quantity ?? 1)}
                        keyboardType="numeric"
                        onChangeText={(val) => {
                          const n = parseInt(val, 10);
                          updateItem(item.id, { quantity: isNaN(n) ? 1 : Math.max(1, n) });
                        }}
                      />
                      <Pressable
                        onPress={() =>
                          updateItem(item.id, { quantity: (item.quantity || 1) + 1 })
                        }
                        style={styles.qtyButton}
                      >
                        <Text style={styles.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Unit Cost */}
                  <View style={[styles.column, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Cost Price (₱)</Text>
                    <TextInput
                      style={styles.input}
                      value={String(item.costPrice ?? '')}
                      keyboardType="decimal-pad"
                      onChangeText={(val) =>
                        updateItem(item.id, { costPrice: parseFloat(val) || 0 })
                      }
                      placeholder="0.00"
                    />
                  </View>

                  {/* Selling Price */}
                  <View style={[styles.column, { flex: 1.1 }]}>
                    <View style={styles.labelWithMarginRow}>
                      <Text style={styles.fieldLabel}>Selling (₱)</Text>
                      <Text style={[styles.marginBadge, Number(margin) < 0 && styles.negativeMargin]}>
                        {Number(margin) >= 0 ? `+${margin}%` : `${margin}%`}
                      </Text>
                    </View>
                    <TextInput
                      style={[styles.input, styles.sellingInput]}
                      value={String(item.sellingPrice ?? '')}
                      keyboardType="decimal-pad"
                      onChangeText={(val) =>
                        updateItem(item.id, { sellingPrice: parseFloat(val) || 0 })
                      }
                      placeholder="0.00"
                    />
                  </View>
                </View>

                {/* Category & Unit Picker Chips */}
                <View style={styles.tagsContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                    <View style={styles.chipsRow}>
                      <Text style={styles.chipSectionLabel}>Cat:</Text>
                      {COMMON_CATEGORIES.map((cat) => {
                        const isSelected = item.category === cat;
                        return (
                          <Pressable
                            key={cat}
                            onPress={() => updateItem(item.id, { category: cat })}
                            style={[styles.smallChip, isSelected && styles.smallChipSelected]}
                          >
                            <Text
                              style={[
                                styles.smallChipText,
                                isSelected && styles.smallChipTextSelected,
                              ]}
                            >
                              {cat}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, flexGrow: 0 }}>
                    <View style={styles.chipsRow}>
                      <Text style={styles.chipSectionLabel}>Unit:</Text>
                      {COMMON_UNITS.map((u) => {
                        const isSelected = item.unit === u;
                        return (
                          <Pressable
                            key={u}
                            onPress={() => updateItem(item.id, { unit: u })}
                            style={[styles.smallChip, isSelected && styles.smallChipSelected]}
                          >
                            <Text
                              style={[
                                styles.smallChipText,
                                isSelected && styles.smallChipTextSelected,
                              ]}
                            >
                              {u}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Quick Action: Fill Single into Main Form */}
                <View style={styles.cardFooterRow}>
                  <Text style={styles.subtotalText}>
                    Line Total: ₱{((item.costPrice || 0) * (item.quantity || 1)).toFixed(2)}
                  </Text>
                  <Pressable
                    onPress={() => {
                      onApplySingleItem(item);
                      onClose();
                      toast.info('Applied to Form', `"${item.name}" loaded into product form.`);
                    }}
                    style={styles.applySingleButton}
                  >
                    <FontAwesome5 name="edit" size={11} color="#059669" />
                    <Text style={styles.applySingleButtonText}>Fill into Form</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {items.length > 0 && (
            <Pagination
              currentPage={page}
              totalItems={items.length}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              itemName="receipt items"
            />
          )}
        </ScrollView>

        {/* Footer with Batch Save */}
        <View style={styles.footer}>
          <View style={styles.footerSummary}>
            <Text style={styles.footerItemsCount}>
              {items.length} {items.length === 1 ? 'Product' : 'Products'} Selected
            </Text>
            <Text style={styles.footerTotalCost}>
              Total Cost: ₱{calculateTotalCost().toFixed(2)}
            </Text>
          </View>

          <View style={styles.footerButtonsRow}>
            <Pressable
              onPress={handleSaveAll}
              disabled={isSavingAll || items.length === 0}
              style={[
                styles.batchSaveButton,
                (isSavingAll || items.length === 0) && styles.batchSaveButtonDisabled,
              ]}
            >
              {isSavingAll ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <FontAwesome5 name="layer-group" size={14} color="#ffffff" />
                  <Text style={styles.batchSaveButtonText}>
                    Import All {items.length} Products to Inventory
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  infoBanner: {
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1,
    borderBottomColor: '#bbf7d0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  infoBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#166534',
    flex: 1,
    lineHeight: 16,
  },
  receiptSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  receiptSummaryLabel: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
  },
  receiptSummaryValue: {
    fontSize: 14,
    color: '#15803d',
    fontWeight: '800',
  },
  receiptSummaryCount: {
    fontSize: 12,
    color: '#64748b',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  itemIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  nameInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    marginTop: 14,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  sellingInput: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    fontWeight: '700',
  },
  labelWithMarginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  marginBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  negativeMargin: {
    color: '#ef4444',
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  qtyInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    paddingVertical: 4,
  },
  tagsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    marginRight: 2,
  },
  smallChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  smallChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  smallChipTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  subtotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  applySingleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  applySingleButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  footer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  footerItemsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  footerTotalCost: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  footerButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  batchSaveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  batchSaveButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
  },
  batchSaveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
