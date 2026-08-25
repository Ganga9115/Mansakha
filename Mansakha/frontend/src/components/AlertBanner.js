import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Accessible, explicit-text system banner - info/warning/critical variants,
// each with an icon AND a written description (never color-only), for
// page-level notices and inline explanatory callouts (e.g. Case Detail's
// AI explanation, Ministry login's restricted-access notice).
const VARIANT = {
  info: { color: colors.primaryDark, bg: colors.infoLight, icon: 'info' },
  warning: { color: colors.warning, bg: colors.warningLight, icon: 'alert-triangle' },
  critical: { color: colors.danger, bg: colors.dangerLight, icon: 'alert-octagon' },
};

export default function AlertBanner({ variant = 'info', title, children }) {
  const meta = VARIANT[variant] || VARIANT.info;

  return (
    <View
      style={[styles.banner, { backgroundColor: meta.bg, borderColor: `${meta.color}40` }]}
      accessibilityRole="alert"
    >
      <Feather name={meta.icon} size={16} color={meta.color} style={styles.icon} />
      <View style={styles.textCol}>
        {title && <Text style={[styles.title, { color: meta.color }]}>{title}</Text>}
        {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', borderWidth: 1, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  icon: { marginRight: spacing.sm, marginTop: 2 },
  textCol: { flex: 1 },
  title: { ...typography.bodyStrong, marginBottom: 2 },
  body: { ...typography.bodySmall, color: colors.textPrimary },
});
