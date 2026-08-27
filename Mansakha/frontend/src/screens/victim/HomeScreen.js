import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { dashboardContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import Card from '../../components/Card';
import RiskBadge from '../../components/RiskBadge';
import DesktopHeaderActions from '../../components/DesktopHeaderActions';
import TopRightActions from '../../components/TopRightActions';
import { QueryBoundary } from '../../components/QueryStates';
import { useVictimDashboard, useUpcomingSessions } from '../../services/hooks';

export default function HomeScreen({ navigation }) {
  const query = useVictimDashboard();
  const sessionsQuery = useUpcomingSessions();
  const upcomingSessions = sessionsQuery.data?.sessions || [];
  const { tier, isDesktop } = useResponsive();
  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      <QueryBoundary query={query}>
        {(data) => {
          const score = data.currentDistressLevel?.score ?? 34;
          const riskLevel = data.currentDistressLevel?.riskLevel ?? 'Moderate';

          return (
            <>
              {/* Top Profile Header */}
              <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
                <View style={styles.headerLeft}>
                  {isDesktop ? (
                    <Feather name="user" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
                  ) : (
                    <View style={styles.avatarContainer}>
                      <Feather name="user" size={32} color={colors.primary} />
                      <View style={styles.avatarEditBadge}>
                        <Feather name="shield" size={10} color={colors.white} />
                      </View>
                    </View>
                  )}

                  <View style={styles.headerInfo}>
                    {!isDesktop && (
                      <View style={styles.pillBadge}>
                        <Text style={styles.pillText}>{data.caseStatus.caseStage}</Text>
                      </View>
                    )}
                    <Text style={styles.statusTitle}>{data.caseStatus.status}</Text>
                    {!isDesktop && (
                      <Text style={styles.subtext}>
                        {data.nextCheckIn
                          ? `Next: ${new Date(data.nextCheckIn).toLocaleDateString()}`
                          : 'Active Portal'}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.headerRight}>
                  {isDesktop ? (
                    <DesktopHeaderActions
                      fullName={data.fullName}
                      alertCount={data.alerts.length}
                      onBellPress={() => navigation?.navigate('support')}
                    />
                  ) : (
                    <TopRightActions />
                  )}
                </View>
              </View>

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
                      <View style={styles.scoreBadgeRow}>
                        <Text style={styles.scoreNumber}>{score}/100</Text>
                        <View style={styles.riskBadgeWrapper}>
                          <RiskBadge riskLevel={riskLevel} />
                        </View>
                      </View>
                      <Text style={styles.distressSubtext}>
                        Next check-in: {data.nextCheckIn ? new Date(data.nextCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today, 4:00 PM'}
                      </Text>
                    </View>

                    {/* Circular Percentage Badge */}
                    <View style={styles.percentageCircle}>
                      <Text style={styles.percentageText}>{score}%</Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  <Pressable
                    style={styles.distressBtn}
                    onPress={() => navigation?.navigate('checkin')}
                  >
                    <Feather name="mic" size={18} color={colors.white} style={{ marginRight: spacing.sm }} />
                    <Text style={styles.distressBtnText}>Start Check-in</Text>
                  </Pressable>
                </View>

                {/* Quick Actions Header */}
                <Text style={styles.sectionHeaderTitle}>Quick Actions</Text>

                {/* 2x2 Quick Actions Grid */}
                <View style={styles.gridContainer}>
                  <Pressable
                    style={[styles.gridCard, isDesktop && styles.gridCardDesktop]}
                    onPress={() => navigation?.navigate('Chatbot')}
                  >
                    <View style={styles.gridIconCircle}>
                      <Feather name="message-circle" size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.gridTitle}>Talk to Mansakha</Text>
                    <Text style={styles.gridSub}>Safe AI chatbot</Text>
                  </Pressable>

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

                  <Pressable
                    style={[styles.gridCard, isDesktop && styles.gridCardDesktop]}
                    onPress={() => navigation?.navigate('support')}
                  >
                    <View style={styles.gridIconCircle}>
                      <Feather name="phone-call" size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.gridTitle}>Support Helpline</Text>
                    <Text style={styles.gridSub}>Connect with experts</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.gridCard, isDesktop && styles.gridCardDesktop]}
                    onPress={() => navigation?.navigate('Journal')}
                  >
                    <View style={styles.gridIconCircle}>
                      <Feather name="book-open" size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.gridTitle}>My Journal</Text>
                    <Text style={styles.gridSub}>Write it down</Text>
                  </Pressable>
                </View>

                {/* Upcoming Counselling Session - scheduled by the assigned
                    Counsellor (Feature Catalog Section 2.2), previously
                    invisible to the victim entirely. */}
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
            </>
          );
        }}
      </QueryBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  statusTitle: { ...typography.h3, color: colors.primaryDark },
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
    ...shadow.card,
  },
  gridCardDesktop: { width: '23%' },
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