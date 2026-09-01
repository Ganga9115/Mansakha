import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { colors } from '../shared/theme/colors';
import { typography } from '../shared/theme/typography';
import { tabletShellWidth, sidebarWidth } from '../shared/theme/layout';
import { useResponsive } from '../shared/hooks/useResponsive';
import { getNavItemsForRole } from './roleNavConfig';
import SidebarNav from '../shared/components/SidebarNav';
import AiChatButton from '../shared/components/AiChatButton';

import HomeScreen from '../wellness/screens/HomeScreen';
import CheckinScreen from '../wellness/screens/CheckinScreen';
import CheckinConfirmationScreen from '../wellness/screens/CheckinConfirmationScreen';
import DistressHistoryScreen from '../wellness/screens/DistressHistoryScreen';
import SupportScreen from '../support/screens/SupportScreen';
import SettingsScreen from '../support/screens/SettingsScreen';
import ChatScreen from '../chat/screens/ChatScreen';
import WellnessScreen from '../wellness/screens/WellnessScreen';
import JournalScreen from '../wellness/screens/JournalScreen';
import CounsellorChatScreen from '../chat/screens/CounsellorChatScreen';

import { useUserDashboard, useAssignedCounsellor } from '../shared/services/hooks';

const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();
const CheckinStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// Nested stack for Check-in flow (Check-in -> Confirmation)
function CheckinTab() {
  return (
    <CheckinStack.Navigator screenOptions={{ headerShown: false }}>
      <CheckinStack.Screen name="CheckinMain" component={CheckinScreen} />
      <CheckinStack.Screen name="CheckinConfirmation" component={CheckinConfirmationScreen} />
    </CheckinStack.Navigator>
  );
}

const SCREENS = {
  home: HomeScreen,
  checkin: CheckinTab,
  history: DistressHistoryScreen,
  settings: SettingsScreen,
  mycounsellor: CounsellorChatScreen,
};

// Map screen keys to Feather icons - shared between the bottom tab bar
// (mobile/tablet) and the sidebar (desktop) so the same icon appears
// either way. Support has no entry here - it's no longer a tab/sidebar
// item (see the "support" RootStack.Screen in ShellStack below), and
// SidebarNav already skips any route missing from this map.
const TAB_ICONS = {
  home: 'home',
  checkin: 'mic',
  history: 'bar-chart-2',
  settings: 'user',
  mycounsellor: 'message-square',
};

function TabNavigator() {
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.borderStrong,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: typography.caption.fontSize,
          fontFamily: typography.bodyStrong.fontFamily,
          marginTop: 2,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName = TAB_ICONS[route.name] || 'circle';
          return <Feather name={iconName} size={size || 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="home" component={SCREENS.home} options={{ title: 'Home' }} />
      <Tab.Screen name="checkin" component={SCREENS.checkin} options={{ title: 'Check-in' }} />
      <Tab.Screen name="history" component={SCREENS.history} options={{ title: 'History' }} />
      <Tab.Screen
        name="mycounsellor"
        component={SCREENS.mycounsellor}
        options={{
          title: 'My Counsellor',
          tabBarButton: showMyCounsellor ? undefined : () => null,
        }}
      />
      <Tab.Screen name="settings" component={SCREENS.settings} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

// Desktop tier: a permanent (non-overlay, non-swipeable) drawer used
// purely as a left sidebar rail. Same routes/screens as TabNavigator -
// only the navigation chrome differs.
function DesktopNavigator() {
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  return (
    <Drawer.Navigator
      useLegacyImplementation={false}
      screenOptions={{
        headerShown: false,
        drawerType: 'permanent',
        drawerStyle: {
          width: sidebarWidth,
          backgroundColor: colors.sidebarBg,
          borderRightWidth: 0,
        },
        sceneContainerStyle: { backgroundColor: colors.background },
      }}
      drawerContent={(props) => <SidebarNav {...props} icons={TAB_ICONS} showMyCounsellor={showMyCounsellor} />}
    >
      <Drawer.Screen name="home" component={SCREENS.home} options={{ title: 'Home' }} />
      <Drawer.Screen name="checkin" component={SCREENS.checkin} options={{ title: 'Check-in' }} />
      <Drawer.Screen name="history" component={SCREENS.history} options={{ title: 'History' }} />
      <Drawer.Screen name="mycounsellor" component={SCREENS.mycounsellor} options={{ title: 'My Counsellor' }} />
      <Drawer.Screen name="settings" component={SCREENS.settings} options={{ title: 'Profile' }} />
      <Drawer.Screen name="Chatbot" component={ChatScreen} />
      <Drawer.Screen name="Wellbeing" component={WellnessScreen} />
      <Drawer.Screen name="Journal" component={JournalScreen} />
      <Drawer.Screen name="CounsellorChat" component={CounsellorChatScreen} />
    </Drawer.Navigator>
  );
}

function TabNavigatorWithFAB() {
  return (
    <View style={{ flex: 1 }}>
      <TabNavigator />
      <AiChatButton />
    </View>
  );
}

function DesktopNavigatorWithFAB() {
  return (
    <View style={{ flex: 1 }}>
      <DesktopNavigator />
      <AiChatButton />
    </View>
  );
}

// Screens pushed on top of the tab/drawer navigator (not part of the daily
// tab bar) - reached via Home's quick-action tiles or Settings' conditional
// counsellor-chat entry point. Nesting these above MainTabs, rather than
// adding more tabs, keeps the 5-item tab bar/sidebar from getting crowded;
// `navigation.navigate('Chatbot')` called from any screen inside MainTabs
// bubbles up to this stack automatically.
//
// "support" is registered here unconditionally (regardless of includeExtras/
// tier) rather than as a Tab.Screen/Drawer.Screen - it's no longer a
// persistent nav item in the tab bar or the desktop sidebar, but Home's
// "Support Helpline" quick-action tile and the header bell still both call
// navigation.navigate('support'), so the route itself has to keep existing
// somewhere reachable on every tier.
function ShellStack({ tabs, includeExtras = true }) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={tabs} />
      <RootStack.Screen name="support" component={SupportScreen} />
      {includeExtras && (
        <>
          <RootStack.Screen name="Chatbot" component={ChatScreen} />
          <RootStack.Screen name="Wellbeing" component={WellnessScreen} />
          <RootStack.Screen name="Journal" component={JournalScreen} />
          <RootStack.Screen name="CounsellorChat" component={CounsellorChatScreen} />
        </>
      )}
    </RootStack.Navigator>
  );
}

export default function UserShell() {
  const { tier } = useResponsive();

  if (tier === 'desktop') {
    return (
      <View style={{ flex: 1 }}>
        <ShellStack tabs={DesktopNavigatorWithFAB} includeExtras={false} />
      </View>
    );
  }

  if (tier === 'tablet') {
    return (
      <View style={styles.webBackdrop}>
        <View style={[styles.webFrame, { maxWidth: tabletShellWidth }]}>
          <ShellStack tabs={TabNavigatorWithFAB} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ShellStack tabs={TabNavigatorWithFAB} />
    </View>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  webFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
});
