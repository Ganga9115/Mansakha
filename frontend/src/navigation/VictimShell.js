import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { getNavItemsForRole } from './roleNavConfig';
import HomeScreen from '../screens/victim/HomeScreen';
import CheckinScreen from '../screens/victim/CheckinScreen';
import CheckinConfirmationScreen from '../screens/victim/CheckinConfirmationScreen';
import DistressHistoryScreen from '../screens/victim/DistressHistoryScreen';
import SupportScreen from '../screens/victim/SupportScreen';
import SettingsScreen from '../screens/victim/SettingsScreen';

const Tab = createBottomTabNavigator();
const CheckinStack = createNativeStackNavigator();

// Check-in needs a nested stack so submitting can push a Confirmation screen
// without leaving the tab; every other tab is a single screen.
function CheckinTab() {
  return (
    <CheckinStack.Navigator screenOptions={{ headerShown: false }}>
      <CheckinStack.Screen name="CheckinMain" component={CheckinScreen} />
      <CheckinStack.Screen name="CheckinConfirmation" component={CheckinConfirmationScreen} />
    </CheckinStack.Navigator>
  );
}

const SCREENS = { home: HomeScreen, checkin: CheckinTab, history: DistressHistoryScreen, support: SupportScreen, settings: SettingsScreen };

// Bottom tabs stay the navigation pattern on BOTH platforms - deliberately NOT a
// sidebar listing feature names, since a victim's device (phone or a shared/public
// browser) may not be private. That reasoning doesn't change between web and
// Android, so it isn't platform-branched here.
//
// What DOES differ: on web, a full-bleed phone-width layout stretched across a
// desktop browser reads as unfinished, not as a deliberate web presentation. So web
// gets a centered, framed card on a neutral backdrop; Android renders full-bleed,
// edge-to-edge, as a native app should.
function TabNavigator() {
  const navItems = getNavItemsForRole('Victim');
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        tabBarActiveTintColor: colors.primary,
      }}
    >
      {navItems.map((item) => (
        <Tab.Screen key={item.key} name={item.key} component={SCREENS[item.key]} options={{ title: item.label }} />
      ))}
    </Tab.Navigator>
  );
}

export default function VictimShell() {
  if (Platform.OS !== 'web') {
    return <TabNavigator />;
  }
  return (
    <View style={styles.webBackdrop}>
      <View style={styles.webFrame}>
        <TabNavigator />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webBackdrop: { flex: 1, alignItems: 'center', backgroundColor: colors.surface },
  webFrame: {
    flex: 1, width: '100%', maxWidth: 480, backgroundColor: colors.background,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
  },
});
