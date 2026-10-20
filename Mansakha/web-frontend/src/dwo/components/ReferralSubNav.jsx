import React from 'react';
import { NavLink } from 'react-router-dom';

// Small linked row so a case's Overview/Relief/Compensation/Activity
// Log/Tasks still reads as ONE case even though each is now its own real
// route - matching this codebase's own convention (every page is a
// distinct URL, not client-side tab state), rather than cramming every
// concern onto one screen. Immediate Relief and Compensation are DWO's own
// two extra tabs, on top of the Overview/Log/Tasks base template reused
// across the other role folders - each is a genuinely separate workflow
// (approve-and-provide vs. verify-and-track-in-stages), not just another
// card on the same page.
const TABS = [
  { label: 'Overview', suffix: '' },
  { label: 'Immediate Relief', suffix: '/relief' },
  { label: 'Compensation', suffix: '/compensation' },
  { label: 'Activity Log', suffix: '/log' },
  { label: 'Tasks', suffix: '/tasks' },
];

export default function ReferralSubNav({ base }) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200">
      {TABS.map((t) => (
        <NavLink
          key={t.label}
          to={`${base}${t.suffix}`}
          end={t.suffix === ''}
          className={({ isActive }) =>
            `px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition ${
              isActive ? 'border-brand-600 text-brand-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
