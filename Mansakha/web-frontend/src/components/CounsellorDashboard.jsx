import React from 'react';
import DashboardLayout from '../components/DashboardLayout';

export default function CounsellorDashboard() {
  return (
    <DashboardLayout title="Counsellor Dashboard">
      <div className="space-y-6">
        
        {/* METRIC CARDS ROW */}
        <div className="grid grid-cols-6 gap-4">
          <MetricCard label="TOTAL CASES" count="248" dotColor="bg-slate-600" />
          <MetricCard label="LOW RISK" count="142" dotColor="bg-emerald-500" />
          <MetricCard label="MODERATE RISK" count="68" dotColor="bg-amber-500" />
          <MetricCard label="HIGH RISK" count="28" dotColor="bg-rose-500" />
          <MetricCard label="CRITICAL" count="10" dotColor="bg-purple-600" />
          <MetricCard label="OPEN ALERTS" count="15" dotColor="bg-[#519BCE]" />
        </div>

        {/* MIDDLE SECTION - CHARTS */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="font-bold text-sm text-gray-800 mb-6">Distress Trend (6 Months)</h3>
            <div className="h-44 relative flex flex-col justify-between">
              <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-gray-400 pointer-events-none">
                <span>100</span>
                <span>50</span>
                <span>0</span>
              </div>
              <div className="pl-6 h-full flex items-end">
                <svg className="w-full h-32 overflow-visible" viewBox="0 0 500 100">
                  <path d="M 0 90 L 60 85 L 170 55 L 280 40 L 400 10" fill="none" stroke="#519BCE" strokeWidth="2.5" />
                </svg>
              </div>
              <div className="pl-6 flex justify-between text-[11px] text-gray-500 pt-2">
                <span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="font-bold text-sm text-gray-800 mb-2">Risk Distribution</h3>
            <div className="flex items-center justify-around h-full">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="4.5" strokeDasharray="57 100" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#f97316" strokeWidth="4.5" strokeDasharray="27 100" strokeDashoffset="-57" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="4.5" strokeDasharray="16 100" strokeDashoffset="-84" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-bold text-gray-800 leading-none">248</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">Total</span>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-600 font-medium">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span><span>Low Risk (57%)</span></div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span><span>Moderate (27%)</span></div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-600"></span><span>High/Critical (16%)</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm">
            <h3 className="font-bold text-sm text-gray-800 mb-6">Priority Cases by Type</h3>
            <div className="space-y-4">
              <BarRow label="Domestic Violence" count="12 active" fill="w-[80%] bg-red-600" />
              <BarRow label="Human Trafficking" count="8 active" fill="w-[50%] bg-purple-900" />
              <BarRow label="Severe Depression" count="14 active" fill="w-[90%] bg-red-600" />
              <BarRow label="Self-Harm Risk" count="4 active" fill="w-[30%] bg-purple-900" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-sm text-gray-800">Recent Critical Alerts</h3>
                <a href="#" className="text-xs text-[#519BCE] font-medium hover:underline">View All</a>
              </div>
              <div className="divide-y divide-gray-50">
                <AlertRow id="V-2024-0847" type="Domestic Violence" status="Critical" statusBg="bg-rose-100 text-rose-700" time="12m ago" />
                <AlertRow id="V-2024-0912" type="Self-Harm Alert" status="Critical" statusBg="bg-rose-100 text-rose-700" time="45m ago" />
                <AlertRow id="V-2024-0511" type="Trafficking Suspect" status="High" statusBg="bg-rose-50 text-rose-600" time="2h ago" />
                <AlertRow id="V-2024-1002" type="Severe Anxiety" status="Moderate" statusBg="bg-amber-100 text-amber-700" time="3h ago" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, count, dotColor }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`}></span>
        <span className="text-[10px] font-bold text-gray-500 tracking-wider">{label}</span>
      </div>
      <span className="text-3xl font-bold text-gray-800 mt-3">{count}</span>
    </div>
  );
}

function BarRow({ label, count, fill }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold mb-1 text-gray-700">
        <span>{label}</span>
        <span className="text-gray-400 font-normal">{count}</span>
      </div>
      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fill}`}></div>
      </div>
    </div>
  );
}

function AlertRow({ id, type, status, statusBg, time }) {
  return (
    <div className="py-3 flex items-center justify-between text-xs">
      <div className="flex items-center gap-3">
        <span className="font-bold text-gray-800">{id}</span>
        <span className="text-gray-600">{type}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusBg}`}>{status}</span>
        <span className="text-gray-400 w-12 text-right">{time}</span>
      </div>
    </div>
  );
}