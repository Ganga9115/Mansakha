import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { dashboardContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import RiskBadge from '../../shared/components/RiskBadge';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useUpcomingSessions, useAssignedCounsellor } from '../../shared/services/hooks';

export default function HomeScreen({ navigation }) {
  const query = useUserDashboard();
  const sessionsQuery = useUpcomingSessions();
  const upcomingSessions = sessionsQuery.data?.sessions || [];
  const assignedCounsellorQuery = useAssignedCounsellor();
  const hasAssignedCounsellor = !!assignedCounsellorQuery.data?.assigned;
  const { tier, isDesktop } = useResponsive();
  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  return (
    <View style={styles.screen}>
      <QueryBoundary query={query}>
        {(data) => {
          // Was defaulting to a fake "34/100, Moderate" whenever no real
          // score existed yet - a brand-new user who had never checked in
          // would see a specific, invented distress reading as if it were
          // real. hasScore now drives a genuine empty state instead.
          const hasScore = data.currentDistressLevel?.score != null;
          const score = data.currentDistressLevel?.score ?? null;
          const riskLevel = data.currentDistressLevel?.riskLevel ?? null;

          return (
            <>
              {/* Top Profile Header - a sibling of the ScrollView below, not
                  a child of it, so it stays pinned in place while the body
                  scrolls underneath instead of scrolling away with it. */}
              <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
                <View style={styles.headerLeft}>
                  {isDesktop ? (
                    <Feather name="home" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
                  ) : (
                    <View style={styles.avatarContainer}>
                      <Feather name="home" size={28} color={colors.primary} />
                    </View>
                  )}

                  <View style={styles.headerInfo}>
                    <Text style={styles.pageTitle}>Home</Text>
                  </View>
                </View>

                <View style={styles.headerRight}>
                  {isDesktop ? (
                    <DesktopHeaderActions
                      fullName={data.fullName}
                      alertCount={data.alerts.length}
                      onBellPress={() => {}}
                      showNotifications
                    />
                  ) : (
                    <TopRightActions showNotifications />
                  )}
                </View>
              </View>

              <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
              {/* Main Rounded Body Area */}
              <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: dashboardContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
                {/* Date Ticker */}
                <View style={styles.dateTicker}>
                  <Text style={styles.tickerText}>{dayStr}</Text>
                  <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
                  <Text style={styles.tickerText}>{yearStr}</Text>
                </View>

                {/* Distress Score Hero Card */}
                <View style={styles.distressCard}>
                  <View style={styles.distressTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.distressLabel}>Distress Score</Text>
                      {hasScore ? (
                        <View style={styles.scoreBadgeRow}>
                          <Text style={styles.scoreNumber}>{score}/100</Text>
                          <View style={styles.riskBadgeWrapper}>
                            <RiskBadge riskLevel={riskLevel} />
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.noScoreText}>Complete your first check-in to see your score here.</Text>
                      )}
                    </View>

                    {/* Circular Percentage Badge */}
                    {hasScore && (
                      <View style={styles.percentageCircle}>
                        <Text style={styles.percentageText}>{score}%</Text>
                      </View>
                    )}
                  </View>

                  {/* Action Button */}
                  <Pressable
                    style={styles.distressBtn}
                    onPress={() => navigation?.navigate('checkin')}
                  >
                    <Feather name="mic" size={18} color={colors.white} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.distressBtnText}>Start Check-in</Text>
                  </Pressable>

                  {/* Tier-based recommendation, in the same tile as the score
                      it's derived from - Low -> lifestyle activities,
                      Moderate -> wellness activities, High -> talk to/opt
                      into counselling, Critical -> seek professional medical
                      help. Driven by whichever channel (AI chat, IVRS call,
                      or the 15-question check-in) most recently produced a
                      distress_scores row. */}
                  {/* Heart + short "Recommendation" label on the left, a
                      short action button on the right - no more full
                      sentence-per-tier copy (felt like too much text). */}
                  {data.recommendation && (
                    <View style={styles.recommendationInline}>
                      <View style={styles.recommendationRow}>
                        <Feather name="heart" size={16} color={colors.primaryDark} style={{ marginRight: spacing.sm }} />
                        <Text style={styles.recommendationLabel}>Recommendation</Text>
                        {data.recommendation.actionType === 'wellness' && (
                          <Pressable style={styles.recommendationPill} onPress={() => navigation?.navigate('Wellbeing')}>
                            <Text style={styles.recommendationPillText}>My Well-being</Text>
                          </Pressable>
                        )}
                        {data.recommendation.actionType === 'counsellor_chat' && (
                          <Pressable style={styles.recommendationPill} onPress={() => navigation?.navigate('mycounsellor')}>
                            <Text style={styles.recommendationPillText}>Chat with Counsellor</Text>
                          </Pressable>
                        )}
                        {data.recommendation.actionType === 'opt_in_counsellor' && (
                          <Pressable style={styles.recommendationPill} onPress={() => navigation?.navigate('settings')}>
                            <Text style={styles.recommendationPillText}>Opt In for Support</Text>
                          </Pressable>
                        )}
                        {data.recommendation.actionType === 'medical' && (
                          <Pressable style={styles.recommendationPill} onPress={() => navigation?.navigate('support')}>
                            <Text style={styles.recommendationPillText}>Helpline Numbers</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                {/* Same background/border/shadow as the Distress Score tile
                    above, per explicit request - a second tile of that same
                    color, not a differently-styled quick-action card. */}
                <Pressable style={styles.actInfoCard} onPress={() => navigation?.navigate('AtrocitiesAct')}>
                  <Feather name="shield" size={18} color={colors.primaryDark} style={{ marginRight: spacing.sm }} />
                  <Text style={styles.actInfoText}>Prevention of Atrocities Act, 1989</Text>
                  <Feather name="chevron-right" size={18} color={colors.primaryDark} />
                </Pressable>

                {/* Quick Actions Header */}
                <Text style={styles.sectionHeaderTitle}>Quick Actions</Text>

                {/* 2x2 Quick Actions Grid */}
                <View style={styles.gridContainer}>
                  <Pressable
                    style={[styles.gridCard, isDesktop && styles.gridCardDesktop]}
                    onPress={() => navigation?.navigate('Wellbeing')}
                  >
                    <View style={styles.gridIconCircle}>
                      <Feather name="trending-up" size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.gridTitle}>My Well-being</Text>
                    <Text style={styles.gridSub}>Check your history</Text>
                  </Pressable>

                  {hasAssignedCounsellor && (
                    <Pressable
                      style={[styles.gridCard, isDesktop && styles.gridCardDesktop]}
                      onPress={() => navigation?.navigate('mycounsellor')}
                    >
                      {!!data.hasUnreadCounsellorMessage && <View style={styles.unreadDot} />}
                      <View style={styles.gridIconCircle}>
                        <Feather name="message-square" size={20} color={colors.primary} />
                      </View>
                      <Text style={styles.gridTitle}>Chat with counsellor</Text>
                      <Text style={styles.gridSub}>Chat directly</Text>
                    </Pressable>
                  )}
                </View>

                {/* Upcoming Counselling Session - scheduled by the assigned
                    Counsellor (Feature Catalog Section 2.2), previously
                    invisible to the user entirely. */}
                {upcomingSessions.length > 0 && (
                  <Card style={styles.customCard}>
                    <Text style={styles.cardHeaderTitle}>Upcoming Session</Text>
                    <View style={{ marginTop: spacing.sm }}>
                      {upcomingSessions.map((s, i) => (
                        <View key={s.sessionId} style={[styles.subRow, i > 0 && styles.rowBorder]}>
                          <Feather name="calendar" size={14} color={colors.primary} style={{ marginRight: spacing.sm }} />
                          <Text style={styles.subRowText}>
                            {s.counsellorName ? `With ${s.counsellorName} • ` : ''}
                            {new Date(s.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                )}

                {/* Recent Activity Section */}
                {data.alerts.length > 0 && (
                  <Card style={styles.customCard}>
                    <Text style={styles.cardHeaderTitle}>Recent Activity</Text>
                    <View style={{ marginTop: spacing.sm }}>
                      {data.alerts.map((a, i) => (
                        <View key={a.alertId} style={[styles.subRow, i > 0 && styles.rowBorder]}>
                          <View style={styles.dotMarker} />
                          <Text style={styles.subRowText}>
                            {a.status} • {new Date(a.triggeredAt).toLocaleDateString()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                )}
              </View>
              </ScrollView>
            </>
          );
        }}
      </QueryBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primaryLight },
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'center',
  },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  avatarContainerDesktop: { width: 36, height: 36 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    padding: 3,
  },
  headerInfo: { flex: 1 },
  pillBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRight: { marginLeft: spacing.md },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBody: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentBodyDesktop: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  dateTicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  tickerText: { ...typography.bodyStrong, color: colors.primary },
  tickerTextActive: { color: colors.error },
  distressCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  distressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  distressLabel: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 14 },
  noScoreText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  scoreBadgeRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  scoreNumber: { ...typography.display, color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  riskBadgeWrapper: { marginLeft: spacing.sm },
  distressSubtext: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  percentageCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  percentageText: { ...typography.bodyStrong, color: colors.textPrimary, fontWeight: '800' },
  distressBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distressBtnText: { ...typography.bodyStrong, color: colors.white, fontSize: 16 },
  actInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  actInfoText: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  // Inline within distressCard (same tile as the score/Start Check-in
  // button), not a separate card - a top border to visually separate it
  // from the button above, but still one continuous tile.
  recommendationInline: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  // Heart + "Recommendation" label on the left, the action pill on the
  // right - one row, not stacked.
  recommendationRow: { flexDirection: 'row', alignItems: 'center' },
  recommendationLabel: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  // Small pill button, self-sized to its label - no separate message/detail
  // paragraph (felt like too much reading for this tile).
  recommendationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  recommendationPillText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  sectionHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    fontWeight: '700',
  },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  gridCard: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    ...shadow.card,
  },
  gridCardDesktop: { width: '23%' },
  unreadDot: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  gridIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  gridTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14 },
  gridSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  customCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeaderTitle: { ...typography.h3, color: colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  subRowText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.sm, flexShrink: 1 },
  rowBorder: { borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.xs, marginTop: spacing.xs },
  dotMarker: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.warning },
});