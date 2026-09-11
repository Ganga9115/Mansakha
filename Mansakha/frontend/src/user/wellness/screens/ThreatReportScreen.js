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
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useThreatStatus } from '../../shared/services/hooks';

// Protection status view. The reporting form that used to live here is
// gone - see NoProtectionYet below for why.
function StatusCard({ data }) {
  return (
    <>
      <Card>
        <View style={styles.statusHeaderRow}>
          <Text style={styles.cardTitle}>Your Protection Status</Text>
          <View style={[styles.statusPill, data.status === 'Resolved' ? styles.statusPillResolved : styles.statusPillOpen]}>
            <Text style={[styles.statusPillText, data.status === 'Resolved' ? styles.statusPillTextResolved : styles.statusPillTextOpen]}>
              {data.status === 'Resolved' ? 'Resolved' : 'Active'}
            </Text>
          </View>
        </View>
        {/* What the Protection Officer actually recorded on Mark Resolved -
            not just a bare "Resolved" status with no explanation. */}
        {data.status === 'Resolved' && data.outcome ? (
          <View style={styles.outcomeBox}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.outcomeCategory}>{data.outcome.category}</Text>
              {!!data.outcome.detail && <Text style={styles.outcomeDetail}>{data.outcome.detail}</Text>}
            </View>
          </View>
        ) : (
          <Text style={styles.pendingText}>
            {data.updates.length === 0
              ? 'Your report has been received. The assigned Protection Officer will act on it shortly.'
              : 'Latest updates from your assigned Protection Officer:'}
          </Text>
        )}
      </Card>

      {data.updates.map((u, idx) => (
        <View key={idx} style={styles.updateRow}>
          <Feather name="shield" size={14} color={colors.success} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.updateText}>{u.noteText}</Text>
            <Text style={styles.updateDate}>{new Date(u.createdAt).toLocaleString('en-IN')}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

// Nothing to report FROM here any more - "Report a Threat" was removed as a
// separate victim action. It reached the same Protection Officer queue as
// the Emergency Call, only slower and without the emergency framing, which
// meant a victim in danger had to choose between two near-identical buttons.
// Urgent danger goes through Get Help Now; a considered, planned request
// goes through Request Assistance (Witness Protection / Relocation). This
// screen is now purely the status view for whichever of those is active.
function NoProtectionYet() {
  return (
    <Card>
      <View style={styles.statusHeaderRow}>
        <Text style={styles.cardTitle}>Your Protection Status</Text>
      </View>
      <Text style={styles.pendingText}>
        No protection request is active right now. If you are in immediate danger, use Get Help Now - it alerts your
        Protection Officer with your location straight away. For planned protection or relocation, apply through
        Request Assistance.
      </Text>
    </Card>
  );
}

export default function ThreatReportScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const statusQuery = useThreatStatus();

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
            <Feather name="shield" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Protection</Text>
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
            {(data) => (data?.hasReport ? <StatusCard data={data} /> : <NoProtectionYet />)}
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

  alertIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15 },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 90, textAlignVertical: 'top', color: colors.textPrimary, marginBottom: spacing.md, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },

  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  statusPill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillOpen: { backgroundColor: colors.warningLight },
  statusPillResolved: { backgroundColor: colors.successLight },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  statusPillTextOpen: { color: colors.warning },
  statusPillTextResolved: { color: colors.success },
  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  outcomeBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  outcomeCategory: { ...typography.bodyStrong, color: colors.success, fontSize: 14 },
  outcomeDetail: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },

  updateRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  updateText: { ...typography.bodySmall, color: colors.textPrimary, lineHeight: 19 },
  updateDate: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
});
