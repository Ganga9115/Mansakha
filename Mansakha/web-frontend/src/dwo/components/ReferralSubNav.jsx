import React from 'react';
import { NavLink } from 'react-router-dom';

// Small linked row so a case's Overview/Activity Log/Tasks still reads as
// ONE case even though each is now its own real route - matching this
// codebase's own convention (every page is a distinct URL, not client-side
// tab state), rather than cramming all three concerns onto one screen.
// THE TEMPLATE reused verbatim across the other 6 role folders.
const TABS = [
  { label: 'Overview', suffix: '' },
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
              isActive ? 'border-[#519BCE] text-[#3D5A80]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
