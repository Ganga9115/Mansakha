import React, { useState } from 'react';
import { Text, Platform, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';
import Section from '../../components/Section';
import StatGrid from '../../components/StatGrid';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useAdminDashboard, useRootJurisdiction } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiClient } from '../../services/apiClient';
import { LoadingState, ErrorState } from '../../components/QueryStates';

const TILES = [
  { key: 'total', label: 'Total Cases', icon: 'users', disclaimer: 'All registered cases in this jurisdiction, regardless of risk tier.' },
  { key: 'vulnerable', label: 'Vulnerable (Moderate)', icon: 'alert-circle', disclaimer: 'Cases whose most recent check-in scored in the Moderate risk band.' },
  { key: 'highRisk', label: 'High Risk', icon: 'alert-triangle', disclaimer: 'Cases whose most recent check-in scored in the High risk band.' },
  { key: 'critical', label: 'Critical', icon: 'alert-octagon', disclaimer: 'Cases whose most recent check-in scored in the Critical risk band - these trigger real-time alerts.' },
];

// Handles District/State/National uniformly - Section 4.5: each tier has a
// genuinely different default view, not the same dashboard with a filter. The
// backend response shape already encodes that (`tier`, and `cases` vs `trends`),
// this screen just renders whichever shape came back. Reused by Ministry's
// National Dashboard too (same component, unrestricted access via that role).
export default function AdminDashboardScreen({ navigation, route }) {
  const scope = useStaffScope();
  const { session } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // Ministry's own role has jurisdictionId: null (unrestricted) - resolve the
  // National root as the "home" view in that case, unless a route param
  // (drill-down, or a specific jurisdiction) already specifies one.
  const needsRoot = !route.params?.jurisdictionId && !scope.jurisdictionId;
  const rootQuery = useRootJurisdiction(needsRoot);
  const jurisdictionId = route.params?.jurisdictionId || scope.jurisdictionId || rootQuery.data?.jurisdictionId;

  const query = useAdminDashboard(jurisdictionId);

  const handleExport = async () => {
    if (Platform.OS !== 'web') {
      toast.info('Export is available on the web app for now.');
      return;
    }
    setExporting(true);
    try {
      const blob = await apiClient.downloadBlob(`/api/admin/dashboard/${jurisdictionId}/export`, session?.token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mansakha-export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (needsRoot && rootQuery.isLoading) return <LoadingState />;
  if (needsRoot && rootQuery.isError) return <ErrorState message={rootQuery.error?.message} onRetry={rootQuery.refetch} />;

  const caseColumns = [
    { key: 'victimId', label: 'Case ID', flex: 1.4, render: (item) => <Text style={styles.cellStrong}>Case {item.victimId.slice(0, 8)}</Text> },
    { key: 'riskLevel', label: 'Risk Level', flex: 1, render: (item) => <StatusBadge status={item.riskLevel} /> },
  ];

  const rollupColumns = [
    { key: 'name', label: 'Jurisdiction', flex: 1.4, render: (item) => <Text style={styles.cellStrong}>{item.name}</Text> },
    { key: 'total', label: 'Cases', flex: 0.8, render: (item) => <Text style={styles.cell}>{item.total}</Text> },
    { key: 'critical', label: 'Critical', flex: 0.8, render: (item) => <Text style={[styles.cell, item.critical > 0 && styles.criticalCount]}>{item.critical}</Text> },
  ];

  return (
    <ScreenContainer>
      <QueryBoundary query={query}>
        {(data) => (
          <>
            <Section
              eyebrow={data.tier}
              title="Overview"
              action={<Button title="Export CSV" variant="outline" icon="download" onPress={handleExport} loading={exporting} style={styles.exportButton} />}
            >
              <StatGrid items={TILES.map((t) => ({ label: t.label, value: data[t.key], icon: t.icon, disclaimer: t.disclaimer }))} />
            </Section>

            {data.tier === 'district' && (
              <Section eyebrow="Case-level detail" title="Cases">
                <DataTable
                  columns={caseColumns}
                  data={data.cases}
                  keyExtractor={(item) => item.victimId}
                  onRowPress={(item) => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: true })}
                  emptyMessage="No cases in this district yet."
                  emptyIcon="inbox"
                />
              </Section>
            )}

            {(data.tier === 'state' || data.tier === 'national') && (
              <Section eyebrow="Rollup" title={data.tier === 'state' ? 'Districts' : 'States'}>
                <DataTable
                  columns={rollupColumns}
                  data={data.trends}
                  keyExtractor={(item) => item.jurisdictionId}
                  onRowPress={(item) => navigation.navigate('AdminDashboard', { jurisdictionId: item.jurisdictionId })}
                  emptyMessage="No child jurisdictions configured yet."
                  emptyIcon="map"
                />
              </Section>
            )}
          </>
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  exportButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
  criticalCount: { color: colors.danger, fontFamily: typography.bodyStrong.fontFamily },
});
