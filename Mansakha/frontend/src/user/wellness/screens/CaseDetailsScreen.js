import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import { useUserDashboard, useCourtCaseDetails, useInvestigationProgress } from '../../shared/services/hooks';

// Real, live status from the Investigating Officer's own record - kept as
// its own independent card/query, entirely separate from the eCourts
// simulation below (courtCaseSimulation.js is purely decorative/
// deterministic; this is the genuine investigation record).
const ACCUSED_STATUS_TONE = {
  'In Custody': { bg: '#E4F5EC', fg: '#2F8A5B' },
  Convicted: { bg: '#E4F5EC', fg: '#2F8A5B' },
  'Out on Bail': { bg: '#FEF3C7', fg: '#9A5B06' },
  Absconding: { bg: '#FBE9E8', fg: '#A13934' },
};

function InvestigationProgressCard({ data }) {
  if (!data || (!data.accusedStatus && !data.investigationProgress && data.chargesheetStatus === 'Not Filed')) return null;
  const tone = ACCUSED_STATUS_TONE[data.accusedStatus];
  return (
    <Card headerTitle="Investigation Progress">
      {data.accusedStatus && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Accused Status</Text>
          <View style={[styles.statusPill, tone && { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusPillText, tone && { color: tone.fg }]}>{data.accusedStatus}</Text>
          </View>
        </View>
      )}
      <Row label="Chargesheet" value={data.chargesheetStatus === 'Filed' ? `Filed ${formatDate(data.chargesheetFiledAt)}` : 'Not yet filed'} />
      {data.investigationProgress && (
        <Text style={styles.progressText}>{data.investigationProgress}</Text>
      )}
    </Card>
  );
}

function Row({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PartyList({ title, parties }) {
  if (!parties || parties.length === 0) return null;
  return (
    <View style={styles.partyGroup}>
      <Text style={styles.partyGroupTitle}>{title}</Text>
      {parties.map((p, i) => (
        <Text key={i} style={styles.partyName}>{p.name} <Text style={styles.partyRole}>({p.role})</Text></Text>
      ))}
    </View>
  );
}

export default function CaseDetailsScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const linkedCases = dashboardQuery.data?.linkedCases || [];
  const [selectedUserId, setSelectedUserId] = useState(null);

  // Default to the caller's own anchor case once the list loads - the
  // switcher below only ever renders when there's more than one to choose
  // between.
  const activeUserId = selectedUserId || linkedCases[0]?.userId;
  const activeCase = linkedCases.find((c) => c.userId === activeUserId);
  const courtQuery = useCourtCaseDetails(activeUserId);
  const investigationQuery = useInvestigationProgress();

  return (
    <View style={styles.container}>
      {/* Fixed top bar - a sibling of the ScrollView below, not its first
          child, so it stays pinned while the body scrolls underneath it
          (matches JournalScreen.js's actual structure - AtrocitiesActScreen
          claims to follow the same pattern but puts its header inside the
          ScrollView instead, which scrolls it away with the content; that
          reads as a broken/missing top bar on web/desktop specifically,
          where a fixed header is the expected behavior). */}
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
            <Feather name="file-text" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Case Details</Text>
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
        {/* Case switcher - Multi-Case-Per-Person Support: only shown when
            this account actually has more than one docket to choose
            between (see useUserDashboard's linkedCases). */}
        {linkedCases.length > 1 && (
          <View style={styles.switcherRow}>
            {linkedCases.map((c) => (
              <Pressable
                key={c.userId}
                onPress={() => setSelectedUserId(c.userId)}
                style={[styles.switcherPill, c.userId === activeUserId && styles.switcherPillActive]}
              >
                <Text style={[styles.switcherPillText, c.userId === activeUserId && styles.switcherPillTextActive]}>
                  Docket {c.docketNumber}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <InvestigationProgressCard data={investigationQuery.data} />

        {!activeUserId ? (
          <EmptyState icon="file-text" message="No case found for your account yet." />
        ) : (
          <QueryBoundary query={courtQuery}>
            {(data) => {
              if (!data?.available) {
                return (
                  <EmptyState
                    icon="clock"
                    title="Not yet available"
                    message={data?.reason || 'Court case details aren’t available for this case yet.'}
                  />
                );
              }

              const hasIaOrOther = (data.iaDetails?.length > 0) || (data.connectedCases?.length > 0)
                || (data.transferHistory?.length > 0) || (data.objections?.length > 0) || data.originatingCaseNumber;

              return (
                <>
                  <Card headerTitle="Case Overview">
                    <Row label="CNR Number" value={data.cnrNumber} />
                    <Row label="Case Type" value={data.caseType} />
                    <Row label="Category" value={data.caseCategory} />
                    <Row label="Filing No. / Date" value={data.filingNumber ? `${data.filingNumber} (${formatDate(data.filingDate)})` : null} />
                    <Row label="Registration No. / Date" value={data.registrationNumber ? `${data.registrationNumber} (${formatDate(data.registrationDate)})` : null} />
                    <Row label="Court Complex" value={data.courtComplex} />
                    <Row label="Court Establishment" value={data.courtEstablishment} />
                    <Row label="Court Number" value={data.courtNumber} />
                    <Row label="Coram" value={data.coram?.join(', ')} />
                    <Row label="Case Stage" value={data.caseStageLabel} />
                    <Row label="Status" value={data.caseStatus} />
                    {data.caseStatus === 'Disposed' && (
                      <>
                        <Row label="Decision Date" value={formatDate(data.decisionDate)} />
                        <Row label="Disposal Nature" value={data.disposalNature} />
                      </>
                    )}
                  </Card>

                  {data.caseStatus !== 'Disposed' && (
                    <Card headerTitle="Next Hearing">
                      <Row label="Date" value={formatDate(data.nextHearingDate)} />
                      <Row label="Purpose" value={data.nextHearingPurpose} />
                      <Row label="First Hearing" value={formatDate(data.firstHearingDate)} />
                      <Row label="Hearing Mode" value={data.hearingMode} />
                    </Card>
                  )}

                  <Card headerTitle="Parties & Advocates">
                    <PartyList title="Petitioner" parties={data.petitionerNames} />
                    <PartyList title="Respondent" parties={data.respondentNames} />
                    <PartyList title="Advocates" parties={data.advocateNames} />
                  </Card>

                  <Card headerTitle="Acts, Sections & FIR">
                    {data.actsSections?.map((a, i) => <Text key={i} style={styles.listItem}>{'•'} {a}</Text>)}
                    <Row label="Police Station" value={data.firPoliceStation} />
                    <Row label="FIR Number" value={data.firNumber} />
                    <Row label="FIR Year" value={data.firYear} />
                  </Card>

                  {data.iaDetails?.length > 0 && (
                    <Card headerTitle="Interlocutory Applications (incl. Bail)">
                      {data.iaDetails.map((ia, i) => (
                        <View key={i} style={styles.iaItem}>
                          <Text style={styles.iaType}>{ia.iaType} <Text style={styles.iaStatus}>({ia.status})</Text></Text>
                          <Text style={styles.iaMeta}>{ia.iaNumber} · filed {formatDate(ia.filingDate)}</Text>
                        </View>
                      ))}
                    </Card>
                  )}

                  {data.hearingHistory?.length > 0 && (
                    <Card headerTitle="Hearing History">
                      {data.hearingHistory.slice().reverse().map((h, i) => (
                        <View key={i} style={styles.historyItem}>
                          <Text style={styles.historyDate}>{formatDate(h.date)}</Text>
                          <Text style={styles.historyBusiness}>{h.business}</Text>
                        </View>
                      ))}
                    </Card>
                  )}

                  {data.orders?.length > 0 && (
                    <Card headerTitle="Orders & Judgments">
                      {data.orders.slice().reverse().map((o, i) => (
                        <View key={i} style={styles.historyItem}>
                          <Feather name={o.type === 'Judgment' ? 'award' : 'file'} size={14} color={colors.primaryDark} style={{ marginRight: spacing.xs }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyBusiness}>{o.title}</Text>
                            <Text style={styles.historyDate}>{formatDate(o.date)}</Text>
                          </View>
                        </View>
                      ))}
                    </Card>
                  )}

                  {hasIaOrOther && (
                    <Card headerTitle="Other Details">
                      <Row label="Originating Case No." value={data.originatingCaseNumber} />
                      <Row label="Connected Cases" value={data.connectedCases?.join(', ')} />
                      <Row label="Transfer History" value={data.transferHistory?.length ? `${data.transferHistory.length} transfer(s) on record` : null} />
                      <Row label="Objections" value={data.objections?.length ? `${data.objections.length} objection(s) raised` : null} />
                    </Card>
                  )}

                  <Text style={styles.disclaimer}>{data.note}</Text>
                </>
              );
            }}
          </QueryBoundary>
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

  switcherRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  switcherPill: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  switcherPillActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  switcherPillText: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 13 },
  switcherPillTextActive: { color: colors.white },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.md },
  rowLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  rowValue: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, flex: 1.4, textAlign: 'right' },
  statusPill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: spacing.sm },
  statusPillText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  progressText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 19, marginTop: spacing.xs },

  partyGroup: { marginBottom: spacing.sm },
  partyGroupTitle: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  partyName: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  partyRole: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },

  listItem: { ...typography.body, color: colors.textPrimary, fontSize: 13, marginBottom: 4 },

  iaItem: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border + '50' },
  iaType: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 },
  iaStatus: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },
  iaMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  historyItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border + '50' },
  historyDate: { ...typography.caption, color: colors.textSecondary, width: 90 },
  historyBusiness: { ...typography.body, color: colors.textPrimary, fontSize: 13, flex: 1 },

  disclaimer: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxxl },
});
