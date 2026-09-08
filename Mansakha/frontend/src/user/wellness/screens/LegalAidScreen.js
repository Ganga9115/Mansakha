import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useLegalAidStatus, useRequestLegalAid, useSubmitLegalAidFeedback } from '../../shared/services/hooks';

// Legal Aid - the consolidated DLSA flow. Distinct from the existing
// "Request Assistance" (Intervention Requests, District-Admin-triaged,
// medical/safety/other types) - this is its own dedicated pipeline that
// goes straight to DLSA Coordinator, available at any case stage (legal
// aid may be needed well before a case closes, unlike rehabilitation).

const STARS = [1, 2, 3, 4, 5];

function StarRating({ value, onChange }) {
  return (
    <View style={styles.starRow}>
      {STARS.map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
          <Feather name="star" size={28} color={n <= value ? colors.warning || '#F5A623' : colors.border} style={n <= value ? styles.starFilled : null} />
        </Pressable>
      ))}
    </View>
  );
}

function RequestForm() {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const requestLegalAid = useRequestLegalAid();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setError(null);
    try {
      await requestLegalAid.mutateAsync(reason.trim());
    } catch (err) {
      setError(err.message || 'Could not submit your request.');
    }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Request Legal Aid</Text>
      <Text style={styles.introText}>
        Kindly state why you require legal assistance. DLSA Coordinator will review your request and
        assign you a lawyer.
      </Text>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={4}
        placeholder="e.g. I need help understanding the case proceedings and filing my compensation claim..."
        placeholderTextColor={colors.textSecondary}
        value={reason}
        onChangeText={setReason}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button title="Submit Request" onPress={handleSubmit} loading={requestLegalAid.isPending} disabled={!reason.trim() || requestLegalAid.isPending} />
    </Card>
  );
}

function StatusCard({ data }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const submitFeedback = useSubmitLegalAidFeedback();

  const handleSubmitFeedback = async () => {
    if (!rating) return;
    setError(null);
    try {
      await submitFeedback.mutateAsync({ rating, comment: comment.trim() || undefined });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not submit feedback.');
    }
  };

  return (
    <>
      <Card>
        <View style={styles.statusHeaderRow}>
          <Text style={styles.cardTitle}>Your Legal Aid Request</Text>
          <View style={[styles.statusPill, data.status === 'Resolved' ? styles.statusPillResolved : styles.statusPillOpen]}>
            <Text style={[styles.statusPillText, data.status === 'Resolved' ? styles.statusPillTextResolved : styles.statusPillTextOpen]}>
              {data.status}
            </Text>
          </View>
        </View>

        {data.assignedLawyer ? (
          <View style={styles.lawyerBox}>
            <Feather name="user-check" size={16} color={colors.success} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.lawyerName}>{data.assignedLawyer}</Text>
              <Text style={styles.lawyerCaption}>Your assigned legal counsel</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.pendingText}>Your request is under review. Counsel will be assigned shortly.</Text>
        )}
      </Card>

      {data.assignedLawyer && !data.feedbackGiven && !submitted && (
        <Card>
          <Text style={styles.cardTitle}>Rate Your Legal Aid Experience</Text>
          <Text style={styles.introText}>Your feedback helps DLSA ensure you are being properly represented.</Text>
          <StarRating value={rating} onChange={setRating} />
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            placeholder="Optional comments..."
            placeholderTextColor={colors.textSecondary}
            value={comment}
            onChangeText={setComment}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Button title="Submit Feedback" onPress={handleSubmitFeedback} loading={submitFeedback.isPending} disabled={!rating || submitFeedback.isPending} />
        </Card>
      )}

      {(data.feedbackGiven || submitted) && (
        <View style={styles.feedbackThanks}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <Text style={styles.feedbackThanksText}>Thank you - your feedback has been recorded.</Text>
        </View>
      )}
    </>
  );
}

export default function LegalAidScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const statusQuery = useLegalAidStatus();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <View style={styles.headerIconTile}>
            <Feather name="briefcase" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Legal Aid</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => {}} />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <QueryBoundary query={statusQuery}>
            {(data) => (data?.hasRequest ? <StatusCard data={data} /> : <RequestForm />)}
          </QueryBoundary>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 720, alignSelf: 'center' },

  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, marginBottom: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 90, textAlignVertical: 'top', color: colors.textPrimary, marginBottom: spacing.md, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },

  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  statusPill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillOpen: { backgroundColor: colors.warningLight || '#FEF3C7' },
  statusPillResolved: { backgroundColor: colors.successLight },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  statusPillTextOpen: { color: colors.warning || '#B45309' },
  statusPillTextResolved: { color: colors.success },

  lawyerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md },
  lawyerName: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14 },
  lawyerCaption: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  starRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  starFilled: {},

  feedbackThanks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  feedbackThanksText: { ...typography.bodySmall, color: colors.textSecondary },
});
