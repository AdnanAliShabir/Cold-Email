import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/leads', label: 'Leads', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M16 3.13a4 4 0 010 7.75M8 7a4 4 0 110 8 4 4 0 010-8z' },
  { to: '/pipeline', label: 'Pipeline', icon: 'M3 3v18h18M8 17V9m4 8V5m4 12v-6' },
  { to: '/followups', label: 'Follow-ups', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/statistics', label: 'Statistics', icon: 'M3 3v18h18M7 17v-6m5 6V7m5 10v-3' },
  { to: '/ai', label: 'AI Tools', icon: 'M12 3v3m6.36 1.64l-2.12 2.12M21 12h-3m.36 6.36l-2.12-2.12M12 21v-3m-6.36-1.64l2.12-2.12M3 12h3m-.36-6.36l2.12 2.12M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { to: '/templates', label: 'Templates', icon: 'M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2z' },
]

function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 bg-gray-900 text-gray-300 flex flex-col fixed inset-y-0 z-20">
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">LeadCRM</h1>
          <p className="text-xs text-gray-500">Hunt · Outreach · Close</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-emerald-600 text-white' : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-gray-800">
          <div className="mb-2 text-sm">{user?.name}</div>
          <button
            onClick={logout}
            className="w-full text-left text-xs text-gray-400 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 min-w-0 overflow-x-hidden">
        <div className="p-8 min-h-screen">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Layout