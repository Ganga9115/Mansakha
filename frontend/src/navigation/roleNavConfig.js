// Single source of truth for role-based navigation - Build Prompt Section 0b:
// "a single mapping of role -> { navItems, allowedPages } consumed by one route
// resolver, so adding a new page to a role's dashboard means editing one config
// object, not duplicating a router file per role."
//
// `screen` names match the Stack.Screen names registered in StaffShell.js's
// per-role navigators (Victim's are unused - VictimShell keys tabs by `key`
// directly).

export const roleNavConfig = {
  Ministry: {
    navItems: [
      { key: 'dashboard', label: 'National Dashboard', screen: 'MinistryDashboard' },
      { key: 'staffManagement', label: 'Staff Management', screen: 'StaffManagement' },
      { key: 'systemConfig', label: 'System Configuration', screen: 'SystemConfig' },
      { key: 'auditLog', label: 'Audit Log', screen: 'AuditLog' },
    ],
  },
  Administration: {
    // Case Detail isn't a standalone sidebar destination - it's reached by tapping
    // a case in the dashboard's list, which needs a specific victimId.
    navItems: [
      { key: 'dashboard', label: 'Dashboard', screen: 'AdminDashboard' },
      { key: 'workload', label: 'Counsellor Workload', screen: 'Workload' },
      { key: 'alerts', label: 'Alerts', screen: 'AdminAlerts' },
    ],
  },
  Counsellor: {
    navItems: [
      { key: 'dashboard', label: 'Dashboard', screen: 'CounsellorDashboard' },
      { key: 'caseQueue', label: 'Case Queue', screen: 'CaseQueue' },
      { key: 'alerts', label: 'Alerts Feed', screen: 'AlertsFeed' },
    ],
  },
  Victim: {
    navItems: [
      { key: 'home', label: 'Home', screen: 'home' },
      { key: 'checkin', label: 'Check-in', screen: 'checkin' },
      { key: 'history', label: 'My History', screen: 'history' },
      { key: 'support', label: 'Support', screen: 'support' },
      { key: 'settings', label: 'Settings', screen: 'settings' },
    ],
  },
};

export function getNavItemsForRole(roleName) {
  return roleNavConfig[roleName] ? roleNavConfig[roleName].navItems : [];
}
