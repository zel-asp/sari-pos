import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type NavTab =
  | "dashboard"
  | "overview"
  | "pos"
  | "utang"
  | "inventory"
  | "stock-history"
  | "products/new";

interface NavItemConfig {
  id: NavTab;
  label: string;
  route: string;
  icon: string;
  badge?: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    route: "/",
    icon: "chart-pie",
  },
  {
    id: "overview",
    label: "Overview & Charts",
    route: "/overview",
    icon: "chart-line",
  },
  {
    id: "pos",
    label: "Sell (POS)",
    route: "/pos",
    icon: "cash-register",
  },
  {
    id: "utang",
    label: "Customer Utang",
    route: "/utang/index",
    icon: "book-open",
  },
  {
    id: "inventory",
    label: "Inventory",
    route: "/inventory",
    icon: "boxes",
  },
  {
    id: "stock-history",
    label: "Stock History",
    route: "/stock-history",
    icon: "history",
  },
  {
    id: "products/new",
    label: "Add Product",
    route: "/products/new",
    icon: "plus-circle",
  },
];

interface AppLayoutProps {
  activeTab?: NavTab;
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function AppLayout({
  activeTab,
  title,
  headerRight,
  children,
}: AppLayoutProps) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768; // Tablet, iPad, Desktop/Large Screen
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (route: string) => {
    setMenuOpen(false);
    if (route === "/") {
      router.replace("/");
    } else {
      router.push(route as any);
    }
  };

  // --------------------------------------------------------------------------
  // 1. Large Screen Sidebar Component
  // --------------------------------------------------------------------------
  const renderSidebar = () => (
    <View style={styles.sidebar}>
      {/* Brand Header */}
      <View style={styles.sidebarBrand}>
        <View style={styles.brandIconCircle}>
          <FontAwesome5 name="store" size={18} color="#ffffff" />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandTitle}>Sari POS</Text>
          <Text style={styles.brandSubtitle}>Cloud Point of Sale</Text>
        </View>
      </View>

      {/* Navigation Items */}
      <ScrollView
        style={styles.sidebarNavScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.navSectionHeading}>MAIN MENU</Text>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => handleNavigate(item.route)}
              style={({ pressed }) => [
                styles.sidebarNavItem,
                isActive && styles.sidebarNavItemActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View
                style={[
                  styles.navItemIconBox,
                  isActive && styles.navItemIconBoxActive,
                ]}
              >
                <FontAwesome5
                  name={item.icon}
                  size={15}
                  color={isActive ? "#059669" : "#64748b"}
                />
              </View>
              <Text
                style={[
                  styles.sidebarNavLabel,
                  isActive && styles.sidebarNavLabelActive,
                ]}
              >
                {item.label}
              </Text>
              {isActive && <View style={styles.activePillIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Cloud & Store Footer */}
      <View style={styles.sidebarFooter}>
        <Text style={styles.footerVersionText}>v1.0.0 • Offline Ready</Text>
      </View>
    </View>
  );

  // --------------------------------------------------------------------------
  // 2. Mobile Menu Bar (Top Header & Slide Drawer)
  // --------------------------------------------------------------------------
  const renderMobileMenuBar = () => (
    <View style={styles.menuBar}>
      <View style={styles.menuBarLeft}>
        <View style={styles.menuBarBrandIcon}>
          <FontAwesome5 name="store" size={14} color="#059669" />
        </View>
        <View style={styles.menuBarTitleWrap}>
          <Text style={styles.menuBarTitle} numberOfLines={1}>
            {title || "Sari POS"}
          </Text>
        </View>
      </View>
      <View style={styles.menuBarRight}>
        {headerRight ? (
          <View style={styles.menuBarCustomAction}>{headerRight}</View>
        ) : null}
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.menuButton,
            pressed && styles.menuButtonPressed,
          ]}
          accessibilityLabel="Open navigation menu"
        >
          <FontAwesome5 name="bars" size={18} color="#0f172a" />
        </Pressable>
      </View>
    </View>
  );

  const renderMobileDrawer = () => (
    <Modal
      visible={menuOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setMenuOpen(false)}
    >
      <View style={styles.drawerOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuOpen(false)}
        />
        <View style={styles.drawerPanel}>
          {/* Drawer Header */}
          <SafeAreaView edges={["top"]} style={styles.drawerHeaderSafe}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandRow}>
                <View style={styles.drawerBrandIcon}>
                  <FontAwesome5 name="store" size={16} color="#ffffff" />
                </View>
                <View>
                  <Text style={styles.drawerBrandTitle}>Sari POS</Text>
                  <Text style={styles.drawerBrandSub}>Menu</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setMenuOpen(false)}
                style={({ pressed }) => [
                  styles.drawerCloseBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <FontAwesome name="times" size={18} color="#64748b" />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Drawer Links */}
          <ScrollView style={styles.drawerLinksScroll}>
            <Text style={styles.drawerSectionTitle}>NAVIGATION</Text>
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleNavigate(item.route)}
                  style={({ pressed }) => [
                    styles.drawerItem,
                    isActive && styles.drawerItemActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View
                    style={[
                      styles.drawerItemIconBox,
                      isActive && styles.drawerItemIconBoxActive,
                    ]}
                  >
                    <FontAwesome5
                      name={item.icon}
                      size={16}
                      color={isActive ? "#059669" : "#64748b"}
                    />
                  </View>
                  <Text
                    style={[
                      styles.drawerItemLabel,
                      isActive && styles.drawerItemLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {isActive && (
                    <View style={styles.drawerActiveBadge}>
                      <Text style={styles.drawerActiveBadgeText}>Active</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // --------------------------------------------------------------------------
  // Main Render (Sidebar on Desktop/Tablet, Menu Bar on Mobile)
  // --------------------------------------------------------------------------
  if (isLargeScreen) {
    return (
      <View style={styles.largeContainer}>
        {renderSidebar()}
        <View style={styles.mainContentArea}>
          {title || headerRight ? (
            <View style={styles.largeTopHeader}>
              <Text style={styles.largeTopTitle}>{title || "Sari POS"}</Text>
              {headerRight ? (
                <View style={styles.largeTopHeaderRight}>{headerRight}</View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.largeContentInner}>{children}</View>
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <View style={styles.mobileContainer}>
      <SafeAreaView edges={["top"]} style={styles.safeHeaderWrapper}>
        {renderMobileMenuBar()}
      </SafeAreaView>
      <View style={styles.mobileContentArea}>{children}</View>
      {renderMobileDrawer()}
    </View>
  );
}

const styles = StyleSheet.create({
  // Large Screen / Sidebar styles
  largeContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f8fafc",
  },
  sidebar: {
    width: 260,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingTop: Platform.OS === "web" ? 24 : 44,
    paddingHorizontal: 16,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  sidebarBrand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginBottom: 28,
  },
  brandIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  sidebarNavScroll: {
    flex: 1,
  },
  navSectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 8,
  },
  sidebarNavItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    position: "relative",
  },
  sidebarNavItemActive: {
    backgroundColor: "#ecfdf5",
  },
  navItemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  navItemIconBoxActive: {
    backgroundColor: "#d1fae5",
  },
  sidebarNavLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    flex: 1,
  },
  sidebarNavLabelActive: {
    color: "#059669",
    fontWeight: "800",
  },
  activePillIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: "#059669",
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 16,
    paddingHorizontal: 8,
  },
  cloudBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  cloudBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  footerVersionText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "500",
  },
  mainContentArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  largeTopHeader: {
    height: 64,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  largeTopTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  largeTopHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  largeContentInner: {
    flex: 1,
  },

  // Mobile Menu Bar Styles
  mobileContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  safeHeaderWrapper: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  menuBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
  },
  menuBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  menuBarBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  menuButtonPressed: {
    backgroundColor: "#e2e8f0",
  },
  menuBarTitleWrap: {
    flex: 1,
  },
  menuBarTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  menuBarRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuBarCustomAction: {
    marginRight: 4,
  },
  mobileContentArea: {
    flex: 1,
  },

  // Mobile Drawer Modal
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  drawerPanel: {
    width: "78%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    height: "100%",
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
    justifyContent: "space-between",
  },
  drawerHeaderSafe: {
    backgroundColor: "#ffffff",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  drawerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  drawerBrandIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  drawerBrandTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  drawerBrandSub: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerLinksScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  drawerSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 8,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  drawerItemActive: {
    backgroundColor: "#ecfdf5",
  },
  drawerItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  drawerItemIconBoxActive: {
    backgroundColor: "#d1fae5",
  },
  drawerItemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
    flex: 1,
  },
  drawerItemLabelActive: {
    color: "#059669",
    fontWeight: "800",
  },
  drawerActiveBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  drawerActiveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
  },
  drawerFooter: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
});
