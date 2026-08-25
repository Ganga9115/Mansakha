import React, { useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { Calendar } from 'lucide-react';

export default function LogIntervention() {
  const [formData, setFormData] = useState({
    victimId: 'V-2024-0847',
    interventionType: 'Counsellor Crisis Counseling Session',
    priority: 'Urgent Protocol Deploy',
    status: 'In Progress',
    followUpDate: '2024-10-04',
    assignedProfessional: 'Dr. Sarah Jenkins (Senior Counsellor)',
    notes: 'Completed immediate callback attempt at 14:20 PM via secured shadow network channel. User reported situational domestic safety escalation. Instructed on physical backup escape route to designated emergency safehouse zone. Mobilized regional outreach team for physical wellness verification standard sequence. User safe-word verified.'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Submitted Intervention:', formData);
  };

  return (
    <StaffLayout title="Log New Intervention Protocol" activePage="Interventions">
      <div className="space-y-6 max-w-6xl mx-auto">
        
        {/* TOP SUMMARY BANNER CARD */}
        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-start gap-16">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">
              Target Victim ID
            </span>
            <span className="text-base font-bold text-gray-800">
              V-2024-0847
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">
              Case Classification
            </span>
            <span className="text-base font-bold text-gray-800">
              Domestic Violence
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">
              AI Severity Score
            </span>
            <span className="inline-block bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded">
              High Risk (78/100)
            </span>
          </div>
        </div>

        {/* MAIN FORM CONTAINER */}
        <div className="bg-white p-8 rounded-xl border border-gray-200/80 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-6">
            Intervention Execution Details
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 2-COLUMN FORM GRID */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              
              {/* LEFT COLUMN */}
              <div className="space-y-5">
                {/* Victim Record ID */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Victim Record ID
                  </label>
                  <input
                    type="text"
                    name="victimId"
                    value={formData.victimId}
                    readOnly
                    className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-transparent rounded-lg text-xs font-medium text-gray-800 focus:outline-none cursor-not-allowed"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Verify patient biometric mapping record before submit
                  </p>
                </div>

                {/* Intervention Type Action */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Intervention Type Action
                  </label>
                  <select
                    name="interventionType"
                    value={formData.interventionType}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE]"
                  >
                    <option>Counsellor Crisis Counseling Session</option>
                    <option>Emergency Outreach Dispatch</option>
                    <option>Medical & Legal Escort</option>
                  </select>
                </div>

                {/* Priority Escalation Matrix */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Priority Escalation Matrix
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE]"
                  >
                    <option>Urgent Protocol Deploy</option>
                    <option>Standard Review Sequence</option>
                    <option>Low Risk Monitoring</option>
                  </select>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-5">
                {/* Intervention Status Progress */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Intervention Status Progress
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE]"
                  >
                    <option>In Progress</option>
                    <option>Completed</option>
                    <option>Pending Follow-up</option>
                  </select>
                </div>

                {/* Scheduled Follow-up Date */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Scheduled Follow-up Date
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="followUpDate"
                      value="October 04, 2024"
                      readOnly
                      className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none"
                    />
                    <Calendar size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                {/* Assigned Senior Professional */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Assigned Senior Professional
                  </label>
                  <input
                    type="text"
                    name="assignedProfessional"
                    value={formData.assignedProfessional}
                    readOnly
                    className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border border-transparent rounded-lg text-xs font-medium text-gray-800 focus:outline-none cursor-not-allowed"
                  />
                </div>
              </div>

            </div>

            {/* FULL-WIDTH TEXTAREA: Protocol Action Notes */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Protocol Action Notes & Clinical Impression
              </label>
              <textarea
                name="notes"
                rows={5}
                value={formData.notes}
                onChange={handleChange}
                className="w-full p-3.5 bg-white border border-gray-300 rounded-lg text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE] resize-none"
              />
            </div>

            {/* FOOTER ACTION BUTTONS */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                className="px-5 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-800 transition"
              >
                Cancel
              </button>
              
              <button
                type="button"
                className="px-5 py-2.5 text-xs font-semibold text-[#519BCE] border border-[#519BCE] rounded-lg hover:bg-[#519BCE]/10 transition"
              >
                Save as Draft
              </button>

              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#519BCE] hover:bg-[#3d83b3] rounded-lg shadow-sm transition"
              >
                Submit Intervention
              </button>
            </div>

          </form>
        </div>

      </div>
    </StaffLayout>
  );
}