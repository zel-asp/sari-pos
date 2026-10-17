import React from 'react';
import { View, Text } from 'react-native';

export interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md';
}

export function Badge({ label, variant = 'default', size = 'md' }: BadgeProps) {
  const getContainerStyles = () => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 border-amber-300';
      case 'danger':
        return 'bg-rose-50 border-rose-200';
      case 'info':
        return 'bg-sky-50 border-sky-200';
      case 'default':
      default:
        return 'bg-zinc-100 border-zinc-200';
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'success':
        return 'text-emerald-800';
      case 'warning':
        return 'text-amber-800';
      case 'danger':
        return 'text-rose-700';
      case 'info':
        return 'text-sky-800';
      case 'default':
      default:
        return 'text-zinc-700';
    }
  };

  const getDotStyles = () => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-500';
      case 'warning':
        return 'bg-amber-500';
      case 'danger':
        return 'bg-rose-500';
      case 'info':
        return 'bg-sky-500';
      case 'default':
      default:
        return 'bg-zinc-400';
    }
  };

  const sizeStyles = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full border self-start ${getContainerStyles()} ${sizeStyles}`}
    >
      <View className={`w-1.5 h-1.5 rounded-full ${getDotStyles()}`} />
      <Text className={`font-bold text-xs ${getTextStyles()}`}>{label}</Text>
    </View>
  );
}

export function StockStatusBadge({
  stock,
  minStock,
  unit,
}: {
  stock: number;
  minStock: number;
  unit?: string;
}) {
  if (stock <= 0) {
    return <Badge label="Out of Stock" variant="danger" size="sm" />;
  }
  if (stock <= minStock) {
    return <Badge label={`Low Stock (${stock} ${unit || ''})`} variant="warning" size="sm" />;
  }
  return <Badge label={`${stock} ${unit || 'in stock'}`} variant="success" size="sm" />;
}
