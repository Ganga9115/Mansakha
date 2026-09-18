import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bell, BarChart, FileText, UserPlus, User, LogOut, Menu, X, Mail, HeartHandshake, Network, Users2 } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe, useMailUnreadCount } from '../services/hooks';
import NotificationBell from '../components/NotificationBell';

// District Admin's own dedicated shell - own copy of what used to be the
// shared StaffLayout, trimmed to just District Admin's nav. Analysis was
// added alongside State/National's own Analysis pages once Reports.jsx's
// read-only trend/severity/intervention charts moved out into it - unlike
// State/National's Analysis (built around comparing sub-jurisdictions,
// which District has none of), District's Analysis is time-series analytics
// over its own single jurisdiction, so it earns the same nav item for a
// different reason. "Edit User Record" (formerly "Register User") no longer
// creates users - user creation was Data Operator's job all along (the PS's
// own front-desk intake role) and District Admin's duplicate create-user
// feature was removed; this nav item now only reaches the search/edit
// (contact number, address) panel that's a distinct, legitimate oversight
// feature. Mail sits directly above Profile per explicit product placement.
const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/districtadmin' },
  { name: 'Analysis', icon: BarChart, path: '/districtadmin/analysis' },
  { name: 'Edit User Record', icon: UserPlus, path: '/districtadmin/edit-user' },
  { name: 'Alerts', icon: Bell, path: '/districtadmin/alerts' },
  { name: 'Intervention Requests', icon: HeartHandshake, path: '/districtadmin/intervention-requests' },
  { name: 'Agency Coordination', icon: Network, path: '/districtadmin/agency-coordination' },
  { name: 'Coordination Roster', icon: Users2, path: '/districtadmin/coordination-roster' },
  { name: 'Reports', icon: FileText, path: '/districtadmin/reports' },
  { name: 'Mail', icon: Mail, path: '/districtadmin/mail' },
  { name: 'Profile', icon: User, path: '/districtadmin/profile' },
];

export default function StaffLayout({ children, title = 'Dashboard', headerAction = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const { data: mailUnread } = useMailUnreadCount();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const profilePath = '/districtadmin/profile';
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

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 max-w-[80vw] bg-[#3D5A80] text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <img src="/logo-3.png" alt="Mansakha" className="h-auto w-[185px]" />

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
                end={item.name !== 'Mail'}
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
                <span className="text-sm flex-1">{item.name}</span>
                {item.name === 'Mail' && mailUnread?.count > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {mailUnread.count > 99 ? '99+' : mailUnread.count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
            {headerAction && <div className="ml-2 shrink-0">{headerAction}</div>}
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">

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
                <p className="text-[#3D5A80]/70">District Administration</p>
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          {children}
        </main>
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
                onClick={() => { logout(); navigate('/login'); }}
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

