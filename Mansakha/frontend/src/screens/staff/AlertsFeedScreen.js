import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import AlertBanner from '../../components/AlertBanner';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorAlerts } from '../../services/hooks';

// Polls every 15s (see hooks.js) rather than a raw Supabase Realtime subscription -
// direct anon-key Realtime access is deliberately blocked by deny-all RLS
// (security_and_realtime.sql), so this is the only path that actually delivers data.
// Alert rows carry a status (Open/Acknowledged/Resolved), not a risk level -
// the /alerts endpoint doesn't join distress_scores/risk_levels, so the
// banner below counts unresolved (Open) alerts, the real data available,
// rather than inventing a "critical" concept the payload doesn't carry.
export default function AlertsFeedScreen({ navigation }) {
  const query = useCounsellorAlerts();

  const columns = [
    { key: 'victimId', label: 'Case ID', flex: 1.2, render: (item) => <Text style={styles.cellStrong}>Case {item.victimId.slice(0, 8)}</Text> },
    { key: 'triggeredAt', label: 'Triggered At', flex: 1.4, render: (item) => <Text style={styles.cell}>{new Date(item.triggeredAt).toLocaleString()}</Text> },
    { key: 'status', label: 'Status', flex: 1, render: (item) => <StatusBadge status={item.status} /> },
  ];

  return (
    <ScreenContainer>
      <QueryBoundary query={query} empty={(data) => !data?.alerts?.length}>
        {(data) => {
          const openCount = data.alerts.filter((a) => a.status === 'Open').length;
          return (
            <>
              {openCount > 0 && (
                <AlertBanner variant="critical" title={`${openCount} unresolved alert${openCount === 1 ? '' : 's'}`}>
                  These cases have an Open alert with no logged intervention yet.
                </AlertBanner>
              )}
              <DataTable
                columns={columns}
                data={data.alerts}
                keyExtractor={(item) => item.alertId}
                onRowPress={(item) => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: false })}
                emptyMessage="No alerts to show."
                emptyIcon="bell-off"
              />
            </>
          );
        }}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
});
