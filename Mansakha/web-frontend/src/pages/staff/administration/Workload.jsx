import React from 'react';
import { useLocation } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import { useMyJurisdiction, useAdminWorkload } from '../../../services/hooks';

export default function Workload() {
  const location = useLocation();
  const section = location.pathname.startsWith('/stateadmin') ? 'stateadmin' : 'districtadmin';
  const { jurisdictionId, loading: jurisdictionLoading } = useMyJurisdiction();
  const { data, loading, error } = useAdminWorkload(jurisdictionId);

  const counsellors = data?.counsellors || [];
  const maxCases = Math.max(1, ...counsellors.map((c) => c.caseCount || 0));

  return (
    <StaffLayout title="Counsellor Workload" section={section}>
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                <th className="py-3.5 px-6">Counsellor</th>
                <th className="py-3.5 px-4">Active Cases</th>
                <th className="py-3.5 px-4">Avg. Response Time</th>
                <th className="py-3.5 px-6">Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {jurisdictionLoading || loading ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={4} className="py-8 text-center text-rose-600">{error}</td></tr>
              ) : counsellors.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No counsellors assigned yet.</td></tr>
              ) : counsellors.map((c) => (
                <tr key={c.officialId} className="hover:bg-gray-50/70 transition">
                  <td className="py-4 px-6 font-bold text-gray-800">{c.fullName}</td>
                  <td className="py-4 px-4 text-gray-700 font-medium">{c.caseCount}</td>
                  <td className="py-4 px-4 text-gray-700 font-medium">{c.avgResponseMinutes != null ? `${c.avgResponseMinutes}m` : '-'}</td>
                  <td className="py-4 px-6">
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#519BCE] rounded-full" style={{ width: `${((c.caseCount || 0) / maxCases) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </StaffLayout>
  );
}
