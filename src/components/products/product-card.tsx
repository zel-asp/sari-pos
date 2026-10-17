import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { type Product } from '@/types/database';
import { formatPHP } from '@/utils/currency';
import { StockStatusBadge } from '@/components/ui/badge';

export interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  onRestockPress?: () => void;
  showCostPrice?: boolean;
}

export function ProductCard({
  product,
  onPress,
  onRestockPress,
  showCostPrice = true,
}: ProductCardProps) {
  const isOutOfStock = product.stock_quantity <= 0;
  const isLowStock = product.stock_quantity <= product.minimum_stock && !isOutOfStock;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isOutOfStock && styles.cardOutOfStock,
        isLowStock && styles.cardLowStock,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{product.category}</Text>
            </View>
            {product.barcode ? (
              <View style={styles.barcodeBadge}>
                <FontAwesome name="barcode" size={11} color="#64748b" style={{ marginRight: 4 }} />
                <Text style={styles.barcodeText}>{product.barcode}</Text>
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

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.sellingPrice}>
            {formatPHP(product.selling_price)}
            <Text style={styles.unitText}> / {product.unit}</Text>
          </Text>
          {showCostPrice && (
            <Text style={styles.costInfo}>
              Cost: {formatPHP(product.cost_price)} • Profit: {formatPHP(product.selling_price - product.cost_price)}
            </Text>
          )}
        </View>

        {onRestockPress && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onRestockPress();
            }}
            style={({ pressed }) => [styles.restockButton, pressed && styles.restockButtonPressed]}
          >
            <FontAwesome5 name="plus" size={10} color="#047857" style={{ marginRight: 4 }} />
            <Text style={styles.restockButtonText}>Restock</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardOutOfStock: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2',
  },
  cardLowStock: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleContainer: {
    flex: 1,
    marginRight: 10,
  },
  productName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
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
  categoryText: {
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
  barcodeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#475569',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  sellingPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: -0.3,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  costInfo: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  restockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  restockButtonPressed: {
    backgroundColor: '#d1fae5',
  },
  restockButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
});
