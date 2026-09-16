import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { typography } from '../theme/typography';

const VARIANT = {
  success: { icon: 'check-circle', bg: colors.successLight, fg: colors.success },
  error: { icon: 'alert-circle', bg: colors.dangerLight, fg: colors.danger },
  info: { icon: 'info', bg: colors.infoLight, fg: colors.primaryDark },
};

const ENTER_MS = 220;
const EXIT_MS = 160;

// `exiting` (set by ToastContext just before the real removal) drives the
// fade/slide-out below, then hands back to `onExited` to actually drop the
// toast from state - manual dismiss (the X button) requests the same exit
// instead of vanishing instantly, so both paths animate identically.
function ToastRow({ toast, onRequestDismiss, onExited }) {
  const { icon, bg, fg } = VARIANT[toast.type] || VARIANT.info;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!toast.exiting) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onExited(toast.id));
  }, [toast.exiting]);

  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={[styles.iconTile, { backgroundColor: bg }]}>
        <Feather name={icon} size={16} color={fg} />
      </View>
      <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
      <Pressable
        onPress={() => onRequestDismiss(toast.id)}
        hitSlop={8}
        style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
      >
        <Feather name="x" size={14} color={colors.textSecondary} />
      </Pressable>
      <View style={[styles.accentBar, { backgroundColor: fg }]} />
    </Animated.View>
  );
}

// Floating stack of rounded cards under the safe-area top inset, instead of
// a full-bleed banner glued to the very top edge - center-anchored with a
// max width so it reads as a deliberate notification, not a stretched strip,
// on tablet/desktop widths too.
export default function Toast({ toasts, onRequestDismiss, onExited }) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;
  return (
    <View style={[styles.container, { top: insets.top + spacing.md }]} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onRequestDismiss={onRequestDismiss} onExited={onExited} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 999,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadow.pop,
    ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)' }, default: {} }),
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginLeft: spacing.xs,
  },
  message: { flex: 1, ...typography.bodyStrong, color: colors.textPrimary, marginRight: spacing.sm },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnPressed: { backgroundColor: colors.background },
});
