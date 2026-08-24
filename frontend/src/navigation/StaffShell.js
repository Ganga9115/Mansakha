import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useAuth } from '../context/AuthContext';
import { StaffScopeProvider } from '../context/StaffScopeContext';
import { getNavItemsForRole } from './roleNavConfig';

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
// documented way. The previous approach (a ref attached to a nested
// Stack.Navigator, with the sidebar rendered as an unrelated sibling View) never
// reliably reached the navigator - clicking any sidebar item silently did
// nothing. This is the actual fix, not a workaround.
function SidebarContent({ navigation, state, navItems, onLogout }) {
  // React Navigation hands drawerContent the navigator's own state - this is what
  // PragatiMitra's sidebar highlights (active item in white/blue vs muted gray for
  // the rest), which the previous plain sidebar never distinguished at all.
  const activeRouteName = state?.routes?.[state.index]?.name;

  return (
    <View style={styles.sidebar}>
      {navItems.map((item) => {
        const active = item.screen === activeRouteName;
        return (
          <Pressable
            key={item.key}
            style={[styles.navItem, active && styles.navItemActive]}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Text style={[styles.navItemLabel, active && styles.navItemLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
      <Pressable style={styles.navItem} onPress={onLogout}>
        <Text style={[styles.navItemLabel, { color: colors.danger }]}>Log out</Text>
      </Pressable>
    </View>
  );
}

// Custom header - also receives `navigation` as a prop directly from React
// Navigation, so the hamburger button can call navigation.toggleDrawer() the
// normal way too.
//
// The search input and bell that used to live here were both decorative -
// no search endpoint exists anywhere in the backend to wire the input to, so
// it's removed outright rather than left as fake UI. The bell is wired to
// this role's registered alerts screen (roleNavConfig's `alerts` nav item)
// when one exists - only Counsellor has one today (Administration/Ministry
// have no alerts screen registered in SCREENS_BY_ROLE below) - and simply
// isn't rendered otherwise, for the same reason.
function TopBar({ navigation, isWide, roleName, jurisdictionLevel }) {
  // Administration's alerts feed is district-tier only (same backend
  // restriction as Workload) - a State/National account gets no bell,
  // rather than one that 400s when tapped.
  const alertsItem = roleName === 'Administration' && jurisdictionLevel !== 'district'
    ? null
    : getNavItemsForRole(roleName).find((item) => item.key === 'alerts');

  return (
    <View style={styles.topBar}>
      {!isWide && (
        <Pressable onPress={() => navigation.toggleDrawer()} style={styles.hamburger}>
          <Text style={styles.hamburgerIcon}>≡</Text>
        </Pressable>
      )}
      <Text style={styles.logo}>Mansakha</Text>
      <View style={styles.spacer} />
      {alertsItem && (
        <Pressable
          style={styles.iconButton}
          onPress={() => navigation.navigate(alertsItem.screen)}
          hitSlop={8}
        >
          <Feather name="bell" size={20} color={colors.sidebarTextActive} />
        </Pressable>
      )}
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
          header: (props) => <TopBar {...props} isWide={isWide} roleName={roleName} jurisdictionLevel={jurisdictionLevel} />,
          drawerType: isWide ? 'permanent' : 'front',
          drawerStyle: { width: 220, backgroundColor: colors.sidebarBg },
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
  // Dark navy, matching PragatiMitra's Appshell - distinct from the rest of the
  // app's light blue-on-white screens.
  topBar: {
    flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: spacing.lg,
    backgroundColor: colors.sidebarBg, gap: spacing.md,
  },
  hamburger: { padding: spacing.xs },
  hamburgerIcon: { color: colors.sidebarTextActive, fontSize: 22 },
  logo: { color: colors.sidebarTextActive, fontSize: 18, fontWeight: '700', marginRight: spacing.lg },
  spacer: { flex: 1 },
  iconButton: { padding: spacing.sm },
  sidebar: { flex: 1, backgroundColor: colors.sidebarBg, paddingVertical: spacing.md },
  navItem: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.sm, marginHorizontal: spacing.sm },
  navItemActive: { backgroundColor: colors.sidebarAccent },
  navItemLabel: { color: colors.sidebarText, fontSize: 14, fontWeight: '500' },
  navItemLabelActive: { color: colors.sidebarTextActive, fontWeight: '700' },
});
