import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, FolderKanban, ShieldAlert, Users, LogOut, KeyRound, ChevronRight, Server
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/ssh-servers', label: 'SSH Servers', icon: Server },
  { to: '/audit', label: 'Audit Logs', icon: ShieldAlert, adminOnly: true },
  { to: '/team', label: 'Team', icon: Users, adminOnly: true },
]

export default function Layout() {
  const { user, clearAuth, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-gray-100 flex flex-col">
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <KeyRound className="text-brand-400" size={22} />
            <span className="font-bold text-white text-lg leading-tight">ENV Manager</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Multi-Cloud Secrets</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, exact, adminOnly }) => {
            if (adminOnly && !isAdmin) return null
            return (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800 mb-2">
            <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold">
              {user?.full_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
