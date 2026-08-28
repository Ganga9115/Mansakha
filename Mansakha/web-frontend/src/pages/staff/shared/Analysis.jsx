import React from 'react';
import { useLocation } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import BarChart from '../../../components/BarChart';
import { useMyJurisdiction, useAdminDashboard } from '../../../services/hooks';

// State Admin compares its own districts; National Admin compares states -
// both call the exact same GET /api/admin/dashboard/:jurisdictionId every
// other page here already uses (StateDashboard/NationalDashboard), just
// charting its `trends` array instead of tabling it, so these numbers can
// never drift from what those dashboards already show. District Admin has
// no sub-jurisdictions to compare, so it doesn't get this page at all.
export default function Analysis() {
  const location = useLocation();
  const section = location.pathname.startsWith('/nationaladmin') ? 'nationaladmin' : 'stateadmin';
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);

  const rows = data?.trends || [];
  const unitLabel = section === 'nationaladmin' ? 'State' : 'District';

  return (
    <StaffLayout title="Analysis" section={section}>
      {jurisdictionLoading || loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No {unitLabel.toLowerCase()} data yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <BarChart
            title={`Total Cases by ${unitLabel}`}
            subtitle="Highest first - where caseload is concentrated."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.total }))}
            valueLabel="cases"
            barColor="bg-[#519BCE]"
          />
          <BarChart
            title={`Critical Cases by ${unitLabel}`}
            subtitle="Highest first - where the most urgent cases are concentrated."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.critical }))}
            valueLabel="cases"
            barColor="bg-purple-600"
          />
          <BarChart
            title={`High-Risk Cases by ${unitLabel}`}
            subtitle="Highest first - cases flagged High but not yet Critical."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.highRisk }))}
            valueLabel="cases"
            barColor="bg-rose-500"
          />
          <BarChart
            title={`Vulnerable Cases by ${unitLabel}`}
            subtitle="Highest first - cases flagged Moderate risk."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.vulnerable }))}
            valueLabel="cases"
            barColor="bg-amber-500"
          />
        </div>
      )}
    </StaffLayout>
  );
}
