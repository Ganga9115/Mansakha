import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
// Import your service hooks
import { useUserDashboard, useAssignedCounsellor } from '../services/hooks';

// Approx rendered height of the floating navCard below (paddingVertical:10
// top+bottom + icon 22). Exported so other floating elements - the AI chat
// FAB (see AiChatButton.js) - can reserve enough clearance above this bar's
// `bottom` inset instead of guessing a magic number that drifts out of sync
// whenever this bar's own sizing changes.
export const BOTTOM_NAV_BAR_HEIGHT = 60;

// A single tab: icon-only when inactive, expands into an icon+label pill
// when active - same "morphing pill" pattern as Restora's own bottom bar
// (frontend/lib/widgets/custom_bottom_navigation_bar.dart), reimplemented
// on Mansakha's existing white floating bar instead of Restora's dark-navy
// one (kept white per explicit request). Animated per-item (not
// LayoutAnimation) since react-native-web has unreliable LayoutAnimation
// support - this runs identically on native and web.
function NavBarItem({ item, isActive, onPress }) {
  const anim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isActive ? 1 : 0,
      duration: 220,
      useNativeDriver: false, // animating layout (maxWidth/padding), not transform/opacity alone
    }).start();
  }, [isActive]);

  const paddingHorizontal = anim.interpolate({ inputRange: [0, 1], outputRange: [10, 16] });
  const labelMaxWidth = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });
  const labelOpacity = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });

  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Animated.View
        style={[
          styles.pill,
          {
            paddingHorizontal,
            backgroundColor: isActive ? colors.primary + '1F' : 'transparent',
            borderWidth: isActive ? 1 : 0,
            borderColor: colors.primary + '40',
          },
        ]}
      >
        <Feather
          name={item.icon}
          size={20}
          color={isActive ? colors.primary : colors.textSecondary}
        />
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.navLabel,
            { maxWidth: labelMaxWidth, opacity: labelOpacity, marginLeft: isActive ? 8 : 0 },
          ]}
        >
          {item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

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
        {NAV_ITEMS.map((item) => (
          <NavBarItem
            key={item.key}
            item={item}
            isActive={currentTab === item.key}
            onPress={() => handleNavigation(item.route)}
          />
        ))}
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
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingVertical: 8,
  },
  navLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    overflow: 'hidden',
  },
});
