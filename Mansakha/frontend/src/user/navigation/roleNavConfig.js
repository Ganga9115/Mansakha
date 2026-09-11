// Single source of truth for role-based navigation, trimmed to the User
// app's tab bar now that Staff/Ministry navigation lives in web-frontend.
// `screen` keys match UserShell.js's SCREENS map. `icon`: Feather glyph.

export const roleNavConfig = {
  User: {
    navItems: [
      { key: 'home', label: 'Home', screen: 'home', icon: 'home' },
      { key: 'checkin', label: 'Check-in', screen: 'checkin', icon: 'mic' },
      { key: 'history', label: 'My History', screen: 'history', icon: 'bar-chart-2' },
      { key: 'support', label: 'Support', screen: 'support', icon: 'file-text' },
      { key: 'settings', label: 'Profile', screen: 'settings', icon: 'user' },
    ],
  },
};

export function getNavItemsForRole(roleName) {
  return roleNavConfig[roleName] ? roleNavConfig[roleName].navItems : [];
}
