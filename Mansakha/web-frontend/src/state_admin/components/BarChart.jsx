import React from 'react';

// Same "plain inline SVG-less div bars, no charting library" approach used
// throughout this app - State Admin's own copy, used by its Analysis page.
export default function BarChart({ title, subtitle, items, valueLabel, barColor, formatValue }) {
  const sorted = [...items].filter((i) => i.value != null).sort((a, b) => b.value - a.value);
  const max = sorted.length > 0 ? Math.max(...sorted.map((i) => i.value)) : 0;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
      <h3 className="font-bold text-sm text-gray-800 mb-1">{title}</h3>
      <p className="text-[11px] text-gray-400 mb-4">{subtitle}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray-400">Not enough data yet.</p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {sorted.map((item) => (
            <div key={item.jurisdictionId} className="flex items-center gap-3 text-xs">
              <span className="w-28 shrink-0 truncate text-gray-600 font-medium" title={item.name}>{item.name}</span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: max > 0 ? `${(item.value / max) * 100}%` : '0%' }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-semibold text-gray-700">
                {formatValue ? formatValue(item.value) : item.value} <span className="font-normal text-gray-400">{valueLabel}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
