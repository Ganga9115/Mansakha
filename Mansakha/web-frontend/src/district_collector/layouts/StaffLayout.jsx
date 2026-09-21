import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Building2, ClipboardList, User, LogOut, Menu, X } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe } from '../services/hooks';

// District Collector's own dedicated shell - copied from
// dwo/layouts/StaffLayout.jsx (itself copied from district_admin's
// template). A genuinely new, separate role (not a flag on District Admin)
// so District Admin's existing app stays completely untouched.
const NAV_ITEMS = [
  { name: 'Committee Review', icon: Building2, path: '/districtcollector' },
  { name: 'My Tasks', icon: ClipboardList, path: '/districtcollector/tasks' },
  { name: 'Profile', icon: User, path: '/districtcollector/profile' },
];

export default function StaffLayout({ children, title = 'Committee Review' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const activeNavItem = NAV_ITEMS
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const TitleIcon = activeNavItem?.icon;

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 max-w-[80vw] bg-blue-800 text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <img src="/logo-3.png" alt="Mansakha" className="h-auto w-[185px]" />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-blue-100 hover:text-white" aria-label="Close menu">
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
                    isActive ? 'bg-blue-700 text-white shadow-sm' : 'text-blue-100 hover:bg-white/10'
                  }`
                }
              >
                <Icon size={18} />
                <span className="text-sm flex-1">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-blue-50 border-b border-blue-100 px-4 sm:px-8 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-blue-900 shrink-0" aria-label="Open menu">
              <Menu size={22} />
            </button>
            {TitleIcon && <TitleIcon size={20} className="text-blue-900 shrink-0 hidden sm:block" />}
            <h2 className="text-lg sm:text-xl font-bold text-blue-900 truncate">{title}</h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <div className="text-xs hidden sm:block text-right">
              <p className="font-bold text-blue-900">{me?.fullName || 'Loading...'}</p>
              <p className="text-blue-900/70">District Collector</p>
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-2 rounded-full text-rose-600 hover:bg-rose-50 transition shrink-0"
              aria-label="Log Out"
              title="Log Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-8">{children}</main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Log out?</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to log out of your account?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                Cancel
              </button>
              <button
                onClick={() => { logout(); navigate('/signin'); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
