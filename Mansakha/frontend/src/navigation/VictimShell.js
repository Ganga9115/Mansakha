import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getNavItemsForRole } from './roleNavConfig';

import HomeScreen from '../screens/victim/HomeScreen';
import CheckinScreen from '../screens/victim/CheckinScreen';
import CheckinConfirmationScreen from '../screens/victim/CheckinConfirmationScreen';
import DistressHistoryScreen from '../screens/victim/DistressHistoryScreen';
import SupportScreen from '../screens/victim/SupportScreen';
import SettingsScreen from '../screens/victim/SettingsScreen';

const Tab = createBottomTabNavigator();
const CheckinStack = createNativeStackNavigator();

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

// Map screen keys to Feather icons
const TAB_ICONS = {
  home: 'home',
  checkin: 'mic',
  history: 'arrow-up-down',
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
  webBackdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  webFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
});