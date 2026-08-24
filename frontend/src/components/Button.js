import React from 'react';
import { Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Centralizes the button styling every screen previously hand-rolled per
// StyleSheet. variant: primary/secondary/outline/ghost/danger.
export default function Button({
  title, onPress, variant = 'primary', icon, loading = false, disabled = false, style, textStyle,
}) {
  const isDisabled = disabled || loading;
  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.primary} size="small" />
      ) : (
        <>
          {icon && <Feather name={icon} size={17} color={ICON_COLOR[variant]} style={styles.icon} />}
          <Text style={[styles.text, TEXT_STYLE[variant], isDisabled && styles.textDisabled, textStyle]}>{title}</Text>
        </>
      )}
    </>
  );

  if (variant === 'primary' && !isDisabled) {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={({ pressed }) => [pressed && styles.pressed, style]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, styles.row]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base, styles.row, VARIANT_STYLE[variant], isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style,
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});

const VARIANT_STYLE = StyleSheet.create({
  // Only reached when disabled/loading (the enabled path renders the
  // gradient instead) - needs its own solid background since no gradient
  // wraps it here.
  primary: { backgroundColor: colors.primaryDark },
  secondary: { backgroundColor: colors.primaryLight },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
});

const TEXT_STYLE = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.primaryDark },
  outline: { color: colors.primary },
  ghost: { color: colors.primary },
  danger: { color: colors.onPrimary },
});
