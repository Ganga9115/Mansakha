import React from 'react';
import { FlatList, View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import { QueryBoundary } from '../../components/QueryStates';
import { useAdminAlerts } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';

// District tier only (Section 4.5, same restriction the backend route itself
// enforces) - closes a real gap: useAdminAlerts already existed in hooks.js
// with a working backend endpoint behind it, but no screen ever rendered it.
const STATUS_STYLE = {
  Open: { color: colors.danger, icon: 'alert-octagon' },
  Acknowledged: { color: colors.moderate, icon: 'clock' },
  Resolved: { color: colors.low, icon: 'check-circle' },
};

export default function AdminAlertsScreen({ navigation }) {
  const scope = useStaffScope();
  const query = useAdminAlerts(scope.jurisdictionId);

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
                <Pressable onPress={() => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: true })}>
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
