import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useResponsive } from '../hooks/useResponsive';

export default function AiChatButton() {
  const navigation = useNavigation();
  const { isDesktop } = useResponsive();

  const currentRouteName = useNavigationState(state => {
    if (!state) return null;
    const currentRoute = state.routes[state.index];
    // If it's a nested navigator (like the Drawer or Tab), get its active route
    if (currentRoute.state && currentRoute.state.routes) {
      return currentRoute.state.routes[currentRoute.state.index].name;
    }
    return currentRoute.name;
  });

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
      style={[styles.fab, { bottom: isDesktop ? 24 : 84 }]}
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
    zIndex: 20,
  },
});
