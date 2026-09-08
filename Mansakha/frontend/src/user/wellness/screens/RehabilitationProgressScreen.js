import React from 'react';
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
import { useUserDashboard, useRehabilitationProgress } from '../../shared/services/hooks';

// Status pill styling for a phase - mirrors RequestInterventionScreen.js's
// own STATUS_META/statusPill convention (Pending/Accepted/Rejected there),
// adapted to this endpoint's two statuses.
const STATUS_META = {
  Open: { color: colors.warning, bg: colors.warningLight, icon: 'clock' },
  Resolved: { color: colors.success, bg: colors.successLight, icon: 'check-circle' },
};

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

function PhaseCard({ phase, index, showIndex }) {
  const meta = STATUS_META[phase.status] || STATUS_META.Open;
  const updates = phase.updates || [];

  return (
    <Card headerTitle={showIndex ? `Rehabilitation Phase ${index + 1}` : 'Rehabilitation Phase'}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Status</Text>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Feather name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{phase.status}</Text>
        </View>
      </View>
      <Row label="Started" value={formatDate(phase.startedAt)} />
      <Row label="Completed" value={formatDate(phase.completedAt)} />

      {updates.length > 0 && (
        <View style={styles.updatesSection}>
          <Text style={styles.updatesSectionTitle}>Progress Updates</Text>
          {updates.slice().reverse().map((u, i) => (
            <View key={i} style={styles.historyItem}>
              <Text style={styles.historyDate}>{formatDate(u.createdAt)}</Text>
              <Text style={styles.historyBusiness}>{u.noteText}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export default function RehabilitationProgressScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const rehabilitationQuery = useRehabilitationProgress();

  return (
    <View style={styles.container}>
      {/* Fixed top bar - a sibling of the ScrollView below, not its first
          child, so it stays pinned while the body scrolls underneath it
          (matches CaseDetailsScreen.js/JournalScreen.js's actual structure -
          AtrocitiesActScreen claims to follow the same pattern but puts its
          header inside the ScrollView instead, which scrolls it away with
          the content; that reads as a broken/missing top bar on web/desktop
          specifically, where a fixed header is the expected behavior). */}
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
            <Feather name="sunrise" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Rehabilitation Progress</Text>
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
          <QueryBoundary query={rehabilitationQuery}>
            {(data) => {
              const phases = data?.phases || [];

              if (phases.length === 0) {
                return (
                  <EmptyState
                    icon="sunrise"
                    title="No rehabilitation phase yet"
                    message="This appears here once one begins."
                  />
                );
              }

              return (
                <>
                  {phases.map((phase, i) => (
                    <PhaseCard key={phase.referralId} phase={phase} index={i} showIndex={phases.length > 1} />
                  ))}

                  <Text style={styles.disclaimer}>
                    Your rehabilitation phase is coordinated by your government rehabilitation center or NGO
                    partner and updated by your assigned Rehabilitation Officer.
                  </Text>
                </>
              );
            }}
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

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.md },
  rowLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  rowValue: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, flex: 1.4, textAlign: 'right' },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillText: { ...typography.caption, fontWeight: '700', fontSize: 10 },

  updatesSection: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border + '50' },
  updatesSectionTitle: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  historyItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border + '50' },
  historyDate: { ...typography.caption, color: colors.textSecondary, width: 90 },
  historyBusiness: { ...typography.body, color: colors.textPrimary, fontSize: 13, flex: 1 },

  disclaimer: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxxl },
});
