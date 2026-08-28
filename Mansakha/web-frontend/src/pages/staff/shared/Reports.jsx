import React, { useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
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
    <StaffLayout title="Analytics & Operational Reports" activePage="Reports">
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

        {/* BOTTOM ROW: DONUT CHART */}
        <div className="grid grid-cols-1 gap-6">
          
          {/* Intervention Phase Breakdown */}
          <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl border border-gray-200/60 shadow-md space-y-4">
            <h3 className="font-bold text-sm text-gray-800 tracking-wide">
              Intervention Phase Breakdown
            </h3>

            <div className="flex flex-col sm:flex-row items-center justify-around py-4">
              {/* SVG Donut */}
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#F3F4F6"
                    strokeWidth="4"
                  />
                  {/* Completed (40%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="4"
                    strokeDasharray="40, 100"
                    className="transition-all duration-1000 ease-out"
                  />
                  {/* In Progress (35%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    strokeDasharray="35, 100"
                    strokeDashoffset="-40"
                    className="transition-all duration-1000 ease-out delay-150"
                  />
                  {/* Planned (25%) */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="4"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-75"
                    className="transition-all duration-1000 ease-out delay-300"
                  />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold text-gray-800">100%</span>
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Total</span>
                </div>
              </div>

              {/* Legend List */}
              <div className="space-y-4 mt-6 sm:mt-0 text-sm font-semibold text-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-100"></div>
                  <span>Completed Actions <span className="text-gray-400 ml-2">40%</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm ring-2 ring-blue-100"></div>
                  <span>In Progress Queue <span className="text-gray-400 ml-2">35%</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm ring-2 ring-amber-100"></div>
                  <span>Planned / Referred <span className="text-gray-400 ml-2">25%</span></span>
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
            accent="blue"
          />
          <StatCard 
            title="AVG CALLBACK RESPONSE" 
            value="14.5m" 
            subtitle="Crisis response average"
            accent="emerald"
          />
          <StatCard 
            title="CASES SUCCESSFULLY RESOLVED" 
            value="94" 
            subtitle="During selected timeframe" 
            accent="purple"
          />
          <StatCard 
            title="SYSTEM ESCALATION RATE" 
            value="4.8%" 
            subtitle="To critical emergency layer" 
            accent="rose"
          />
        </div>

      </div>
    </StaffLayout>
  );
}

function StatCard({ title, value, subtitle, accent = 'gray' }) {
  const accents = {
    blue: 'border-blue-200 bg-blue-50/50 text-blue-600',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-600',
    purple: 'border-purple-200 bg-purple-50/50 text-purple-600',
    rose: 'border-rose-200 bg-rose-50/50 text-rose-600',
    gray: 'border-gray-200 bg-gray-50/50 text-gray-600'
  };

  const ringAccents = {
    blue: 'ring-blue-100',
    emerald: 'ring-emerald-100',
    purple: 'ring-purple-100',
    rose: 'ring-rose-100',
    gray: 'ring-gray-100'
  };

  return (
    <div className={`relative p-5 rounded-2xl border ${accents[accent].split(' ')[0]} bg-white shadow-sm hover:shadow-md transition-shadow duration-300 space-y-2 overflow-hidden group`}>
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${accents[accent].split(' ')[1]} opacity-50 group-hover:scale-150 transition-transform duration-700 ease-out`}></div>
      <span className="relative text-[10px] font-bold tracking-wider text-gray-500 uppercase block">
        {title}
      </span>
      <span className="relative text-3xl font-extrabold text-gray-900 block tracking-tight">
        {value}
      </span>
      <span className="relative text-[11px] font-semibold text-gray-400 block">
        {subtitle}
      </span>
    </div>
  );
}