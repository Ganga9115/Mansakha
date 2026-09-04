import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';

// Shared log-out icon + confirm dialog, used wherever a screen/shell needs a
// logout entry point (SidebarNav's desktop-tier drawer, SettingsScreen's
// phone/tablet-tier header - the latter previously had NO working logout at
// all: `logout` was destructured from useAuth() but never called or wired to
// a button anywhere in that screen). Styled after GetHelpButton's
// header-icon + confirm-modal pattern so both destructive-action confirms in
// this app look and feel the same.
//
// Logging out just clears the session via AuthContext; RootNavigator watches
// `session` and swaps to the login stack on its own once it's null, so there
// is no explicit "navigate to login" call needed here (unlike the web app,
// which has separate per-role login routes to send users back to).
// `variant="icon"` (default) is the small circular header button used in
// SidebarNav's desktop drawer; `variant="row"` is a full-width labeled row,
// used at the bottom of Profile/Settings content - both share the exact
// same confirm-modal logic below so there's one place that actually calls
// logout().
export default function LogoutButton({ style, iconColor = colors.danger, background = colors.dangerLight, variant = 'icon' }) {
  const { logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await logout();
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      {variant === 'row' ? (
        <Pressable
          style={[styles.rowBtn, style]}
          onPress={() => setConfirmOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
        >
          <View style={[styles.rowIconTile, { backgroundColor: background }]}>
            <Feather name="log-out" size={18} color={iconColor} />
          </View>
          <Text style={styles.rowLabel}>Log Out</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.iconBtn, { backgroundColor: background }, style]}
          onPress={() => setConfirmOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
        >
          <Feather name="log-out" size={18} color={iconColor} />
        </Pressable>
      )}

      <Modal visible={confirmOpen} transparent animationType="none" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconTile}>
              <Feather name="log-out" size={28} color={colors.danger} />
            </View>
            <Text style={styles.title}>Log Out?</Text>
            <Text style={styles.body}>Are you sure you want to log out of Mansakha?</Text>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm} disabled={loading}>
              <Text style={styles.confirmBtnText}>{loading ? 'Logging out...' : 'Yes, Log Out'}</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setConfirmOpen(false)} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowLabel: { ...typography.h3, color: colors.danger },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
      default: {},
    }),
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...typography.bodySmall, color: '#4A4A4A', textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
  confirmBtn: {
    width: '100%',
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  confirmBtnText: { ...typography.bodyStrong, color: colors.white },
  cancelBtn: { width: '100%', paddingVertical: spacing.sm, alignItems: 'center' },
  cancelBtnText: { ...typography.bodyStrong, color: '#4A4A4A' },
});
