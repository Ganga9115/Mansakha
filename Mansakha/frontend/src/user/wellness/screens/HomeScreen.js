import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { dashboardContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import RiskBadge from '../../shared/components/RiskBadge';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import BottomNavBar from '../../shared/components/BottomNavBar';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useUpcomingSessions, useAssignedCounsellor, useRehabilitationProgress } from '../../shared/services/hooks';

export default function HomeScreen({ navigation }) {
  // Case-lifecycle isolation (migration_034): null means "let the backend
  // resolve to the anchor" (today's exact default behaviour). Only ever set
  // to something else by the effect below (auto-isolating into a
  // Rehabilitation-opted-in case) or by the victim's own tap on the case
  // switcher further down - never inferred from anything else.
  const [selectedUserId, setSelectedUserId] = useState(null);
  const query = useUserDashboard(selectedUserId);
  const linkedCases = query.data?.linkedCases || [];
  const activeUserId = query.data?.userId;

  // A case in the Rehabilitation stage that the victim has opted into gets
  // isolated into its own docket-based context automatically - opening the
  // app should show that isolated view immediately, not require a manual
  // switch, while Investigation/Trial/Compensation/Case-Closed cases stay
  // on the normal shared (anchor) context exactly as before. Only runs
  // while the victim hasn't already made an explicit choice via the
  // switcher (selectedUserId still null), so a manual switch away is never
  // silently overridden back.
  useEffect(() => {
    if (selectedUserId || !activeUserId) return;
    const rehabCase = linkedCases.find((c) => c.caseStage === 'Rehabilitation' && c.rehabilitationOptedIn);
    if (rehabCase && rehabCase.userId !== activeUserId) {
      setSelectedUserId(rehabCase.userId);
    }
  }, [linkedCases, activeUserId, selectedUserId]);

  const sessionsQuery = useUpcomingSessions();
  const upcomingSessions = sessionsQuery.data?.sessions || [];
  const assignedCounsellorQuery = useAssignedCounsellor();
  const hasAssignedCounsellor = !!assignedCounsellorQuery.data?.assigned;
  // Scoped to whichever case is currently active - never leaks another
  // case's Rehabilitation referral/phases into this one's view.
  const rehabilitationQuery = useRehabilitationProgress(activeUserId);
  const inRehabilitation = !!rehabilitationQuery.data?.inRehabilitation;
  // "Start Rehabilitation Support" was removed from here - the mandatory
  // app-open decision gate (UserGate.js -> RehabilitationDecisionGate.js)
  // now handles this before Home is ever reached, so an optional tile for
  // the same decision would be unreachable dead UI.
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  return (
    <View style={styles.screen}>
      <QueryBoundary query={query}>
        {(data) => {
          const hasScore = data.currentDistressLevel?.score != null;
          const score = data.currentDistressLevel?.score ?? null;
          const riskLevel = data.currentDistressLevel?.riskLevel ?? null;

          return (
            <>
              {/* Top Profile Header */}
              <View
                style={[
                  styles.topHeader,
                  isDesktop && styles.topHeaderDesktop,
                  !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
                ]}
              >
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

              <ScrollView
                style={styles.container}
                contentContainerStyle={!isDesktop ? styles.scrollContentMobile : null}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                {/* Main Body Area */}
                <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: dashboardContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
                  {/* Date Ticker */}
                  <View style={[styles.dateTicker, !isDesktop && styles.dateTickerMobile]}>
                    <Text style={styles.tickerText}>{dayStr}</Text>
                    <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
                    <Text style={styles.tickerText}>{yearStr}</Text>
                  </View>

                  {/* Case Switcher - migration_034: only shown when this
                      account actually has more than one docket. Each pill
                      shows that case's own current eCourt stage so it's
                      clear which one (if any) is the isolated Rehabilitation
                      context - switching here is the "exit" path back to a
                      victim's other cases from inside that isolation. */}
                  {linkedCases.length > 1 && (
                    <View style={styles.caseSwitcherRow}>
                      {linkedCases.map((c) => (
                        <Pressable
                          key={c.userId}
                          onPress={() => setSelectedUserId(c.userId)}
                          style={[styles.caseSwitcherPill, c.userId === activeUserId && styles.caseSwitcherPillActive]}
                        >
                          <Text style={[styles.caseSwitcherDocket, c.userId === activeUserId && styles.caseSwitcherTextActive]}>
                            Docket {c.docketNumber}
                          </Text>
                          <Text style={[styles.caseSwitcherStage, c.userId === activeUserId && styles.caseSwitcherTextActive]}>
                            {c.caseStage}{c.caseStage === 'Rehabilitation' && c.rehabilitationOptedIn ? ' · Opted In' : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

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

                      {hasScore && (
                        <View style={styles.percentageCircle}>
                          <Text style={styles.percentageText}>{score}%</Text>
                        </View>
                      )}
                    </View>

                    <Pressable
                      style={styles.distressBtn}
                      onPress={() => navigation?.navigate('checkin')}
                    >
                      <Feather name="mic" size={18} color={colors.white} style={{ marginRight: spacing.sm }} />
                      <Text style={styles.distressBtnText}>Start Check-in</Text>
                    </Pressable>

                    {data.recommendation && (
                      <View style={styles.recommendationInline}>
                        <View style={styles.recommendationRow}>
                          <Feather name="heart" size={16} color={colors.primaryDark} style={{ marginRight: spacing.sm }} />
                          <Text style={styles.recommendationLabel}>Recommendation</Text>
                          {data.recommendation.actionType === 'wellness' && (
                            <Pressable style={styles.recommendationPill} onPress={() => navigation?.navigate('wellbeing')}>
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

                  <Pressable style={styles.actInfoCard} onPress={() => navigation?.navigate('AtrocitiesAct')}>
                    <Feather name="shield" size={18} color={colors.primaryDark} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.actInfoText}>Prevention of Atrocities Act, 1989</Text>
                    <Feather name="chevron-right" size={18} color={colors.primaryDark} />
                  </Pressable>

                  {/* Quick Actions Section */}
                  <Text style={styles.sectionHeaderTitle}>Quick Actions</Text>
                  <View style={styles.gridContainer}>
                    <Pressable
                      style={[styles.gridCardRow, isDesktop && styles.gridCardRowDesktop]}
                      onPress={() => navigation?.navigate('CaseDetails', { caseUserId: activeUserId })}
                    >
                      <View style={styles.gridIconSquare}>
                        <Feather name="file-text" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gridTitle}>Case Details</Text>
                        <Text style={styles.gridSub}>Court case status</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                    </Pressable>

                    {/* Request Assistance - victim-initiated intervention
                        requests (User -> District Admin), replacing the old
                        Counsellor-recommended flow entirely. See
                        RequestInterventionScreen.js. */}
                    <Pressable
                      style={[styles.gridCardRow, isDesktop && styles.gridCardRowDesktop]}
                      onPress={() => navigation?.navigate('RequestIntervention')}
                    >
                      <View style={styles.gridIconSquare}>
                        <Feather name="life-buoy" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gridTitle}>Request Assistance</Text>
                        <Text style={styles.gridSub}>Medical, legal aid, financial help & more</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                    </Pressable>

                    {/* Report a Threat - the consolidated Protection Officer
                        flow. See ThreatReportScreen.js. */}
                    <Pressable
                      style={[styles.gridCardRow, isDesktop && styles.gridCardRowDesktop]}
                      onPress={() => navigation?.navigate('ThreatReport')}
                    >
                      <View style={styles.gridIconSquare}>
                        <Feather name="alert-triangle" size={18} color={colors.danger} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gridTitle}>Report a Threat</Text>
                        <Text style={styles.gridSub}>Notify your nearest Protection Officer</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                    </Pressable>

                    {/* Compensation - read-only view of the statutory
                        award and its 3-stage payment tracker. See
                        CompensationScreen.js. */}
                    <Pressable
                      style={[styles.gridCardRow, isDesktop && styles.gridCardRowDesktop]}
                      onPress={() => navigation?.navigate('Compensation', { caseUserId: activeUserId })}
                    >
                      <View style={styles.gridIconSquare}>
                        <Feather name="credit-card" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gridTitle}>Compensation</Text>
                        <Text style={styles.gridSub}>Track your statutory compensation payments</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                    </Pressable>

                    {/* Rehabilitation Progress - only shown once the victim
                        has an open post-case-closure rehabilitation phase
                        (livelihood/housing/schooling support tracked by a
                        Rehabilitation Officer). See
                        RehabilitationProgressScreen.js. */}
                    {inRehabilitation && (
                      <Pressable
                        style={[styles.gridCardRow, isDesktop && styles.gridCardRowDesktop]}
                        onPress={() => navigation?.navigate('RehabilitationProgress', { caseUserId: activeUserId })}
                      >
                        <View style={styles.gridIconSquare}>
                          <Feather name="sunrise" size={18} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.gridTitle}>Rehabilitation Progress</Text>
                          <Text style={styles.gridSub}>Livelihood, housing & more</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                      </Pressable>
                    )}

                  </View>

                  {/* Two Column Layout for Upcoming Sessions and Recent Activity */}
                  <View style={[styles.twoColumnGrid, !isDesktop && styles.singleColumnGrid]}>
                    {/* Upcoming Sessions Card */}
                    <View style={styles.sectionContainerCard}>
                      <View style={styles.sectionCardHeader}>
                        <Text style={styles.cardHeaderTitle}>Upcoming Sessions</Text>
                      </View>

                      {upcomingSessions.length > 0 ? (
                        <View style={styles.sessionsListContainer}>
                          {upcomingSessions.map((s, index) => {
                            const dateObj = new Date(s.scheduledAt);
                            const monthStr = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
                            const dateNum = String(dateObj.getDate()).padStart(2, '0');
                            const dayName = dateObj.toLocaleString('default', { weekday: 'short' }).toUpperCase();
                            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                              <View key={s.sessionId || index} style={styles.sessionItemBox}>
                                <View style={styles.sessionTopRow}>
                                  <View style={styles.dateBlock}>
                                    <View style={styles.dateBlockTop}>
                                      <Text style={styles.dateBlockMonth}>{monthStr}</Text>
                                    </View>
                                    <View style={styles.dateBlockBottom}>
                                      <Text style={styles.dateBlockNum}>{dateNum}</Text>
                                      <Text style={styles.dateBlockDay}>{dayName}</Text>
                                    </View>
                                  </View>

                                  <View style={styles.sessionDetails}>
                                    <View style={styles.upcomingPill}>
                                      <Text style={styles.upcomingPillText}>Upcoming</Text>
                                    </View>
                                    <Text style={styles.sessionTitle}>Counselling Session</Text>
                                    {s.counsellorName && (
                                      <View style={styles.iconMetaRow}>
                                        <Feather name="user" size={13} color={colors.textSecondary} />
                                        <Text style={styles.sessionMetaText}>With {s.counsellorName}</Text>
                                      </View>
                                    )}
                                    <View style={styles.iconMetaRow}>
                                      <Feather name="clock" size={13} color={colors.textSecondary} />
                                      <Text style={styles.sessionMetaText}>{timeStr}</Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={styles.emptyContainer}>
                          <Feather name="calendar" size={24} color={colors.textSecondary} />
                          <Text style={styles.emptyText}>No upcoming sessions scheduled.</Text>
                        </View>
                      )}
                    </View>

                    {/* Recent Activity Card */}
                    <View style={styles.sectionContainerCard}>
                      <View style={styles.sectionCardHeader}>
                        <Text style={styles.cardHeaderTitle}>Recent Activity</Text>
                      </View>

                      {data.alerts.length > 0 ? (
                        data.alerts.map((a, i) => (
                          <View key={a.alertId || i} style={styles.activityRowItem}>
                            <View style={styles.activityStatusIcon}>
                              <Feather
                                name={i === 0 ? "check-circle" : "plus-circle"}
                                size={20}
                                color={i === 0 ? colors.success || "#10B981" : colors.primary}
                              />
                            </View>
                            <View style={styles.activityContent}>
                              <Text style={styles.activityStatusTitle}>{a.status}</Text>
                              <Text style={styles.activitySubtext}>
                                {i === 0 ? "Your case has been acknowledged by the support team." : "Initial case registration completed."}
                              </Text>
                              <View style={styles.activityTimeRow}>
                                <Feather name="clock" size={12} color={colors.textSecondary} />
                                <Text style={styles.activityTimestamp}>
                                  {new Date(a.triggeredAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.activitySideIcon}>
                              <Feather name="file-text" size={16} color={colors.primary} />
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={styles.emptyContainer}>
                          <Feather name="activity" size={24} color={colors.textSecondary} />
                          <Text style={styles.emptyText}>No recent activity found.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Integrated Bottom Navigation Bar for Mobile Views */}
              {!isDesktop && (
                <BottomNavBar currentTab="Home" navigation={navigation} />
              )}
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
  scrollContentMobile: {
    paddingBottom: 100, // Clearance for floating bottom navbar
  },
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
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  headerInfo: { flex: 1 },
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  headerRight: { marginLeft: spacing.md },
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
  dateTickerMobile: {
    marginTop: spacing.sm,
  },
  tickerText: { ...typography.bodyStrong, color: colors.primary },
  tickerTextActive: { color: colors.error },
  caseSwitcherRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  caseSwitcherPill: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  caseSwitcherPillActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  caseSwitcherDocket: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 12 },
  caseSwitcherStage: { ...typography.caption, color: colors.textSecondary, fontSize: 10, marginTop: 1 },
  caseSwitcherTextActive: { color: colors.white },
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
  recommendationInline: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  recommendationRow: { flexDirection: 'row', alignItems: 'center' },
  recommendationLabel: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
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

  /* Quick Actions Styling */
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  gridCardRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    gap: spacing.sm,
    ...shadow.card,
  },
  gridCardRowDesktop: { width: '48.5%' },
  unreadDot: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  gridIconSquare: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  gridSub: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  /* Two-Column Layout */
  twoColumnGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  singleColumnGrid: {
    flexDirection: 'column',
  },
  sectionContainerCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardHeaderTitle: { ...typography.h3, color: colors.textPrimary, fontWeight: '700', fontSize: 16 },

  /* Upcoming Sessions Box */
  sessionsListContainer: {
    gap: spacing.md,
  },
  sessionItemBox: {
    backgroundColor: colors.primaryLight + '50',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dateBlock: {
    width: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateBlockTop: {
    backgroundColor: colors.primary,
    paddingVertical: 4,
    alignItems: 'center',
  },
  dateBlockMonth: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 10 },
  dateBlockBottom: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dateBlockNum: { ...typography.h2, color: colors.textPrimary, fontWeight: '800', fontSize: 18, lineHeight: 20 },
  dateBlockDay: { ...typography.caption, color: colors.textSecondary, fontSize: 10 },

  sessionDetails: { flex: 1, gap: 2 },
  upcomingPill: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  upcomingPillText: { ...typography.caption, color: colors.primary, fontWeight: '700', fontSize: 10 },
  sessionTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  iconMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sessionMetaText: { ...typography.caption, color: colors.textSecondary, fontSize: 12 },

  /* Recent Activity Box */
  activityRowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '50',
    gap: spacing.sm,
  },
  activityStatusIcon: { marginTop: 2 },
  activityContent: { flex: 1 },
  activityStatusTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  activitySubtext: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontSize: 12 },
  activityTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  activityTimestamp: { ...typography.caption, color: colors.textSecondary, fontSize: 10 },
  activitySideIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyText: { ...typography.caption, color: colors.textSecondary },
});