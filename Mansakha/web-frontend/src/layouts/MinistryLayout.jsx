import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, FileText, Map, Inbox, Radio, LogOut, Search, User, Trophy } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe } from '../services/hooks';
import NotificationBell from '../components/NotificationBell';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/ministry/dashboard' },
  { name: 'Staff Management', icon: Users, path: '/ministry/staff-management' },
  { name: 'Performance & Efficacy', icon: Trophy, path: '/ministry/performance' },
  { name: 'System Configuration', icon: Settings, path: '/ministry/system-config' },
  { name: 'Audit Log', icon: FileText, path: '/ministry/audit-log' },
  { name: 'Analysis', icon: Map, path: '/ministry/heatmap' },
  { name: 'Reports Inbox', icon: Inbox, path: '/ministry/reports' },
  { name: 'Emergency Broadcast', icon: Radio, path: '/ministry/broadcast' },
  { name: 'Profile', icon: User, path: '/ministry/profile' },
];

// Distinct from StaffLayout on purpose - Ministry's screen set is exactly
// these 3 pages plus its own Login, small enough that a shared/parameterized
// layout with Staff wouldn't pay for itself. Sidebar corner cell/footer
// pattern matches StaffLayout's though, so the sidebar reads as the same
// product across every role.
export default function MinistryLayout({ children, title = 'Ministry Console' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  // Same icon as whichever sidebar item matches the current page, so the
  // top bar always shows a page icon + name, matching the Victim app.
  const activeNavItem = NAV_ITEMS.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );
  const TitleIcon = activeNavItem?.icon;

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans">
      {/* Log Out sits right after the nav list, not pinned to the bottom of
          the screen - on a short nav (most roles) that used to leave a huge
          empty gap above it. The whole sidebar scrolls as one unit (hidden
          scrollbar) only in the rare case nav+logout together are taller
          than the viewport, so nothing is ever unreachable either way. */}
      <aside className="w-64 bg-[#3D5A80] text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar">
        {/* Corner cell - same height as the header to its right. */}
        <div className="h-16 flex flex-col justify-center px-6 border-b border-white/10 shrink-0">
          <h1 className="text-xl font-bold tracking-wide leading-tight">Mansakha</h1>
          <p className="text-[11px] text-blue-200 italic leading-tight">Ministry Console</p>
        </div>
        <nav className="space-y-2 p-6">
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

        <div className="px-6 pb-4 pt-2 mt-auto border-t border-blue-400/30 shrink-0">
          <button
            onClick={() => { logout(); navigate('/ministry/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-blue-100 hover:bg-white/10 transition text-sm"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>
      {/* Header stays fixed; only the content below it scrolls
          (overflow-y-auto lives on <main>, not this wrapper). */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Same palette as the Victim app's top bar */}
        <header className="h-16 bg-[#EBF4FA] border-b border-[#D6E8F5] px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {TitleIcon && <TitleIcon size={20} className="text-[#3D5A80]" />}
            <h2 className="text-xl font-bold text-[#3D5A80]">{title}</h2>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D5A80]/60" size={16} />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-1.5 bg-white rounded-md text-sm border border-[#D6E8F5] focus:outline-none focus:ring-2 focus:ring-[#519BCE] w-64 text-[#3D5A80]"
              />
            </div>

            <NotificationBell />

            <div className="flex items-center gap-3 border-l border-[#D6E8F5] pl-4">
              <div className="w-9 h-9 rounded-full bg-[#EBF4FA] border border-[#D6E8F5] flex items-center justify-center">
                <User size={18} className="text-[#3D5A80]" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-[#3D5A80]">{me?.fullName || 'Loading...'}</p>
                <p className="text-[#3D5A80]/70">Ministry Console</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
