import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadow } from '../theme/shadow';
import { useToast } from '../context/ToastContext';
import { useTriggerUrgentHelp } from '../services/hooks';
import { useResponsive } from '../hooks/useResponsive';

// Best-effort only (same as ThreatReportScreen.js's captureLocation) - a
// denied permission, no GPS (desktop web), or any failure never blocks the
// alert itself; the backend already treats location as optional.
async function captureLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

// Fixed India police emergency number - only used if the backend response is
// somehow missing pcrNumber (it always sends "100" today; see
// PCR_NUMBER in backend/src/user/routes/user.routes.js).
const FALLBACK_PCR_NUMBER = '100';

// Replaces the previously-removed SosButton with the same two-step-confirm
// UX (tap the icon opens a modal, a second explicit tap actually sends) but
// wired to POST /api/user/urgent-help instead of the old SOS endpoint. That
// call notifies the assigned counsellor, the user's District Administration,
// and that district's State Administration server-side; it does NOT place a
// phone call itself (Exotel/IVRS is a deliberate stub), so on success this
// also opens the device's native dialer pre-filled with the Police Control
// Room number the backend returns.
//
// As a header icon this now also replaces the old "Talk to Mansakha by
// voice" phone-call button (that AI-chatbot entry point still exists via
// the floating AiChatButton FAB, so nothing is lost) - hence the header
// variant renders a phone icon, styled red/dangerLight, rather than the
// alert-triangle used on the standalone FAB variant.
export default function GetHelpButton({ asHeaderIcon = false }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const triggerUrgentHelp = useTriggerUrgentHelp();
  const { isDesktop } = useResponsive();

  const handleConfirm = async () => {
    try {
      const location = await captureLocation();
      const data = await triggerUrgentHelp.mutateAsync(location);
      setConfirmOpen(false);
      toast.success('Help is on the way. Connecting you to the Police Control Room...');
      const pcrNumber = data?.pcrNumber || FALLBACK_PCR_NUMBER;
      Linking.openURL(`tel:${pcrNumber}`).catch(() => {
        // Dialer couldn't be opened (e.g. web/desktop without telephony) -
        // the alert itself was already sent successfully above, so this is
        // only a follow-up notice, not a failure of the main action.
        toast.info(`Could not open the dialer automatically. Please call ${pcrNumber} directly.`);
      });
    } catch (err) {
      // Do NOT open the dialer or imply help was requested if the API call
      // itself failed.
      toast.error(err.message || 'Could not send the alert. Please try again.');
    }
  };

  return (
    <>
      <Pressable
        style={asHeaderIcon ? styles.headerIconBtn : [styles.fab, { bottom: isDesktop ? 24 : 84 }]}
        onPress={() => setConfirmOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Get Help Now"
      >
        <Feather
          name={asHeaderIcon ? 'phone-call' : 'alert-triangle'}
          size={asHeaderIcon ? 20 : 22}
          color={asHeaderIcon ? colors.danger : colors.white}
        />
      </Pressable>

      <Modal
        visible={confirmOpen}
        transparent
        animationType="none"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconTile}>
              <Feather name="alert-triangle" size={28} color={colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Get Help Now?</Text>
            <Text style={styles.confirmBody}>
              This will immediately notify your counsellor, your Protection Officer, your district administration,
              and your state administration that you need urgent help, share your current location if permitted,
              and will help connect you to the Police Control Room.
            </Text>
            <Pressable style={styles.confirmDeleteBtn} onPress={handleConfirm} disabled={triggerUrgentHelp.isPending}>
              <Text style={styles.confirmDeleteBtnText}>{triggerUrgentHelp.isPending ? 'Sending...' : 'Yes, Get Help Now'}</Text>
            </Pressable>
            <Pressable style={styles.confirmCancelBtn} onPress={() => setConfirmOpen(false)} disabled={triggerUrgentHelp.isPending}>
              <Text style={styles.confirmCancelBtnText}>Cancel</Text>
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
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  // Verbatim copy of MyEntry.js's delete-confirmation modal styles (the
  // "journal delete" popup), renamed to this file's own content - kept
  // textually identical, not just value-equal, so there is no possible
  // source of drift between the two anywhere in the app.
  confirmBackdrop: {
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
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 1)',
    ...Platform.select({
      web: { backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' },
      default: {},
    }),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  confirmIconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  confirmTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  confirmBody: { ...typography.bodySmall, color: '#4A4A4A', textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
  confirmDeleteBtn: {
    width: '100%',
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  confirmDeleteBtnText: { ...typography.bodyStrong, color: colors.white },
  confirmCancelBtn: { width: '100%', paddingVertical: spacing.sm, alignItems: 'center' },
  confirmCancelBtnText: { ...typography.bodyStrong, color: '#4A4A4A' },
});
