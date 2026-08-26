import React from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { useJurisdictionOptions, useAdminDashboard } from '../../services/hooks';

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// Ministry's own landing dashboard - a superset of National Admin's view
// (no jurisdiction restriction applies to Ministry per the Build Prompt),
// so it fetches the root national jurisdiction and reuses the same
// tier-differentiated GET /api/admin/dashboard/:jurisdictionId National
// Admin's dashboard calls, rather than a separate unrestricted endpoint.
export default function MinistryDashboard() {
  const nationalJurisdictionQuery = useJurisdictionOptions('national');
  const nationalJurisdictionId = nationalJurisdictionQuery.data?.jurisdictions?.[0]?.jurisdictionId;
  const { data, loading, error } = useAdminDashboard(nationalJurisdictionId);

  const states = data?.states || [];

  return (
    <MinistryLayout title="Ministry Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <StatCard title="Total Cases (Nationwide)" value={data?.totalCases ?? '-'} />
          <StatCard title="High-Risk Cases" value={data?.highRiskCases ?? '-'} tone="text-rose-600" />
          <StatCard title="Critical Cases" value={data?.criticalCases ?? '-'} tone="text-purple-700" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-sm text-gray-800">State/UT-wise Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3 px-6">State / UT</th>
                  <th className="py-3 px-4">Total Cases</th>
                  <th className="py-3 px-4">High-Risk</th>
                  <th className="py-3 px-4">Critical</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {nationalJurisdictionQuery.loading || loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={4} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : states.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">No state data yet.</td></tr>
                ) : states.map((s) => (
                  <tr key={s.jurisdictionId} className="hover:bg-gray-50/70 transition">
                    <td className="py-3.5 px-6 font-bold text-gray-800">{s.name}</td>
                    <td className="py-3.5 px-4 text-gray-700 font-medium">{s.totalCases}</td>
                    <td className="py-3.5 px-4 text-rose-600 font-bold">{s.highRiskCases}</td>
                    <td className="py-3.5 px-4 text-purple-700 font-bold">{s.criticalCases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MinistryLayout>
  );
}
