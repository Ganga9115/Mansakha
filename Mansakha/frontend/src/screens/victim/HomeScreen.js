import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Section from '../../components/Section';
import ScreenContainer from '../../components/ScreenContainer';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useVictimDashboard } from '../../services/hooks';

export default function HomeScreen() {
  const query = useVictimDashboard();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Your Dashboard</Text>
      <QueryBoundary query={query}>
        {(data) => (
          <>
            <Section eyebrow="Case status" title="Your case">
              <Card elevated>
                <Text style={styles.value}>{data.caseStatus.status} - {data.caseStatus.caseStage}</Text>
                {!!data.nextCheckIn && (
                  <View style={styles.subRow}>
                    <Feather name="calendar" size={14} color={colors.textSecondary} />
                    <Text style={styles.subRowText}>Next check-in around {new Date(data.nextCheckIn).toLocaleDateString()}</Text>
                  </View>
                )}
              </Card>
            </Section>

            <Section eyebrow="Trend" title="How you've been trending">
              <Card elevated>
                {data.currentDistressLevel ? (
                  <View style={styles.trendRow}>
                    <RiskBadge riskLevel={data.currentDistressLevel.riskLevel} />
                    <Text style={styles.trendText}>Latest check-in</Text>
                  </View>
                ) : (
                  <View style={[styles.subRow, styles.subRowFirst]}>
                    <Feather name="info" size={14} color={colors.textSecondary} />
                    <Text style={styles.subRowText}>No check-ins yet - try the Check-in tab.</Text>
                  </View>
                )}
              </Card>
            </Section>

            {data.alerts.length > 0 && (
              <Section eyebrow="Alerts" title="Recent activity">
                <Card elevated>
                  {data.alerts.map((a, i) => (
                    <View key={a.alertId} style={[styles.subRow, i === 0 && styles.subRowFirst]}>
                      <View style={styles.dot} />
                      <Text style={styles.subRowText}>{a.status} - {new Date(a.triggeredAt).toLocaleDateString()}</Text>
                    </View>
                  ))}
                </Card>
              </Section>
            )}

            <Section eyebrow="Resources" title="Support">
              <Card elevated>
                {data.supportLinks.map((link, i) => (
                  <View key={link.label} style={[styles.supportItem, i === data.supportLinks.length - 1 && styles.supportItemLast]}>
                    <Text style={styles.supportLabel}>{link.label}</Text>
                    <Text style={styles.subRowText}>{link.detail}</Text>
                  </View>
                ))}
              </Card>
            </Section>
          </>
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.xxl },
  value: { ...typography.h3, color: colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  subRowFirst: { marginTop: 0 },
  subRowText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.xs, flexShrink: 1 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  supportItem: { marginBottom: spacing.md },
  supportItemLast: { marginBottom: 0 },
  supportLabel: { ...typography.bodyStrong, color: colors.textPrimary },
});
