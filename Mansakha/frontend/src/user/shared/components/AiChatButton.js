import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_NAV_BAR_HEIGHT } from './BottomNavBar';
import { useResponsive } from '../hooks/useResponsive';

// The floating button sits this far above the bottom nav bar (if present)
export const FAB_GAP_ABOVE_NAV_BAR = 16;
export const FAB_SIZE = 56;

export default function AiChatButton() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  
  // Mirrors BottomNavBar's own `bottom: Math.max(insets.bottom, 12)` so this
  // stays clear of it on every device - phones with a large safe-area inset
  // (e.g. the home-indicator gesture area) push the nav bar further up than
  // a flat, un-adjusted offset accounted for, which is what let the two
  // collide before.
  const mobileBottom = Math.max(insets.bottom, 12) + BOTTOM_NAV_BAR_HEIGHT + FAB_GAP_ABOVE_NAV_BAR;

  // useNavigationState is a live subscription to the nav tree - it re-renders
  // this component the instant ANY navigator's state changes, anywhere in
  // the app, on every platform including web. That already made the
  // now-removed web-only workaround (a custom window event fired from only
  // ONE of the two navigators - DesktopNavigator, never TabNavigator, the
  // one phone/tablet/mobile-web actually uses - plus a sessionStorage read
  // that only ran once on mount) both unnecessary and the actual source of
  // the bug: on mobile-web, no event ever fired, so the FAB's hidden state
  // only ever updated on a full page reload, one navigation behind.
  const currentRouteName = useNavigationState((state) => {
    if (!state) return null;
    let r = state.routes[state.index];
    while (r && r.state && r.state.routes && r.state.index !== undefined) {
      r = r.state.routes[r.state.index];
    }
    return r ? r.name : null;
  });

  const isHidden = currentRouteName === 'Chatbot' || currentRouteName === 'mycounsellor' || currentRouteName === 'CounsellorChat';

  if (isHidden) {
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
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
    // Above BottomNavBar's navCard (elevation: 6) so the FAB always draws on
    // top of it on Android, in addition to sitting clear of it vertically.
    elevation: 99,
    zIndex: 9999,
  },
});
