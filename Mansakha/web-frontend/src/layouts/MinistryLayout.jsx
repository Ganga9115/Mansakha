import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, Settings, FileText } from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Staff Management', icon: Users, path: '/ministry/staff-management' },
  { name: 'System Configuration', icon: Settings, path: '/ministry/system-config' },
  { name: 'Audit Log', icon: FileText, path: '/ministry/audit-log' },
];

// Distinct from StaffLayout on purpose - Ministry's screen set is exactly
// these 3 pages plus its own Login, small enough that a shared/parameterized
// layout with Staff wouldn't pay for itself.
export default function MinistryLayout({ children, title = 'Ministry Console' }) {
  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans">
      <aside className="w-64 bg-[#3D5A80] text-white flex flex-col justify-between p-6 shrink-0">
        <div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-wide">Mansakha</h1>
            <p className="text-xs text-blue-200 italic mt-0.5">Ministry Console</p>
          </div>
          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                      isActive ? 'bg-[#519BCE] text-white shadow-sm' : 'text-blue-100 hover:bg-white/10'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span className="text-sm">{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-y-auto">
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center shrink-0">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        </header>
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
