import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { secretsApi } from '../api/client'
import { X, Clock, Eye, EyeOff, RotateCcw, GitCompare } from 'lucide-react'
import type { Secret, SecretVersion } from '../types'

function ValueCell({ value, isSensitive }: { value: string | null; isSensitive: boolean }) {
  const [shown, setShown] = useState(!isSensitive)
  if (value === null)
    return <span className="text-gray-400 italic text-xs">enable Reveal to view</span>
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <code className="font-mono text-xs break-all">{isSensitive && !shown ? '••••••••' : value}</code>
      {isSensitive && (
        <button onClick={() => setShown(s => !s)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          {shown ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}
    </span>
  )
}

interface Props {
  secret: Secret
  projectId: string
  envId: string
  appId: string
  onClose: () => void
}

export default function SecretHistoryDrawer({ secret, projectId, envId, appId, onClose }: Props) {
  const qc = useQueryClient()
  const [reveal, setReveal] = useState(false)
  const [diffId, setDiffId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { data: versions = [], isLoading } = useQuery<SecretVersion[]>({
    queryKey: ['versions', secret.id, reveal],
    queryFn: () => secretsApi.versions(projectId, envId, appId, secret.id, reveal).then(r => r.data),
  })

  const { data: currentSecret } = useQuery<Secret>({
    queryKey: ['secret', secret.id, 'revealed'],
    queryFn: () =>
      secretsApi.list(projectId, envId, appId, true).then(r =>
        r.data.find((s: Secret) => s.id === secret.id)
      ),
    enabled: reveal,
  })

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      secretsApi.restore(projectId, envId, appId, secret.id, versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['secrets', appId] })
      qc.invalidateQueries({ queryKey: ['versions', secret.id] })
      qc.invalidateQueries({ queryKey: ['secret', secret.id, 'revealed'] })
      setConfirmId(null)
      setDiffId(null)
    },
  })

  const diffVersion = versions.find(v => v.id === diffId)
  // Non-sensitive: value is already in the secret prop; sensitive: need reveal query
  const currentValue = reveal
    ? (currentSecret?.value ?? secret.value)
    : (secret.is_sensitive ? null : secret.value)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />

      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-brand-500" />
              <h2 className="font-semibold text-gray-900">Version History</h2>
            </div>
            <code className="text-xs text-gray-500 font-mono mt-0.5 block">{secret.key}</code>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" className="rounded" checked={reveal}
                onChange={e => setReveal(e.target.checked)} />
              Reveal values
            </label>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Diff panel */}
        {diffId && diffVersion && (
          <div className="mx-4 mt-4 p-3 border rounded-lg bg-amber-50 border-amber-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <GitCompare size={12} />
                v{diffVersion.version} → v{secret.version} (current)
              </span>
              <button onClick={() => setDiffId(null)} className="text-amber-500 hover:text-amber-700">
                <X size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">v{diffVersion.version} — old</p>
                <div className="bg-red-50 border border-red-200 rounded p-2 min-h-[36px] flex items-center">
                  <ValueCell value={diffVersion.value} isSensitive={secret.is_sensitive} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">v{secret.version} — current</p>
                <div className="bg-green-50 border border-green-200 rounded p-2 min-h-[36px] flex items-center">
                  <ValueCell value={currentValue} isSensitive={secret.is_sensitive} />
                </div>
              </div>
            </div>
            {!reveal && secret.is_sensitive && (
              <p className="text-xs text-amber-700 mt-2">Enable "Reveal values" above to compare.</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Current version */}
          <div className="border-2 border-green-300 rounded-lg p-3 bg-green-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-gray-700">v{secret.version}</span>
                <span className="badge bg-green-100 text-green-700 text-xs">current</span>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(secret.updated_at).toLocaleString()}
              </span>
            </div>
            <ValueCell value={currentValue} isSensitive={secret.is_sensitive} />
          </div>

          {/* History entries */}
          {isLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading history…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No previous versions — this secret has never been changed.</p>
          ) : (
            versions.map(v => (
              <div key={v.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono font-medium text-gray-700">v{v.version}</span>
                      <span className="text-xs text-gray-400">{new Date(v.changed_at).toLocaleString()}</span>
                    </div>
                    <ValueCell value={v.value} isSensitive={secret.is_sensitive} />
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => setDiffId(diffId === v.id ? null : v.id)}
                      title="Compare with current"
                      className={`p-1.5 rounded transition-colors ${
                        diffId === v.id
                          ? 'bg-amber-100 text-amber-700'
                          : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                      }`}
                    >
                      <GitCompare size={13} />
                    </button>

                    {confirmId === v.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-orange-600 whitespace-nowrap">Restore to v{v.version}?</span>
                        <button
                          onClick={() => restoreMutation.mutate(v.id)}
                          disabled={restoreMutation.isPending}
                          className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(v.id)}
                        title={`Restore to v${v.version}`}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  )
}
