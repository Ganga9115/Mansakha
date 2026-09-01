import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadow } from '../theme/shadow';
import { useMyNotifications } from '../services/hooks';

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

// A dropdown panel, not a full-screen navigation - matches the counsellor
// web app's own NotificationBell (bell icon -> small panel anchored under
// it, dismissed by tapping outside), used identically from both
// TopRightActions (phone/tablet) and DesktopHeaderActions (desktop tier),
// so both read as the exact same feature regardless of which header renders
// it. React Native has no simple "anchor a panel under this exact button"
// primitive across native+web, so this uses a transparent full-screen
// Modal with the panel pinned to the top-right - visually the same result
// (a dropdown near the bell) without needing a measurement/portal library.
export default function NotificationBell({ size = 18, color = colors.primaryDark }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMyNotifications();
  const notifications = data?.notifications || [];
  const hasNotifications = notifications.length > 0;

  return (
    <>
      <Pressable style={styles.iconCircleBtn} onPress={() => setOpen(true)} accessibilityLabel="Notifications">
        <Feather name="bell" size={size} color={color} />
        {hasNotifications && <View style={styles.bellDot} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Swallow taps inside the panel so they don't fall through to the backdrop and close it. */}
          <Pressable style={styles.panel} onPress={() => {}}>
            <Text style={styles.panelTitle}>Notifications</Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {isLoading ? (
                <Text style={styles.emptyText}>Loading...</Text>
              ) : notifications.length === 0 ? (
                <Text style={styles.emptyText}>No notifications yet.</Text>
              ) : (
                notifications.map((n) => (
                  <View key={n.notificationId} style={styles.row}>
                    <View style={styles.iconTile}>
                      <Feather name={ICON_BY_TYPE[n.type] || 'bell'} size={14} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.message}>{n.message}</Text>
                      <Text style={styles.timestamp}>{timeAgo(n.notifiedAt)}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    alignItems: 'flex-end',
    paddingTop: 70,
    paddingRight: spacing.lg,
  },
  panel: {
    width: 320,
    maxWidth: '90%',
    maxHeight: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  panelTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  list: { maxHeight: 340 },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconTile: {
    width: 30, height: 30, borderRadius: radius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  message: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
  timestamp: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
