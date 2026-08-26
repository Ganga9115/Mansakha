import React from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ListOrdered,
  Bell,
  MessageSquare,
  BarChart3,
  Settings,
  Search,
  LogOut,
  UserPlus,
  FileSearch,
  Users,
} from 'lucide-react';
import { logout } from '../services/auth';
import { useMe, useCounsellorAlerts } from '../services/hooks';

const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100';

// District/State Admin have near-identical nav shapes, only the URL prefix,
// underlying jurisdiction level, and (District only) Victim Registration
// differ. National Admin's Feature Catalog entry is Dashboard-only, so it
// doesn't take this generator at all.
function adminNavItems(prefix, extraItems = []) {
  return [
    { name: 'Dashboard', icon: LayoutDashboard, path: `/${prefix}` },
    ...extraItems,
    { name: 'Workload', icon: ListOrdered, path: `/${prefix}/workload` },
    { name: 'Alerts', icon: Bell, path: `/${prefix}/alerts` },
    { name: 'Reports', icon: BarChart3, path: `/${prefix}/reports` },
    { name: 'Profile', icon: Settings, path: `/${prefix}/profile` },
  ];
}

const NAV_ITEMS_BY_SECTION = {
  counsellor: [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/counsellor' },
    { name: 'Case Queue', icon: ListOrdered, path: '/counsellor/case-queue' },
    { name: 'Alerts', icon: Bell, path: '/counsellor/alerts' },
    { name: 'Interventions', icon: MessageSquare, path: '/counsellor/interventions' },
    { name: 'Reports', icon: BarChart3, path: '/counsellor/reports' },
    { name: 'Profile', icon: Settings, path: '/counsellor/profile' },
  ],
  districtadmin: adminNavItems('districtadmin', [
    { name: 'Register Victim', icon: UserPlus, path: '/districtadmin/register-victim' },
  ]),
  stateadmin: adminNavItems('stateadmin'),
  nationaladmin: [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/nationaladmin' },
    { name: 'Profile', icon: Settings, path: '/nationaladmin/profile' },
  ],
  dataintake: [
    { name: 'Register Victim', icon: UserPlus, path: '/dataintake' },
    { name: 'Victims', icon: Users, path: '/dataintake/victims' },
    { name: 'Fetch Case Details', icon: FileSearch, path: '/dataintake/fetch-case' },
    { name: 'Profile', icon: Settings, path: '/dataintake/profile' },
  ],
};

const SECTION_LABELS = {
  counsellor: 'Senior Counsellor',
  districtadmin: 'District Administration',
  stateadmin: 'State Administration',
  nationaladmin: 'National Administration',
  dataintake: 'Data Intake Admin',
};

// Shared shell for Counsellor, District Admin, and State Admin - `section`
// picks which nav set to show; if not passed explicitly, it's derived from
// the current URL so admin pages don't need to thread the prop through.
export default function StaffLayout({ children, title = 'Dashboard', section }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  // Every route is role-prefixed now (including Reports/Profile), so the
  // section always resolves cleanly from the URL - no more guessing a
  // shared, prefix-less route belongs to Counsellor by default.
  const resolvedSection = section
    || (location.pathname.startsWith('/districtadmin') ? 'districtadmin'
      : location.pathname.startsWith('/stateadmin') ? 'stateadmin'
      : location.pathname.startsWith('/nationaladmin') ? 'nationaladmin'
      : location.pathname.startsWith('/dataintake') ? 'dataintake'
      : 'counsellor');
  const navItems = NAV_ITEMS_BY_SECTION[resolvedSection] || NAV_ITEMS_BY_SECTION.counsellor;
  const alertsPath = navItems.find((item) => item.name === 'Alerts')?.path || `/${resolvedSection}`;
  const profilePath = navItems.find((item) => item.name === 'Profile')?.path || `/${resolvedSection}/profile`;
  // Real open-alert count for the bell dot, matching the Victim app's bell
  // (only shown when there's actually something to see) - only Counsellor
  // has a real alerts endpoint today, District/State Admin's is still a
  // "Coming soon" stub with no data source, so the dot stays off there
  // rather than showing a fabricated count.
  const { data: alertsData } = useCounsellorAlerts(resolvedSection === 'counsellor');
  const openAlertCount = resolvedSection === 'counsellor'
    ? (alertsData?.alerts || []).filter((a) => a.status === 'Open').length
    : 0;
  // Same icon as whichever sidebar item matches the current page, so the
  // top bar always shows a page icon + name, matching the Victim app.
  // Longest-path-wins: Dashboard's own path (e.g. /counsellor) is a prefix
  // of every other route here, so a plain first-match would always pick
  // Dashboard's icon instead of the more specific current page's.
  const activeNavItem = navItems
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const TitleIcon = activeNavItem?.icon;

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] text-gray-800 font-sans">

      {/* PERSISTENT SIDEBAR */}
      <aside className="w-64 bg-[#3D5A80] text-white flex flex-col justify-between shrink-0">
        <div>
          {/* Corner cell - same height as the header to its right, so the
              two read as one continuous strip across the top. */}
          <div className="h-16 flex flex-col justify-center px-6 border-b border-white/10">
            <h1 className="text-xl font-bold tracking-wide leading-tight">Mansakha</h1>
            <p className="text-[11px] text-blue-200 italic leading-tight">Mind matters. We're listening.</p>
          </div>

          <nav className="space-y-2 p-6">
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

        <div className="px-6 pb-6 pt-4 border-t border-blue-400/30">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-blue-100 hover:bg-white/10 transition text-sm"
          >
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* PERSISTENT HEADER - same palette as the Victim app's top bar */}
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
                placeholder="Search cases, alerts..."
                className="pl-9 pr-4 py-1.5 bg-white rounded-md text-sm border border-[#D6E8F5] focus:outline-none focus:ring-2 focus:ring-[#519BCE] w-64 text-[#3D5A80]"
              />
            </div>

            <Link
              to={alertsPath}
              className="relative p-1 text-[#3D5A80] hover:opacity-70"
            >
              <Bell size={20} />
              {openAlertCount > 0 && (
                <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
              )}
            </Link>

            <button
              onClick={() => navigate(profilePath)}
              className="flex items-center gap-3 border-l border-[#D6E8F5] pl-4 text-left focus:outline-none"
            >
              <img
                src={me?.profileImageUrl || FALLBACK_PHOTO}
                alt={me?.fullName || 'Profile'}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div className="text-xs">
                <p className="font-bold text-[#3D5A80]">{me?.fullName || 'Loading...'}</p>
                <p className="text-[#3D5A80]/70">{SECTION_LABELS[resolvedSection]}</p>
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
