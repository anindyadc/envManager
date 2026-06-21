import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { shareLinksApi } from '../api/client'
import { Key, Eye, EyeOff, Copy, Check, Lock, Clock } from 'lucide-react'

interface PublicSecret {
  key: string
  value: string | null
  is_sensitive: boolean
}

interface PublicView {
  environment_name: string
  project_name: string
  env_type: string
  expires_at: string
  secrets: PublicSecret[]
  note: string | null
}

function SecretRow({ secret }: { secret: PublicSecret }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const displayValue = secret.is_sensitive && !revealed ? (secret.value ?? '••••••••') : (secret.value ?? '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret.value ?? '')
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
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-gray-600 max-w-sm truncate">{displayValue}</code>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {secret.is_sensitive && (
              <button
                onClick={() => setRevealed(r => !r)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}
            <button onClick={handleCopy} className="p-1 text-gray-400 hover:text-gray-700 rounded">
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, error } = useQuery<PublicView>({
    queryKey: ['share', token],
    queryFn: () => shareLinksApi.getPublic(token!).then(r => r.data),
    retry: false,
  })

  const [search, setSearch] = useState('')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading shared environment…</p>
      </div>
    )
  }

  if (error) {
    const msg = (error as any)?.response?.data?.detail ?? 'Link not found or expired'
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center">
          <Lock size={36} className="mx-auto text-gray-300 mb-3" />
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Cannot access this link</h1>
          <p className="text-gray-500 text-sm">{msg}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const filtered = data.secrets.filter(s => s.key.toLowerCase().includes(search.toLowerCase()))
  const expiresAt = new Date(data.expires_at)
  const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 3600000))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Shared Environment</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {data.project_name} / {data.environment_name}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="badge bg-gray-100 text-gray-600">{data.env_type}</span>
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {hoursLeft > 0
                  ? `Expires in ${hoursLeft < 24 ? `${hoursLeft}h` : `${Math.floor(hoursLeft / 24)}d`}`
                  : 'Expired'}
              </span>
              {data.note && <span>· {data.note}</span>}
            </div>
          </div>
          <div className="text-xs text-gray-400 text-right">
            <Lock size={14} className="inline mr-1" />
            Read-only · Sensitive values masked
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="card overflow-hidden">
          <div className="p-4 border-b flex items-center gap-3">
            <input
              className="input max-w-xs"
              placeholder="Filter keys…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span className="text-sm text-gray-400">
              {filtered.length} of {data.secrets.length} secrets
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Key className="mx-auto text-gray-300 mb-3" size={36} />
              <p className="text-gray-400">No secrets match your filter.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                  <th className="py-3 px-4">Key</th>
                  <th className="py-3 px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(secret => (
                  <SecretRow key={secret.key} secret={secret} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
