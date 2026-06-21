import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { secretsApi, sshCredentialsApi, envsApi } from '../api/client'
import type { SSHCredential, Environment } from '../types'
import { X, Terminal, ChevronRight, Upload, Server, Link, KeyRound, Lock } from 'lucide-react'

interface Props {
  projectId: string
  envId: string
  env: Environment
  onClose: () => void
}

type Step = 'connect' | 'preview'
type Mode = 'saved' | 'manual'
type AuthType = 'key' | 'password'

export default function SSHImportModal({ projectId, envId, env, onClose }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('connect')
  const [mode, setMode] = useState<Mode>(env.ssh_credential_id ? 'saved' : 'saved')

  // Saved-credential mode — pre-fill from environment's saved SSH config
  const [selectedCredId, setSelectedCredId] = useState(env.ssh_credential_id ?? '')
  const [remotePath, setRemotePath] = useState(env.remote_path ?? '')

  // Manual mode
  const [manual, setManual] = useState({
    host: '', port: 22, username: '',
    auth_type: 'key' as AuthType,
    private_key: '', password: '', path: '',
  })

  const [fetchError, setFetchError] = useState('')
  const [content, setContent] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const { data: credentials = [] } = useQuery<SSHCredential[]>({
    queryKey: ['ssh-credentials'],
    queryFn: () => sshCredentialsApi.list().then(r => r.data),
  })

  // When credentials load, if env has a saved credential_id ensure mode is 'saved'
  useEffect(() => {
    if (env.ssh_credential_id && credentials.length > 0) {
      setMode('saved')
    }
  }, [credentials, env.ssh_credential_id])

  const selectedCred = credentials.find(c => c.id === selectedCredId)

  const setManualField = (field: keyof typeof manual) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setManual(m => ({ ...m, [field]: field === 'port' ? Number(e.target.value) : e.target.value }))

  // Save ssh config back to the environment after a successful import
  const saveEnvConfig = useMutation({
    mutationFn: (data: { ssh_credential_id?: string; remote_path?: string }) =>
      envsApi.update(projectId, envId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environment', projectId, envId] }),
  })

  const fetchMutation = useMutation({
    mutationFn: () => {
      const params =
        mode === 'saved'
          ? { credential_id: selectedCredId, path: remotePath }
          : {
              host: manual.host, port: manual.port, username: manual.username,
              auth_type: manual.auth_type, path: manual.path,
              ...(manual.auth_type === 'key' ? { private_key: manual.private_key } : { password: manual.password }),
            }
      return secretsApi.sshFetch(projectId, envId, params)
    },
    onSuccess: (res) => {
      setContent(res.data.content)
      setFetchError('')
      setStep('preview')
    },
    onError: (err: any) => setFetchError(err.response?.data?.detail || 'Connection failed'),
  })

  const importMutation = useMutation({
    mutationFn: () => secretsApi.importDotenv(projectId, envId, content, overwrite),
    onSuccess: (res) => {
      setImportResult(res.data)
      qc.invalidateQueries({ queryKey: ['secrets', envId] })
      // Persist the SSH config that worked back to the environment
      if (mode === 'saved' && selectedCredId) {
        saveEnvConfig.mutate({ ssh_credential_id: selectedCredId, remote_path: remotePath })
      } else if (mode === 'manual') {
        // For manual mode, only save the path (no credential to save)
        saveEnvConfig.mutate({ remote_path: manual.path })
      }
    },
    onError: (err: any) => setFetchError(err.response?.data?.detail || 'Import failed'),
  })

  const canFetch =
    mode === 'saved'
      ? Boolean(selectedCredId && remotePath)
      : Boolean(
          manual.host && manual.username && manual.path &&
          (manual.auth_type === 'key' ? manual.private_key : manual.password)
        )

  const displayHost = mode === 'saved' ? (selectedCred?.host ?? '') : manual.host
  const displayPath = mode === 'saved' ? remotePath : manual.path
  const lineCount = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('=')).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-brand-600" />
            <h2 className="font-semibold text-lg">Import from Server</h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50 text-sm flex-shrink-0">
          <span className={step === 'connect' ? 'font-semibold text-brand-700' : 'text-gray-400'}>
            1. Connect
          </span>
          <ChevronRight size={14} className="text-gray-300" />
          <span className={step === 'preview' ? 'font-semibold text-brand-700' : 'text-gray-400'}>
            2. Preview &amp; Import
          </span>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {importResult ? (
            <div className="text-center py-6">
              <div className="text-green-600 font-semibold text-lg mb-4">Import complete!</div>
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-6">
                {([['Created', importResult.created, 'text-green-600'], ['Updated', importResult.updated, 'text-blue-600'], ['Skipped', importResult.skipped, 'text-gray-500']] as const).map(([l, v, c]) => (
                  <div key={l} className="card p-3 text-center">
                    <div className={`text-2xl font-bold ${c}`}>{v}</div>
                    <div className="text-xs text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mb-4">Server config saved to this environment for next time.</p>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          ) : step === 'connect' ? (
            <form onSubmit={e => { e.preventDefault(); fetchMutation.mutate() }} className="space-y-5">
              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button type="button" onClick={() => setMode('saved')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 transition-colors ${mode === 'saved' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Server size={14} /> Use Saved Server
                </button>
                <button type="button" onClick={() => setMode('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 transition-colors ${mode === 'manual' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Terminal size={14} /> Enter Manually
                </button>
              </div>

              {mode === 'saved' ? (
                <>
                  {credentials.length === 0 ? (
                    <div className="text-center py-4 border border-dashed rounded-lg">
                      <Server size={28} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500 mb-2">No saved servers yet.</p>
                      <a href="/ssh-servers" target="_blank" rel="noopener"
                        className="text-sm text-brand-600 hover:underline inline-flex items-center gap-1">
                        <Link size={13} /> Go to SSH Servers to add one
                      </a>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Select server *</label>
                      <select className="input" required value={selectedCredId}
                        onChange={e => setSelectedCredId(e.target.value)}>
                        <option value="">— choose a server —</option>
                        {credentials.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.label} ({c.username}@{c.host}:{c.port})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remote .env path *</label>
                    <input className="input font-mono" required placeholder="/home/ubuntu/myapp/.env"
                      value={remotePath} onChange={e => setRemotePath(e.target.value)} />
                    {env.ssh_credential_id === selectedCredId && env.remote_path && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Pre-filled from this environment's saved config
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hostname / IP *</label>
                      <input className="input" required placeholder="10.10.10.102"
                        value={manual.host} onChange={setManualField('host')} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input className="input" type="number" min={1} max={65535}
                        value={manual.port} onChange={setManualField('port')} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input className="input" required placeholder="ubuntu"
                      value={manual.username} onChange={setManualField('username')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Authentication</label>
                    <div className="flex rounded-lg border overflow-hidden text-sm">
                      <button type="button"
                        onClick={() => setManual(m => ({ ...m, auth_type: 'key' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 transition-colors ${manual.auth_type === 'key' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <KeyRound size={13} /> SSH Key
                      </button>
                      <button type="button"
                        onClick={() => setManual(m => ({ ...m, auth_type: 'password' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 transition-colors ${manual.auth_type === 'password' ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <Lock size={13} /> Password
                      </button>
                    </div>
                  </div>
                  {manual.auth_type === 'key' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SSH Private Key *
                        <span className="font-normal text-gray-400 ml-1">(PEM — RSA, ECDSA or Ed25519)</span>
                      </label>
                      <textarea className="input font-mono text-xs resize-none" rows={5}
                        required spellCheck={false}
                        placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                        value={manual.private_key} onChange={setManualField('private_key')} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input className="input" type="password" required autoComplete="off"
                        placeholder="••••••••••••"
                        value={manual.password} onChange={setManualField('password')} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remote .env path *</label>
                    <input className="input font-mono" required placeholder="/home/ubuntu/myapp/.env"
                      value={manual.path} onChange={setManualField('path')} />
                  </div>
                </>
              )}

              {fetchError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{fetchError}</p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={!canFetch || fetchMutation.isPending} className="btn-primary">
                  {fetchMutation.isPending ? 'Connecting…' : 'Fetch File'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Fetched from <code className="bg-gray-100 px-1 rounded text-xs">{displayHost}:{displayPath}</code>
                  {' — '}<strong>{lineCount}</strong> variable{lineCount !== 1 ? 's' : ''} detected
                </p>
                <button onClick={() => { setStep('connect'); setFetchError('') }}
                  className="text-xs text-brand-600 hover:underline">
                  Change connection
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File content preview</label>
                <textarea className="input font-mono text-xs resize-none bg-gray-50" rows={12}
                  value={content} onChange={e => setContent(e.target.value)} spellCheck={false} />
                <p className="text-xs text-gray-400 mt-1">You can edit the content before importing.</p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={overwrite}
                  onChange={e => setOverwrite(e.target.checked)} />
                <span className="text-sm text-gray-700">Overwrite existing keys</span>
              </label>

              {fetchError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{fetchError}</p>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button onClick={() => importMutation.mutate()}
                  disabled={!content.trim() || importMutation.isPending} className="btn-primary">
                  <Upload size={15} />
                  {importMutation.isPending ? 'Importing…' : 'Import Secrets'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
