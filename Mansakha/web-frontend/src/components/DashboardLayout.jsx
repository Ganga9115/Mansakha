import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ListOrdered, 
  Bell, 
  MessageSquare, 
  BarChart3, 
  Settings, 
  Search 
} from 'lucide-react';

export default function DashboardLayout({ children, title = "Dashboard" }) {
  const navigate = useNavigate();

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/" },
    { name: "Case Queue", icon: ListOrdered, path: "/case-queue" },
    { name: "Alerts", icon: Bell, path: "/alerts" },
    { name: "Interventions", icon: MessageSquare, path: "/interventions" },
    { name: "Reports", icon: BarChart3, path: "/reports" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

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
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition ${
                      isActive 
                        ? "bg-[#519BCE] text-white shadow-sm" 
                        : "text-blue-100 hover:bg-white/10"
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

        <div className="pt-4 border-t border-blue-400/30 flex items-center gap-2 text-xs text-blue-200">
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>Secure Server Connected</span>
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
              to="/alerts" 
              className="relative p-1 text-gray-500 hover:text-gray-700"
            >
              <Bell size={20} />
              <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
            </Link>

            <button 
              onClick={() => navigate('/settings')}
              className="flex items-center gap-3 border-l border-gray-200 pl-6 text-left focus:outline-none"
            >
              <img 
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100" 
                alt="Dr. Sarah Jenkins" 
                className="w-9 h-9 rounded-full object-cover"
              />
              <div className="text-xs">
                <p className="font-bold text-gray-800">Dr. Sarah Jenkins</p>
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