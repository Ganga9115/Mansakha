import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';
import { StaffScopeProvider } from '../context/StaffScopeContext';
import { getNavItemsForRole } from './roleNavConfig';
import GovernmentHeader from './GovernmentHeader';

import CounsellorDashboardScreen from '../screens/staff/CounsellorDashboardScreen';
import CaseQueueScreen from '../screens/staff/CaseQueueScreen';
import CaseDetailScreen from '../screens/staff/CaseDetailScreen';
import LogInterventionScreen from '../screens/staff/LogInterventionScreen';
import AlertsFeedScreen from '../screens/staff/AlertsFeedScreen';
import AdminAlertsScreen from '../screens/staff/AdminAlertsScreen';
import AdminDashboardScreen from '../screens/staff/AdminDashboardScreen';
import WorkloadScreen from '../screens/staff/WorkloadScreen';
import StaffManagementScreen from '../screens/ministry/StaffManagementScreen';
import SystemConfigScreen from '../screens/ministry/SystemConfigScreen';
import AuditLogScreen from '../screens/ministry/AuditLogScreen';

const Drawer = createDrawerNavigator();
const SIDEBAR_BREAKPOINT = 768; // below this width, sidebar collapses to a drawer

// Every screen reachable per role (not just the ones shown as sidebar buttons -
// CaseDetail/LogIntervention are drill-down targets navigated to from other
// screens, not top-level sidebar destinations).
const SCREENS_BY_ROLE = {
  Counsellor: [
    { name: 'CounsellorDashboard', component: CounsellorDashboardScreen },
    { name: 'CaseQueue', component: CaseQueueScreen },
    { name: 'CaseDetail', component: CaseDetailScreen },
    { name: 'LogIntervention', component: LogInterventionScreen },
    { name: 'AlertsFeed', component: AlertsFeedScreen },
  ],
  Administration: [
    { name: 'AdminDashboard', component: AdminDashboardScreen },
    { name: 'CaseDetail', component: CaseDetailScreen },
    { name: 'Workload', component: WorkloadScreen },
    { name: 'AdminAlerts', component: AdminAlertsScreen },
  ],
  Ministry: [
    { name: 'MinistryDashboard', component: AdminDashboardScreen },
    { name: 'CaseDetail', component: CaseDetailScreen },
    { name: 'StaffManagement', component: StaffManagementScreen },
    { name: 'SystemConfig', component: SystemConfigScreen },
    { name: 'AuditLog', component: AuditLogScreen },
  ],
};

// Custom drawer panel - React Navigation hands this component `navigation`
// directly as a prop, so sidebar items call navigation.navigate() the normal,
// documented way. Institutional nav rail: navy background, white text, a
// gold-free blue left-border active indicator (per the shared blue/white
// palette), Feather icon per item, and uppercase section-group labels for
// hierarchical structure instead of a flat list.
function SidebarContent({ navigation, state, navItems, onLogout }) {
  const activeRouteName = state?.routes?.[state.index]?.name;
  let lastGroup = null;

  return (
    <View style={styles.sidebar} accessibilityRole="navigation">
      {navItems.map((item) => {
        const active = item.screen === activeRouteName;
        const showGroup = item.group && item.group !== lastGroup;
        lastGroup = item.group || lastGroup;
        return (
          <React.Fragment key={item.key}>
            {showGroup && <Text style={styles.groupLabel}>{item.group}</Text>}
            <Pressable
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => navigation.navigate(item.screen)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
            >
              {item.icon && <Feather name={item.icon} size={16} color={active ? colors.sidebarTextActive : colors.sidebarText} style={styles.navIcon} />}
              <Text style={[styles.navItemLabel, active && styles.navItemLabelActive]}>{item.label}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
      <View style={styles.sidebarSpacer} />
      <Pressable style={styles.navItem} onPress={onLogout} accessibilityRole="button" accessibilityLabel="Log out">
        <Feather name="log-out" size={16} color={colors.danger} style={styles.navIcon} />
        <Text style={[styles.navItemLabel, { color: colors.danger }]}>Log out</Text>
      </Pressable>
    </View>
  );
}

export default function StaffShell({ roleName, jurisdictionId, jurisdictionLevel }) {
  const { width } = useWindowDimensions();
  // Web can show a persistent sidebar on a wide-enough window; the Android app
  // never does, even on a large tablet - a permanent sidebar reads as a web-app
  // convention, not a native-mobile one, so Android always gets the drawer.
  const isWide = Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT;
  const { logout } = useAuth();

  // Administration's Workload and Alerts are District-tier only (Section 4.5)
  // - the backend already enforces this, but showing the sidebar entry to a
  // State/National account would just be a dead link. Scoped to Administration
  // specifically: Counsellor also has an 'alerts' key, but Counsellor's alerts
  // endpoint has no such tier restriction.
  const districtOnlyKeys = ['workload', 'alerts'];
  const navItems = getNavItemsForRole(roleName).filter(
    (item) => !(roleName === 'Administration' && districtOnlyKeys.includes(item.key) && jurisdictionLevel !== 'district')
  );

  const screens = SCREENS_BY_ROLE[roleName];
  if (!screens) return <Text>Unknown role: {roleName}</Text>;

  return (
    <StaffScopeProvider value={{ roleName, jurisdictionId, jurisdictionLevel }}>
      <Drawer.Navigator
        initialRouteName={screens[0].name}
        drawerContent={(props) => <SidebarContent {...props} navItems={navItems} onLogout={logout} />}
        screenOptions={{
          header: (props) => <GovernmentHeader {...props} isWide={isWide} roleName={roleName} jurisdictionLevel={jurisdictionLevel} />,
          drawerType: isWide ? 'permanent' : 'front',
          drawerStyle: { width: 240, backgroundColor: colors.sidebarBg },
          overlayColor: 'rgba(15, 23, 42, 0.3)',
        }}
      >
        {screens.map((screen) => (
          <Drawer.Screen key={screen.name} name={screen.name} component={screen.component} />
        ))}
      </Drawer.Navigator>
    </StaffScopeProvider>
  );
}

const styles = StyleSheet.create({
  sidebar: { flex: 1, backgroundColor: colors.sidebarBg, paddingVertical: spacing.md },
  groupLabel: {
    ...typography.label, color: colors.sidebarText, opacity: 0.7,
    paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  navItemActive: { backgroundColor: colors.primaryDark, borderLeftColor: colors.sidebarAccent },
  navIcon: { marginRight: spacing.sm },
  navItemLabel: { color: colors.sidebarText, fontSize: 14, fontWeight: '500' },
  navItemLabelActive: { color: colors.sidebarTextActive, fontWeight: '700' },
  sidebarSpacer: { flex: 1 },
});
