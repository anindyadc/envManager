import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../api/client'
import { ShieldAlert } from 'lucide-react'
import type { AuditLog } from '../types'

const actionColor: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-700',
  REGISTER: 'bg-purple-100 text-purple-700',
  EXPORT: 'bg-yellow-100 text-yellow-700',
  IMPORT: 'bg-orange-100 text-orange-700',
  READ: 'bg-gray-100 text-gray-500',
}

export default function AuditLogs() {
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit'],
    queryFn: () => auditApi.list({ limit: 200 }).then(r => r.data),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="text-brand-600" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 text-sm">Complete history of all actions in your organization</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No audit records yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Resource</th>
                <th className="py-3 px-4">Detail</th>
                <th className="py-3 px-4">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-t hover:bg-gray-50 text-sm">
                  <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`badge ${actionColor[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-gray-700 font-medium">{log.resource_type}</span>
                    {log.resource_name && (
                      <span className="text-gray-400 text-xs ml-1.5">{log.resource_name}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-gray-400 text-xs max-w-xs truncate">{log.detail ?? '—'}</td>
                  <td className="py-2.5 px-4 text-gray-400 text-xs">{log.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
