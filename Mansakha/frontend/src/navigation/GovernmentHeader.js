import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { getNavItemsForRole } from './roleNavConfig';

// Structured government-portal header, replacing the earlier plain TopBar:
// a left insignia + platform name/department subtitle, a right-aligned
// role/jurisdiction context zone (the official's authority context should
// always be visible), and the alerts bell with an accessible label and a
// real count badge. Announced as a banner landmark for screen readers.
export default function GovernmentHeader({ navigation, isWide, roleName, jurisdictionLevel, alertCount = 0 }) {
  // Administration's alerts feed is district-tier only (same backend
  // restriction as Workload) - a State/National account gets no bell,
  // rather than one that 400s when tapped.
  const alertsItem = roleName === 'Administration' && jurisdictionLevel !== 'district'
    ? null
    : getNavItemsForRole(roleName).find((item) => item.key === 'alerts');

  const jurisdictionLabel = jurisdictionLevel ? `${jurisdictionLevel.charAt(0).toUpperCase()}${jurisdictionLevel.slice(1)} tier` : null;

  return (
    <View style={styles.header} accessibilityRole="header">
      {!isWide && (
        <Pressable
          onPress={() => navigation.toggleDrawer()}
          style={styles.hamburger}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
        >
          <Feather name="menu" size={22} color={colors.textPrimary} />
        </Pressable>
      )}

      <View style={styles.insigniaBadge}>
        <Feather name="shield" size={16} color={colors.primary} />
      </View>
      <View style={styles.titleCol}>
        <Text style={styles.title}>Mansakha</Text>
        <Text style={styles.subtitle}>Ministry of Social Justice and Empowerment</Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.contextZone}>
        <Text style={styles.roleLabel}>{roleName}</Text>
        {jurisdictionLabel && <Text style={styles.jurisdictionLabel}>{jurisdictionLabel}</Text>}
      </View>

      {alertsItem && (
        <Pressable
          style={styles.iconButton}
          onPress={() => navigation.navigate(alertsItem.screen)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Alerts"
          accessibilityHint={alertCount > 0 ? `${alertCount} unresolved alerts` : 'No unresolved alerts'}
        >
          <Feather name="bell" size={19} color={colors.textPrimary} />
          {alertCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{alertCount > 99 ? '99+' : alertCount}</Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: spacing.lg,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  hamburger: { padding: spacing.xs },
  insigniaBadge: {
    width: 34, height: 34, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight,
  },
  titleCol: {},
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, textTransform: 'none' },
  spacer: { flex: 1 },
  contextZone: { alignItems: 'flex-end', marginRight: spacing.sm },
  roleLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.textPrimary },
  jurisdictionLabel: { ...typography.caption, color: colors.textSecondary, textTransform: 'none' },
  iconButton: { padding: spacing.sm },
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
});
