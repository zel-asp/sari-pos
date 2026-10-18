import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

interface BottomNavBarProps {
  activeTab: 'dashboard' | 'pos' | 'utang' | 'inventory';
}

/**
 * @deprecated Replaced by AppLayout (Menu bar on mobile, sidebar on large screens).
 * Renders null so no lower navigation bar ever appears.
 */
export function BottomNavBar(_props: BottomNavBarProps) {
  return null;
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
