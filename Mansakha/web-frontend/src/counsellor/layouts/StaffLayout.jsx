import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, Users, Bell, BarChart3, User, LogOut, Search, Menu, X } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe } from '../services/hooks';
import NotificationBell from '../components/NotificationBell';

// Counsellor's own dedicated shell - own copy of what used to be the shared
// StaffLayout, trimmed to just Counsellor's nav (no other role's items, no
// section-switching logic needed since this file only ever serves one role).
const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/counsellor' },
  { name: 'Case Queue', icon: Inbox, path: '/counsellor/queue' },
  { name: 'My Users', icon: Users, path: '/counsellor/my-users' },
  { name: 'Alerts', icon: Bell, path: '/counsellor/alerts' },
  { name: 'Reports', icon: BarChart3, path: '/counsellor/reports' },
  { name: 'Profile', icon: User, path: '/counsellor/profile' },
];

export default function StaffLayout({ children, title = 'Dashboard' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const profilePath = '/counsellor/profile';
  // Same icon as whichever sidebar item matches the current page, so the
  // top bar always shows a page icon + name, matching the User app.
  // Longest-path-wins: Dashboard's own path (/counsellor) is a prefix of
  // every other route here, so a plain first-match would always pick
  // Dashboard's icon instead of the more specific current page's.
  const activeNavItem = NAV_ITEMS
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const TitleIcon = activeNavItem?.icon;

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans overflow-hidden">

      {/* Backdrop - closes the drawer on tap, below lg where the sidebar is an overlay not a static rail */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* PERSISTENT SIDEBAR - Log Out sits right after the nav list, not
          pinned to the bottom of the screen (on a short nav that used to
          leave a huge empty gap above it). The whole sidebar scrolls as one
          unit (hidden scrollbar) only if nav+logout together are taller
          than the viewport, so nothing is ever unreachable either way.
          Below lg it becomes a hamburger-triggered overlay drawer instead
          of a static rail. */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 max-w-[80vw] bg-[#3D5A80] text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Corner cell - same height as the header to its right, so the
            two read as one continuous strip across the top. */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-wide leading-tight">Mansakha</h1>
            <p className="text-[11px] text-blue-200 italic leading-tight">Mind matters. We're listening.</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-blue-100 hover:text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-2 p-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                end
                onClick={() => setSidebarOpen(false)}
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

        <div className="px-6 pb-4 pt-2 mt-auto border-t border-blue-400/30 shrink-0">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-blue-100 hover:bg-white/10 transition text-sm"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW AREA - header stays fixed; only the content below it
          scrolls (overflow-y-auto lives on <main>, not this wrapper). */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* PERSISTENT HEADER - same palette as the User app's top bar */}
        <header className="h-16 bg-[#EBF4FA] border-b border-[#D6E8F5] px-4 sm:px-8 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-[#3D5A80] shrink-0"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            {TitleIcon && <TitleIcon size={20} className="text-[#3D5A80] shrink-0 hidden sm:block" />}
            <h2 className="text-lg sm:text-xl font-bold text-[#3D5A80] truncate">{title}</h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D5A80]/60" size={16} />
              <input
                type="text"
                placeholder="Search cases, alerts..."
                className="pl-9 pr-4 py-1.5 bg-white rounded-md text-sm border border-[#D6E8F5] focus:outline-none focus:ring-2 focus:ring-[#519BCE] w-40 lg:w-64 text-[#3D5A80]"
              />
            </div>

            <NotificationBell />

            <button
              onClick={() => navigate(profilePath)}
              className="flex items-center gap-3 sm:border-l border-[#D6E8F5] sm:pl-4 text-left focus:outline-none"
            >
              {me?.profileImageUrl ? (
                <img
                  src={me.profileImageUrl}
                  alt={me?.fullName || 'Profile'}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#EBF4FA] border border-[#D6E8F5] flex items-center justify-center shrink-0">
                  <User size={18} className="text-[#3D5A80]" />
                </div>
              )}
              <div className="text-xs hidden sm:block">
                <p className="font-bold text-[#3D5A80]">{me?.fullName || 'Loading...'}</p>
                <p className="text-[#3D5A80]/70">Senior Counsellor</p>
              </div>
            </button>
          </div>
        </header>

        {/* DYNAMIC PAGE CONTENT - the only scrollable region in this shell */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
