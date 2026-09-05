import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { useMobileSidebar } from '../context/MobileSidebarContext';

// Hamburger trigger for the mobile/tablet slide-in menu (MobileSidebarOverlay)
// - rendered in the header of each tab-root screen, mirroring the desktop
// sidebar's own item list rather than introducing a second, separate nav.
export default function MenuButton({ style }) {
  const { open } = useMobileSidebar();

  return (
    <Pressable
      onPress={open}
      style={[styles.btn, style]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
    >
      <Feather name="menu" size={20} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
});
