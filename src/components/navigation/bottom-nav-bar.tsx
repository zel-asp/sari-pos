import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

interface BottomNavBarProps {
  activeTab: 'dashboard' | 'pos' | 'utang' | 'inventory';
}

export function BottomNavBar({ activeTab }: BottomNavBarProps) {
  return (
    <View style={styles.navContainer}>
      {/* 1. Dashboard Tab */}
      <Pressable
        onPress={() => {
          if (activeTab !== 'dashboard') router.replace('/');
        }}
        style={styles.navItem}
      >
        <FontAwesome5
          name="store"
          size={18}
          color={activeTab === 'dashboard' ? '#059669' : '#94a3b8'}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'dashboard' && styles.navLabelActive,
          ]}
        >
          Dashboard
        </Text>
      </Pressable>

      {/* 2. POS / Sell (Export) Tab */}
      <Pressable
        onPress={() => {
          if (activeTab !== 'pos') router.push('/pos');
        }}
        style={styles.navItem}
      >
        <View style={activeTab === 'pos' ? styles.activeIconWrap : undefined}>
          <FontAwesome5
            name="cash-register"
            size={18}
            color={activeTab === 'pos' ? '#059669' : '#94a3b8'}
          />
        </View>
        <Text
          style={[
            styles.navLabel,
            activeTab === 'pos' && styles.navLabelActive,
          ]}
        >
          Sell (Export)
        </Text>
      </Pressable>

      {/* 3. Customer Utang Tab */}
      <Pressable
        onPress={() => {
          if (activeTab !== 'utang') router.push('/utang/index');
        }}
        style={styles.navItem}
      >
        <FontAwesome5
          name="book-open"
          size={18}
          color={activeTab === 'utang' ? '#059669' : '#94a3b8'}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'utang' && styles.navLabelActive,
          ]}
        >
          Utang
        </Text>
      </Pressable>

      {/* 4. Inventory Tab */}
      <Pressable
        onPress={() => {
          if (activeTab !== 'inventory') router.push('/inventory');
        }}
        style={styles.navItem}
      >
        <FontAwesome5
          name="boxes"
          size={18}
          color={activeTab === 'inventory' ? '#059669' : '#94a3b8'}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'inventory' && styles.navLabelActive,
          ]}
        >
          Inventory
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
  },
  activeIconWrap: {
    transform: [{ scale: 1.08 }],
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 3,
  },
  navLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },
});
