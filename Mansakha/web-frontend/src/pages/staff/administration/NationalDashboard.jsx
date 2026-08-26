import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import { useMyJurisdiction, useAdminDashboard } from '../../../services/hooks';

function StatCard({ title, value, tone }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">{title}</span>
      <span className={`text-2xl font-bold block ${tone || 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

// National Administration - same aggregate-first pattern one level up from
// State: state-wise breakdown by default, drilling into a state (which
// itself drills into district, then case) is the exception path rather
// than a flattened jump straight to victims. `unrestricted` isn't needed
// here the way it is for Ministry reusing this component - National sees
// the whole country by definition of its own jurisdiction.
export default function NationalDashboard() {
  const navigate = useNavigate();
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminDashboard(jurisdictionId);

  const states = data?.states || [];
  const trend = data?.trend || [];

  return (
    <StaffLayout title="National Dashboard" section="nationaladmin">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <StatCard title="Total Cases (National)" value={data?.totalCases ?? '-'} />
          <StatCard title="High-Risk Cases" value={data?.highRiskCases ?? '-'} tone="text-rose-600" />
          <StatCard title="Critical Cases" value={data?.criticalCases ?? '-'} tone="text-purple-700" />
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-800">State-wise Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                    <th className="py-3 px-6">State / UT</th>
                    <th className="py-3 px-4">Total Cases</th>
                    <th className="py-3 px-4">High-Risk</th>
                    <th className="py-3 px-4">Critical</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {jurisdictionLoading || loading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">Loading...</td></tr>
                  ) : error ? (
                    <tr><td colSpan={5} className="py-8 text-center text-rose-600">{error}</td></tr>
                  ) : states.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">No state data yet.</td></tr>
                  ) : states.map((s) => (
                    <tr key={s.jurisdictionId} className="hover:bg-gray-50/70 transition">
                      <td className="py-3.5 px-6 font-bold text-gray-800">{s.name}</td>
                      <td className="py-3.5 px-4 text-gray-700 font-medium">{s.totalCases}</td>
                      <td className="py-3.5 px-4 text-rose-600 font-bold">{s.highRiskCases}</td>
                      <td className="py-3.5 px-4 text-purple-700 font-bold">{s.criticalCases}</td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          onClick={() => navigate(`/nationaladmin/state/${s.jurisdictionId}`)}
                          className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-medium transition"
                        >
                          Drill Down
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
            <h3 className="font-bold text-sm text-gray-800 mb-4">Policy-Input Trend (National)</h3>
            {trend.length === 0 ? (
              <p className="text-xs text-gray-400">Not enough data yet.</p>
            ) : (
              <div className="space-y-2">
                {trend.map((t) => (
                  <div key={t.period} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-gray-500 shrink-0">{t.period}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#519BCE] rounded-full" style={{ width: `${Math.min(100, t.avgScore)}%` }} />
                    </div>
                    <span className="font-bold text-gray-700 w-8 text-right">{t.avgScore}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
