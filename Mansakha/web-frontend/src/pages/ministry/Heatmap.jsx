import React from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { useHeatmap } from '../../services/hooks';

// Color intensity by average distress score (the primary metric); victim
// count shown as secondary text on each card. A grid of cards, not a real
// map - no mapping library is a dependency here, and one card per state/UT
// says everything a choropleth would for this data's granularity.
function intensityClass(avgScore) {
  if (avgScore == null) return 'bg-gray-50 border-gray-200 text-gray-400';
  if (avgScore >= 80) return 'bg-purple-600 border-purple-700 text-white';
  if (avgScore >= 60) return 'bg-rose-500 border-rose-600 text-white';
  if (avgScore >= 40) return 'bg-amber-400 border-amber-500 text-gray-900';
  return 'bg-emerald-400 border-emerald-500 text-gray-900';
}

export default function Heatmap() {
  const { data, loading, error } = useHeatmap();
  const regions = data?.regions || [];

  return (
    <MinistryLayout title="Heatmap by State / Region">
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      ) : regions.length === 0 ? (
        <p className="text-sm text-gray-400">No regional data yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {regions.map((r) => (
            <div key={r.jurisdictionId} className={`p-4 rounded-xl border ${intensityClass(r.avgScore)}`}>
              <p className="font-bold text-sm">{r.name}</p>
              <p className="text-2xl font-bold mt-2">{r.avgScore != null ? r.avgScore.toFixed(0) : '-'}</p>
              <p className="text-[11px] opacity-80 mt-1">avg. distress score</p>
              <p className="text-[11px] opacity-80">{r.victimCount} victims</p>
            </div>
          ))}
        </div>
      )}
    </MinistryLayout>
  );
}
