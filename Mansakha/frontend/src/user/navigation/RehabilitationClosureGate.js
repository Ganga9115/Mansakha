import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../shared/theme/colors';
import { spacing } from '../shared/theme/spacing';
import { radius } from '../shared/theme/radius';
import { typography } from '../shared/theme/typography';
import { useContinueRehabilitationAfterClosure, useEndRehabilitationAfterClosure } from '../shared/services/hooks';

// migration_034 - the special post-closure Rehabilitation continuation
// flow: this popup is shown ONLY for a docket that was in the Rehabilitation
// stage, with the victim already opted in, at the moment eCourt marked it
// Case Closed (see ecourtStageSync.js's own transition logic, which is the
// sole place rehabilitation_closure_pending_ack is ever set to true).
// Rendered by UserGate INSTEAD of UserShell until answered, same convention
// as RehabilitationDecisionGate.js.
//
// "Yes" keeps this docket's Rehabilitation context and application access
// alive despite the closed-docket login rule that would otherwise apply -
// the court case itself stays Closed, that fact never changes.
// "No" ends Rehabilitation access for this case; UserGate's own next render
// (its dashboard query is invalidated by both mutations below) naturally
// falls through to whichever of the victim's other cases remains active, or
// to a plain closed-case state if this was their only case.
export default function RehabilitationClosureGate({ docketNumber, caseUserId, onAnswered }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // null | 'yes' | 'no'
  const continueMutation = useContinueRehabilitationAfterClosure(caseUserId);
  const endMutation = useEndRehabilitationAfterClosure(caseUserId);

  const handleAnswer = async (answer) => {
    setError(null);
    setBusy(answer);
    try {
      if (answer === 'yes') {
        await continueMutation.mutateAsync();
      } else {
        await endMutation.mutateAsync();
      }
      onAnswered?.();
    } catch (err) {
      setError(err.message || 'Could not process this request. Kindly try again.');
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Feather name="check-circle" size={28} color={colors.primaryDark} />
        </View>
        <Text style={styles.headerLabel}>Case Closed by eCourt</Text>
        <Text style={styles.title}>
          {docketNumber ? `Docket ${docketNumber} Has Been Closed` : 'Your Case Has Been Closed'}
        </Text>
        <Text style={styles.subtitle}>
          The eCourt has marked this case as closed. Would you like to continue using the app and continue
          with your Rehabilitation support for this case?
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.primaryBtn, !!busy && styles.btnDisabled]}
          onPress={() => handleAnswer('yes')}
          disabled={!!busy}
        >
          {busy === 'yes' ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Yes, continue Rehabilitation</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, !!busy && styles.btnDisabled]}
          onPress={() => handleAnswer('no')}
          disabled={!!busy}
        >
          {busy === 'no' ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.secondaryBtnText}>No, end Rehabilitation access</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Choosing "No" ends Rehabilitation access for this specific case. If you have other active cases,
          you will continue to see them as usual.
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
