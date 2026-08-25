import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useWorkload } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';

// Simple visual load cue from open-alert count - fixed thresholds, not an
// invented scoring formula: 5+ open alerts is Heavy, 2+ is Moderate,
// otherwise Light - shown as a StatusBadge (text + icon), not a colored dot.
function loadStatus(openAlertCount) {
  if (openAlertCount >= 5) return 'Heavy';
  if (openAlertCount >= 2) return 'Moderate';
  return 'Light';
}

// District tier only (Section 4.5) - the backend route itself also enforces this
// (400 if the target jurisdiction isn't a district), this screen just doesn't
// bother rendering the nav entry for State/National (see StaffShell.js).
export default function WorkloadScreen() {
  const scope = useStaffScope();
  const query = useWorkload(scope.jurisdictionId);

  const columns = [
    { key: 'name', label: 'Counsellor', flex: 1.3, render: (item) => <Text style={styles.cellStrong}>{item.name}</Text> },
    { key: 'interventionCount', label: 'Interventions', flex: 1, render: (item) => <Text style={styles.cell}>{item.interventionCount}</Text> },
    { key: 'openAlertCount', label: 'Open Alerts', flex: 1, render: (item) => <Text style={styles.cell}>{item.openAlertCount}</Text> },
    { key: 'load', label: 'Load Status', flex: 1, render: (item) => <StatusBadge status={loadStatus(item.openAlertCount)} /> },
  ];

  return (
    <ScreenContainer>
      <QueryBoundary query={query} empty={(data) => !data?.counsellors?.length}>
        {(data) => (
          <DataTable columns={columns} data={data.counsellors} keyExtractor={(item) => item.officialId} emptyMessage="No counsellors in this district yet." emptyIcon="users" />
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
});
