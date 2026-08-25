import React, { useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export default function Alerts({ onNavigate }) {
  const [filter, setFilter] = useState('All');

  const alertsData = [
    { id: 'V-2024-0847', label: 'Domestic Violence', score: 78, trend: 'rising', severity: 'High', time: '2 hours ago', active: true },
    { id: 'V-2024-0912', label: 'Self-Harm Risk Index', score: 92, trend: 'rising', severity: 'Critical', time: '45 min ago', active: true },
    { id: 'V-2024-1102', label: 'Severe Anxiety Episode', score: 75, trend: 'rising', severity: 'High', time: '3 hours ago', active: true },
    { id: 'V-2024-0511', label: 'Coordinated Abusive Behavior', score: 85, trend: 'stable', severity: 'Critical', time: '4 hours ago', active: true },
    { id: 'V-2024-0341', label: 'Sudden Social Withdrawal', score: 62, trend: 'stable', severity: 'Moderate', time: 'Yesterday', active: false },
    { id: 'V-2024-0210', label: 'Severe Trauma Trigger', score: 81, trend: 'declining', severity: 'High', time: '2 days ago', active: false },
  ];

  return (
    <StaffLayout title="System Anomaly Alerts" activePage="Alerts" onNavigate={onNavigate}>
      <div className="space-y-6">
        
        {/* FILTER BAR */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs">
            <button 
              onClick={() => setFilter('All')} 
              className={`px-3 py-1.5 rounded-lg font-medium transition ${filter === 'All' ? 'bg-[#519BCE] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              All Alerts <span className="ml-1 text-[10px] font-normal">18</span>
            </button>
            <button 
              onClick={() => setFilter('New')} 
              className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${filter === 'New' ? 'bg-[#519BCE] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              New <span className="bg-[#519BCE] text-white px-1.5 py-0.2 rounded-full text-[10px]">5</span>
            </button>
            <button 
              onClick={() => setFilter('Reviewed')} 
              className={`px-3 py-1.5 rounded-lg font-medium transition ${filter === 'Reviewed' ? 'bg-[#519BCE] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Reviewed <span className="ml-1 text-[10px] text-gray-400">7</span>
            </button>
            <button 
              onClick={() => setFilter('Acknowledged')} 
              className={`px-3 py-1.5 rounded-lg font-medium transition ${filter === 'Acknowledged' ? 'bg-[#519BCE] text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Acknowledged <span className="ml-1 text-[10px] text-gray-400">6</span>
            </button>
          </div>

          <span className="text-xs text-gray-400 font-medium">Auto-refreshing every 30s</span>
        </div>

        {/* ALERTS CARDS LIST */}
        <div className="space-y-3">
          {alertsData.map((item) => (
            <div 
              key={item.id} 
              className={`bg-white p-4 rounded-xl border transition flex items-center justify-between ${
                item.active ? 'border-[#519BCE]/60 shadow-sm' : 'border-gray-200/80'
              }`}
            >
              {/* Left Info */}
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${item.active ? 'bg-[#519BCE]' : 'bg-transparent'}`}></span>
                <div>
                  <h4 className="font-bold text-sm text-gray-800">{item.id}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                </div>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-10 text-xs">
                {/* Score */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block tracking-wider">Distress Score</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.score >= 85 ? 'bg-purple-900' : 'bg-red-600'}`} style={{ width: `${item.score}%` }}></div>
                    </div>
                    <span className="font-bold text-gray-800">{item.score}</span>
                  </div>
                </div>

                {/* Trend */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block tracking-wider">Trend</span>
                  <div className="flex items-center gap-1 mt-1 font-medium text-gray-700">
                    {item.trend === 'rising' && <ArrowUpRight size={14} className="text-red-500" />}
                    {item.trend === 'declining' && <ArrowDownRight size={14} className="text-emerald-500" />}
                    {item.trend === 'stable' && <Minus size={14} className="text-gray-400" />}
                    <span>{item.trend}</span>
                  </div>
                </div>

                {/* Severity */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block tracking-wider">Severity</span>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.severity === 'Critical' ? 'bg-purple-100 text-purple-700' :
                    item.severity === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {item.severity}
                  </span>
                </div>

                {/* Triggered Time */}
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block tracking-wider">Triggered</span>
                  <span className="text-gray-600 font-medium mt-1 block">{item.time}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onNavigate && onNavigate('Case Detail')}
                  className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE]/10 rounded-lg text-xs font-medium transition"
                >
                  Review details
                </button>
                <button className="px-3 py-1.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-medium transition shadow-sm">
                  Acknowledge
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </StaffLayout>
  );
}