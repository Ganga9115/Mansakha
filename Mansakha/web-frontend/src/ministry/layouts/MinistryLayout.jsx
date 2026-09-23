import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, FileText, Inbox, LogOut, User, Trophy, Menu, X, Mail } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe, useMailUnreadCount } from '../services/hooks';
import NotificationBell from '../components/NotificationBell';
import SidebarGlideNav from '../../shared/components/SidebarGlideNav';
import { usePageHeaderValue } from '../../shared/context/PageHeaderContext';

// Mail sits directly above Profile per explicit product placement.
const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/ministry/dashboard' },
  { name: 'Staff Management', icon: Users, path: '/ministry/staff-management' },
  { name: 'Performance & Efficacy', icon: Trophy, path: '/ministry/performance' },
  { name: 'Coordination Roster', icon: Users, path: '/ministry/coordination-roster' },
  { name: 'System Configuration', icon: Settings, path: '/ministry/system-config' },
  { name: 'Audit Log', icon: FileText, path: '/ministry/audit-log' },
  { name: 'Reports Inbox', icon: Inbox, path: '/ministry/reports' },
  { name: 'Mail', icon: Mail, path: '/ministry/mail' },
  { name: 'Profile', icon: User, path: '/ministry/profile' },
];

// Distinct from every Administration role's StaffLayout on purpose -
// Ministry's screen set is its own console plus its own Login, small enough
// that a shared/parameterized layout with Staff wouldn't pay for itself.
// Sidebar corner cell/footer pattern matches every other role's layout
// though, so the sidebar reads as the same product across every role.
export default function MinistryLayout() {
  const { title, headerAction } = usePageHeaderValue();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const { data: mailUnread } = useMailUnreadCount();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const profilePath = '/ministry/profile';
  const activeNavItem = NAV_ITEMS.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );
  const TitleIcon = activeNavItem?.icon;
  const navItemsWithBadge = NAV_ITEMS.map((item) => (item.name === 'Mail' ? { ...item, badge: mailUnread?.count } : item));

  return (
    <div className="flex h-screen w-full bg-brand-50 text-gray-800 font-sans overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 max-w-[80vw] bg-brand-900 text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <div className="flex flex-col items-start gap-0.5">
            <img src="/logo-3.png" alt="Mansakha" className="h-auto w-[185px]" />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-brand-100 hover:text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <SidebarGlideNav items={navItemsWithBadge} activeName={activeNavItem?.name} onItemClick={() => setSidebarOpen(false)} />
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-brand-50 border-b border-brand-100 px-4 sm:px-8 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-brand-900 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            {TitleIcon && <TitleIcon size={20} className="text-brand-900 shrink-0 hidden sm:block" />}
            <h2 className="text-lg sm:text-xl font-bold text-brand-900 truncate">{title}</h2>
            {headerAction && <div className="ml-2 shrink-0">{headerAction}</div>}
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">

            <NotificationBell />

            <button
              onClick={() => navigate(profilePath)}
              className="flex items-center gap-3 sm:border-l border-brand-100 sm:pl-4 text-left focus:outline-none"
            >
              <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <User size={18} className="text-brand-900" />
              </div>
              <div className="text-xs hidden sm:block">
                <p className="font-bold text-brand-900">{me?.fullName || 'Loading...'}</p>
                <p className="text-brand-900/70">Ministry Console</p>
              </div>
            </button>

            {/* Log Out - relocated here from the sidebar bottom per product
                request: top-right, icon-only, red/destructive, and gated
                behind a confirm dialog instead of logging out immediately. */}
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-8"><Outlet /></main>
      </div>

      {/* Log Out confirm dialog - plain Tailwind overlay, no UI library
          needed for a two-button confirm. */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Log out?</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to log out of your account?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { logout(); navigate('/ministry/login'); }}
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
