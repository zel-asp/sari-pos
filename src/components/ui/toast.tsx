import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  show: (options: ToastOptions) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastState extends ToastOptions {
  id: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-30));
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: -20,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      setToast({
        ...options,
        type: options.type || 'info',
        id: Date.now(),
      });

      // Animate in
      opacity.setValue(0);
      translateY.setValue(-30);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 7,
          tension: 60,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      const duration = options.duration ?? (options.type === 'error' ? 4500 : 3200);
      hideTimerRef.current = setTimeout(() => {
        hide();
      }, duration);
    },
    [hide, opacity, translateY]
  );

  const success = useCallback((title: string, message?: string) => {
    show({ type: 'success', title, message });
  }, [show]);

  const error = useCallback((title: string, message?: string) => {
    show({ type: 'error', title, message });
  }, [show]);

  const warning = useCallback((title: string, message?: string) => {
    show({ type: 'warning', title, message });
  }, [show]);

  const info = useCallback((title: string, message?: string) => {
    show({ type: 'info', title, message });
  }, [show]);

  const getToastIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <FontAwesome5 name="check-circle" size={18} color="#ffffff" />;
      case 'error':
        return <FontAwesome5 name="exclamation-circle" size={18} color="#ffffff" />;
      case 'warning':
        return <FontAwesome5 name="exclamation-triangle" size={16} color="#ffffff" />;
      case 'info':
      default:
        return <FontAwesome5 name="info-circle" size={18} color="#ffffff" />;
    }
  };

  const getToastStyle = (type: ToastType) => {
    switch (type) {
      case 'success':
        return styles.toastSuccess;
      case 'error':
        return styles.toastError;
      case 'warning':
        return styles.toastWarning;
      case 'info':
      default:
        return styles.toastInfo;
    }
  };

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info, hide }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            getToastStyle(toast.type || 'info'),
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable onPress={hide} style={styles.toastInner}>
            <View style={styles.iconBox}>{getToastIcon(toast.type || 'info')}</View>
            <View style={styles.textBox}>
              <Text style={styles.toastTitle}>{toast.title}</Text>
              {toast.message ? (
                <Text style={styles.toastMessage}>{toast.message}</Text>
              ) : null}
            </View>
            <Pressable onPress={hide} hitSlop={10} style={styles.closeBtn}>
              <FontAwesome name="times" size={14} color="#ffffff" style={{ opacity: 0.8 }} />
            </Pressable>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 54,
    left: 16,
    right: 16,
    zIndex: 99999,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    maxWidth: 480,
    alignSelf: 'center',
    width: '92%',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toastSuccess: {
    backgroundColor: '#047857', // deep emerald
    borderLeftWidth: 5,
    borderLeftColor: '#34d399',
  },
  toastError: {
    backgroundColor: '#be123c', // deep rose
    borderLeftWidth: 5,
    borderLeftColor: '#f43f5e',
  },
  toastWarning: {
    backgroundColor: '#b45309', // amber
    borderLeftWidth: 5,
    borderLeftColor: '#fbbf24',
  },
  toastInfo: {
    backgroundColor: '#1d4ed8', // blue
    borderLeftWidth: 5,
    borderLeftColor: '#60a5fa',
  },
  iconBox: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBox: {
    flex: 1,
  },
  toastTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  toastMessage: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
    opacity: 0.95,
  },
  closeBtn: {
    marginLeft: 10,
    padding: 6,
  },
});
