import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadow } from '../theme/shadow';
import { useToast } from '../context/ToastContext';
import { useTriggerSOS } from '../services/hooks';
import { useResponsive } from '../hooks/useResponsive';

// Persistent, always-reachable emergency control - rendered as a sibling
// overlay above the tab/drawer navigator (see VictimShell.js) so it stays
// visible no matter which Victim tab is active. A two-step confirm (tap to
// open, a second explicit tap to send) rather than a single-tap trigger,
// since an accidental press here has real consequences.
export default function SosButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const triggerSos = useTriggerSOS();
  const { isDesktop } = useResponsive();

  const handleConfirm = async () => {
    try {
      await triggerSos.mutateAsync();
      setConfirmOpen(false);
      toast.success('Emergency alert sent. Someone will reach out to you shortly.');
    } catch (err) {
      toast.error(err.message || 'Could not send the alert. Please try again.');
    }
  };

  return (
    <>
      <Pressable
        style={[styles.fab, { bottom: isDesktop ? 24 : 84 }]}
        onPress={() => setConfirmOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Send emergency SOS alert"
      >
        <Feather name="alert-triangle" size={22} color={colors.white} />
      </Pressable>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconTile}>
              <Feather name="alert-triangle" size={28} color={colors.danger} />
            </View>
            <Text style={styles.title}>Send Emergency Alert?</Text>
            <Text style={styles.body}>
              This will immediately notify your counsellor (or the nearest available one) that you need urgent help.
            </Text>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm} disabled={triggerSos.isPending}>
              <Text style={styles.confirmBtnText}>{triggerSos.isPending ? 'Sending...' : 'Yes, Send SOS'}</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setConfirmOpen(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
    zIndex: 20,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.xl, alignItems: 'center', ...shadow.modal,
  },
  iconTile: {
    width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.dangerLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
  confirmBtn: { width: '100%', backgroundColor: colors.danger, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  confirmBtnText: { ...typography.bodyStrong, color: colors.white },
  cancelBtn: { width: '100%', paddingVertical: spacing.sm, alignItems: 'center' },
  cancelBtnText: { ...typography.bodyStrong, color: colors.textSecondary },
});
