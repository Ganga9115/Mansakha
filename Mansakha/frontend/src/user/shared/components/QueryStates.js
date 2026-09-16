import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import Button from './Button';

// Shared loading/error/empty rendering so every screen doesn't reimplement the same
// three states - and so no screen silently shows a blank/broken view on failure.

// Was a stack of gray skeleton bars (see Skeleton.js's SkeletonRows) -
// explicitly asked to remove that look ("even blank screen is fine, not
// those boxes"). A small centered spinner is the minimal middle ground: no
// boxes, but still some sign the page is doing something rather than
// looking frozen/broken. `rows` is no longer used (this used to size the
// skeleton stack) - kept as an accepted-but-ignored prop so no call site
// needs touching.
export function LoadingState({ rows } = {}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <View style={[styles.iconTile, styles.iconTileDanger]}>
        <Feather name="alert-triangle" size={22} color={colors.danger} />
      </View>
      <Text style={styles.errorText}>{message || 'Something went wrong.'}</Text>
      {onRetry && <Button title="Retry" variant="outline" onPress={onRetry} style={styles.retryButton} />}
    </View>
  );
}

// icon: optional Feather icon name (defaults to a neutral inbox glyph).
export function EmptyState({ message, title, icon = 'inbox' }) {
  return (
    <View style={styles.center}>
      <View style={styles.iconTile}>
        <Feather name={icon} size={22} color={colors.textSecondary} />
      </View>
      {title && <Text style={styles.emptyTitle}>{title}</Text>}
      <Text style={styles.emptyText}>{message || 'Nothing here yet.'}</Text>
    </View>
  );
}

// Renders the right state for a useQuery result, or the children with `data` once
// loaded - avoids each screen repeating isLoading/isError/data checks.
export function QueryBoundary({ query, empty, children }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={query.refetch} />;
  if (empty && empty(query.data)) return <EmptyState message={typeof empty === 'function' ? undefined : empty} />;
  return children(query.data);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  iconTile: {
    width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  iconTileDanger: { backgroundColor: colors.dangerLight },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  retryButton: { minWidth: 120 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
