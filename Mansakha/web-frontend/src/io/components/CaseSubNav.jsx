import React from 'react';
import { NavLink } from 'react-router-dom';

// Same Overview/Activity Log/Tasks-as-real-routes convention as every
// other role folder's own ReferralSubNav.jsx, based on userId instead of a
// referralId since this role has no referral of its own.
const TABS = [
  { label: 'Overview', suffix: '' },
  { label: 'Activity Log', suffix: '/log' },
  { label: 'Tasks', suffix: '/tasks' },
];

export default function CaseSubNav({ base }) {
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
