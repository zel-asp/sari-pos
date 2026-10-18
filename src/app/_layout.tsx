import '@/global.css';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ToastProvider } from '@/components/ui/toast';
import { initDatabase } from '@/database';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initDatabase().catch((err) => {
      console.warn('[RootLayout] Database init error:', err);
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#ffffff' },
            headerTintColor: '#059669',
            headerTitleStyle: { fontWeight: 'bold' },
            contentStyle: { backgroundColor: '#f4f4f5' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="pos" options={{ title: 'Sell (Export) POS' }} />
          <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
          <Stack.Screen name="products/new" options={{ title: 'Add Product' }} />
          <Stack.Screen name="products/[id]" options={{ title: 'Product Details' }} />
          <Stack.Screen name="utang/index" options={{ title: 'Customer Utang' }} />
          <Stack.Screen name="utang/new" options={{ title: 'New Utang Transaction' }} />
          <Stack.Screen name="utang/[id]" options={{ title: 'Customer Profile' }} />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
