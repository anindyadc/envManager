import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, envsApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Plus, ChevronRight, Pencil, Trash2, ArrowLeft, X, Server, Users } from 'lucide-react'
import type { Project, Environment, EnvironmentType } from '../types'
import ShareModal from '../components/ShareModal'

const envTypeBadge: Record<string, string> = {
  production: 'bg-red-100 text-red-700',
  staging: 'bg-yellow-100 text-yellow-700',
  development: 'bg-green-100 text-green-700',
  testing: 'bg-blue-100 text-blue-700',
  custom: 'bg-gray-100 text-gray-700',
}

const ENV_TYPES: EnvironmentType[] = ['development', 'staging', 'production', 'testing', 'custom']

function EnvModal({ projectId, env, onClose }: { projectId: string; env?: Environment; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: env?.name ?? '', env_type: env?.env_type ?? 'development' as EnvironmentType })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      env ? envsApi.update(projectId, env.id, data) : envsApi.create(projectId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['environments', projectId] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to save'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">{env ? 'Edit Environment' : 'New Environment'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input className="input" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. prod-us-east" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="input" value={form.env_type}
              onChange={e => setForm(f => ({ ...f, env_type: e.target.value as EnvironmentType }))}>
              {ENV_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Saving...' : env ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const { isEditor } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | Environment | null>(null)
  const [showShare, setShowShare] = useState(false)

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then(r => r.data),
  })

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: ['environments', projectId],
    queryFn: () => envsApi.list(projectId!).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (envId: string) => envsApi.delete(projectId!, envId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments', projectId] }),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link to="/projects" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to Projects
      </Link>

      {project && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <span className="badge bg-brand-100 text-brand-700">{project.cloud_provider.toUpperCase()}</span>
              </div>
              {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
              <div className="flex gap-4 mt-2 text-sm text-gray-400">
                {project.region && <span><Server size={13} className="inline mr-1" />{project.region}</span>}
                {project.server_host && <span>{project.server_host}</span>}
              </div>
            </div>
            <button
              onClick={() => setShowShare(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Users size={15} /> Share Project
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Environments ({environments.length})</h2>
        {isEditor && (
          <button className="btn-primary" onClick={() => setModal('create')}>
            <Plus size={16} /> Add Environment
          </button>
        )}
      </div>

      {environments.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400">No environments yet.</p>
          {isEditor && (
            <button className="btn-primary mt-4" onClick={() => setModal('create')}>
              <Plus size={16} /> Create environment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {environments.map(env => (
            <div key={env.id} className="card p-4 hover:shadow-md transition-shadow group flex items-center gap-4">
              <div>
                <span className={`badge ${envTypeBadge[env.env_type]}`}>
                  {env.env_type.charAt(0).toUpperCase() + env.env_type.slice(1)}
                </span>
              </div>
              <div className="flex-1">
                <Link to={`/projects/${projectId}/environments/${env.id}`}
                  className="font-medium text-gray-900 hover:text-brand-600 transition-colors">
                  {env.name}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">{env.secret_count} secret{env.secret_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {isEditor && (
                  <>
                    <button onClick={() => setModal(env)}
                      className="p-1.5 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${env.name}"?`)) deleteMutation.mutate(env.id) }}
                      className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <Link to={`/projects/${projectId}/environments/${env.id}`}
                  className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg">
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <EnvModal
          projectId={projectId!}
          env={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
      {showShare && project && (
        <ShareModal
          projectId={projectId!}
          projectName={project.name}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}
