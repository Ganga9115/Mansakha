import React, { useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { useAuditLog } from '../services/hooks';

const PAGE_SIZE = 20;

export default function AuditLog() {
  usePageHeader({ title: 'Audit Log' });
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAuditLog(page);

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Timestamp</th>
                  <th className="py-3.5 px-4">Official</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-6">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={4} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">No audit entries yet.</td></tr>
                ) : entries.map((e) => (
                  <tr key={e.auditId} className="hover:bg-gray-50/70 transition">
                    <td className="py-3 px-6 text-gray-500 font-mono">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-800 font-semibold">{e.officialName || 'System'}</td>
                    <td className="py-3 px-4 text-gray-700">{e.action}</td>
                    <td className="py-3 px-6 text-gray-500">{e.entityType} {e.entityId ? `#${String(e.entityId).slice(0, 8)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total === 0 ? 'No entries' : `Page ${page} of ${totalPages} (${total} entries)`}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
