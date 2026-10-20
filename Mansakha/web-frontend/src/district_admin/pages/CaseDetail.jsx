import React from 'react';
import { useParams } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useCaseDetail, useCaseNotes } from '../services/hooks';

const RISK_BADGE = {
  Critical: 'bg-red-100 text-red-800 border border-red-300',
  High: 'bg-orange-100 text-orange-800 border border-orange-300',
  Moderate: 'bg-amber-100 text-amber-700',
  Low: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
};

const TREND_META = {
  escalating: { icon: ArrowUpRight, color: 'text-red-600', label: 'Escalating' },
  stable_or_improving: { icon: ArrowDownRight, color: 'text-emerald-600', label: 'Stable or improving' },
  insufficient_data: { icon: Minus, color: 'text-gray-400', label: 'Insufficient data' },
};

// District Admin's own copy of the Case File view - read-only (District
// Admin never gets intervention-logging, note-composing, scheduling, or
// in-app chat, per the PS's explicit Counsellor/Administration split).
export default function CaseDetail() {
  const { id: userId } = useParams();
  const { data, loading, error } = useCaseDetail(userId);
  const notesQuery = useCaseNotes(userId);

  usePageHeader({ title: loading || error ? 'Case File' : `Case File: ${userId.slice(0, 8)}` });

  if (loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (error) {
    return <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>;
  }

  const trend = TREND_META[data.trend] || TREND_META.insufficient_data;
  const TrendIcon = trend.icon;

  return (
    <>
      <div className="space-y-6">

        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
              <span className="text-base font-bold text-gray-800">{userId.slice(0, 8)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Risk Level</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${RISK_BADGE[data.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                {data.riskLevel}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Distress Score</span>
              <span className="font-bold text-xs text-gray-800">{data.score}/100 {data.previousScore != null && <span className="text-gray-400 font-normal">(was {data.previousScore})</span>}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Trend</span>
              <span className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${trend.color}`}>
                <TrendIcon size={14} /> {trend.label}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Intervention</span>
              <span className="text-xs font-bold text-gray-700">{data.interventionStatus}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

          <div className="col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Contributing Signals</h3>
              {(data.riskFactors || []).length === 0 ? (
                <p className="text-xs text-gray-400">No signals recorded for this check-in.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {data.riskFactors.map((f) => (
                    <div key={f.signal} className="flex items-center justify-between">
                      <span className="text-gray-600 font-medium capitalize">{f.signal.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-gray-800">{f.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.explanation && (
                <div className="mt-4 p-3 bg-brand-50 rounded-lg text-xs text-gray-700 leading-relaxed">
                  <span className="font-bold text-brand-900 block mb-1">AI explanation</span>
                  {data.explanation}
                </div>
              )}
              {data.suggestedInterventionType && (
                <div className="mt-3 p-3 bg-brand-50 rounded-lg text-xs text-gray-700">
                  <span className="font-bold text-brand-900">AI-suggested intervention:</span> {data.suggestedInterventionType.name} - review before acting.
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">Case Notes</h3>
              {notesQuery.loading ? (
                <p className="text-xs text-gray-400">Loading notes...</p>
              ) : (notesQuery.data?.notes || []).length === 0 ? (
                <p className="text-xs text-gray-400">No notes yet.</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {notesQuery.data.notes.map((n) => (
                    <div key={n.noteId} className="border-b border-gray-50 pb-2">
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <span className="font-semibold text-gray-600">{n.authorName}</span>
                        {n.authoredBy === 'ai' && (
                          <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-900 text-[9px] font-bold uppercase">AI-drafted</span>
                        )}
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-gray-700">{n.noteText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-2">Case Background</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{data.caseBackground || 'No background notes on file.'}</p>
            </div>
          </div>

        </div>

      </div>
    </>
  );
}
