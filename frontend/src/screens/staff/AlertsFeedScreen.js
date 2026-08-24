import React from 'react';
import { FlatList, View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorAlerts } from '../../services/hooks';

// Polls every 15s (see hooks.js) rather than a raw Supabase Realtime subscription -
// direct anon-key Realtime access is deliberately blocked by deny-all RLS
// (security_and_realtime.sql), so this is the only path that actually delivers data.

// Alert rows carry a status (Open/Acknowledged/Resolved), not a risk level - the
// /alerts endpoint doesn't join distress_scores/risk_levels (see
// routes/counsellor.js), so severity here is derived from status instead: an
// unaddressed (Open) alert is the urgent one. Reuses the existing risk-tier
// colors rather than inventing a new palette.
const STATUS_STYLE = {
  Open: { color: colors.danger, icon: 'alert-octagon' },
  Acknowledged: { color: colors.moderate, icon: 'clock' },
  Resolved: { color: colors.low, icon: 'check-circle' },
};

export default function AlertsFeedScreen({ navigation }) {
  const query = useCounsellorAlerts();

  return (
    <View style={styles.container}>
      <QueryBoundary query={query} empty={(data) => !data?.alerts?.length}>
        {(data) => (
          <FlatList
            data={data.alerts}
            keyExtractor={(item) => item.alertId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const statusStyle = STATUS_STYLE[item.status] || STATUS_STYLE.Open;
              return (
                <Pressable onPress={() => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: false })}>
                  <Card elevated style={[styles.row, { borderLeftColor: statusStyle.color }]}>
                    <View style={[styles.iconTile, { backgroundColor: `${statusStyle.color}1A` }]}>
                      <Feather name={statusStyle.icon} size={18} color={statusStyle.color} />
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.victimId}>Case {item.victimId.slice(0, 8)}</Text>
                      <Text style={styles.time}>{new Date(item.triggeredAt).toLocaleString()}</Text>
                    </View>
                    <Text style={[styles.status, { color: statusStyle.color }]}>{item.status}</Text>
                  </Card>
                </Pressable>
              );
            }}
          />
        )}
      </QueryBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4 },
  iconTile: {
    width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  info: { flex: 1 },
  victimId: { ...typography.bodyStrong, color: colors.textPrimary },
  time: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  status: { ...typography.label },
});
