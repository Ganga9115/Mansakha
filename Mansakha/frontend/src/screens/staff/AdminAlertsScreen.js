import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import AlertBanner from '../../components/AlertBanner';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useAdminAlerts } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';

// District tier only (Section 4.5, same restriction the backend route itself
// enforces) - closes a real gap: useAdminAlerts already existed in hooks.js
// with a working backend endpoint behind it, but no screen ever rendered it.
export default function AdminAlertsScreen({ navigation }) {
  const scope = useStaffScope();
  const query = useAdminAlerts(scope.jurisdictionId);

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
                onRowPress={(item) => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: true })}
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
