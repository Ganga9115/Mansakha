import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { colors } from '../shared/theme/colors';
import { typography } from '../shared/theme/typography';
import { tabletShellWidth, sidebarWidth } from '../shared/theme/layout';
import { useResponsive } from '../shared/hooks/useResponsive';
import SidebarNav from '../shared/components/SidebarNav';
import AiChatButton from '../shared/components/AiChatButton';
import MobileSidebarOverlay from '../shared/components/MobileSidebarOverlay';
import { MobileSidebarProvider } from '../shared/context/MobileSidebarContext';
import { TAB_ICONS } from './tabConfig';

import HomeScreen from '../wellness/screens/HomeScreen';
import CheckinScreen from '../wellness/screens/CheckinScreen';
import CheckinConfirmationScreen from '../wellness/screens/CheckinConfirmationScreen';
import DistressHistoryScreen from '../wellness/screens/DistressHistoryScreen';
import SupportScreen from '../support/screens/SupportScreen';
import AtrocitiesActScreen from '../support/screens/AtrocitiesActScreen';
import SettingsScreen from '../support/screens/SettingsScreen';
import ChatScreen from '../chat/screens/ChatScreen';
import CaseDetailsScreen from '../wellness/screens/CaseDetailsScreen';
import RequestInterventionScreen from '../wellness/screens/RequestInterventionScreen';
import RehabilitationProgressScreen from '../wellness/screens/RehabilitationProgressScreen';
import RehabilitationOptInScreen from '../wellness/screens/RehabilitationOptInScreen';
import LegalAidHubScreen from '../wellness/screens/LegalAidHubScreen';
import LegalAidRequestScreen from '../wellness/screens/LegalAidRequestScreen';
import LegalAidRepresentativeScreen from '../wellness/screens/LegalAidRepresentativeScreen';
import ThreatReportScreen from '../wellness/screens/ThreatReportScreen';
import FinancialAidScreen from '../wellness/screens/FinancialAidScreen';
import CompensationScreen from '../wellness/screens/CompensationScreen';
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

// The `savedRoute` fallback each navigator below uses for `initialRouteName`
// reads RootNavigator.js's `mansakha_active_page` - written from the ROOT
// NavigationContainer's onStateChange as whatever the deepest leaf route
// happens to be at that instant, from ANY navigator in the tree, not just
// this one. Two different ways that bites a Tab/Drawer.Navigator here:
//  1. One level too deep: 'checkin' nests its own CheckinStack
//     ('CheckinMain'/'CheckinConfirmation') - a saved leaf from inside it
//     isn't a screen name this navigator itself owns.
//  2. One level too shallow, from a totally different navigator: right
//     after login, the ROOT Stack.Navigator's own transition to 'UserShell'
//     fires onStateChange before MainTabs has mounted any nested state of
//     its own, so the "leaf" captured at that instant is 'UserShell' - not
//     a screen this navigator owns either (confirmed live: this crashed
//     every fresh login with "Couldn't find a screen named 'UserShell'...").
// Both crash identically ("Couldn't find a screen named '...' to use as
// 'initialRouteName'") because React Navigation takes this prop on faith.
// Rather than enumerate every foreign/nested name that could show up here,
// validate against the screen names this navigator actually registers
// below and only use the saved value if it's genuinely one of them.
const NESTED_LEAF_TO_TAB = {
  CheckinMain: 'checkin',
  CheckinConfirmation: 'checkin',
};

function resolveTopLevelRoute(savedRoute, validNames) {
  if (!savedRoute) return null;
  const mapped = NESTED_LEAF_TO_TAB[savedRoute] || savedRoute;
  return validNames.has(mapped) ? mapped : null;
}

// Mirrors exactly the <Tab.Screen>/<Drawer.Screen> names registered below -
// keep in sync if either list changes.
const MOBILE_TAB_SCREEN_NAMES = new Set(['home', 'checkin', 'wellbeing', 'history', 'mycounsellor', 'settings', 'Journal', 'MyEntry']);
const DESKTOP_DRAWER_SCREEN_NAMES = new Set([
  'home', 'checkin', 'wellbeing', 'history', 'mycounsellor', 'settings',
  'Chatbot', 'Journal', 'MyEntry', 'CounsellorChat', 'support', 'AtrocitiesAct',
  'CaseDetails', 'RequestIntervention', 'RehabilitationProgress', 'RehabilitationOptIn',
  'LegalAidHub', 'LegalAidRequest', 'LegalAidRepresentative', 'ThreatReport',
  'FinancialAid', 'Compensation',
]);

const SCREENS = {
  home: HomeScreen,
  checkin: CheckinTab,
  wellbeing: WellnessScreen,
  history: DistressHistoryScreen,
  settings: SettingsScreen,
  mycounsellor: CounsellorChatScreen,
};

// Short labels for the bottom tab bar specifically (distinct from each
// screen's own `options.title`, which SidebarNav/the hamburger menu still
// read as-is) - with up to 6 tabs visible at once, the full titles ("My
// well-being", "My Counsellor") don't leave every item enough width for a
// consistent look; short enough that all six fit comfortably at one fixed
// font size, without needing to shrink any single one down further than
// the rest.
const TAB_BAR_LABELS = {
  home: 'Home',
  checkin: 'Check-in',
  wellbeing: 'Wellness',
  history: 'History',
  mycounsellor: 'Chat',
  settings: 'Profile',
};

function TabNavigator() {
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  // Fallback only for a fresh navigation state with no restored tab index of
  // its own - RootNavigator.js's own onStateChange already writes
  // mansakha_active_page for the whole tree (every navigator, tabs
  // included) and is what NavigationContainer's initialState actually
  // restores from on reload; a second write from here raced with it and
  // was never read back by anything (AiChatButton now reads live
  // navigation state directly instead - see its own comment).
  const savedRoute = (typeof window !== 'undefined' && window.sessionStorage)
    ? window.sessionStorage.getItem('mansakha_active_page')
    : null;

  return (
    <Tab.Navigator
      initialRouteName={resolveTopLevelRoute(savedRoute, MOBILE_TAB_SCREEN_NAMES) || 'home'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.borderStrong,
        // Every mobile/tablet screen renders its own floating BottomNavBar
        // (see shared/components/BottomNavBar.js) instead of relying on this
        // native tab bar - having both rendered at once was showing two
        // stacked bottom nav bars on screen. Hiding it here rather than
        // deleting the options below keeps the rest of this file's intent
        // (icons/labels per route) documented in one place, even though none
        // of it renders while the bar stays hidden.
        tabBarStyle: { display: 'none' },
        // Explicit `flex: 1` (on top of react-navigation's own default,
        // which already does this) so every one of the up to 6 items gets
        // exactly the same, equal share of the bar's width - centered
        // content and no horizontal padding of its own, so nothing nudges
        // one icon closer to its neighbour or the bar's edge than another.
        tabBarItemStyle: {
          flex: 1,
          paddingHorizontal: 0,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName = TAB_ICONS[route.name] || 'circle';
          return <Feather name={iconName} size={size || 22} color={color} />;
        },
        // A custom label (rather than tabBarLabelStyle + options.title) so
        // every item's text renders at the same fixed size by default -
        // `adjustsFontSizeToFit` only kicks in as a last-resort safety net
        // on an unusually narrow phone, rather than being how normal-width
        // phones fit these labels (which would make items look visibly
        // inconsistent with each other).
        tabBarLabel: ({ color }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.9}
            style={{
              color,
              fontSize: typography.caption.fontSize,
              fontFamily: typography.bodyStrong.fontFamily,
              marginTop: 2,
              textAlign: 'center',
            }}
          >
            {TAB_BAR_LABELS[route.name] || route.name}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="home" component={SCREENS.home} options={{ title: 'Home' }} />
      <Tab.Screen name="checkin" component={SCREENS.checkin} options={{ title: 'Check-in' }} />
      <Tab.Screen name="wellbeing" component={SCREENS.wellbeing} options={{ title: 'My well-being' }} />
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
      {/* Journal and MyEntry aren't primary tabs (no icon in the tab bar),
          but registering them here rather than as a RootStack-level push
          (as Chatbot/CounsellorChat still are below) means navigating to
          them keeps this same floating tab bar visible underneath, instead
          of hiding it like a full-screen stack push would. */}
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="MyEntry" component={MyEntryScreen} options={{ tabBarButton: () => null }} />
    </Tab.Navigator>
  );
}

function DesktopNavigator() {
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  // Fallback only for a fresh navigation state with no restored tab index of
  // its own - see TabNavigator's own comment on why this no longer also
  // writes/dispatches on every navigation.
  const savedRoute = (typeof window !== 'undefined' && window.sessionStorage)
    ? window.sessionStorage.getItem('mansakha_active_page')
    : null;

  return (
    <Drawer.Navigator
      initialRouteName={resolveTopLevelRoute(savedRoute, DESKTOP_DRAWER_SCREEN_NAMES) || 'home'}
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
      <Drawer.Screen name="wellbeing" component={SCREENS.wellbeing} options={{ title: 'My well-being' }} />
      <Drawer.Screen name="history" component={SCREENS.history} options={{ title: 'History' }} />
      <Drawer.Screen name="mycounsellor" component={SCREENS.mycounsellor} options={{ title: 'My Counsellor' }} />
      <Drawer.Screen name="settings" component={SCREENS.settings} options={{ title: 'Profile' }} />
      <Drawer.Screen name="Chatbot" component={ChatScreen} />
      <Drawer.Screen name="Journal" component={JournalScreen} />
      <Drawer.Screen name="MyEntry" component={MyEntryScreen} />
      <Drawer.Screen name="CounsellorChat" component={CounsellorChatScreen} />
      <Drawer.Screen name="support" component={SupportScreen} />
      <Drawer.Screen name="AtrocitiesAct" component={AtrocitiesActScreen} />
      <Drawer.Screen name="CaseDetails" component={CaseDetailsScreen} />
      <Drawer.Screen name="RequestIntervention" component={RequestInterventionScreen} />
      <Drawer.Screen name="RehabilitationProgress" component={RehabilitationProgressScreen} />
      <Drawer.Screen name="RehabilitationOptIn" component={RehabilitationOptInScreen} />
      <Drawer.Screen name="LegalAidHub" component={LegalAidHubScreen} />
      <Drawer.Screen name="LegalAidRequest" component={LegalAidRequestScreen} />
      <Drawer.Screen name="LegalAidRepresentative" component={LegalAidRepresentativeScreen} />
      <Drawer.Screen name="ThreatReport" component={ThreatReportScreen} />
      <Drawer.Screen name="FinancialAid" component={FinancialAidScreen} />
      <Drawer.Screen name="Compensation" component={CompensationScreen} />
    </Drawer.Navigator>
  );
}

function TabNavigatorWithFAB() {
  return (
    <MobileSidebarProvider>
      <View style={{ flex: 1 }}>
        <TabNavigator />
        <AiChatButton />
        <MobileSidebarOverlay />
      </View>
    </MobileSidebarProvider>
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
      <RootStack.Screen name="CaseDetails" component={CaseDetailsScreen} />
      <RootStack.Screen name="RequestIntervention" component={RequestInterventionScreen} />
      <RootStack.Screen name="RehabilitationProgress" component={RehabilitationProgressScreen} />
      <RootStack.Screen name="RehabilitationOptIn" component={RehabilitationOptInScreen} />
      <RootStack.Screen name="LegalAidHub" component={LegalAidHubScreen} />
      <RootStack.Screen name="LegalAidRequest" component={LegalAidRequestScreen} />
      <RootStack.Screen name="LegalAidRepresentative" component={LegalAidRepresentativeScreen} />
      <RootStack.Screen name="ThreatReport" component={ThreatReportScreen} />
      <RootStack.Screen name="FinancialAid" component={FinancialAidScreen} />
      <RootStack.Screen name="Compensation" component={CompensationScreen} />
      {includeExtras && (
        <>
          <RootStack.Screen name="Chatbot" component={ChatScreen} />
          <RootStack.Screen name="Wellbeing" component={WellnessScreen} />
          {/* Journal and MyEntry are registered inside TabNavigator itself
              (as hidden, icon-less tabs) instead of here, so navigating to
              them keeps the floating bottom tab bar visible - see
              TabNavigator's own comment above. */}
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