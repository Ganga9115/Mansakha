import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useVictimDashboard } from '../../services/hooks';

// Small icon tile + label header reused across the stat/summary cards below -
// gives each Card a clear visual anchor instead of a bare bold label.
function CardHeader({ icon, label, tint = colors.primary, tintBg = colors.primaryLight }) {
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.iconTile, { backgroundColor: tintBg }]}>
        <Feather name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.cardHeaderLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const query = useVictimDashboard();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Dashboard</Text>
      <QueryBoundary query={query}>
        {(data) => (
          <>
            <Card elevated>
              <CardHeader icon="briefcase" label="Your case" />
              <Text style={styles.value}>{data.caseStatus.status} - {data.caseStatus.caseStage}</Text>
              {!!data.nextCheckIn && (
                <View style={styles.subRow}>
                  <Feather name="calendar" size={14} color={colors.textSecondary} />
                  <Text style={styles.subRowText}>Next check-in around {new Date(data.nextCheckIn).toLocaleDateString()}</Text>
                </View>
              )}
            </Card>

            <Card elevated>
              <CardHeader icon="trending-up" label="How you've been trending" />
              {data.currentDistressLevel ? (
                <View style={styles.trendRow}>
                  <RiskBadge riskLevel={data.currentDistressLevel.riskLevel} />
                  <Text style={styles.trendText}>Latest check-in</Text>
                </View>
              ) : (
                <View style={styles.subRow}>
                  <Feather name="info" size={14} color={colors.textSecondary} />
                  <Text style={styles.subRowText}>No check-ins yet - try the Check-in tab.</Text>
                </View>
              )}
            </Card>

            {data.alerts.length > 0 && (
              <Card elevated>
                <CardHeader icon="bell" label="Recent activity" tint={colors.warning} tintBg={colors.warningLight} />
                {data.alerts.map((a) => (
                  <View key={a.alertId} style={styles.subRow}>
                    <View style={styles.dot} />
                    <Text style={styles.subRowText}>{a.status} - {new Date(a.triggeredAt).toLocaleDateString()}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Card elevated>
              <CardHeader icon="life-buoy" label="Support" tint={colors.success} tintBg={colors.successLight} />
              {data.supportLinks.map((link) => (
                <View key={link.label} style={styles.supportItem}>
                  <Text style={styles.supportLabel}>{link.label}</Text>
                  <Text style={styles.subRowText}>{link.detail}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </QueryBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  iconTile: {
    width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardHeaderLabel: { ...typography.label, color: colors.textSecondary, textTransform: 'uppercase' },
  value: { ...typography.h3, color: colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  subRowText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.xs, flexShrink: 1 },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trendText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  supportItem: { marginBottom: spacing.sm },
  supportLabel: { ...typography.bodyStrong, color: colors.textPrimary },
});
