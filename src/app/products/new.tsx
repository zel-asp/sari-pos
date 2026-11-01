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
  ActivityIndicator,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { FontAwesome5, FontAwesome, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '@/components/ui/toast';
import { AppButton } from '@/components/ui/app-button';
import { BarcodeScannerModal } from '@/components/camera/barcode-scanner-modal';
import { ReceiptReviewModal } from '@/components/receipt/receipt-review-modal';
import { ProductRepository } from '@/database/repositories/product-repository';
import { pesosToCentavos } from '@/utils/currency';
import { type UnitOfMeasurement } from '@/types/database';
import {
  parseReceiptWithGemini,
  parseReceiptsWithGemini,
  type ReceiptScanResult,
  type ScannedReceiptItem,
} from '@/lib/gemini';

export interface QueuedImage {
  id: string;
  uri: string;
  base64?: string | null;
  mimeType?: string;
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

export default function NewProductScreen() {
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

  // Duplicate prevention states
  const [nameError, setNameError] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Receipt Scanner states
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [receiptScanResult, setReceiptScanResult] = useState<ReceiptScanResult | null>(null);
  const [showReceiptReview, setShowReceiptReview] = useState(false);
  const [imageQueue, setImageQueue] = useState<QueuedImage[]>([]);
  const [activeScannedItemId, setActiveScannedItemId] = useState<string | null>(null);

  const checkNameDuplicate = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setNameError(null);
      return;
    }
    try {
      const isDup = await ProductRepository.isNameDuplicate(trimmed);
      if (isDup) {
        setNameError(`"${trimmed}" is already in your database. Avoid creating duplicates.`);
      } else {
        setNameError(null);
      }
    } catch {
      // ignore check error
    }
  };

  const checkBarcodeDuplicate = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setBarcodeError(null);
      return;
    }
    try {
      const isDup = await ProductRepository.isBarcodeDuplicate(trimmed);
      if (isDup) {
        setBarcodeError(`Barcode "${trimmed}" already belongs to an existing product.`);
      } else {
        setBarcodeError(null);
      }
    } catch {
      // ignore check error
    }
  };

  const getBase64FromUri = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleTakeReceiptPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        toast.error('Camera Permission Denied', 'Camera permission is required to snap receipt photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newImage: QueuedImage = {
          id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType || 'image/jpeg',
        };
        setImageQueue((prev) => {
          const updated = [...prev, newImage];
          toast.success(
            'Photo Added to Queue',
            `Photo #${updated.length} queued. Snap more or tap "Extract All".`
          );
          return updated;
        });
      }
    } catch {
      toast.error('Camera Error', 'Could not open camera.');
    }
  };

  const handlePickReceiptFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages: QueuedImage[] = result.assets.map((asset, idx) => ({
          id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType || 'image/jpeg',
        }));
        setImageQueue((prev) => {
          const updated = [...prev, ...newImages];
          toast.success(
            'Photos Queued',
            `Added ${newImages.length} photo${newImages.length > 1 ? 's' : ''} (${updated.length} total in queue).`
          );
          return updated;
        });
      }
    } catch {
      toast.error('File Error', 'Could not select image file.');
    }
  };

  const handleRemoveQueuedImage = (id: string) => {
    setImageQueue((prev) => prev.filter((img) => img.id !== id));
  };

  const handleClearQueue = () => {
    setImageQueue([]);
  };

  const handleProcessQueue = async () => {
    if (imageQueue.length === 0) {
      toast.warning('Queue is Empty', 'Please take or insert at least one receipt photo first.');
      return;
    }

    try {
      setIsScanningReceipt(true);
      const preparedImages = await Promise.all(
        imageQueue.map(async (img) => {
          let b64 = img.base64;
          if (!b64) {
            b64 = await getBase64FromUri(img.uri);
          }
          return {
            base64: b64,
            mimeType: img.mimeType || 'image/jpeg',
          };
        })
      );

      const result = await parseReceiptsWithGemini(preparedImages);

      if (!result.items || result.items.length === 0) {
        toast.warning(
          'No Items Found',
          'Could not detect purchased items in the uploaded photos. Please ensure the receipts are well-lit and legible.'
        );
        return;
      }

      // Clear image queue now that extraction is complete
      setImageQueue([]);

      if (result.items.length === 1) {
        handleApplySingleItem(result.items[0]);
        setReceiptScanResult(result);
        toast.success(
          'Product Details Auto-Filled!',
          `Loaded "${result.items[0].name}" (Cost: ₱${result.items[0].costPrice.toFixed(2)}, SRP: ₱${result.items[0].sellingPrice.toFixed(2)}).`
        );
        return;
      }

      setReceiptScanResult(result);
      setShowReceiptReview(true);
      toast.success(
        'Receipts Processed!',
        `Extracted ${result.items.length} items from ${result.storeName || 'receipt'}.`
      );
    } catch (err) {
      console.error('[Receipt Scanner Error]', err);
      toast.error(
        'Scan Failed',
        err instanceof Error ? err.message : 'Failed to parse receipts with AI.'
      );
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const handleApplySingleItem = (item: ScannedReceiptItem) => {
    setActiveScannedItemId(item.id);
    setName(item.name);
    setCostPriceStr(item.costPrice ? item.costPrice.toFixed(2) : '');
    setSellingPriceStr(item.sellingPrice ? item.sellingPrice.toFixed(2) : '');
    setStockStr(String(item.quantity || 1));
    if (COMMON_CATEGORIES.includes(item.category)) {
      setCategory(item.category);
    } else {
      setCategory('Other');
      setCustomCategory(item.category);
    }
    if (COMMON_UNITS.includes(item.unit as UnitOfMeasurement)) {
      setUnit(item.unit as UnitOfMeasurement);
    }
    setNameError(null);
  };

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

    // Check for duplicate name in database
    const isDupName = await ProductRepository.isNameDuplicate(trimmedName);
    if (isDupName) {
      setNameError(`A product named "${trimmedName}" already exists.`);
      toast.error('Duplicate Product', `A product with the name "${trimmedName}" already exists in your inventory.`);
      return;
    }

    // Check for duplicate barcode if barcode is entered
    const trimmedBarcode = barcode.trim();
    if (trimmedBarcode) {
      const isDupBarcode = await ProductRepository.isBarcodeDuplicate(trimmedBarcode);
      if (isDupBarcode) {
        setBarcodeError(`Barcode "${trimmedBarcode}" is already assigned to another product.`);
        toast.error('Duplicate Barcode', `Barcode "${trimmedBarcode}" already belongs to an existing product.`);
        return;
      }
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

      await ProductRepository.create({
        name: name.trim(),
        barcode: barcode.trim() || null,
        category: selectedCategory,
        cost_price: costCentavos,
        selling_price: sellingCentavos,
        stock_quantity: stock,
        unit,
        minimum_stock: minStock,
      });

      // Handle batch receipt items if currently active
      if (receiptScanResult && receiptScanResult.items && receiptScanResult.items.length > 0) {
        const remaining = receiptScanResult.items.filter(
          (it) => it.id !== activeScannedItemId && it.name.trim().toLowerCase() !== name.trim().toLowerCase()
        );

        if (remaining.length > 0) {
          setReceiptScanResult({ ...receiptScanResult, items: remaining });
          setName('');
          setBarcode('');
          setCostPriceStr('');
          setSellingPriceStr('');
          setStockStr('0');
          setCategory('General');
          setCustomCategory('');
          setActiveScannedItemId(null);
          setNameError(null);
          setBarcodeError(null);

          toast.success(
            'Product Saved!',
            `"${name.trim()}" saved. ${remaining.length} item${remaining.length === 1 ? '' : 's'} remaining in receipt batch.`
          );

          // Return to receipt review modal so user can proceed with next item
          setTimeout(() => {
            setShowReceiptReview(true);
          }, 350);
          return;
        } else {
          setReceiptScanResult(null);
          setActiveScannedItemId(null);
          toast.success('Batch Complete!', `All items from the receipt have been added to your inventory.`);
          setTimeout(() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/inventory');
            }
          }, 700);
          return;
        }
      }

      toast.success('Product Added!', `"${name.trim()}" has been saved to your inventory.`);
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/inventory');
        }
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
          {/* Persistent Scanned Batch Banner */}
          {receiptScanResult && receiptScanResult.items && receiptScanResult.items.length > 0 && (
            <View style={styles.scannedBatchBanner}>
              <View style={styles.scannedBatchHeader}>
                <View style={styles.scannedBatchBadge}>
                  <FontAwesome5 name="receipt" size={12} color="#059669" />
                  <Text style={styles.scannedBatchBadgeText}>
                    SCANNED RECEIPT ({receiptScanResult.items.length} {receiptScanResult.items.length === 1 ? 'ITEM' : 'ITEMS'})
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Discard Receipt Items?',
                      'Are you sure you want to discard the remaining items from this scanned receipt?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Discard',
                          style: 'destructive',
                          onPress: () => {
                            setReceiptScanResult(null);
                            setActiveScannedItemId(null);
                            toast.info('Batch Discarded', 'Receipt items cleared.');
                          },
                        },
                      ]
                    );
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.scannedBatchDiscardText}>Discard Batch</Text>
                </Pressable>
              </View>

              <Text style={styles.scannedBatchDescription}>
                {activeScannedItemId
                  ? `Editing "${name || 'item'}" from ${receiptScanResult.storeName || 'receipt'}. Other scanned items are saved.`
                  : `${receiptScanResult.items.length} items parsed from ${receiptScanResult.storeName || 'receipt'}.`}
              </Text>

              <View style={styles.scannedBatchActionsRow}>
                <Pressable
                  onPress={() => setShowReceiptReview(true)}
                  style={({ pressed }) => [styles.openBatchButton, pressed && { opacity: 0.85 }]}
                >
                  <FontAwesome5 name="list-ul" size={13} color="#ffffff" />
                  <Text style={styles.openBatchButtonText}>
                    Return to Scanned Items ({receiptScanResult.items.length})
                  </Text>
                </Pressable>

                {activeScannedItemId && (
                  <Pressable
                    onPress={() => {
                      const currentIndex = receiptScanResult.items.findIndex((it) => it.id === activeScannedItemId);
                      const nextIndex = (currentIndex + 1) % receiptScanResult.items.length;
                      const nextItem = receiptScanResult.items[nextIndex];
                      if (nextItem) {
                        handleApplySingleItem(nextItem);
                        toast.info('Switched Item', `Loaded "${nextItem.name}" into form.`);
                      }
                    }}
                    style={({ pressed }) => [styles.nextItemButton, pressed && { opacity: 0.85 }]}
                  >
                    <FontAwesome5 name="step-forward" size={11} color="#059669" />
                    <Text style={styles.nextItemButtonText}>Next Item</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* AI Receipt Intake Card */}
          <View style={styles.aiReceiptCard}>
            <View style={styles.aiReceiptHeader}>
              <View style={styles.aiIconBubble}>
                <FontAwesome5 name="magic" size={14} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiReceiptTitle}>AI Receipt Scanner & Queuing</Text>
                <Text style={styles.aiReceiptSub}>
                  Take or insert multiple receipt photos in queue, then extract all items at once.
                </Text>
              </View>
            </View>

            {/* If there are queued photos, show queue preview list */}
            {imageQueue.length > 0 ? (
              <View style={styles.queueContainer}>
                <View style={styles.queueHeaderRow}>
                  <Text style={styles.queueTitle}>
                    Queued Photos ({imageQueue.length})
                  </Text>
                  <Pressable onPress={handleClearQueue} hitSlop={8}>
                    <Text style={styles.clearQueueText}>Clear All</Text>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.queueThumbnailsRow}
                >
                  {imageQueue.map((item, idx) => (
                    <View key={item.id} style={styles.queueThumbnailBox}>
                      <Image source={{ uri: item.uri }} style={styles.queueThumbnailImage} />
                      <View style={styles.queueBadge}>
                        <Text style={styles.queueBadgeText}>#{idx + 1}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleRemoveQueuedImage(item.id)}
                        style={styles.queueDeleteBtn}
                        hitSlop={6}
                      >
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.queueActionsRow}>
                  <Pressable
                    onPress={handleTakeReceiptPhoto}
                    style={({ pressed }) => [styles.queueAddMoreBtn, pressed && { opacity: 0.8 }]}
                  >
                    <FontAwesome5 name="camera" size={12} color="#059669" />
                    <Text style={styles.queueAddMoreText}>+ Camera</Text>
                  </Pressable>

                  <Pressable
                    onPress={handlePickReceiptFile}
                    style={({ pressed }) => [styles.queueAddMoreBtn, pressed && { opacity: 0.8 }]}
                  >
                    <FontAwesome5 name="plus" size={12} color="#059669" />
                    <Text style={styles.queueAddMoreText}>+ Photos</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleProcessQueue}
                    style={({ pressed }) => [styles.queueExtractBtn, pressed && { opacity: 0.9 }]}
                  >
                    <FontAwesome5 name="magic" size={13} color="#ffffff" />
                    <Text style={styles.queueExtractBtnText}>
                      Extract All ({imageQueue.length})
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.aiReceiptButtonsRow}>
                <Pressable
                  onPress={handleTakeReceiptPhoto}
                  style={({ pressed }) => [styles.aiActionButton, styles.cameraButton, pressed && { opacity: 0.85 }]}
                >
                  <FontAwesome5 name="camera" size={13} color="#ffffff" />
                  <Text style={styles.aiActionButtonText}>Snap Photo</Text>
                </Pressable>

                <Pressable
                  onPress={handlePickReceiptFile}
                  style={({ pressed }) => [styles.aiActionButton, styles.uploadButton, pressed && { opacity: 0.85 }]}
                >
                  <FontAwesome5 name="images" size={13} color="#059669" />
                  <Text style={[styles.aiActionButtonText, { color: '#059669' }]}>Insert Photos</Text>
                </Pressable>
              </View>
            )}
          </View>
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
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError(null);
              }}
              onBlur={() => checkNameDuplicate(name)}
              placeholder="Enter product name"
              placeholderTextColor="#94a3b8"
              style={[styles.input, nameError ? styles.inputError : null]}
              autoFocus={!params.barcode}
            />
            {nameError ? (
              <View style={styles.duplicateWarningRow}>
                <FontAwesome5 name="exclamation-circle" size={12} color="#dc2626" style={{ marginRight: 6 }} />
                <Text style={styles.duplicateWarningText}>{nameError}</Text>
              </View>
            ) : null}
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
                onChangeText={(text) => {
                  setBarcode(text);
                  if (barcodeError) setBarcodeError(null);
                }}
                onBlur={() => checkBarcodeDuplicate(barcode)}
                placeholder="e.g. 4800016644819"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                style={[styles.input, styles.monoInput, styles.barcodeInput, barcodeError ? styles.inputError : null]}
              />
              <Pressable
                onPress={() => setShowScanner(true)}
                style={({ pressed }) => [styles.scanButton, pressed && { opacity: 0.85 }]}
              >
                <FontAwesome5 name="camera" size={13} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.scanButtonText}>Scan</Text>
              </Pressable>
            </View>
            {barcodeError ? (
              <View style={styles.duplicateWarningRow}>
                <FontAwesome5 name="exclamation-circle" size={12} color="#dc2626" style={{ marginRight: 6 }} />
                <Text style={styles.duplicateWarningText}>{barcodeError}</Text>
              </View>
            ) : null}
            {barcode && !barcodeError ? (
              <View style={styles.scannedNoticeRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <FontAwesome5 name="check-circle" size={11} color="#059669" style={{ marginRight: 5 }} />
                  <Text style={styles.scannedNoticeText} numberOfLines={1}>
                    Code ready: {barcode}
                  </Text>
                </View>
                <Pressable onPress={() => { setBarcode(''); setBarcodeError(null); }} hitSlop={8}>
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
          checkBarcodeDuplicate(scannedCode);
        }}
        title="Scan Barcode / QR Code"
      />

      {/* AI Receipt Scanning Progress Modal */}
      <Modal visible={isScanningReceipt} transparent animationType="fade">
        <View style={styles.scanningModalBackdrop}>
          <View style={styles.scanningModalBox}>
            <View style={styles.scanningIconCircle}>
              <ActivityIndicator size="large" color="#059669" />
            </View>
            <Text style={styles.scanningModalTitle}>
              {imageQueue.length > 1 ? `AI Reading ${imageQueue.length} Photos...` : 'AI Reading Receipt...'}
            </Text>
            <Text style={styles.scanningModalSub}>
              Detecting item names, quantities, and wholesale costs with Gemini. Please wait a moment.
            </Text>
          </View>
        </View>
      </Modal>

      {/* AI Receipt Review Modal */}
      <ReceiptReviewModal
        visible={showReceiptReview}
        onClose={() => setShowReceiptReview(false)}
        scanResult={receiptScanResult}
        activeItemId={activeScannedItemId}
        onApplySingleItem={handleApplySingleItem}
        onUpdateItems={(updated) => {
          setReceiptScanResult((prev) => (prev ? { ...prev, items: updated } : null));
        }}
        onBatchSaved={(count) => {
          setReceiptScanResult(null);
          setActiveScannedItemId(null);
          toast.success('Inventory Updated', `${count} items added to inventory.`);
          setTimeout(() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/inventory');
            }
          }, 800);
        }}
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
  aiReceiptCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    backgroundColor: '#f0fdf4',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  aiReceiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  aiIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiReceiptTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065f46',
    letterSpacing: 0.2,
  },
  aiReceiptSub: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  aiReceiptButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  aiActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  cameraButton: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  aiActionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
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
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  duplicateWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  duplicateWarningText: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
    flex: 1,
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
  scanningModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scanningModalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  scanningIconCircle: {
    marginBottom: 16,
  },
  scanningModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  scanningModalSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  scannedBatchBanner: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  scannedBatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  scannedBatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scannedBatchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065f46',
    letterSpacing: 0.4,
  },
  scannedBatchDiscardText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
    textDecorationLine: 'underline',
  },
  scannedBatchDescription: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 10,
  },
  scannedBatchActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  openBatchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  openBatchButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  nextItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  nextItemButtonText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  queueContainer: {
    marginTop: 4,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46',
  },
  clearQueueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ef4444',
    textDecorationLine: 'underline',
  },
  queueThumbnailsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  queueThumbnailBox: {
    width: 72,
    height: 72,
    borderRadius: 10,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  queueThumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  queueBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  queueBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  queueDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ffffff',
    borderRadius: 10,
  },
  queueActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  queueAddMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#059669',
  },
  queueAddMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  queueExtractBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  queueExtractBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});

