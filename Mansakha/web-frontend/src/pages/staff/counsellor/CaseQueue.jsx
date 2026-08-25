import React from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus 
} from 'lucide-react';

export default function CaseQueue() {
  const casesData = [
    { id: 'V-2024-0847', type: 'Domestic Violence', score: 78, trend: 'rising', risk: 'High', checkIn: 'Today', status: 'Acknowledged' },
    { id: 'V-2024-0912', type: 'Severe Depression', score: 92, trend: 'rising', risk: 'Critical', checkIn: '1h ago', status: 'Pending Review' },
    { id: 'V-2024-0511', type: 'Human Trafficking', score: 85, trend: 'stable', risk: 'Critical', checkIn: '2h ago', status: 'Intervened' },
    { id: 'V-2024-0731', type: 'Severe Anxiety', score: 64, trend: 'declining', risk: 'Moderate', checkIn: 'Yesterday', status: 'Scheduled' },
    { id: 'V-2024-0612', type: 'Domestic Violence', score: 71, trend: 'stable', risk: 'High', checkIn: 'Yesterday', status: 'In Progress' },
    { id: 'V-2024-1002', type: 'Panic Disorder', score: 55, trend: 'rising', risk: 'Moderate', checkIn: 'Sep 28', status: 'Acknowledged' },
    { id: 'V-2024-0419', type: 'Severe Depression', score: 80, trend: 'rising', risk: 'High', checkIn: 'Sep 27', status: 'Review Scheduled' },
    { id: 'V-2024-0320', type: 'Self-Harm Risk', score: 88, trend: 'rising', risk: 'Critical', checkIn: 'Sep 26', status: 'Immediate Outreach' },
  ];

  return (
    <StaffLayout title="Case Queue Management" activePage="Case Queue">
      <div className="space-y-6">
        
        {/* FILTER BAR */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            
            {/* Search Input */}
            <div className="relative min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                placeholder="Search ID..." 
                className="pl-8 pr-3 py-2 bg-[#F8F9FA] rounded-lg w-full text-xs text-gray-700 border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]"
              />
            </div>

            {/* Risk Level Dropdown */}
            <select className="px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]">
              <option>Risk Level: High/Critical</option>
              <option>Risk Level: Low</option>
              <option>Risk Level: All</option>
            </select>

            {/* Case Type Dropdown */}
            <select className="px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]">
              <option>Case Type: All Types</option>
              <option>Domestic Violence</option>
              <option>Severe Depression</option>
            </select>

            {/* Trend Dropdown */}
            <select className="px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]">
              <option>Trend: All Trends</option>
              <option>Rising</option>
              <option>Stable</option>
              <option>Declining</option>
            </select>

            {/* Status Dropdown */}
            <select className="px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium border-none focus:outline-none focus:ring-1 focus:ring-[#519BCE]">
              <option>Status: Active</option>
              <option>Status: Resolved</option>
            </select>

            {/* Date Range Picker */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#F8F9FA] rounded-lg text-gray-700 font-medium">
              <Calendar size={14} className="text-gray-500" />
              <span>Sep 1 - Sep 30</span>
            </div>

          </div>

          {/* Apply Filters Button */}
          <button className="px-4 py-2 bg-[#519BCE] text-white rounded-lg font-medium hover:bg-[#3d83b3] transition shadow-sm">
            Apply Filters
          </button>
        </div>

        {/* DATA TABLE */}
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Victim ID</th>
                  <th className="py-3.5 px-4">Case Type</th>
                  <th className="py-3.5 px-4">Distress Score</th>
                  <th className="py-3.5 px-4">Trend</th>
                  <th className="py-3.5 px-4">Risk Level</th>
                  <th className="py-3.5 px-4">Last Check-in</th>
                  <th className="py-3.5 px-4">Intervention</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {casesData.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/70 transition">
                    
                    {/* Victim ID */}
                    <td className="py-4 px-6 font-bold text-gray-800">{item.id}</td>
                    
                    {/* Case Type */}
                    <td className="py-4 px-4 text-gray-700 font-medium">{item.type}</td>
                    
                    {/* Distress Score (Progress Bar + Score) */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              item.score >= 85 ? 'bg-purple-900' :
                              item.score >= 70 ? 'bg-red-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                        <span className="font-bold text-gray-800">{item.score}</span>
                      </div>
                    </td>

                    {/* Trend Indicator */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1 font-medium text-gray-600">
                        {item.trend === 'rising' && <ArrowUpRight size={14} className="text-red-500" />}
                        {item.trend === 'declining' && <ArrowDownRight size={14} className="text-emerald-500" />}
                        {item.trend === 'stable' && <Minus size={14} className="text-gray-400" />}
                        <span>{item.trend}</span>
                      </div>
                    </td>

                    {/* Risk Level Badge */}
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                        item.risk === 'Critical' ? 'bg-purple-100 text-purple-700' :
                        item.risk === 'High' ? 'bg-rose-100 text-rose-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {item.risk}
                      </span>
                    </td>

                    {/* Last Check-in */}
                    <td className="py-4 px-4 text-gray-600">{item.checkIn}</td>

                    {/* Intervention Status */}
                    <td className="py-4 px-4 font-medium text-gray-700">{item.status}</td>

                    {/* Action Button */}
                    <td className="py-4 px-6 text-right">
                      <button className="px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#519BCE] hover:text-white rounded-md text-xs font-medium transition">
                        View Case
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
          <span>Showing 1-8 of 28 priority cases</span>
          
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50" disabled>
              Previous
            </button>
            <button className="w-8 h-8 rounded bg-[#519BCE] text-white font-medium flex items-center justify-center shadow-sm">
              1
            </button>
            <button className="w-8 h-8 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center">
              2
            </button>
            <button className="px-3 py-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>

      </div>
    </StaffLayout>
  );
}