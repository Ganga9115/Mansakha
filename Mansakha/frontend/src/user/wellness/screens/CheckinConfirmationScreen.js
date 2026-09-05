import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { riskLevel, summary, alertTriggered } = route?.params || {};

  return (
    <View style={styles.container}>
      <View style={[styles.helpButtonWrapper, { top: insets.top + spacing.md }]}>
        <GetHelpButton asHeaderIcon />
      </View>
      <View style={{ maxWidth: formContentWidth[tier], width: '100%', alignItems: 'center', paddingBottom: !isDesktop ? 100 : 0 }}>
        {/* Illustration Asset */}
        <View style={styles.illustrationWrapper}>
          <Image
            source={require('../../shared/assets/success-illustration.png')}
            style={styles.illustration}
            resizeMode="contain"
          />
        </View>

        {/* Main Success Title */}
        <Text style={styles.title}>SUCCESS!!</Text>

        {/* Simplified Assessment Text */}
        <Text style={styles.body}>Successfully completed the assessment</Text>

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
      </View>
      {!isDesktop && <BottomNavBar currentTab="CheckIn" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
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
});