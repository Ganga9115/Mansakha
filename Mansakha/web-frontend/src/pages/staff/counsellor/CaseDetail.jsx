import React from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { ArrowUpRight } from 'lucide-react';

export default function CaseDetail({ onNavigate }) {
  return (
    <StaffLayout title="Case File: V-2024-0847" activePage="Case Queue" onNavigate={onNavigate}>
      <div className="space-y-6">
        
        {/* TOP SUMMARY HEADER */}
        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case ID</span>
              <span className="text-base font-bold text-gray-800">V-2024-0847</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Type</span>
              <span className="text-base font-bold text-gray-800">Domestic Violence</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Risk Level</span>
              <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded">High Risk</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Distress Score</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-10 h-1.5 bg-red-600 rounded-full"></div>
                <span className="font-bold text-xs text-gray-800">78/100</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Trend</span>
              <span className="flex items-center gap-1 text-xs font-bold text-red-600 mt-0.5">
                <ArrowUpRight size={14} /> Rising
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-[#519BCE] text-white rounded-lg text-xs font-medium shadow-sm hover:bg-[#3d83b3] transition">
              Acknowledge Alert
            </button>
            <button 
              onClick={() => onNavigate && onNavigate('Interventions')}
              className="px-4 py-2 border border-[#519BCE] text-[#519BCE] rounded-lg text-xs font-medium hover:bg-[#519BCE]/10 transition"
            >
              Log Intervention
            </button>
            <button className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition">
              Schedule Follow-up
            </button>
          </div>
        </div>

        {/* 2-COLUMN MAIN CONTENT */}
        <div className="grid grid-cols-3 gap-6">
          
          {/* LEFT COLUMN (2 Cols Wide) */}
          <div className="col-span-2 space-y-6">
            
            {/* Line Chart Card */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-6">Distress History Log</h3>
              <div className="h-44 relative flex flex-col justify-between">
                <div className="h-32 w-full flex items-end">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100">
                    <path 
                      d="M 0 80 L 100 50 L 200 60 L 300 25 L 400 20 L 500 0" 
                      fill="none" 
                      stroke="#ef4444" 
                      strokeWidth="2" 
                    />
                  </svg>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                  <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span><span>Week 5</span><span>Week 6</span>
                </div>
              </div>
            </div>

            {/* AI Flag Analysis */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-sm text-gray-800">AI Flag Analysis & Confidence</h3>
                <span className="bg-blue-50 text-[#519BCE] text-xs font-bold px-2.5 py-0.5 rounded">Confidence: 94%</span>
              </div>
              <p className="text-xs leading-relaxed text-gray-600">
                This case has been automatically elevated to "High Risk" due to recurrent sentiment patterns associated with escalating environmental distress. Sentiment analysis of voice logs indicates high cortisol speech stress scores, accompanied by safety-related keywords. Recent frequency of emergency contact scans in-app has increased tenfold.
              </p>
            </div>

            {/* Recommended Protocol */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-gray-800">Recommended Clinical Protocol</h3>
              <div className="p-4 bg-gray-50/80 rounded-lg space-y-2 border border-gray-100">
                <h4 className="font-bold text-xs text-[#3D5A80]">Immediate Outreach & Safe-House Verification</h4>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  1. Initiate direct contact via pre-approved emergency stealth protocol within 2 hours. 2. Validate emergency backup contact availability. 3. Co-develop instant safety action plan and dispatch local support partner if threat is validated.
                </p>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN (1 Col Wide) */}
          <div className="space-y-6">
            
            {/* Key Risk Factors Flagged */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">Key Risk Factors Flagged</h3>
              <div className="space-y-3 text-xs">
                <RiskFactorRow label="Escalating Speech Distress Rate" badge="Critical" bg="bg-purple-100 text-purple-700" />
                <RiskFactorRow label="Domestic Co-habitation Risk" badge="High" bg="bg-rose-100 text-rose-700" />
                <RiskFactorRow label="Limited Support Network Scan" badge="Moderate" bg="bg-amber-100 text-amber-700" />
                <RiskFactorRow label="Financial dependency references" badge="Low" bg="bg-emerald-100 text-emerald-700" />
              </div>
            </div>

            {/* Intervention Timeline */}
            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-gray-800">Intervention Timeline</h3>
              
              <div className="space-y-4 border-l-2 border-blue-100 pl-4 text-xs relative">
                <TimelineItem 
                  date="Sep 28, 14:20" 
                  title="Counsellor Callback Attempted" 
                  desc="No response, emergency text sent via safe channel." 
                />
                <TimelineItem 
                  date="Sep 27, 09:15" 
                  title="Initial System Alert Triggered" 
                  desc="Escalating voice stress index flagged by model." 
                />
                <TimelineItem 
                  date="Sep 25, 11:00" 
                  title="Safety Plan Completed" 
                  desc="User verified safe word and emergency contacts." 
                />
              </div>
            </div>

          </div>

        </div>

      </div>
    </StaffLayout>
  );
}

function RiskFactorRow({ label, badge, bg }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600 font-medium">{label}</span>
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bg}`}>{badge}</span>
    </div>
  );
}

function TimelineItem({ date, title, desc }) {
  return (
    <div className="relative">
      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 bg-[#519BCE] rounded-full ring-4 ring-white"></span>
      <span className="text-[10px] text-gray-400 font-medium">{date}</span>
      <h5 className="font-bold text-gray-800 mt-0.5">{title}</h5>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{desc}</p>
    </div>
  );
}