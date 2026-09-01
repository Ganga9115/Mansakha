import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import { useMyNotifications } from '../../shared/services/hooks';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ICON_BY_TYPE = { message: 'message-circle', session: 'calendar' };

export default function NotificationsScreen({ navigation }) {
  const { tier } = useResponsive();
  const { data, isLoading } = useMyNotifications();
  const notifications = data?.notifications || [];

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.topHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.headerIconTile}>
          <Feather name="bell" size={18} color={colors.primary} />
        </View>
        <Text style={styles.statusTitle}>Notifications</Text>
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading...</Text>
        ) : notifications.length === 0 ? (
          <Text style={styles.emptyText}>No notifications yet.</Text>
        ) : (
          notifications.map((n) => (
            <Card key={n.notificationId} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconTile}>
                  <Feather name={ICON_BY_TYPE[n.type] || 'bell'} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.message}>{n.message}</Text>
                  <Text style={styles.timestamp}>{timeAgo(n.notifiedAt)}</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  card: { padding: spacing.md, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  iconTile: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  message: { ...typography.bodyStrong, color: colors.textPrimary },
  timestamp: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
