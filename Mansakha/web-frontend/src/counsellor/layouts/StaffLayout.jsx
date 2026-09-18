import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Bell, BarChart, User, LogOut, Menu, X } from 'lucide-react';
import { logout } from '../services/auth';
import { useMe } from '../services/hooks';
import NotificationBell from '../components/NotificationBell';

// Counsellor's own dedicated shell - own copy of what used to be the shared
// StaffLayout, trimmed to just Counsellor's nav (no other role's items, no
// section-switching logic needed since this file only ever serves one role).
// Mail sits directly above Profile per explicit product placement.
const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/counsellor' },
  { name: 'My Users', icon: Users, path: '/counsellor/my-users' },
  { name: 'Alerts', icon: Bell, path: '/counsellor/alerts' },
  { name: 'Analysis', icon: BarChart, path: '/counsellor/analysis' },
  { name: 'Profile', icon: User, path: '/counsellor/profile' },
];

// `headerAction` - an optional element rendered in the header itself, next
// to the page title (e.g. Case Detail's "Chat with User" button, which used
// to sit alone in its own row inside the page content with a lot of empty
// space next to it - the header is where a page's primary action belongs,
// same place profile/notifications/logout already live).
// `fullBleedContent` - opts a page out of <main>'s own padding (and lets its
// content stretch the full flex height) instead of sitting as a card inside
// it. Chat is the first user of this: it already draws its own full white
// panel (see CaseChat.jsx), so the default padding + this page's own
// rounded/bordered card together read as a box floating inside a box,
// instead of the thread filling the whole content area the way a real chat
// UI (WhatsApp Web, Slack) does.
export default function StaffLayout({ children, title = 'Dashboard', headerAction = null, titleAction = null, fullBleedContent = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const profilePath = '/counsellor/profile';
  // Same icon as whichever sidebar item matches the current page, so the
  // top bar always shows a page icon + name, matching the User app.
  // Dashboard's own path (/counsellor) is excluded from prefix-matching
  // (only matches when it's the exact path) - otherwise, since it's a
  // literal prefix of every other route here, it would win prefix-matching
  // against every other item too and permanently show as "active".
  // Case Detail (and its /notes, /chat children) are siblings of every item
  // above, not nested under one, so they never match by prefix at all -
  // confirmed live as the sidebar showing nothing highlighted while viewing
  // a case, even though it was clearly reached from My Users.
  // Whichever list it was opened from passes that via location.state.fromNav
  // (see MyUsers.jsx's "View Case" and CaseDetail.jsx's own sub-navigation);
  // this defaults to My Users when that's missing (e.g. a direct
  // link/refresh, or reached from Alerts/the notification bell).
  const isCaseDetailRoute = /^\/counsellor\/case-detail\//.test(location.pathname);
  const activeNavItem = isCaseDetailRoute
    ? NAV_ITEMS.find((item) => item.name === (location.state?.fromNav || 'My Users'))
    : NAV_ITEMS
        .filter((item) => location.pathname === item.path || (item.path !== '/counsellor' && location.pathname.startsWith(`${item.path}/`)))
        .sort((a, b) => b.path.length - a.path.length)[0];
  const TitleIcon = activeNavItem?.icon;

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans overflow-hidden">

      {/* Backdrop - closes the drawer on tap, below lg where the sidebar is an overlay not a static rail */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* PERSISTENT SIDEBAR */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 max-w-[80vw] bg-[#3D5A80] text-white flex flex-col shrink-0 overflow-y-auto no-scrollbar transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Corner cell */}
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
            const isActive = activeNavItem?.name === item.name;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                  isActive
                    ? 'bg-[#519BCE] text-white shadow-sm'
                    : 'text-blue-100 hover:bg-white/10'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm flex-1">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* PERSISTENT HEADER - omitted entirely on full-bleed pages (chat):
            CaseChat.jsx already renders its own header (back button, name,
            call/chat context), so this generic one directly above it just
            duplicated a second header bar with nothing left to add - by
            explicit request, removed rather than merely re-styled. Losing
            the mobile hamburger here is fine since that page's own back
            button already leads to a page that has this header. */}
        {!fullBleedContent && (
        <header className="h-16 bg-[#EBF4FA] border-b border-[#D6E8F5] px-3 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-[#3D5A80] p-1 -ml-1 rounded-md hover:bg-blue-100/50 shrink-0"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            {TitleIcon && <TitleIcon size={20} className="text-[#3D5A80] shrink-0 hidden sm:block" />}
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-[#3D5A80] truncate max-w-[130px] xs:max-w-[200px] sm:max-w-xs md:max-w-md lg:max-w-none">{title}</h2>
            {titleAction && <div className="ml-1 sm:ml-2 shrink-0">{titleAction}</div>}
            {headerAction && <div className="ml-1 sm:ml-2 shrink-0">{headerAction}</div>}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            <NotificationBell />

            <button
              onClick={() => navigate(profilePath)}
              className="flex items-center gap-2 sm:gap-3 sm:border-l border-[#D6E8F5] sm:pl-4 text-left focus:outline-none"
            >
              {me?.profileImageUrl ? (
                <img
                  src={me.profileImageUrl}
                  alt={me?.fullName || 'Profile'}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EBF4FA] border border-[#D6E8F5] flex items-center justify-center shrink-0">
                  <User size={18} className="text-[#3D5A80]" />
                </div>
              )}
              <div className="text-xs hidden sm:block">
                <p className="font-bold text-[#3D5A80]">{me?.fullName || 'Loading...'}</p>
                <p className="text-[#3D5A80]/70">Counsellor</p>
              </div>
            </button>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 sm:p-2 rounded-full text-rose-600 hover:bg-rose-50 transition shrink-0"
              aria-label="Log Out"
              title="Log Out"
            >
              <LogOut size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>
        )}

        {/* DYNAMIC PAGE CONTENT */}
        <main className={fullBleedContent ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8'}>
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

