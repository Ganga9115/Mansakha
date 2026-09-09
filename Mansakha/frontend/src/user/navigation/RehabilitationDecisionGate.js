import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../shared/theme/colors';
import { spacing } from '../shared/theme/spacing';
import { radius } from '../shared/theme/radius';
import { typography } from '../shared/theme/typography';
import { useDeclineRehabilitation } from '../shared/services/hooks';
import { EligibleContent } from '../wellness/screens/RehabilitationOptInScreen';

// migration_034: this gate now fires the moment a SPECIFIC docket's own
// eCourt case_stage reaches 'Rehabilitation' and the victim hasn't yet
// answered for it (not on case closure - Rehabilitation is a genuine
// mid-lifecycle stage now, between Trial and Compensation). Rendered by
// UserGate INSTEAD of UserShell for that decision, same convention as
// RehabilitationClosureGate.js.
//
// "No" no longer deactivates the account or logs anyone out - it just
// records rehabilitation_declined_at for THIS docket and lets the case
// continue under completely normal (non-isolated) tracking; when it later
// reaches Case Closed it's treated as an ordinary closure, not a
// continuing rehabilitation. UserGate's own next check (its dashboard query
// is invalidated by the decline mutation) naturally falls through to
// UserShell once this is recorded.
//
// "Yes" reuses EligibleContent (the exact same provider-picker component
// RehabilitationOptInScreen.js renders), scoped to this docket via
// caseUserId - a successful opt-in records rehabilitation_opted_in_at for
// this case (never touching case_stage, which stays exclusively eCourt's),
// and the invalidated eligibility/dashboard queries naturally fall through
// to UserShell on the next render, isolated into this case's own context.
export default function RehabilitationDecisionGate({ providers, caseUserId, docketNumber, onDeclined }) {
  const [step, setStep] = useState('prompt'); // 'prompt' | 'choosing'
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState(null);
  const decline = useDeclineRehabilitation(caseUserId);

  const handleDecline = async () => {
    setError(null);
    setDeclining(true);
    try {
      await decline.mutateAsync();
      onDeclined?.();
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
          <EligibleContent providers={providers} caseUserId={caseUserId} />
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
        <Text style={styles.headerLabel}>
          {docketNumber ? `Docket ${docketNumber} · Rehabilitation Stage` : 'Rehabilitation Stage'}
        </Text>
        <Text style={styles.title}>Would You Like to Proceed With Rehabilitation Support?</Text>
        <Text style={styles.subtitle}>
          The eCourt has moved this case into the Rehabilitation stage. Kindly indicate whether you wish to
          continue with government or NGO-provided rehabilitation services - livelihood, housing, and social
          support tracked by a dedicated Rehabilitation Officer.
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
            <Text style={styles.secondaryBtnText}>No, continue without rehabilitation</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Choosing "No" simply continues this case under normal tracking - your account and docket number
          stay active either way.
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
