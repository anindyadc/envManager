import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { secretsApi, envsApi, projectsApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import {
  Plus, Eye, EyeOff, Pencil, Trash2, ArrowLeft, Download, Upload,
  Copy, Check, X, History, Key, RefreshCw, Link2
} from 'lucide-react'
import type { Secret, Environment, Project } from '../types'
import ShareLinkModal from '../components/ShareLinkModal'
import SSHImportModal from '../components/SSHImportModal'

function SecretRow({ secret, projectId, envId, canEdit }: {
  secret: Secret; projectId: string; envId: string; canEdit: boolean
}) {
  const qc = useQueryClient()
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: revealedSecret } = useQuery<Secret>({
    queryKey: ['secret', secret.id, 'revealed'],
    queryFn: () => secretsApi.list(projectId, envId, true).then(r => r.data.find((s: Secret) => s.id === secret.id)),
    enabled: revealed,
  })

  const updateMutation = useMutation({
    mutationFn: (value: string) => secretsApi.update(projectId, envId, secret.id, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['secrets', envId] })
      qc.invalidateQueries({ queryKey: ['secret', secret.id, 'revealed'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => secretsApi.delete(projectId, envId, secret.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', envId] }),
  })

  const displayValue = revealed ? (revealedSecret?.value ?? '...') : (secret.value ?? '••••••••')

  const handleCopy = async () => {
    const val = revealedSecret?.value ?? secret.value ?? ''
    await navigator.clipboard.writeText(val)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <tr className="border-b last:border-0 hover:bg-gray-50 group">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Key size={13} className="text-gray-400 flex-shrink-0" />
          <code className="text-sm font-mono font-medium text-gray-800">{secret.key}</code>
          {secret.is_sensitive && (
            <span className="badge bg-red-50 text-red-600 text-xs">sensitive</span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              className="input text-sm font-mono flex-1"
              type="text"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              autoFocus
              placeholder="New value..."
            />
            <button className="btn-primary py-1 px-3 text-xs"
              onClick={() => updateMutation.mutate(newValue)}
              disabled={updateMutation.isPending}>
              Save
            </button>
            <button className="btn-secondary py-1 px-3 text-xs" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-gray-600 max-w-xs truncate">
              {displayValue}
            </code>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setRevealed(r => !r)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded">
                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button onClick={handleCopy} className="p-1 text-gray-400 hover:text-gray-700 rounded">
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-xs text-gray-400 text-center">v{secret.version}</td>
      <td className="py-3 px-4 text-xs text-gray-400">{new Date(secret.updated_at).toLocaleDateString()}</td>
      {canEdit && (
        <td className="py-3 px-4">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
            <button onClick={() => { setEditing(true); setNewValue('') }}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded">
              <Pencil size={13} />
            </button>
            <button onClick={() => { if (confirm(`Delete "${secret.key}"?`)) deleteMutation.mutate() }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

function AddSecretModal({ projectId, envId, onClose }: { projectId: string; envId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ key: '', value: '', is_sensitive: true })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => secretsApi.create(projectId, envId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['secrets', envId] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to add'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">Add Secret</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key (UPPER_SNAKE_CASE) *</label>
            <input className="input font-mono" required placeholder="DATABASE_URL"
              value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value *</label>
            <textarea className="input font-mono resize-none" rows={3} required
              placeholder="postgres://user:pass@host:5432/db"
              value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.is_sensitive}
              onChange={e => setForm(f => ({ ...f, is_sensitive: e.target.checked }))} />
            <span className="text-sm text-gray-700">Mark as sensitive (mask in UI)</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Adding...' : 'Add Secret'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ImportModal({ projectId, envId, onClose }: { projectId: string; envId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: () => secretsApi.importDotenv(projectId, envId, content, overwrite),
    onSuccess: (res) => {
      setResult(res.data)
      qc.invalidateQueries({ queryKey: ['secrets', envId] })
    },
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setContent(ev.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">Import .env File</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <div className="text-green-600 font-semibold mb-2">Import complete!</div>
              <div className="grid grid-cols-3 gap-3">
                {[['Created', result.created, 'text-green-600'], ['Updated', result.updated, 'text-blue-600'], ['Skipped', result.skipped, 'text-gray-500']].map(([l, v, c]) => (
                  <div key={l as string} className="card p-3 text-center">
                    <div className={`text-xl font-bold ${c}`}>{v}</div>
                    <div className="text-xs text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
              <button className="btn-primary mt-4" onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              <div>
                <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full justify-center">
                  <Upload size={16} /> Choose .env file
                </button>
                <input ref={fileRef} type="file" accept=".env,text/plain" className="hidden" onChange={handleFile} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Or paste .env content</label>
                <textarea className="input font-mono text-xs resize-none" rows={8}
                  placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=secret\nDEBUG=false'}
                  value={content} onChange={e => setContent(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={overwrite}
                  onChange={e => setOverwrite(e.target.checked)} />
                <span className="text-sm text-gray-700">Overwrite existing keys</span>
              </label>
              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button onClick={() => mutation.mutate()} disabled={!content || mutation.isPending} className="btn-primary">
                  {mutation.isPending ? 'Importing...' : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EnvironmentDetail() {
  const { projectId, envId } = useParams<{ projectId: string; envId: string }>()
  const { isEditor, isAdmin } = useAuth()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showShareLinks, setShowShareLinks] = useState(false)
  const [showSSHImport, setShowSSHImport] = useState(false)
  const [search, setSearch] = useState('')
  const [reevalResult, setReevalResult] = useState<{ changed: number; unchanged: number } | null>(null)

  const reevaluateMutation = useMutation({
    mutationFn: () => secretsApi.reevaluateSensitive(projectId!, envId!),
    onSuccess: (res) => {
      setReevalResult(res.data)
      qc.invalidateQueries({ queryKey: ['secrets', envId] })
    },
  })

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then(r => r.data),
  })

  const { data: env } = useQuery<Environment>({
    queryKey: ['environment', projectId, envId],
    queryFn: () => envsApi.get(projectId!, envId!).then(r => r.data),
  })

  const { data: secrets = [], isLoading } = useQuery<Secret[]>({
    queryKey: ['secrets', envId],
    queryFn: () => secretsApi.list(projectId!, envId!).then(r => r.data),
  })

  const handleExport = async () => {
    const res = await secretsApi.exportDotenv(projectId!, envId!)
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `.env.${env?.name ?? 'export'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = secrets.filter(s => s.key.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link to={`/projects/${projectId}`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> {project?.name}
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{env?.name}</h1>
            <span className={`badge ${env?.env_type === 'production' ? 'bg-red-100 text-red-700' : env?.env_type === 'staging' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
              {env?.env_type}
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-0.5">{secrets.length} secret{secrets.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={handleExport} className="btn-secondary">
            <Download size={15} /> Export .env
          </button>
          <button onClick={() => setShowShareLinks(true)} className="btn-secondary">
            <Link2 size={15} /> Share Link
          </button>
          {isEditor && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary">
                <Upload size={15} /> Import .env
              </button>
              <button onClick={() => setShowSSHImport(true)} className="btn-secondary">
                <Upload size={15} /> Import from Server
              </button>
              <button
                onClick={() => { setReevalResult(null); reevaluateMutation.mutate() }}
                disabled={reevaluateMutation.isPending}
                title="Re-evaluate which keys should be masked based on their name (PASSWORD, KEY, TOKEN, etc.)"
                className="btn-secondary"
              >
                <RefreshCw size={15} className={reevaluateMutation.isPending ? 'animate-spin' : ''} />
                Fix Sensitive Flags
              </button>
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <Plus size={16} /> Add Secret
              </button>
            </>
          )}
        </div>
      </div>

      {reevalResult && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between text-sm text-green-800">
          <span>
            <strong>Sensitive flags updated:</strong> {reevalResult.changed} changed, {reevalResult.unchanged} already correct.
          </span>
          <button onClick={() => setReevalResult(null)} className="text-green-600 hover:text-green-800 ml-4">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <input className="input max-w-xs" placeholder="Filter keys..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <span className="text-sm text-gray-400">{filtered.length} of {secrets.length}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading secrets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-gray-400">No secrets yet. Add your first environment variable.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="py-3 px-4">Key</th>
                <th className="py-3 px-4">Value</th>
                <th className="py-3 px-4 text-center">Version</th>
                <th className="py-3 px-4">Updated</th>
                {isEditor && <th className="py-3 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(secret => (
                <SecretRow
                  key={secret.id}
                  secret={secret}
                  projectId={projectId!}
                  envId={envId!}
                  canEdit={isEditor}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddSecretModal projectId={projectId!} envId={envId!} onClose={() => setShowAdd(false)} />}
      {showImport && <ImportModal projectId={projectId!} envId={envId!} onClose={() => setShowImport(false)} />}
      {showSSHImport && env && <SSHImportModal projectId={projectId!} envId={envId!} env={env} onClose={() => setShowSSHImport(false)} />}
      {showShareLinks && env && (
        <ShareLinkModal
          projectId={projectId!}
          envId={envId!}
          envName={env.name}
          onClose={() => setShowShareLinks(false)}
        />
      )}
    </div>
  )
}
