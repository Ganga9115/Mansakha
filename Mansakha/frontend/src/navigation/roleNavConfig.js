// Single source of truth for role-based navigation - Build Prompt Section 0b:
// "a single mapping of role -> { navItems, allowedPages } consumed by one route
// resolver, so adding a new page to a role's dashboard means editing one config
// object, not duplicating a router file per role."
//
// `screen` names match the Stack.Screen names registered in StaffShell.js's
// per-role navigators (Victim's are unused - VictimShell keys tabs by `key`
// directly). `icon`: Feather glyph shown in the sidebar. `group`: uppercase
// section label rendered above the item when it differs from the previous
// item's group - gives the sidebar real hierarchical structure instead of a
// flat list.

export const roleNavConfig = {
  Ministry: {
    navItems: [
      { key: 'dashboard', label: 'National Dashboard', screen: 'MinistryDashboard', icon: 'grid', group: 'Overview' },
      { key: 'staffManagement', label: 'Staff Management', screen: 'StaffManagement', icon: 'users', group: 'Administration' },
      { key: 'systemConfig', label: 'System Configuration', screen: 'SystemConfig', icon: 'settings', group: 'Administration' },
      { key: 'auditLog', label: 'Audit Log', screen: 'AuditLog', icon: 'file-text', group: 'Compliance' },
    ],
  },
  Administration: {
    // Case Detail isn't a standalone sidebar destination - it's reached by tapping
    // a case in the dashboard's list, which needs a specific victimId.
    navItems: [
      { key: 'dashboard', label: 'Dashboard', screen: 'AdminDashboard', icon: 'grid', group: 'Overview' },
      { key: 'workload', label: 'Counsellor Workload', screen: 'Workload', icon: 'users', group: 'Case Management' },
      { key: 'alerts', label: 'Alerts', screen: 'AdminAlerts', icon: 'bell', group: 'Case Management' },
    ],
  },
  Counsellor: {
    navItems: [
      { key: 'dashboard', label: 'Dashboard', screen: 'CounsellorDashboard', icon: 'grid', group: 'Overview' },
      { key: 'caseQueue', label: 'Case Queue', screen: 'CaseQueue', icon: 'list', group: 'Case Management' },
      { key: 'alerts', label: 'Alerts Feed', screen: 'AlertsFeed', icon: 'bell', group: 'Case Management' },
    ],
  },
  Victim: {
    navItems: [
      { key: 'home', label: 'Home', screen: 'home', icon: 'home' },
      { key: 'checkin', label: 'Check-in', screen: 'checkin', icon: 'edit-3' },
      { key: 'history', label: 'My History', screen: 'history', icon: 'bar-chart-2' },
      { key: 'support', label: 'Support', screen: 'support', icon: 'life-buoy' },
      { key: 'settings', label: 'Settings', screen: 'settings', icon: 'settings' },
    ],
  },
};

export function getNavItemsForRole(roleName) {
  return roleNavConfig[roleName] ? roleNavConfig[roleName].navItems : [];
}
