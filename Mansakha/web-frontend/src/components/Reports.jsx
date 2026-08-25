import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Download } from 'lucide-react';

export default function Reports() {
  const [timeRange, setTimeRange] = useState('Last 30 Days');

  const stackedData = [
    { month: 'May', high: 30, moderate: 45, low: 25 },
    { month: 'Jun', high: 25, moderate: 50, low: 25 },
    { month: 'Jul', high: 20, moderate: 40, low: 40 },
    { month: 'Aug', high: 35, moderate: 45, low: 20 },
    { month: 'Sep', bg: true, high: 30, moderate: 45, low: 25 },
  ];

  return (
    <DashboardLayout title="Analytics & Operational Reports" activePage="Reports">
      <div className="space-y-6">
        
        {/* TOP CONTROLS & DATE FILTER */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            {['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Custom Range'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  timeRange === range
                    ? 'bg-[#519BCE]/15 text-[#519BCE]'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition">
            <Download size={14} />
            Export System Audit (PDF)
          </button>
        </div>

        {/* TOP ROW: 2 CHARTS */}
        <div className="grid grid-cols-2 gap-6">
          
          {/* Average Distress Severity Trends */}
          <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">
              Average Distress Severity Trends (6 Months)
            </h3>
            
            <div className="h-44 relative flex flex-col justify-between pt-4">
              <svg className="w-full h-32 overflow-visible" viewBox="0 0 500 100">
                <line x1="0" y1="50" x2="500" y2="50" stroke="#E5E7EB" strokeDasharray="4 4" />
                <path
                  d="M 0 65 L 125 45 L 250 55 L 340 10 L 450 45"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="2.5"
                />
              </svg>
              <div className="flex justify-between text-xs font-semibold text-gray-400 px-2 pt-2 border-t border-gray-100">
                <span>May</span>
                <span>Jun</span>
                <span>Jul</span>
                <span>Aug</span>
                <span>Sep</span>
              </div>
            </div>
          </div>

          {/* Severity Distribution Stacked Matrix */}
          <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">
              Severity Distribution Stacked Matrix
            </h3>

            <div className="h-44 flex flex-col justify-between">
              <div className="h-32 flex items-end justify-between px-6 pt-2">
                {stackedData.map((item) => (
                  <div key={item.month} className="flex flex-col items-center gap-2 w-8">
                    <div className="w-4 h-28 flex flex-col justify-end gap-1 rounded overflow-hidden">
                      <div className="bg-red-600 w-full rounded-sm" style={{ height: `${item.high}%` }}></div>
                      <div className="bg-amber-500 w-full rounded-sm" style={{ height: `${item.moderate}%` }}></div>
                      <div className="bg-emerald-600 w-full rounded-sm" style={{ height: `${item.low}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-xs font-semibold text-gray-400 px-6 pt-2 border-t border-gray-100">
                <span>May</span>
                <span>Jun</span>
                <span>Jul</span>
                <span>Aug</span>
                <span>Sep</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] font-semibold text-gray-600 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600"></span> High
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Moderate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Low
              </span>
            </div>
          </div>

        </div>

        {/* BOTTOM ROW: DONUT CHART & WORKLOAD */}
        <div className="grid grid-cols-2 gap-6">
          
          {/* Intervention Phase Breakdown */}
          <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">
              Intervention Phase Breakdown
            </h3>

            <div className="flex items-center justify-around py-4">
              {/* SVG Donut */}
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="4"
                  />
                  {/* Completed (40%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="4"
                    strokeDasharray="40, 100"
                  />
                  {/* In Progress (35%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#519BCE"
                    strokeWidth="4"
                    strokeDasharray="35, 100"
                    strokeDashoffset="-40"
                  />
                  {/* Planned (25%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth="4"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-75"
                  />
                </svg>
              </div>

              {/* Legend List */}
              <div className="space-y-3 text-xs font-semibold text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                  <span>Completed Actions (40%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#519BCE]"></span>
                  <span>In Progress Queue (35%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
                  <span>Planned / Referred (25%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Counsellor Workload Allocation */}
          <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-6">
            <h3 className="font-bold text-sm text-gray-800">
              Counsellor Workload Allocation
            </h3>

            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-800 mb-2">
                  <span>Dr. Jenkins (You)</span>
                  <span>28 Active Cases</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#519BCE] rounded-full" style={{ width: '85%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-800 mb-2">
                  <span>Dr. K. Raghav</span>
                  <span>19 Active Cases</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#519BCE] rounded-full" style={{ width: '55%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-gray-800 mb-2">
                  <span>Counsellor A. Sen</span>
                  <span>32 Active Cases</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#519BCE] rounded-full" style={{ width: '95%' }}></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 4 STATS CARDS AT THE BOTTOM */}
        <div className="grid grid-cols-4 gap-6">
          <StatCard 
            title="TOTAL ACTIVE PROTOCOLS" 
            value="142" 
            subtitle="Across all clinical layers" 
          />
          <StatCard 
            title="AVG CALLBACK RESPONSE" 
            value="14.5m" 
            subtitle="Crisis response average" 
          />
          <StatCard 
            title="CASES SUCCESSFULLY RESOLVED" 
            value="94" 
            subtitle="During selected timeframe" 
          />
          <StatCard 
            title="SYSTEM ESCALATION RATE" 
            value="4.8%" 
            subtitle="To critical emergency layer" 
          />
        </div>

      </div>
    </DashboardLayout>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-1">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">
        {title}
      </span>
      <span className="text-2xl font-bold text-gray-800 block">
        {value}
      </span>
      <span className="text-[11px] font-medium text-gray-400 block">
        {subtitle}
      </span>
    </div>
  );
}