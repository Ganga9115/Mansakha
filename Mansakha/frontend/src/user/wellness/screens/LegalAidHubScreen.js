import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import Stepper from '../../shared/components/Stepper';
import StatusBadge from '../../shared/components/StatusBadge';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useMyLegalAidRequestCurrent, useLegalAidStatus, useSubmitLegalAidRequestFeedback } from '../../shared/services/hooks';

// Legal Aid hub - the dedicated pipeline (migration_040), distinct from the
// old consolidated DLSA flow (see the legacy banner below). Landing screen
// for the victim's "Legal Aid" section: Request Legal Aid / My Legal Aid
// Request all reachable from here - this screen itself doubles as "My Legal
// Aid Request" (the status view), and as of migration_043 also carries the
// district DLSA's own contact details and the feedback box directly below
// the stepper, rather than requiring a separate screen for either.

// migration_043: 4 stages, not 7 - "Verified"/"Approved" added review
// overhead between DLSA starting a review and actually assigning a Public
// Prosecutor with no distinct action of their own from the victim's point of
// view, so they're gone from both the stepper and the backend transitions
// that used to produce them.
const STEPS = [
  { title: 'Submitted', context: 'Your request has been received by your district DLSA.' },
  { title: 'Under Review', context: 'DLSA is reviewing your request.' },
  { title: 'Public Prosecutor Assigned', context: 'A Public Prosecutor has been assigned to your case.' },
  { title: 'Completed', context: 'Your Legal Aid case has been completed.' },
];
const STEP_BY_STATUS = { Submitted: 1, 'Under Review': 2, Active: 3, Completed: 4 };

function DlsaCoordinatorCard({ dlsa }) {
  if (!dlsa) return null;
  return (
    <View style={styles.dlsaCard}>
      <View style={styles.dlsaIconTile}>
        <Feather name="shield" size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dlsaLabel}>Your District Legal Services Authority</Text>
        <Text style={styles.dlsaName}>{dlsa.fullName}</Text>
      </View>
      {!!dlsa.phone && (
        <Pressable style={styles.dlsaCallBtn} onPress={() => Linking.openURL(`tel:${dlsa.phone}`).catch(() => {})}>
          <Feather name="phone" size={14} color={colors.primary} />
          <Text style={styles.dlsaCallBtnText}>{dlsa.phone}</Text>
        </Pressable>
      )}
    </View>
  );
}

function StarRating({ value, onChange }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
          <Feather name="star" size={26} color={n <= value ? (colors.warning || '#F5A623') : colors.border} />
        </Pressable>
      ))}
    </View>
  );
}

// Feedback about the currently (or most recently) assigned Public
// Prosecutor - one per assignment (migration_043), reachable the moment
// they're assigned rather than only after a hearing has been recorded.
// myFeedback (from GET .../current) is what tells this whether to show the
// form or the "already submitted" state.
function FeedbackBox({ requestId, myFeedback, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const submitFeedback = useSubmitLegalAidRequestFeedback(requestId);

  if (myFeedback) {
    return (
      <View style={styles.feedbackCard}>
        <View style={styles.feedbackGivenRow}>
          <Feather name="check-circle" size={15} color={colors.success} />
          <Text style={styles.feedbackGivenText}>You rated your Public Prosecutor</Text>
        </View>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Feather key={n} name="star" size={18} color={n <= myFeedback.rating ? (colors.warning || '#F5A623') : colors.border} />
          ))}
        </View>
        {!!myFeedback.comment && <Text style={styles.feedbackGivenComment}>"{myFeedback.comment}"</Text>}
      </View>
    );
  }

  const handleSubmit = async () => {
    if (!rating) return;
    setError(null);
    try {
      await submitFeedback.mutateAsync({ rating, comment: comment.trim() || undefined });
      onSubmitted?.();
    } catch (err) {
      setError(err.message || 'Could not submit feedback.');
    }
  };

  return (
    <View style={styles.feedbackCard}>
      <Text style={styles.feedbackTitle}>Rate Your Public Prosecutor</Text>
      <Text style={styles.feedbackIntro}>Your feedback helps DLSA ensure you are being properly represented.</Text>
      <StarRating value={rating} onChange={setRating} />
      <TextInput
        style={styles.feedbackInput}
        multiline
        numberOfLines={3}
        placeholder="Optional comments..."
        placeholderTextColor={colors.textSecondary}
        value={comment}
        onChangeText={setComment}
      />
      {error && <Text style={styles.feedbackError}>{error}</Text>}
      <Button title="Submit Feedback" onPress={handleSubmit} loading={submitFeedback.isPending} disabled={!rating || submitFeedback.isPending} />
    </View>
  );
}

function LegacyBanner() {
  const legacyQuery = useLegalAidStatus();
  const data = legacyQuery.data;
  if (!data?.hasRequest) return null;
  return (
    <Card style={styles.legacyCard}>
      <View style={styles.legacyHeaderRow}>
        <Feather name="info" size={16} color={colors.primaryDark} />
        <Text style={styles.legacyTitle}>An Earlier Legal Aid Request</Text>
      </View>
      <Text style={styles.legacyText}>
        Status: {data.status}{data.assignedLawyer ? ` · Assigned counsel: ${data.assignedLawyer}` : ''}
      </Text>
      <Text style={styles.legacySub}>This was filed under an earlier version of Legal Aid and is shown here for reference.</Text>
    </Card>
  );
}

function RequestCard({ requestId, status, reason, rejectionReason, dlsaCoordinator, myFeedback, navigation, onFeedbackSubmitted }) {
  if (status === 'Rejected') {
    return (
      <Card>
        <View style={styles.statusHeaderRow}>
          <Text style={styles.cardTitle}>Your Legal Aid Request</Text>
          <StatusBadge status="Rejected" />
        </View>
        {!!reason && <Text style={styles.reasonText}>{reason}</Text>}
        {!!rejectionReason && (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionLabel}>Reason for Rejection</Text>
            <Text style={styles.rejectionText}>{rejectionReason}</Text>
          </View>
        )}
        {/* migration_041: one Legal Aid request per case, ever - a rejected
            request doesn't reopen submission, so there is no "Submit a New
            Request" action here any more. */}
        <Text style={styles.oneShotNote}>
          Legal Aid can be requested once per case. If you believe this rejection was a mistake, contact your
          District Legal Services Authority directly.
        </Text>
        <DlsaCoordinatorCard dlsa={dlsaCoordinator} />
      </Card>
    );
  }

  const step = STEP_BY_STATUS[status] || 1;
  const hasRepresentative = status === 'Active' || status === 'Completed';
  return (
    <Card>
      <View style={styles.statusHeaderRow}>
        <Text style={styles.cardTitle}>Your Legal Aid Request</Text>
        <StatusBadge status={status} />
      </View>
      {!!reason && <Text style={styles.reasonText}>{reason}</Text>}
      <Stepper step={step} steps={STEPS} />

      <DlsaCoordinatorCard dlsa={dlsaCoordinator} />

      {hasRepresentative && (
        <Pressable style={styles.linkRow} onPress={() => navigation.navigate('LegalAidRepresentative')}>
          <Feather name="user-check" size={16} color={colors.primary} />
          <Text style={styles.linkRowText}>View Assigned Public Prosecutor</Text>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>
      )}

      {/* migration_041: one Legal Aid request per case, ever - no "Submit a
          New Request" action once Completed either. */}

      {hasRepresentative && (
        <FeedbackBox requestId={requestId} myFeedback={myFeedback} onSubmitted={onFeedbackSubmitted} />
      )}
    </Card>
  );
}

export default function LegalAidHubScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const activeUserId = dashboardQuery.data?.userId;
  const requestQuery = useMyLegalAidRequestCurrent(activeUserId);

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
          <LegacyBanner />

          <QueryBoundary query={requestQuery}>
            {(data) =>
              data?.hasRequest ? (
                <RequestCard
                  requestId={data.requestId}
                  status={data.status}
                  reason={data.reason}
                  rejectionReason={data.rejectionReason}
                  dlsaCoordinator={data.dlsaCoordinator}
                  myFeedback={data.myFeedback}
                  navigation={navigation}
                  onFeedbackSubmitted={requestQuery.refetch}
                />
              ) : (
                <Card>
                  <Text style={styles.cardTitle}>Request Legal Aid</Text>
                  <Text style={styles.introText}>
                    You are entitled to free legal representation for your case. Tell us why you need it and we'll route
                    your request to your district's DLSA (District Legal Services Authority).
                  </Text>
                  <Button title="Request Legal Aid" onPress={() => navigation.navigate('LegalAidRequest')} />
                </Card>
              )
            }
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
  reasonText: { ...typography.bodySmall, color: colors.textPrimary, lineHeight: 20, marginTop: spacing.xs },

  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },

  rejectionBox: { backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  rejectionLabel: { ...typography.label, color: colors.danger, fontSize: 10 },
  rejectionText: { ...typography.bodySmall, color: colors.textPrimary, marginTop: 2 },
  oneShotNote: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.md },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border + '60',
  },
  linkRowText: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, flex: 1 },

  legacyCard: { backgroundColor: colors.primaryLight + '30', borderColor: colors.primaryLight },
  legacyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  legacyTitle: { ...typography.bodyStrong, color: colors.primaryDark, fontSize: 13 },
  legacyText: { ...typography.bodySmall, color: colors.textPrimary },
  legacySub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  dlsaCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border + '60',
  },
  dlsaIconTile: {
    width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  dlsaLabel: { ...typography.caption, color: colors.textSecondary },
  dlsaName: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14, marginTop: 1 },
  dlsaCallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dlsaCallBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },

  feedbackCard: {
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border + '60',
  },
  feedbackTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14, marginBottom: 2 },
  feedbackIntro: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 16 },
  feedbackInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm,
    minHeight: 64, textAlignVertical: 'top', color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.sm, ...typography.bodySmall,
  },
  feedbackError: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm },
  starRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  feedbackGivenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  feedbackGivenText: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
  feedbackGivenComment: { ...typography.bodySmall, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },
});
