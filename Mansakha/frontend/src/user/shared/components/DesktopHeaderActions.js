import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import GetHelpButton from './GetHelpButton';
import NotificationBell from './NotificationBell';

// The header's old "Talk to Mansakha by voice" phone-call icon has been
// repurposed into the Get Help Now emergency action below (the AI chatbot
// is still reachable via the floating AiChatButton FAB, so no entry point
// is actually lost).
// The notification bell is Home-screen-only (showNotifications) - every
// other screen that renders this in its header just gets the call icon.
//
// `onBellPress`/`alertCount` used to drive this bell, but every caller
// passed `onBellPress={() => {}}` and an unrelated alert count - meaning on
// desktop/wide-browser width (this component, not TopRightActions, renders
// there) the bell never actually did anything. Now uses the same
// NotificationBell (dropdown panel, not a full-screen navigate) as
// TopRightActions, so both tiers behave identically; `onBellPress`/
// `alertCount` are no longer read.
export default function DesktopHeaderActions({ fullName, roleLabel = '', showNotifications = false }) {
  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
        {showNotifications && <NotificationBell color={colors.primaryDark} />}
        <GetHelpButton asHeaderIcon />
      </View>

      <View style={styles.profileChip}>
        <View style={styles.avatarCircle}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.profileName} numberOfLines={1}>{fullName || 'Loading...'}</Text>
          {!!roleLabel && <Text style={styles.profileRole} numberOfLines={1}>{roleLabel}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 34,
    width: 256,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary, outlineStyle: 'none' },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: spacing.lg,
    maxWidth: 160,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  profileName: { ...typography.bodyStrong, fontSize: 13, color: colors.textPrimary },
  profileRole: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
