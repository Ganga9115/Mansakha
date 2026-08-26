import React, { useState } from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useReportsInbox } from '../../services/hooks';

export default function ReportsInbox() {
  const { data, loading, error } = useReportsInbox();
  const [expandedId, setExpandedId] = useState(null);
  const reports = data?.reports || [];

  return (
    <MinistryLayout title="Reports Inbox">
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 p-6">Loading...</p>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-6 rounded-lg">{error}</div>
        ) : reports.length === 0 ? (
          <p className="text-sm text-gray-400 p-6">No reports submitted yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((r) => {
              const expanded = expandedId === r.reportId;
              return (
                <div key={r.reportId}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : r.reportId)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/70 transition"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-800">{r.jurisdictionName || r.jurisdictionId}</p>
                      <p className="text-xs text-gray-500">Submitted by {r.generatedByName || 'Unknown'} - {new Date(r.generatedAt).toLocaleString()}</p>
                    </div>
                    {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </button>
                  {expanded && (
                    <div className="px-6 pb-4 text-xs text-gray-600">
                      <pre className="bg-gray-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(r.snapshot, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MinistryLayout>
  );
}
