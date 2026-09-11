import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import { useUserDashboard, useRehabilitationProgress } from '../../shared/services/hooks';
import { useActiveCase } from '../../shared/context/ActiveCaseContext';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Timeline item status styling helper
function getTimelineStatusMeta(status) {
  switch (status) {
    case 'Completed':
      return { bg: '#E6F4EA', color: '#1E8E3E', icon: 'check-circle', label: 'Completed' };
    case 'In Progress':
    case 'Open':
      return { bg: '#E8F0FE', color: '#1A73E8', icon: 'clock', label: 'In Progress' };
    default:
      return { bg: '#F1F5F9', color: '#64748B', icon: 'clock', label: 'Pending' };
  }
}

function TimelineItem({ item, isLast }) {
  const meta = getTimelineStatusMeta(item.status);
  const isCompleted = item.status === 'Completed';
  const isInProgress = item.status === 'In Progress' || item.status === 'Open';

  return (
    <View style={styles.timelineRow}>
      {/* Timeline left indicator column */}
      <View style={styles.timelineLeftColumn}>
        <View
          style={[
            styles.timelineIconContainer,
            isCompleted && styles.timelineIconCompleted,
            isInProgress && styles.timelineIconInProgress,
          ]}
        >
          <Feather
            name={isCompleted ? 'check' : isInProgress ? 'refresh-cw' : 'lock'}
            size={12}
            color={isCompleted ? '#FFFFFF' : isInProgress ? '#1A73E8' : '#94A3B8'}
          />
        </View>
        {!isLast && <View style={[styles.timelineLine, isCompleted && styles.timelineLineCompleted]} />}
      </View>

      {/* Timeline item content card */}
      <View style={styles.timelineContentCard}>
        <View style={styles.timelineContentLeft}>
          <View style={styles.itemIconTile}>
            <Feather name={item.icon || 'file-text'} size={18} color="#1E293B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{item.title || item.noteText || 'Rehabilitation Step'}</Text>
            <Text style={styles.itemSubtext}>
              {item.description || item.subtext || 'Regular progress update and support.'}
            </Text>
          </View>
        </View>

        <View style={styles.timelineContentRight}>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Feather name={meta.icon} size={11} color={meta.color} />
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.timelineDateText}>
            {formatDate(item.createdAt || item.startedAt) || '09 Sept 2026'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PhaseCard({ phase }) {
  const updates = phase.updates || [];
  const defaultSteps = [
    {
      title: 'Assessment & Placement',
      description: 'Initial assessment and placement in rehabilitation program.',
      status: 'Completed',
      createdAt: phase.startedAt,
      icon: 'file-text',
    },
    {
      title: 'Counselling & Support',
      description: 'Regular counselling sessions and family support.',
      status: phase.status === 'Resolved' ? 'Completed' : 'In Progress',
      createdAt: phase.startedAt,
      icon: 'users',
    },
    {
      title: 'Skill Development',
      description: 'Vocational training and skill development program.',
      status: 'Pending',
      icon: 'settings',
    },
    {
      title: 'Reintegration',
      description: 'Follow-up and community reintegration support.',
      status: 'Pending',
      icon: 'home',
    },
  ];

  const displayList = updates.length > 0 ? updates : defaultSteps;

  return (
    <>
      {/* Top Main Status Banner Card */}
      <View style={styles.cardContainer}>
        <View style={styles.topCardLeft}>
          <View style={styles.topIconTile}>
            <Feather name="users" size={20} color="#1E293B" />
          </View>
          <View>
            <Text style={styles.topCardTitle}>Rehabilitation Phase</Text>
            <Text style={styles.topCardSubtext}>
              Coordinated by Government Rehabilitation Center & NGO Partner
            </Text>
            <View style={styles.inProgressPill}>
              <View style={styles.greenDot} />
              <Text style={styles.inProgressText}>
                {phase.status === 'Resolved' ? 'Completed' : 'In Progress'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.topCardRight}>
          <View style={styles.metaStatRow}>
            <View style={styles.metaIconBox}>
              <Feather name="calendar" size={14} color="#64748B" />
            </View>
            <View>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{phase.status === 'Resolved' ? 'Completed' : 'Ongoing'}</Text>
            </View>
          </View>

          <View style={[styles.metaStatRow, { marginTop: spacing.xs }]}>
            <View style={styles.metaIconBox}>
              <Feather name="calendar" size={14} color="#64748B" />
            </View>
            <View>
              <Text style={styles.metaLabel}>Started On</Text>
              <Text style={styles.metaValue}>{formatDate(phase.startedAt) || '09 Sept 2026'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Main Rehabilitation Timeline Container */}
      <View style={styles.cardContainer}>
        <View style={styles.timelineHeaderRow}>
          <View style={styles.timelineHeaderIconTile}>
            <Feather name="sliders" size={18} color="#1E293B" />
          </View>
          <View>
            <Text style={styles.topCardTitle}>Rehabilitation Timeline</Text>
            <Text style={styles.topCardSubtext}>
              Your rehabilitation journey is being managed by the government rehabilitation center and NGO partner.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.md }}>
          {displayList.map((item, index) => (
            <TimelineItem key={index} item={item} isLast={index === displayList.length - 1} />
          ))}
        </View>

        {/* Info Disclaimer Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoIconCircle}>
            <Feather name="info" size={14} color="#1A73E8" />
          </View>
          <Text style={styles.infoBannerText}>
            Your progress is being regularly monitored by the government rehabilitation center and NGO partner. You will be updated about any changes.
          </Text>
        </View>
      </View>
    </>
  );
}

export default function RehabilitationProgressScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  // Falls back to whichever docket is active in Settings/Profile (see
  // ActiveCaseContext.js) when this screen wasn't navigated to with an
  // explicit docket already.
  const { activeCaseUserId } = useActiveCase();
  const caseUserId = route?.params?.caseUserId || activeCaseUserId;
  const dashboardQuery = useUserDashboard(caseUserId);
  const rehabilitationQuery = useRehabilitationProgress(caseUserId);

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
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
                    <PhaseCard key={phase.referralId || i} phase={phase} />
                  ))}
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
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 1080, alignSelf: 'center' },

  /* Card styling matching design */
  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg || 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    flexDirection: 'column',
  },

  /* Top Card Layout */
  topCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  topIconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCardTitle: {
    ...typography.h3,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  topCardSubtext: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  topCardRight: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
  },
  metaValue: {
    ...typography.bodyStrong,
    fontSize: 12,
    color: colors.textPrimary,
  },

  /* In Progress Pill */
  inProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    gap: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E8E3E',
  },
  inProgressText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: '#1E8E3E',
  },

  /* Timeline Header */
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  timelineHeaderIconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Timeline Row Items */
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
  },
  timelineLeftColumn: {
    width: 36,
    alignItems: 'center',
    paddingTop: 14,
  },
  timelineIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineIconCompleted: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  timelineIconInProgress: {
    backgroundColor: '#E8F0FE',
    borderColor: '#1A73E8',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 2,
    marginBottom: -12,
  },
  timelineLineCompleted: {
    backgroundColor: '#1A73E8',
  },

  /* Timeline Card Content */
  timelineContentCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineContentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  itemIconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.textPrimary,
  },
  itemSubtext: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineContentRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  timelineDateText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },

  /* Bottom Disclaimer Banner */
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  infoIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerText: {
    ...typography.caption,
    fontSize: 11,
    color: '#1A73E8',
    flex: 1,
    lineHeight: 16,
  },
});