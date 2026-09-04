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
import AtrocitiesActScreen from '../support/screens/AtrocitiesActScreen';
import SettingsScreen from '../support/screens/SettingsScreen';
import ChatScreen from '../chat/screens/ChatScreen';
import WellnessScreen from '../wellness/screens/WellnessScreen';
import JournalScreen from '../wellness/screens/JournalScreen';
import MyEntryScreen from '../wellness/screens/MyEntry';
import CounsellorChatScreen from '../chat/screens/CounsellorChatScreen';

import { useUserDashboard, useAssignedCounsellor } from '../shared/services/hooks';

const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();
const CheckinStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

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
      <Drawer.Screen name="MyEntry" component={MyEntryScreen} />
      <Drawer.Screen name="CounsellorChat" component={CounsellorChatScreen} />
      <Drawer.Screen name="support" component={SupportScreen} />
      <Drawer.Screen name="AtrocitiesAct" component={AtrocitiesActScreen} />
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

function ShellStack({ tabs, includeExtras = true }) {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={tabs} />
      <RootStack.Screen name="support" component={SupportScreen} />
      <RootStack.Screen name="AtrocitiesAct" component={AtrocitiesActScreen} />
      {includeExtras && (
        <>
          <RootStack.Screen name="Chatbot" component={ChatScreen} />
          <RootStack.Screen name="Wellbeing" component={WellnessScreen} />
          <RootStack.Screen name="Journal" component={JournalScreen} />
          <RootStack.Screen name="MyEntry" component={MyEntryScreen} />
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