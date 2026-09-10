import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import { useToast } from '../../shared/context/ToastContext';
import { useUserDashboard, useMyLegalAidRequestCurrent, useLegalAidRepresentative, useLegalAidHearings } from '../../shared/services/hooks';

// "Assigned Representative" - the rep's contact card plus the official
// Hearing Timeline (representative-authored records, never private notes -
// those stay backend-enforced representative-only). Feedback is prompted
// per hearing, not per case, once a hearing's outcome is on record.

function RepresentativeCard({ rep }) {
  const toast = useToast();
  const handleCall = () => {
    if (!rep?.phone) return;
    Linking.openURL(`tel:${rep.phone}`).catch(() => toast.error('Could not start a call on this device.'));
  };

  if (!rep?.hasRepresentative) {
    return (
      <Card>
        <Text style={styles.pendingText}>A Public Prosecutor has not been assigned to your case yet.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.repCard}>
      <View style={styles.repHeaderRow}>
        <View style={styles.repIconTile}>
          <Feather name="user" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.repName}>{rep.fullName}</Text>
          <Text style={styles.repDesignation}>{rep.designation || 'Public Prosecutor'}</Text>
        </View>
      </View>
      {rep.phone && (
        <Pressable style={styles.callBtn} onPress={handleCall}>
          <Feather name="phone" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.callBtnText}>Call</Text>
        </Pressable>
      )}
    </Card>
  );
}

function HearingRow({ hearing, requestId, navigation }) {
  return (
    <View style={styles.hearingRow}>
      <View style={styles.hearingHeaderRow}>
        <Text style={styles.hearingDate}>
          {new Date(hearing.hearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        {!!hearing.court && <Text style={styles.hearingCourt}>{hearing.court}</Text>}
      </View>
      {!!hearing.hearingType && <Text style={styles.hearingType}>{hearing.hearingType}</Text>}
      <Text style={styles.hearingOutcome}>{hearing.outcome}</Text>
      {!!hearing.nextHearingDate && (
        <Text style={styles.hearingNext}>
          Next hearing: {new Date(hearing.nextHearingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
      )}
      {!hearing.feedbackGiven ? (
        <Pressable
          style={styles.feedbackBtn}
          onPress={() => navigation.navigate('LegalAidFeedback', { requestId, hearingId: hearing.hearingId })}
        >
          <Feather name="star" size={13} color={colors.primary} />
          <Text style={styles.feedbackBtnText}>Rate this hearing</Text>
        </Pressable>
      ) : (
        <View style={styles.feedbackGivenRow}>
          <Feather name="check" size={12} color={colors.success} />
          <Text style={styles.feedbackGivenText}>Feedback submitted</Text>
        </View>
      )}
    </View>
  );
}

export default function LegalAidRepresentativeScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const activeUserId = dashboardQuery.data?.userId;
  const requestQuery = useMyLegalAidRequestCurrent(activeUserId);
  const requestId = requestQuery.data?.requestId;
  const repQuery = useLegalAidRepresentative(requestId);
  const hearingsQuery = useLegalAidHearings(requestId);

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
            <Feather name="user-check" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Assigned Public Prosecutor</Text>
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
          {!requestId ? (
            <Card><Text style={styles.pendingText}>No Legal Aid request found for this case.</Text></Card>
          ) : (
            <>
              <QueryBoundary query={repQuery}>{(data) => <RepresentativeCard rep={data} />}</QueryBoundary>

              <Card>
                <View style={styles.cardHeaderRow}>
                  <Feather name="calendar" size={16} color={colors.primaryDark} />
                  <Text style={styles.cardTitle}>Hearing Timeline</Text>
                </View>
                <QueryBoundary query={hearingsQuery}>
                  {(data) =>
                    (data?.hearings || []).length === 0 ? (
                      <EmptyState icon="calendar" message="No hearings recorded yet." />
                    ) : (
                      <View>
                        {data.hearings.map((h, i) => (
                          <View key={h.hearingId}>
                            {i > 0 && <View style={styles.hearingDivider} />}
                            <HearingRow hearing={h} requestId={requestId} navigation={navigation} />
                          </View>
                        ))}
                      </View>
                    )
                  }
                </QueryBoundary>
              </Card>
            </>
          )}
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

  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  repCard: { ...shadow.card },
  repHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  repIconTile: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  repName: { ...typography.h3, color: colors.textPrimary },
  repDesignation: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md },
  callBtnText: { ...typography.bodyStrong, color: colors.textPrimary },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  cardTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700', fontSize: 16 },

  hearingDivider: { height: 1, backgroundColor: colors.border + '50', marginVertical: spacing.sm },
  hearingRow: { paddingVertical: spacing.xs },
  hearingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hearingDate: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  hearingCourt: { ...typography.caption, color: colors.textSecondary },
  hearingType: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  hearingOutcome: { ...typography.bodySmall, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 18 },
  hearingNext: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  feedbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  feedbackBtnText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  feedbackGivenRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  feedbackGivenText: { ...typography.caption, color: colors.success },
});
