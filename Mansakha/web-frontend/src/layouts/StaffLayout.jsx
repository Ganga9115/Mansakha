import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ListOrdered,
  Bell,
  MessageSquare,
  BarChart3,
  Settings,
  Search,
  LogOut,
} from 'lucide-react';
import { logout } from '../services/auth';
import { useMe } from '../services/hooks';

const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100';

const NAV_ITEMS_BY_SECTION = {
  counsellor: [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/staff/counsellor' },
    { name: 'Case Queue', icon: ListOrdered, path: '/staff/counsellor/case-queue' },
    { name: 'Alerts', icon: Bell, path: '/staff/counsellor/alerts' },
    { name: 'Interventions', icon: MessageSquare, path: '/staff/counsellor/interventions' },
    { name: 'Reports', icon: BarChart3, path: '/staff/reports' },
    { name: 'Settings', icon: Settings, path: '/staff/settings' },
  ],
  administration: [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/staff/administration' },
    { name: 'Workload', icon: ListOrdered, path: '/staff/administration/workload' },
    { name: 'Alerts', icon: Bell, path: '/staff/administration/alerts' },
    { name: 'Reports', icon: BarChart3, path: '/staff/reports' },
    { name: 'Settings', icon: Settings, path: '/staff/settings' },
  ],
};

// Shared shell for Counsellor and Administration - `section` picks which nav
// set to show, since the two roles' screen sets don't overlap (Case Queue/
// Interventions vs. Workload) beyond Reports/Settings, which both share.
export default function StaffLayout({ children, title = 'Dashboard', section = 'counsellor' }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const navItems = NAV_ITEMS_BY_SECTION[section] || NAV_ITEMS_BY_SECTION.counsellor;
  const alertsPath = navItems.find((item) => item.name === 'Alerts')?.path || '/staff/reports';

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans">

      {/* PERSISTENT SIDEBAR */}
      <aside className="w-64 bg-[#3D5A80] text-white flex flex-col justify-between p-6 shrink-0">
        <div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-wide">Mansakha</h1>
            <p className="text-xs text-blue-200 italic mt-0.5">Mind matters. We're listening.</p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                      isActive
                        ? 'bg-[#519BCE] text-white shadow-sm'
                        : 'text-blue-100 hover:bg-white/10'
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

        <div className="pt-4 border-t border-blue-400/30 space-y-3">
          <button
            onClick={() => { logout(); navigate('/staff/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-blue-100 hover:bg-white/10 transition text-sm"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-blue-200 px-4">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span>Secure Server Connected</span>
          </div>
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* PERSISTENT HEADER */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>

          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search cases, alerts..."
                className="pl-9 pr-4 py-1.5 bg-[#F8F9FA] rounded-md text-sm border-none focus:outline-none focus:ring-2 focus:ring-[#519BCE] w-64"
              />
            </div>

            <Link
              to={alertsPath}
              className="relative p-1 text-gray-500 hover:text-gray-700"
            >
              <Bell size={20} />
              <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
            </Link>

            <button
              onClick={() => navigate('/staff/settings')}
              className="flex items-center gap-3 border-l border-gray-200 pl-6 text-left focus:outline-none"
            >
              <img
                src={me?.profileImageUrl || FALLBACK_PHOTO}
                alt={me?.fullName || 'Profile'}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div className="text-xs">
                <p className="font-bold text-gray-800">{me?.fullName || 'Loading...'}</p>
                <p className="text-gray-500">Senior Counsellor</p>
              </div>
            </button>
          </div>
        </header>

        {/* DYNAMIC PAGE CONTENT */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
