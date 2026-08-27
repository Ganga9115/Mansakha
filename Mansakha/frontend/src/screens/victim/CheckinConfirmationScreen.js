import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import StatusBadge from '../../components/StatusBadge';

export default function CheckinConfirmationScreen({ navigation, route }) {
  const { tier } = useResponsive();
  const { riskLevel, summary, alertTriggered } = route?.params || {};

  const handleGoHome = () => {
    // 1. Pop all screens off the current stack back to the root CheckinScreen
    if (navigation.canGoBack()) {
      navigation.popToTop();
    }
    // 2. Switch to the Home screen tab
    navigation.navigate('home');
  };

  return (
    <View style={styles.container}>
      <View style={{ maxWidth: formContentWidth[tier], width: '100%', alignItems: 'center' }}>
        {/* Illustration Asset */}
        <View style={styles.illustrationWrapper}>
          <Image
            source={require('../../assets/success-illustration.png')}
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

        {/* Primary Action Button to Homescreen */}
        <Pressable style={styles.primaryBtn} onPress={handleGoHome}>
          <Text style={styles.primaryBtnText}>Go to Homescreen</Text>
        </Pressable>
      </View>
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
  primaryBtn: {
    width: '100%',
    backgroundColor: '#8BCBF9',
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  primaryBtnText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});