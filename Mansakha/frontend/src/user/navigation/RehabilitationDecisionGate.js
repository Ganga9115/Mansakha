import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../shared/theme/colors';
import { spacing } from '../shared/theme/spacing';
import { radius } from '../shared/theme/radius';
import { typography } from '../shared/theme/typography';
import { useAuth } from '../shared/context/AuthContext';
import { useToast } from '../shared/context/ToastContext';
import { EligibleContent } from '../wellness/screens/RehabilitationOptInScreen';

// Mandatory app-open decision, rendered by UserGate INSTEAD of UserShell
// whenever the case is closed and no rehabilitation decision has been made
// yet - the victim can no longer just discover an optional Home tile, they
// must decide before the app opens at all.
//
// "No" calls the self-service decline route then logs out directly - this
// app has no global 401 interceptor (only UserGate's own consent check
// reacts to one), so relying on a 401 to eventually force a logout
// elsewhere would leave a declined session looking "logged in" until the
// user manually backs out. Calling logout() here, synchronously, right
// after the API call succeeds, sidesteps that gap entirely.
//
// "Yes" reuses EligibleContent (the exact same provider-picker component
// RehabilitationOptInScreen.js renders) with no onOptedIn navigation - a
// successful opt-in flips case_stage away from 'Case Closed' via the
// backend, and useOptInRehabilitation already invalidates the eligibility
// query it's built on, so this gate's own next render naturally falls
// through to <UserShell/> with no explicit navigation call needed.
export default function RehabilitationDecisionGate({ providers, onDeclined }) {
  const [step, setStep] = useState('prompt'); // 'prompt' | 'choosing'
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState(null);
  const { logout } = useAuth();
  const toast = useToast();

  const handleDecline = async () => {
    setError(null);
    setDeclining(true);
    try {
      await onDeclined();
      await logout();
    } catch (err) {
      setError(err.message || 'Could not process this request. Kindly try again.');
      setDeclining(false);
    }
  };

  if (step === 'choosing') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.headerLabel}>Rehabilitation Support</Text>
          <EligibleContent providers={providers} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Feather name="compass" size={28} color={colors.primaryDark} />
        </View>
        <Text style={styles.headerLabel}>Your Case Has Been Closed</Text>
        <Text style={styles.title}>Would You Like to Proceed With Rehabilitation Support?</Text>
        <Text style={styles.subtitle}>
          Kindly indicate whether you wish to continue with government or NGO-provided rehabilitation
          services - livelihood, housing, and social support tracked by a dedicated Rehabilitation Officer.
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.primaryBtn, declining && styles.btnDisabled]}
          onPress={() => setStep('choosing')}
          disabled={declining}
        >
          <Text style={styles.primaryBtnText}>Yes, proceed with rehabilitation</Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, declining && styles.btnDisabled]}
          onPress={handleDecline}
          disabled={declining}
        >
          {declining ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.secondaryBtnText}>No, close my account</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Choosing "No" will deactivate your account. You will be signed out and your docket number and
          password will no longer be valid.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.xl, paddingTop: 72, paddingBottom: spacing.xxl || 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg,
  },
  headerLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm, textTransform: 'uppercase' },
  title: { ...typography.h1, fontSize: 21, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md, lineHeight: 28 },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  errorText: { ...typography.bodySmall, color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.lg || radius.md, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.lg || radius.md,
    paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.md,
  },
  secondaryBtnText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  footnote: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 16 },
});
