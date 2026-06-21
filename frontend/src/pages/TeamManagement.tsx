import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Users, Shield, Pencil, Check, X } from 'lucide-react'
import type { User, UserRole } from '../types'

const roleBadge: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

function UserRow({ user, currentUserId }: { user: User; currentUserId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState(user.role)

  const mutation = useMutation({
    mutationFn: () => authApi.updateUser(user.id, { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditing(false) },
  })

  const toggleActive = useMutation({
    mutationFn: () => authApi.updateUser(user.id, { is_active: !user.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const isSelf = user.id === currentUserId

  return (
    <tr className="border-t hover:bg-gray-50">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
            {user.full_name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user.full_name} {isSelf && <span className="text-xs text-gray-400">(you)</span>}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <select className="input text-sm py-1 w-28" value={role} onChange={e => setRole(e.target.value as UserRole)}>
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button onClick={() => mutation.mutate()} className="p-1 text-green-600 hover:bg-green-50 rounded">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`badge ${roleBadge[user.role]}`}>{user.role}</span>
            {!isSelf && (
              <button onClick={() => setEditing(true)} className="p-1 text-gray-300 hover:text-brand-600 rounded">
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <span className={`badge ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-gray-400">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
      <td className="py-3 px-4">
        {!isSelf && (
          <button
            onClick={() => toggleActive.mutate()}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            {user.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </td>
    </tr>
  )
}

export default function TeamManagement() {
  const { user: currentUser } = useAuth()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => authApi.listUsers().then(r => r.data),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Users className="text-brand-600" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-gray-500 text-sm">Manage user access and roles</p>
        </div>
      </div>

      <div className="card p-4 mb-6 bg-amber-50 border-amber-200 flex gap-3">
        <Shield className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-amber-800">
          <strong>Roles:</strong> <strong>Admin</strong> — full access including audit logs and user management.{' '}
          <strong>Editor</strong> — can create/edit projects, environments, and secrets.{' '}
          <strong>Viewer</strong> — read-only access (sensitive values masked).
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Joined</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => <UserRow key={u.id} user={u} currentUserId={currentUser?.id ?? ''} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
