import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sshCredentialsApi } from '../api/client'
import type { SSHCredential } from '../types'
import { Server, Plus, Pencil, Trash2, X, Check, KeyRound, Lock } from 'lucide-react'

type AuthType = 'key' | 'password'

interface FormState {
  label: string
  host: string
  port: number
  username: string
  auth_type: AuthType
  private_key: string
  password: string
}

function CredentialForm({
  initial,
  onSave,
  onCancel,
  isPending,
  error,
}: {
  initial?: Partial<SSHCredential>
  onSave: (data: FormState) => void
  onCancel: () => void
  isPending: boolean
  error: string
}) {
  const isEdit = Boolean(initial?.id)
  const [form, setForm] = useState<FormState>({
    label: initial?.label ?? '',
    host: initial?.host ?? '',
    port: initial?.port ?? 22,
    username: initial?.username ?? '',
    auth_type: (initial?.auth_type as AuthType) ?? 'key',
    private_key: '',
    password: '',
  })

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: field === 'port' ? Number(e.target.value) : e.target.value }))

  const setAuthType = (t: AuthType) => setForm(f => ({ ...f, auth_type: t }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
        <input className="input" required placeholder="Production zenpi server"
          value={form.label} onChange={set('label')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Hostname / IP *</label>
          <input className="input" required placeholder="10.10.10.102"
            value={form.host} onChange={set('host')} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
          <input className="input" type="number" min={1} max={65535}
            value={form.port} onChange={set('port')} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
        <input className="input" required placeholder="ubuntu"
          value={form.username} onChange={set('username')} />
      </div>

      {/* Auth type toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Authentication</label>
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setAuthType('key')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 transition-colors ${form.auth_type === 'key' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <KeyRound size={14} /> SSH Private Key
          </button>
          <button
            type="button"
            onClick={() => setAuthType('password')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 transition-colors ${form.auth_type === 'password' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Lock size={14} /> Password
          </button>
        </div>
      </div>

      {form.auth_type === 'key' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Private Key {isEdit ? <span className="font-normal text-gray-400">(leave blank to keep existing)</span> : '*'}
          </label>
          <textarea
            className="input font-mono text-xs resize-none"
            rows={7}
            required={!isEdit}
            spellCheck={false}
            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
            value={form.private_key}
            onChange={set('private_key')}
          />
          <p className="text-xs text-gray-400 mt-1">Stored encrypted at rest. Never returned after saving.</p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password {isEdit ? <span className="font-normal text-gray-400">(leave blank to keep existing)</span> : '*'}
          </label>
          <input
            className="input"
            type="password"
            required={!isEdit}
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={form.password}
            onChange={set('password')}
          />
          <p className="text-xs text-gray-400 mt-1">Stored encrypted at rest. Never returned after saving.</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'Saving…' : isEdit ? 'Update Server' : 'Save Server'}
        </button>
      </div>
    </form>
  )
}

function CredentialModal({ initial, onClose }: { initial?: SSHCredential; onClose: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      sshCredentialsApi.create({
        label: data.label, host: data.host, port: data.port, username: data.username,
        auth_type: data.auth_type,
        ...(data.auth_type === 'key' ? { private_key: data.private_key } : { password: data.password }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ssh-credentials'] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to save'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => sshCredentialsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ssh-credentials'] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to update'),
  })

  const handleSave = (data: FormState) => {
    setError('')
    if (initial) {
      const payload: Record<string, unknown> = {
        label: data.label, host: data.host, port: data.port,
        username: data.username, auth_type: data.auth_type,
      }
      if (data.auth_type === 'key' && data.private_key.trim()) payload.private_key = data.private_key
      if (data.auth_type === 'password' && data.password) payload.password = data.password
      updateMutation.mutate({ id: initial.id, data: payload })
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">{initial ? 'Edit Server' : 'Add SSH Server'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5">
          <CredentialForm
            initial={initial}
            onSave={handleSave}
            onCancel={onClose}
            isPending={createMutation.isPending || updateMutation.isPending}
            error={error}
          />
        </div>
      </div>
    </div>
  )
}

export default function SSHServers() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<SSHCredential | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: credentials = [], isLoading } = useQuery<SSHCredential[]>({
    queryKey: ['ssh-credentials'],
    queryFn: () => sshCredentialsApi.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: sshCredentialsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ssh-credentials'] }); setConfirmDelete(null) },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Server size={22} className="text-brand-600" /> SSH Servers
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Saved server credentials for importing .env files directly from remote machines
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} /> Add Server
        </button>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-gray-400">Loading…</div>
      ) : credentials.length === 0 ? (
        <div className="card p-12 text-center">
          <Server className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500 font-medium mb-1">No SSH servers saved yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Add a server to quickly import .env files without entering credentials each time.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={15} /> Add Your First Server
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="py-3 px-4">Label</th>
                <th className="py-3 px-4">Host</th>
                <th className="py-3 px-4">Port</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Auth</th>
                <th className="py-3 px-4">Credential</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(cred => (
                <tr key={cred.id} className="border-t hover:bg-gray-50 group">
                  <td className="py-3 px-4 font-medium text-gray-800">{cred.label}</td>
                  <td className="py-3 px-4 font-mono text-sm text-gray-600">{cred.host}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{cred.port}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{cred.username}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cred.auth_type === 'key' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {cred.auth_type === 'key' ? <KeyRound size={11} /> : <Lock size={11} />}
                      {cred.auth_type === 'key' ? 'SSH Key' : 'Password'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {cred.has_credential ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <Check size={11} /> Saved
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button onClick={() => setEditing(cred)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="Edit">
                        <Pencil size={13} />
                      </button>
                      {confirmDelete === cred.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600">Sure?</span>
                          <button onClick={() => deleteMutation.mutate(cred.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded text-xs font-medium">
                            Yes
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(cred.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
        <KeyRound size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          Private keys and passwords are encrypted at rest with AES-256 and are never returned by the API.
          They are decrypted only when you trigger an "Import from Server" action.
        </p>
      </div>

      {(showAdd || editing) && (
        <CredentialModal
          initial={editing ?? undefined}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
