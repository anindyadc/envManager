import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, envsApi, appsApi, getApiError } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Plus, ChevronRight, Pencil, Trash2, ArrowLeft, X, Server, Key } from 'lucide-react'
import type { Project, Environment, Application } from '../types'

function AppModal({
  projectId, envId, app, onClose,
}: { projectId: string; envId: string; app?: Application; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(app?.name ?? '')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      app
        ? appsApi.update(projectId, envId, app.id, { name })
        : appsApi.create(projectId, envId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications', envId] })
      onClose()
    },
    onError: (err: any) => setError(getApiError(err, 'Failed to save')),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">{app ? 'Rename Application' : 'New Application'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="input" required autoFocus
              placeholder="e.g. backend, frontend, worker"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Saving...' : app ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EnvironmentDetail() {
  const { projectId, envId } = useParams<{ projectId: string; envId: string }>()
  const { isEditor } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | Application | null>(null)

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then(r => r.data),
  })

  const { data: env } = useQuery<Environment>({
    queryKey: ['environment', projectId, envId],
    queryFn: () => envsApi.get(projectId!, envId!).then(r => r.data),
  })

  const { data: apps = [], isLoading } = useQuery<Application[]>({
    queryKey: ['applications', envId],
    queryFn: () => appsApi.list(projectId!, envId!).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsApi.delete(projectId!, envId!, appId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', envId] }),
  })

  const envTypeBadge: Record<string, string> = {
    production: 'bg-red-100 text-red-700',
    staging: 'bg-yellow-100 text-yellow-700',
    development: 'bg-green-100 text-green-700',
    testing: 'bg-blue-100 text-blue-700',
    custom: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link to={`/projects/${projectId}`}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> {project?.name}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{env?.name}</h1>
          {env && (
            <span className={`badge ${envTypeBadge[env.env_type]}`}>
              {env.env_type.charAt(0).toUpperCase() + env.env_type.slice(1)}
            </span>
          )}
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setModal('create')}>
            <Plus size={16} /> Add Application
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-10 text-center text-gray-400">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="card p-12 text-center">
          <Server size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-4">No applications yet. Add one to start managing secrets.</p>
          {isEditor && (
            <button className="btn-primary" onClick={() => setModal('create')}>
              <Plus size={16} /> Add Application
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => (
            <div key={app.id}
              className="card p-4 hover:shadow-md transition-shadow group flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <Key size={15} className="text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/projects/${projectId}/environments/${envId}/applications/${app.id}`}
                  className="font-medium text-gray-900 hover:text-brand-600 transition-colors">
                  {app.name}
                </Link>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                  <span>{app.secret_count} secret{app.secret_count !== 1 ? 's' : ''}</span>
                  {app.ssh_server && app.remote_path && (
                    <span className="flex items-center gap-1">
                      <Server size={10} />
                      {app.ssh_server.label} → <code className="font-mono">{app.remote_path}</code>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditor && (
                  <>
                    <button
                      onClick={() => setModal(app)}
                      className="p-1.5 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Rename">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${app.name}" and all its secrets?`)) deleteMutation.mutate(app.id) }}
                      className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <Link
                  to={`/projects/${projectId}/environments/${envId}/applications/${app.id}`}
                  className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg">
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AppModal
          projectId={projectId!}
          envId={envId!}
          app={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
