import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { BarcodeScannerModal } from '@/components/camera/barcode-scanner-modal';
import { ProductRepository } from '@/database/repositories/product-repository';
import { pesosToCentavos } from '@/utils/currency';
import { type UnitOfMeasurement } from '@/types/database';

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

export default function NewProductScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ barcode?: string }>();

  const toast = useToast();

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState(params.barcode || '');
  const [category, setCategory] = useState('General');
  const [customCategory, setCustomCategory] = useState('');
  const [costPriceStr, setCostPriceStr] = useState('');
  const [sellingPriceStr, setSellingPriceStr] = useState('');
  const [stockStr, setStockStr] = useState('0');
  const [unit, setUnit] = useState<UnitOfMeasurement>('piece');
  const [minStockStr, setMinStockStr] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.warning('Product Name Required', 'Please enter a product name before saving.');
      return;
    }

    const costNum = parseFloat(costPriceStr || '0');
    const sellingNum = parseFloat(sellingPriceStr || '0');
    const stockNum = parseFloat(stockStr || '0');
    const minStockNum = parseFloat(minStockStr || '5');

    if (isNaN(sellingNum) || sellingNum <= 0) {
      toast.error('Invalid Selling Price', 'Please enter a valid selling price greater than ₱0.00.');
      return;
    }

    if (isNaN(costNum) || costNum < 0) {
      toast.error('Invalid Cost Price', 'Cost price cannot be negative.');
      return;
    }

    if (isNaN(stockNum) || stockNum < 0) {
      toast.error('Invalid Initial Stock', 'Initial stock quantity cannot be negative.');
      return;
    }

    if (isNaN(minStockNum) || minStockNum < 0) {
      toast.error('Invalid Alert Threshold', 'Low stock alert threshold cannot be negative.');
      return;
    }

    if (sellingNum < costNum) {
      toast.warning('Price Margin Notice', `Selling price (₱${sellingNum.toFixed(2)}) is less than cost (₱${costNum.toFixed(2)}). Saving item...`);
    }

    await submitProduct();
  };

  const submitProduct = async () => {
    try {
      setIsSubmitting(true);
      const selectedCategory = category === 'Other' ? (customCategory.trim() || 'General') : category;
      const costCentavos = pesosToCentavos(parseFloat(costPriceStr || '0'));
      const sellingCentavos = pesosToCentavos(parseFloat(sellingPriceStr || '0'));
      const stock = parseFloat(stockStr || '0');
      const minStock = parseFloat(minStockStr || '5');

      await ProductRepository.create(db, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        category: selectedCategory,
        cost_price: costCentavos,
        selling_price: sellingCentavos,
        stock_quantity: stock,
        unit,
        minimum_stock: minStock,
      });

      toast.success('Product Added!', `"${name.trim()}" has been saved to your inventory.`);
      setTimeout(() => {
        router.back();
      }, 700);
    } catch (err) {
      toast.error('Failed to Save', err instanceof Error ? err.message : 'Failed to create product in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add New Product',
          headerShown: true,
          headerBackTitle: 'Inventory',
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Card 1: Product Name */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <FontAwesome5 name="box" size={13} color="#059669" />
              <Text style={styles.label}>
                Product Name <Text style={styles.required}>*</Text>
              </Text>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lucky Me! Pancit Canton Kalamansi"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              autoFocus={!params.barcode}
            />
          </View>

          {/* Card 2: Barcode */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="barcode" size={14} color="#059669" />
                <Text style={styles.label}>Barcode / Product Code</Text>
              </View>
              <Text style={styles.optional}>Optional</Text>
            </View>
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
                    Code ready: {barcode}
                  </Text>
                </View>
                <Pressable onPress={() => setBarcode('')} hitSlop={8}>
                  <Text style={styles.clearBarcodeText}>Clear</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Card 3: Category */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <FontAwesome5 name="tag" size={13} color="#059669" />
              <Text style={styles.label}>Category</Text>
            </View>
            <View style={styles.pillsContainer}>
              {COMMON_CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setCategory('Other')}
                style={[styles.pill, category === 'Other' && styles.pillSelected]}
              >
                <View style={styles.pillIconRow}>
                  <FontAwesome5
                    name="plus"
                    size={10}
                    color={category === 'Other' ? '#ffffff' : '#059669'}
                  />
                  <Text
                    style={[
                      styles.pillText,
                      category === 'Other' && styles.pillTextSelected,
                    ]}
                  >
                    Custom
                  </Text>
                </View>
              </Pressable>
            </View>

            {category === 'Other' && (
              <TextInput
                value={customCategory}
                onChangeText={setCustomCategory}
                placeholder="Enter custom category name"
                placeholderTextColor="#94a3b8"
                style={[styles.input, { marginTop: 10 }]}
              />
            )}
          </View>

          {/* Card 4: Pricing */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <FontAwesome5 name="money-bill-wave" size={13} color="#059669" />
              <Text style={styles.label}>Pricing (PHP ₱)</Text>
            </View>

            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.subLabel}>
                  Cost Price (₱) <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  value={costPriceStr}
                  onChangeText={setCostPriceStr}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={styles.hint}>Buying/wholesale cost</Text>
              </View>

              <View style={styles.column}>
                <Text style={styles.subLabel}>
                  Selling Price (₱) <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  value={sellingPriceStr}
                  onChangeText={setSellingPriceStr}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.sellingInput]}
                />
                <Text style={[styles.hint, { color: '#059669', fontWeight: '600' }]}>
                  Customer price
                </Text>
              </View>
            </View>
          </View>

          {/* Card 5: Inventory Stock & Alerts */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <FontAwesome5 name="boxes" size={13} color="#059669" />
              <Text style={styles.label}>Initial Stock & Unit</Text>
            </View>

            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.subLabel}>Initial Stock</Text>
                <TextInput
                  value={stockStr}
                  onChangeText={setStockStr}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>

              <View style={styles.column}>
                <Text style={styles.subLabel}>Low Stock Alert</Text>
                <TextInput
                  value={minStockStr}
                  onChangeText={setMinStockStr}
                  placeholder="5"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={[styles.subLabel, { marginTop: 12, marginBottom: 8 }]}>
              Unit of Measurement
            </Text>
            <View style={styles.pillsContainer}>
              {COMMON_UNITS.map((u) => {
                const isSelected = unit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => setUnit(u)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {u}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Save Button with Loading Spinner & Toast Feedback */}
          <AppButton
            onPress={handleSave}
            title="Save Product to Inventory"
            loading={isSubmitting}
            loadingText="Saving Product to Inventory..."
            icon={<FontAwesome5 name="check" size={14} color="#ffffff" />}
            size="lg"
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Barcode & QR Scanner Modal */}
      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(scannedCode, type) => {
          setBarcode(scannedCode);
          toast.success('Code Scanned!', `${scannedCode} (${type.toUpperCase()})`);
        }}
        title="Scan Barcode / QR Code"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: '#ef4444',
  },
  optional: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  monoInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  sellingInput: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    fontWeight: '700',
  },
  columns: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  pillSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pillTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  pillIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 6,
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    paddingVertical: 11,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
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
    marginTop: 8,
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
