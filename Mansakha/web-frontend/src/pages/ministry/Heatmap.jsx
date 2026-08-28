import React from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import BarChart from '../../components/BarChart';
import DonutChart from '../../components/DonutChart';
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
  const regions = data?.heatmap || [];

  return (
    <MinistryLayout title="Analysis by State / Region">
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      ) : regions.length === 0 ? (
        <p className="text-sm text-gray-400">No regional data yet.</p>
      ) : (
        <div className="space-y-6">
          {/* Section 6.3's own card grid, unchanged - a quick-scan snapshot
              of every state at once, complementary to the ranked comparisons
              below rather than replaced by them. */}
          <div className="grid grid-cols-4 gap-4">
            {regions.map((r) => (
              <div key={r.jurisdictionId} className={`p-4 rounded-xl border ${intensityClass(r.averageScore)}`}>
                <p className="font-bold text-sm">{r.name}</p>
                <p className="text-2xl font-bold mt-2">{r.averageScore != null ? r.averageScore.toFixed(0) : '-'}</p>
                <p className="text-[11px] opacity-80 mt-1">avg. distress score</p>
                <p className="text-[11px] opacity-80">{r.victimCount} victims</p>
              </div>
            ))}
          </div>

          {/* Ranked comparisons - answers "which states need attention"
              directly, rather than making Ministry scan 35 cards to find
              the highest/lowest ones. */}
          <div className="grid grid-cols-2 gap-6">
            <BarChart
              title="Average Distress Score by State"
              subtitle="Highest first - where cases are, on average, most severe."
              items={regions.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.averageScore }))}
              valueLabel="pts"
              barColor="bg-rose-500"
              formatValue={(v) => v.toFixed(0)}
            />
            <BarChart
              title="Victim Count by State"
              subtitle="Highest first - where caseload is concentrated."
              items={regions.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.victimCount }))}
              valueLabel="cases"
              barColor="bg-[#519BCE]"
            />
            <BarChart
              title="Critical Cases by State"
              subtitle="Highest first - where the most urgent cases are concentrated."
              items={regions.map((r) => ({ jurisdictionId: r.jurisdictionId, name: r.name, value: r.critical }))}
              valueLabel="cases"
              barColor="bg-purple-600"
            />
            <DonutChart
              title="Nationwide Risk Composition"
              subtitle="Share of all victims at each risk tier, right now."
              segments={[
                { label: 'Critical', value: regions.reduce((sum, r) => sum + (r.critical || 0), 0), color: '#9333EA' },
                { label: 'High Risk', value: regions.reduce((sum, r) => sum + (r.highRisk || 0), 0), color: '#F43F5E' },
                { label: 'Vulnerable', value: regions.reduce((sum, r) => sum + (r.vulnerable || 0), 0), color: '#F59E0B' },
                {
                  label: 'Low / unscored',
                  value: regions.reduce((sum, r) => sum + Math.max(0, (r.victimCount || 0) - (r.critical || 0) - (r.highRisk || 0) - (r.vulnerable || 0)), 0),
                  color: '#10B981',
                },
              ]}
            />
          </div>
        </div>
      )}
    </MinistryLayout>
  );
}
