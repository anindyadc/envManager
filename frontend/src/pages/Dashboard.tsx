import { useQuery } from '@tanstack/react-query'
import { projectsApi, auditApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { FolderKanban, Key, Activity, Cloud, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Project, AuditLog } from '../types'

const providerColors: Record<string, string> = {
  aws: 'bg-orange-100 text-orange-700',
  azure: 'bg-blue-100 text-blue-700',
  gcp: 'bg-red-100 text-red-700',
  on_premise: 'bg-gray-100 text-gray-700',
  multi_cloud: 'bg-purple-100 text-purple-700',
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then(r => r.data),
  })
  const { data: auditLogs = [] } = useQuery<AuditLog[]>({
    queryKey: ['audit', 'recent'],
    queryFn: () => auditApi.list({ limit: 5 }).then(r => r.data),
    enabled: isAdmin,
  })

  const totalEnvs = projects.reduce((s, p) => s + p.environment_count, 0)
  const awsCount = projects.filter(p => p.cloud_provider === 'aws').length
  const azureCount = projects.filter(p => p.cloud_provider === 'azure').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-gray-500 mt-1">Here's an overview of your environment secrets</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Projects', value: projects.length, icon: FolderKanban, color: 'text-brand-600 bg-brand-50' },
          { label: 'Environments', value: totalEnvs, icon: Server, color: 'text-green-600 bg-green-50' },
          { label: 'AWS Projects', value: awsCount, icon: Cloud, color: 'text-orange-600 bg-orange-50' },
          { label: 'Azure Projects', value: azureCount, icon: Cloud, color: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex p-2 rounded-lg mb-3 ${color}`}>
              <Icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Projects</h2>
            <Link to="/projects" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No projects yet. <Link to="/projects" className="text-brand-600 hover:underline">Create one</Link></p>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map(p => (
                <Link key={p.id} to={`/projects/${p.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center text-brand-600 font-bold text-sm">
                    {p.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.environment_count} environment{p.environment_count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={`badge ${providerColors[p.cloud_provider]}`}>
                    {p.cloud_provider.toUpperCase()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Audit Feed */}
        {isAdmin && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Recent Activity</h2>
              <Link to="/audit" className="text-sm text-brand-600 hover:underline">View all</Link>
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                      <Activity size={14} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{log.action}</span>
                        {' '}{log.resource_type}
                        {log.resource_name && <span className="text-gray-500"> · {log.resource_name}</span>}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
