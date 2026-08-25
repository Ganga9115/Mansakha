import React from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

const SPLIT_BREAKPOINT = 768; // reuses StaffShell's validated sidebar breakpoint
const BRAND_PANEL_WIDTH = 360;

// Structured placeholder emblem - a shield badge built from existing
// Feather icons + theme colors (no real coat-of-arms asset exists in this
// project yet), easily swappable for a real image later.
function InsigniaBadge() {
  return (
    <View style={styles.insignia}>
      <Feather name="shield" size={30} color={colors.insignia} />
      <Feather name="check" size={14} color={colors.insigniaAccent} style={styles.insigniaCheck} />
    </View>
  );
}

function BrandPanel({ wide, brandContent }) {
  return (
    <View style={[styles.brandPanel, wide ? styles.brandPanelWide : styles.brandPanelNarrow]}>
      <InsigniaBadge />
      <Text style={styles.logoText}>Mansakha</Text>
      <Text style={styles.tagline}>Ministry of Social Justice and Empowerment</Text>
      {wide && brandContent}
    </View>
  );
}

// Split-panel auth shell: a flat, bordered insignia panel on the left, the
// form itself full-height on the right - no gradient, no card shadow, no
// motion. Stacks vertically below SPLIT_BREAKPOINT. `brandContent`:
// optional extra content in the brand panel (Signup's Stepper).
export default function AuthLayout({ title, subtitle, brandContent, children }) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= SPLIT_BREAKPOINT;

  return (
    <View style={styles.root}>
      <BrandPanel wide={wide} brandContent={brandContent} />
      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formInner}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  brandPanel: {
    padding: spacing.xxl, justifyContent: 'flex-start', backgroundColor: colors.surface,
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  brandPanelWide: { width: BRAND_PANEL_WIDTH, minHeight: '100%' },
  brandPanelNarrow: { width: '100%', paddingBottom: spacing.xl, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  insignia: {
    width: 52, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.insignia,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, backgroundColor: colors.white,
  },
  insigniaCheck: { position: 'absolute', bottom: -4, right: -4, backgroundColor: colors.white, borderRadius: radius.pill },
  logoText: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  tagline: { ...typography.bodySmall, color: colors.textSecondary },
  formScroll: { flex: 1 },
  formContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  formInner: { width: '100%', maxWidth: 420 },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
});
