import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  onPress: () => void | Promise<void>;
  title: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function AppButton({
  onPress,
  title,
  loading = false,
  loadingText,
  disabled = false,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  textStyle,
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryBtn;
      case 'danger':
        return styles.dangerBtn;
      case 'warning':
        return styles.warningBtn;
      case 'outline':
        return styles.outlineBtn;
      case 'primary':
      default:
        return styles.primaryBtn;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return styles.sizeSm;
      case 'lg':
        return styles.sizeLg;
      case 'md':
      default:
        return styles.sizeMd;
    }
  };

  const getTextColor = () => {
    if (variant === 'outline') return '#059669';
    if (variant === 'secondary') return '#334155';
    if (variant === 'warning') return '#92400e';
    return '#ffffff';
  };

  const getSpinnerColor = () => {
    if (variant === 'outline') return '#059669';
    if (variant === 'secondary') return '#334155';
    if (variant === 'warning') return '#92400e';
    return '#ffffff';
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.baseBtn,
        getVariantStyle(),
        getSizeStyle(),
        isDisabled && styles.disabledBtn,
        pressed && !isDisabled && styles.pressedBtn,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.contentRow}>
          <ActivityIndicator
            size="small"
            color={getSpinnerColor()}
            style={{ marginRight: 8 }}
          />
          <Text
            style={[
              styles.btnText,
              { color: getTextColor() },
              size === 'sm' && styles.textSm,
              size === 'lg' && styles.textLg,
              textStyle,
            ]}
          >
            {loadingText || title}
          </Text>
        </View>
      ) : (
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconBox}>{icon}</View>}
          <Text
            style={[
              styles.btnText,
              { color: getTextColor() },
              size === 'sm' && styles.textSm,
              size === 'lg' && styles.textLg,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  baseBtn: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    marginRight: 8,
  },
  primaryBtn: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  secondaryBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  dangerBtn: {
    backgroundColor: '#e11d48',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  warningBtn: {
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#fde68a',
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  sizeSm: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sizeMd: {
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  sizeLg: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 12,
    fontWeight: '700',
  },
  textLg: {
    fontSize: 16,
    fontWeight: '800',
  },
  disabledBtn: {
    opacity: 0.65,
    shadowOpacity: 0,
    elevation: 0,
  },
  pressedBtn: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
