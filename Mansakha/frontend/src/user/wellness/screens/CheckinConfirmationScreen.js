import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import StatusBadge from '../../shared/components/StatusBadge';
import GetHelpButton from '../../shared/components/GetHelpButton';
import BottomNavBar from '../../shared/components/BottomNavBar';

// The only screen in the app with no header bar at all (a full-screen,
// centered "success" card), which meant it was also the only screen without
// the Get Help Now emergency button every other screen carries via
// TopRightActions/DesktopHeaderActions - confirmed missing here specifically
// (grep found it on all 10 other user screens). Floated top-right rather
// than building a header bar just for this one screen, so the existing
// celebratory layout stays intact.
export default function CheckinConfirmationScreen({ route, navigation }) {
  const { tier, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { scored, riskLevel, summary, alertTriggered, questionsAnswered, questionsUntilFirstScore } = route?.params || {};

  // Reaching into this screen's own nested stack (CheckinMain ->
  // CheckinConfirmation) from 3 navigators away - the bottom nav bar or
  // sidebar, through MainTabs' plain wrapper component - silently failed to
  // route at all, not just failed to reset. Doing it locally instead:
  // `navigation` here is this stack's OWN navigation prop (this screen IS a
  // CheckinStack.Screen - see UserShell.js), so popToTop() is a direct,
  // always-reliable call with no cross-navigator ambiguity. It fires the
  // moment this screen blurs - whichever way the user leaves it (Back to
  // Home, View My Check-Ins, a different tab, browser back) - so by the
  // time they return to the Check-in tab through any path, the stack is
  // already sitting back on CheckinMain.
  useFocusEffect(
    useCallback(() => {
      return () => {
        navigation.popToTop();
      };
    }, [navigation])
  );

  return (
    <View style={styles.container}>
      <View style={[styles.helpButtonWrapper, { top: insets.top + spacing.md }]}>
        <GetHelpButton asHeaderIcon />
      </View>
      {/* Now scrollable, not just centered - the two new buttons and the
          quote card pushed total content height past what a fixed,
          non-scrolling View could safely guarantee fitting on a small
          phone screen. */}
      <ScrollView
        style={{ width: '100%' }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: insets.top + spacing.xxl,
          paddingHorizontal: spacing.xl,
          paddingBottom: !isDesktop ? 100 : spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ maxWidth: formContentWidth[tier], width: '100%', alignItems: 'center' }}>
        {/* Illustration Asset */}
        <View style={styles.illustrationWrapper}>
          <Image
            source={require('../../shared/assets/success-illustration.png')}
            style={styles.illustration}
            resizeMode="contain"
          />
        </View>

        {/* Main Success Title */}
        <Text style={styles.title}>Check-In Completed!</Text>

        {/* Simplified Assessment Text */}
        <Text style={styles.body}>Thank you for taking a moment for yourself. You're doing great!</Text>

        {/* Below the first-scoring threshold, there's no distress level yet -
            explain why instead of just silently omitting the badge, so it
            doesn't read as a missing/broken feature. */}
        {scored === false && typeof questionsAnswered === 'number' && (
          <View style={styles.progressCard}>
            <Feather name="trending-up" size={16} color={colors.primary} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.progressCardTitle}>Building your profile</Text>
            <Text style={styles.progressCardText}>
              {questionsAnswered}/105 questions answered - {questionsUntilFirstScore} more until your first personalized insight.
            </Text>
          </View>
        )}

        {/* AI-derived distress level + summary from this check-in's conversation */}
        {(riskLevel || summary) && (
          <View style={styles.summaryCard}>
            {riskLevel && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>DISTRESS LEVEL</Text>
                <StatusBadge status={riskLevel} />
              </View>
            )}
            {summary && (
              <>
                <Text style={styles.summaryLabel}>WHAT MANSAKHA HEARD</Text>
                <Text style={styles.summaryText}>{summary}</Text>
              </>
            )}
            {alertTriggered && (
              <Text style={styles.alertNote}>
                Based on this check-in, your Counsellor has been notified so they can reach out to you.
              </Text>
            )}
          </View>
        )}

        <View style={styles.quoteCard}>
          <Feather name="feather" size={16} color={colors.primary} style={styles.quoteIcon} />
          <Text style={styles.quoteText}>Every small step counts towards a healthier, happier you.</Text>
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('MainTabs', { screen: 'home' })}
        >
          <Feather name="home" size={18} color={colors.onPrimary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('MainTabs', { screen: 'history' })}
        >
          <Feather name="bar-chart-2" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.secondaryBtnText}>View My Check-Ins</Text>
        </Pressable>
      </View>
      </ScrollView>
      {!isDesktop && <BottomNavBar currentTab="CheckIn" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryLight,
  },
  helpButtonWrapper: {
    position: 'absolute',
    top: spacing.xxl,
    right: spacing.xl,
    zIndex: 10,
  },
  illustrationWrapper: {
    width: 260,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.primary,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  progressCard: {
    width: '100%',
    backgroundColor: colors.primaryLight + '80',
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  progressCardTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginBottom: spacing.xs,
  },
  progressCardText: {
    ...typography.bodySmall,
    color: colors.primary,
    lineHeight: 19,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  summaryText: { ...typography.body, color: colors.textPrimary },
  alertNote: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
    lineHeight: 16,
  },
  quoteCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  quoteIcon: {
    marginTop: 2,
  },
  quoteText: {
    ...typography.bodySmall,
    color: colors.primaryDark,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 19,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  primaryBtnText: {
    ...typography.bodyStrong,
    color: colors.onPrimary,
    fontSize: 15,
  },
  secondaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  secondaryBtnText: {
    ...typography.bodyStrong,
    color: colors.primary,
    fontSize: 15,
  },
});