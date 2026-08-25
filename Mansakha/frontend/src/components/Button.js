import React, { useState } from 'react';
import { Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Flat institutional button - solid fill + a shade-shift on press (no
// gradient, no scale transform, no shadow-expansion), plus a visible
// keyboard focus ring (web outline - ignored harmlessly on native).
// variant: primary/secondary/outline/ghost/danger.
export default function Button({
  title, onPress, variant = 'primary', icon, loading = false, disabled = false, style, textStyle, accessibilityHint,
}) {
  const isDisabled = disabled || loading;
  const [focused, setFocused] = useState(false);

  const content = loading ? (
    <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.primary} size="small" />
  ) : (
    <>
      {icon && <Feather name={icon} size={17} color={ICON_COLOR[variant]} style={styles.icon} />}
      <Text style={[styles.text, TEXT_STYLE[variant], isDisabled && styles.textDisabled, textStyle]}>{title}</Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base, styles.row, VARIANT_STYLE[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && PRESSED_STYLE[variant],
        focused && styles.focused,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const ICON_COLOR = {
  primary: colors.onPrimary, secondary: colors.primary, outline: colors.primary,
  ghost: colors.primary, danger: colors.onPrimary,
};

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  icon: { marginRight: spacing.sm },
  text: { ...typography.bodyStrong },
  textDisabled: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  focused: { outlineWidth: colors.focusRingWidth, outlineColor: colors.focusRing, outlineStyle: 'solid', outlineOffset: 2 },
});

const VARIANT_STYLE = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
});

// Instant shade-shift on press - no scale/opacity animation.
const PRESSED_STYLE = StyleSheet.create({
  primary: { backgroundColor: colors.primaryDark },
  secondary: { backgroundColor: colors.border },
  outline: { backgroundColor: colors.primaryLight },
  ghost: { backgroundColor: colors.surface },
  danger: { backgroundColor: '#8F1717' },
});

const TEXT_STYLE = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.primaryDark },
  outline: { color: colors.primary },
  ghost: { color: colors.primary },
  danger: { color: colors.onPrimary },
});
