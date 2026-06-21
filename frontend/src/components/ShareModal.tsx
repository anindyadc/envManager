import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { X, UserPlus, Trash2, Shield, Pencil, Check } from 'lucide-react'
import type { ProjectMember, UserRole } from '../types'

const roleBadge: Record<UserRole, string> = {
  admin:  'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
}

const roleDesc: Record<UserRole, string> = {
  admin:  'Can manage members, edit all settings',
  editor: 'Can add/edit/delete secrets and environments',
  viewer: 'Read-only — values masked by default',
}

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export default function ShareModal({ projectId, projectName, onClose }: Props) {
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('viewer')

  const { data: members = [], isLoading } = useQuery<ProjectMember[]>({
    queryKey: ['members', projectId],
    queryFn: () => membersApi.list(projectId).then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: () => membersApi.add(projectId, email, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEmail('')
      setAddError('')
    },
    onError: (err: any) => setAddError(err.response?.data?.detail || 'Failed to add member'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: UserRole }) =>
      membersApi.updateRole(projectId, memberId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      setEditingId(null)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => membersApi.remove(projectId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg">Share Project</h2>
            <p className="text-sm text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Role legend */}
        <div className="px-5 pt-4 grid grid-cols-3 gap-2">
          {(['admin', 'editor', 'viewer'] as UserRole[]).map(r => (
            <div key={r} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className={`badge ${roleBadge[r]} mb-1`}>{r}</span>
              <p className="text-xs text-gray-500 mt-1">{roleDesc[r]}</p>
            </div>
          ))}
        </div>

        {/* Add member form */}
        <div className="p-5 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Invite by email
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="email"
              placeholder="developer@company.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setAddError('') }}
              onKeyDown={e => e.key === 'Enter' && email && addMutation.mutate()}
            />
            <select
              className="input w-28"
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="btn-primary px-3"
              disabled={!email || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              <UserPlus size={16} />
            </button>
          </div>
          {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
          <p className="text-xs text-gray-400 mt-2">
            The person must already have an account. Share the app URL so they can register first.
          </p>
        </div>

        {/* Members list */}
        <div className="p-5 max-h-72 overflow-y-auto">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Members ({members.length})
          </p>

          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-gray-400 text-sm">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 group">
                  <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {m.full_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.full_name}
                      {m.user_id === currentUser?.id && (
                        <span className="text-xs text-gray-400 ml-1">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                  </div>

                  {editingId === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        className="input text-xs py-1 w-24"
                        value={editRole}
                        onChange={e => setEditRole(e.target.value as UserRole)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => updateMutation.mutate({ memberId: m.id, role: editRole })}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className={`badge ${roleBadge[m.role]}`}>{m.role}</span>
                      {m.user_id !== currentUser?.id && (
                        <>
                          <button
                            onClick={() => { setEditingId(m.id); setEditRole(m.role) }}
                            className="p-1 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Remove ${m.email}?`)) removeMutation.mutate(m.id) }}
                            className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end">
          <button onClick={onClose} className="btn-secondary">Done</button>
        </div>
      </div>
    </div>
  )
}
