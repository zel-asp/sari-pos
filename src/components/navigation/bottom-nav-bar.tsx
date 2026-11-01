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


