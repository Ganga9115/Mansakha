import React from 'react';

// A composition/proportion chart is a different question than the ranked
// bar charts next to it ("what share of cases are Critical?" vs "which
// state has the most Critical cases?") - plain SVG arcs, same no-charting-
// library approach as BarChart. Ministry's own copy, used by Heatmap.jsx.
export default function DonutChart({ title, subtitle, segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 60;
  const stroke = 26;
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;
  const arcs = total > 0
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const arc = { ...s, dash, gap: circumference - dash, offset: -offsetSoFar };
          offsetSoFar += dash;
          return arc;
        })
    : [];

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
      <h3 className="font-bold text-sm text-gray-800 mb-1">{title}</h3>
      <p className="text-[11px] text-gray-400 mb-4">{subtitle}</p>
      {total === 0 ? (
        <p className="text-xs text-gray-400">Not enough data yet.</p>
      ) : (
        <div className="flex items-center gap-6">
          <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0 -rotate-90">
            <circle cx="80" cy="80" r={radius} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.offset}
              />
            ))}
          </svg>
          <div className="space-y-2">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600">{s.label}</span>
                <span className="font-bold text-gray-800">{s.value}</span>
                <span className="text-gray-400">({total > 0 ? Math.round((s.value / total) * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
