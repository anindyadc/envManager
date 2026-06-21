import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shareLinksApi } from '../api/client'
import { X, Link2, Copy, Check, Trash2, Clock, Eye } from 'lucide-react'
import type { ShareLink } from '../types'

const EXPIRY_OPTIONS = [
  { label: '1 hour',  hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days',  hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
]

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h left`
  return `${Math.floor(h / 24)}d left`
}

interface Props {
  projectId: string
  envId: string
  envName: string
  onClose: () => void
}

export default function ShareLinkModal({ projectId, envId, envName, onClose }: Props) {
  const qc = useQueryClient()
  const [hours, setHours] = useState(24)
  const [note, setNote] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: links = [], isLoading } = useQuery<ShareLink[]>({
    queryKey: ['share-links', envId],
    queryFn: () => shareLinksApi.list(projectId, envId).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => shareLinksApi.create(projectId, envId, hours, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-links', envId] })
      setNote('')
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => shareLinksApi.revoke(projectId, envId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-links', envId] }),
  })

  const shareUrl = (token: string) =>
    `${window.location.origin}/share/${token}`

  const handleCopy = async (link: ShareLink) => {
    await navigator.clipboard.writeText(shareUrl(link.token))
    setCopiedId(link.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Link2 size={18} className="text-brand-500" />
              Share Read-Only Link
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{envName}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          Anyone with this link can view all environment keys (sensitive values remain masked).
          The link expires automatically — no account required.
        </div>

        {/* Create form */}
        <div className="p-5 border-b space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Expiry</label>
              <select className="input" value={hours} onChange={e => setHours(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map(o => (
                  <option key={o.hours} value={o.hours}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <input
                className="input"
                placeholder="e.g. for contractor"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn-primary w-full justify-center"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Link2 size={15} />
            {createMutation.isPending ? 'Generating...' : 'Generate Share Link'}
          </button>
        </div>

        {/* Existing links */}
        <div className="p-5 max-h-64 overflow-y-auto">
          <p className="text-sm font-medium text-gray-700 mb-3">Active links ({links.length})</p>
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-gray-400">No active links yet.</p>
          ) : (
            <div className="space-y-2">
              {links.map(link => {
                const expired = new Date(link.expires_at) < new Date()
                return (
                  <div key={link.id} className={`flex items-center gap-3 p-3 rounded-lg border ${expired ? 'border-red-100 bg-red-50 opacity-60' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-gray-600 truncate max-w-[200px]">
                          {shareUrl(link.token)}
                        </code>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className={`flex items-center gap-1 ${expired ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock size={10} /> {timeLeft(link.expires_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={10} /> {link.view_count} views
                        </span>
                        {link.note && <span className="truncate">{link.note}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!expired && (
                        <button
                          onClick={() => handleCopy(link)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded"
                          title="Copy link"
                        >
                          {copiedId === link.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Revoke this link?')) revokeMutation.mutate(link.id) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Revoke link"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  )
}
