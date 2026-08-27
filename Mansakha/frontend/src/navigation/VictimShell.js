import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { tabletShellWidth, sidebarWidth } from '../theme/layout';
import { useResponsive } from '../hooks/useResponsive';
import { getNavItemsForRole } from './roleNavConfig';
import SidebarNav from '../components/SidebarNav';
import AiChatButton from '../components/AiChatButton';

import HomeScreen from '../screens/victim/HomeScreen';
import CheckinScreen from '../screens/victim/CheckinScreen';
import CheckinConfirmationScreen from '../screens/victim/CheckinConfirmationScreen';
import DistressHistoryScreen from '../screens/victim/DistressHistoryScreen';
import SupportScreen from '../screens/victim/SupportScreen';
import SettingsScreen from '../screens/victim/SettingsScreen';
import ChatScreen from '../screens/victim/ChatScreen';
import WellnessScreen from '../screens/victim/WellnessScreen';
import JournalScreen from '../screens/victim/JournalScreen';
import CounsellorChatScreen from '../screens/victim/CounsellorChatScreen';

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
  support: SupportScreen,
  settings: SettingsScreen,
};

// Map screen keys to Feather icons - shared between the bottom tab bar
// (mobile/tablet) and the sidebar (desktop) so the same icon appears
// either way.
const TAB_ICONS = {
  home: 'home',
  checkin: 'mic',
  history: 'bar-chart-2',
  support: 'file-text',
  settings: 'user',
};

function TabNavigator() {
  const navItems = getNavItemsForRole('Victim');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false, // Let custom screens handle their top titles
        tabBarActiveTintColor: colors.primary,      // #519BCE Soft Blue
        tabBarInactiveTintColor: colors.borderStrong, // #9D9D9D Soft Gray
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
          fontFamily: typography.caption.fontFamily,
          marginTop: 2,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName = TAB_ICONS[route.name] || 'circle';
          return <Feather name={iconName} size={size || 22} color={color} />;
        },
      })}
    >
      {navItems.map((item) => (
        <Tab.Screen
          key={item.key}
          name={item.key}
          component={SCREENS[item.key]}
          options={{ title: item.label }}
        />
      ))}
    </Tab.Navigator>
  );
}

// Desktop tier: a permanent (non-overlay, non-swipeable) drawer used
// purely as a left sidebar rail. Same routes/screens as TabNavigator -
// only the navigation chrome differs.
function DesktopNavigator() {
  const navItems = getNavItemsForRole('Victim');

  return (
    <Drawer.Navigator
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
      drawerContent={(props) => <SidebarNav {...props} icons={TAB_ICONS} />}
    >
      {navItems.map((item) => (
        <Drawer.Screen
          key={item.key}
          name={item.key}
          component={SCREENS[item.key]}
          options={{ title: item.label }}
        />
      ))}
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
function ShellStack({ tabs, includeExtras = true }) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={tabs} />
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

export default function VictimShell() {
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
