import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useResponsive } from '../hooks/useResponsive';
import { BOTTOM_NAV_BAR_HEIGHT } from './BottomNavBar';

// Extra breathing room above the bottom nav bar so the FAB never touches
// (let alone overlaps) it - roughly the 20-30px buffer requested on top of
// the nav bar's own height and safe-area inset.
const FAB_GAP_ABOVE_NAV_BAR = 28;

export default function AiChatButton() {
  const navigation = useNavigation();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();

  // Mirrors BottomNavBar's own `bottom: Math.max(insets.bottom, 12)` so this
  // stays clear of it on every device - phones with a large safe-area inset
  // (e.g. the home-indicator gesture area) push the nav bar further up than
  // a flat, un-adjusted offset accounted for, which is what let the two
  // collide before.
  const mobileBottom = Math.max(insets.bottom, 12) + BOTTOM_NAV_BAR_HEIGHT + FAB_GAP_ABOVE_NAV_BAR;

  const currentRouteName = useNavigationState(state => {
    if (!state) return null;
    let r = state.routes[state.index];
    while (r && r.state && r.state.routes && r.state.index !== undefined) {
      r = r.state.routes[r.state.index];
    }
    return r ? r.name : null;
  });

  // Only remove from the AI Chatbot screen, visible everywhere else
  if (currentRouteName === 'Chatbot') {
    return null;
  }

  // Desktop's "Chatbot" screen only exists inside the sidebar's own Drawer
  // navigator (UserShell.js's DesktopNavigator), not as a sibling on the
  // root stack - plain navigate('Chatbot') from here (a sibling of the
  // Drawer, not a descendant of it) resolves to the root stack instead and
  // silently no-ops with a dev warning ("not handled by any navigator").
  // Phone/tablet's root stack DOES register 'Chatbot' directly (ShellStack's
  // includeExtras), so they can navigate to it plainly.
  const openChat = () => {
    if (isDesktop) {
      navigation.navigate('MainTabs', { screen: 'Chatbot' });
    } else {
      navigation.navigate('Chatbot');
    }
  };

  return (
    <Pressable
      style={[styles.fab, { bottom: isDesktop ? 24 : mobileBottom }]}
      onPress={openChat}
      accessibilityRole="button"
      accessibilityLabel="Open AI Chatbot"
    >
      <Feather name="message-circle" size={24} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
    // Above BottomNavBar's navCard (elevation: 6) so the FAB always draws on
    // top of it on Android, in addition to sitting clear of it vertically.
    elevation: 10,
    zIndex: 20,
  },
});
