import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowRight, MapPin } from 'lucide-react';
import { useReferralsList } from '../services/hooks';

// Which of the 4 real paths brought this case here (see
// protectionOfficer.routes.js's ORIGIN_PRIORITY, which sorts the list
// itself - emergency SOS always surfaces first, regardless of when it was
// created). A case with no originType predates this field.
const ORIGIN_META = {
  sos_emergency: { label: 'Emergency', className: 'bg-rose-100 text-rose-700' },
  io_threat_alert: { label: 'IO Alert', className: 'bg-orange-100 text-orange-700' },
  intervention_accepted: { label: 'WP/Relocation', className: 'bg-blue-100 text-blue-700' },
  self_reported_threat: { label: 'Self-Reported', className: 'bg-amber-100 text-amber-700' },
};

// Protection Officer's Protection Registry - a clean, scannable list only.
// Every action (verification log, resolve, task assignment) now lives on
// the dedicated Referral Detail page (see ReferralDetail.jsx), matching
// the list -> detail convention established by dwo/pages/ReferralQueue.jsx,
// rather than cramming every action into an inline accordion within the
// list itself.

const STATUS_BADGE = {
  Open: 'bg-amber-100 text-amber-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
};

// Deliberately NOT the distress score's Low/Moderate/High/Critical palette -
// Threat Tier is a different axis (external danger, not psychological
// distress), assessed by Investigating Officer and read here, never set.
const THREAT_TIER_BADGE = {
  Routine: 'bg-gray-100 text-gray-600',
  Guarded: 'bg-yellow-100 text-yellow-700',
  Elevated: 'bg-orange-100 text-orange-700',
  Severe: 'bg-rose-100 text-rose-700',
};

export default function ProtectionRegistry() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Open');
  const query = useReferralsList(tab);
  const referrals = query.data?.referrals || [];

  return (
    <StaffLayout title="Protection Registry">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Active Protection Cases</h3>
            <p className="text-[11px] text-gray-400">Cases a District Admin has referred to you for physical protection.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {['Open', 'Resolved'].map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === s ? 'bg-[#519BCE] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="border border-gray-200/80 rounded-xl overflow-hidden overflow-x-auto">
            {query.loading ? (
              <p className="text-sm text-gray-400 p-6">Loading...</p>
            ) : query.error ? (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
            ) : referrals.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No {tab.toLowerCase()} referrals.</p>
            ) : (
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase">
                    <th className="px-6 py-3">Origin</th>
                    <th className="px-6 py-3">Docket Number</th>
                    <th className="px-6 py-3">Case Type</th>
                    <th className="px-6 py-3">Referred On</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Threat Tier</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referrals.map((r) => {
                    const origin = r.originType ? ORIGIN_META[r.originType] : null;
                    const tier = r.manualThreatTier || r.threatTier;
                    return (
                    <tr key={r.referralId} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-3.5">
                        {origin ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${origin.className}`}>{origin.label}</span>
                        ) : (
                          <span className="text-[10px] text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-sm font-bold text-gray-800">
                        <div className="flex items-center gap-1.5">
                          {r.docketNumber}
                          {r.location && <MapPin size={13} className="text-[#519BCE]" aria-label="Live location available" />}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{r.caseTypeName}</td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">
                        {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        {tier ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${THREAT_TIER_BADGE[tier] || 'bg-gray-100 text-gray-600'}`}>
                            {tier}{r.manualThreatTier ? ' (Officer)' : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Not yet assessed</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => navigate(`/protectionofficer/referrals/${r.referralId}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-semibold transition"
                        >
                          View <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
