import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
// Import your service hooks
import { useUserDashboard, useAssignedCounsellor } from '../services/hooks';

// Approx rendered height of the floating navCard below (paddingVertical:10
// top+bottom + icon 22 + label's marginTop 4 + its ~15 lineHeight + the
// navItem's paddingBottom 4). Exported so other floating elements - the
// AI chat FAB (see AiChatButton.js) - can reserve enough clearance above
// this bar's `bottom` inset instead of guessing a magic number that drifts
// out of sync whenever this bar's own sizing changes.
export const BOTTOM_NAV_BAR_HEIGHT = 65;

export default function BottomNavBar({ currentTab = 'Home', navigation }) {
  const insets = useSafeAreaInsets();

  // Check counsellor opt-in status
  const dashboard = useUserDashboard();
  const counsellor = useAssignedCounsellor();
  const showMyCounsellor = !!(dashboard.data?.optedForManualCounsellor && counsellor.data?.assigned);

  // Define base navigation items
  const NAV_ITEMS = [
    { key: 'Home', label: 'Home', icon: 'home', route: 'home' },
    { key: 'CheckIn', label: 'Check-in', icon: 'mic', route: 'checkin' },
    { key: 'Wellness', label: 'Wellness', icon: 'heart', route: 'wellbeing' },
    { key: 'History', label: 'History', icon: 'bar-chart-2', route: 'history' },
    // Only include Chat if showMyCounsellor is true
    ...(showMyCounsellor
      ? [{ key: 'Chat', label: 'Chat', icon: 'message-square', route: 'mycounsellor' }]
      : []),
    { key: 'Profile', label: 'Profile', icon: 'user', route: 'settings' },
  ];

  const handleNavigation = (targetRoute) => {
    if (!navigation) return;
    navigation.navigate('MainTabs', { screen: targetRoute });
  };

  return (
    <View
      style={[
        styles.floatingWrapper,
        { bottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <View style={styles.navCard}>
        {NAV_ITEMS.map((item) => {
          const isActive = currentTab === item.key;
          return (
            <Pressable
              key={item.key}
              style={styles.navItem}
              onPress={() => handleNavigation(item.route)}
            >
              <Feather
                name={item.icon}
                size={22}
                color={isActive ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.navLabel,
                  isActive ? styles.activeNavLabel : styles.inactiveNavLabel,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>

              {isActive && <View style={styles.activeIndicator} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingBottom: 4,
  },
  navLabel: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  activeNavLabel: {
    color: colors.primary || '#3B82F6',
    fontWeight: '700',
  },
  inactiveNavLabel: {
    color: colors.textSecondary || '#8E8E93',
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -2,
    width: 16,
    height: 3,
    backgroundColor: colors.primary || '#3B82F6',
    borderRadius: 2,
  },
});