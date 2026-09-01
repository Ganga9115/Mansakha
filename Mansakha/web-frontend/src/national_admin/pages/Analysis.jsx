import React from 'react';
import StaffLayout from '../layouts/StaffLayout';
import BarChart from '../components/BarChart';
import { useMyJurisdiction, useAdminDashboard } from '../services/hooks';

// National Admin compares its own states - calls the exact same GET
// /api/admin/national/dashboard/:jurisdictionId NationalDashboard.jsx
// already uses, just charting its `trends` array instead of tabling it, so
// these numbers can never drift from what the dashboard already shows.
export default function Analysis() {
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);

  const rows = data?.trends || [];

  return (
    <StaffLayout title="Analysis">
      {jurisdictionLoading || loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No state data yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <BarChart
            title="Total Cases by State"
            subtitle="Highest first - where caseload is concentrated."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.total }))}
            valueLabel="cases"
            barColor="bg-[#519BCE]"
          />
          <BarChart
            title="Critical Cases by State"
            subtitle="Highest first - where the most urgent cases are concentrated."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.critical }))}
            valueLabel="cases"
            barColor="bg-purple-600"
          />
          <BarChart
            title="High-Risk Cases by State"
            subtitle="Highest first - cases flagged High but not yet Critical."
            items={rows.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.highRisk }))}
            valueLabel="cases"
            barColor="bg-rose-500"
          />
          <BarChart
            title="Vulnerable Cases by State"
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
