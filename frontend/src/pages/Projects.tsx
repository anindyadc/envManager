import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { projectsApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Plus, Cloud, Server, Pencil, Trash2, ChevronRight, X } from 'lucide-react'
import type { Project, CloudProvider } from '../types'

const PROVIDERS: CloudProvider[] = ['aws', 'azure', 'gcp', 'on_premise', 'multi_cloud']
const providerBadge: Record<string, string> = {
  aws: 'bg-orange-100 text-orange-700',
  azure: 'bg-blue-100 text-blue-700',
  gcp: 'bg-red-100 text-red-700',
  on_premise: 'bg-gray-100 text-gray-700',
  multi_cloud: 'bg-purple-100 text-purple-700',
}

function ProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    cloud_provider: project?.cloud_provider ?? 'aws',
    region: project?.region ?? '',
    server_host: project?.server_host ?? '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      project ? projectsApi.update(project.id, data) : projectsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to save'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">{project ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input className="input" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-api-service" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input resize-none" rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cloud Provider</label>
              <select className="input" value={form.cloud_provider}
                onChange={e => setForm(f => ({ ...f, cloud_provider: e.target.value as CloudProvider }))}>
                {PROVIDERS.map(p => <option key={p} value={p}>{p.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
              <input className="input" value={form.region}
                onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="us-east-1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Server Host</label>
            <input className="input" value={form.server_host}
              onChange={e => setForm(f => ({ ...f, server_host: e.target.value }))} placeholder="10.0.1.100 or api.company.com" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary">
              {mutation.isPending ? 'Saving...' : project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Projects() {
  const { isEditor } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | Project | null>(null)
  const [search, setSearch] = useState('')

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your multi-cloud application environments</p>
        </div>
        {isEditor && (
          <button className="btn-primary" onClick={() => setModal('create')}>
            <Plus size={18} /> New Project
          </button>
        )}
      </div>

      <div className="mb-4">
        <input className="input max-w-xs" placeholder="Search projects..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Cloud className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500 font-medium">No projects found</p>
          {isEditor && (
            <button className="btn-primary mt-4" onClick={() => setModal('create')}>
              <Plus size={16} /> Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => (
            <div key={project.id} className="card p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-700 font-bold">
                    {project.name[0].toUpperCase()}
                  </div>
                  <div>
                    <Link to={`/projects/${project.id}`}
                      className="font-semibold text-gray-900 hover:text-brand-600 transition-colors">
                      {project.name}
                    </Link>
                    <span className={`badge ml-2 ${providerBadge[project.cloud_provider]}`}>
                      {project.cloud_provider.toUpperCase()}
                    </span>
                  </div>
                </div>
                {isEditor && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setModal(project)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${project.name}"?`)) deleteMutation.mutate(project.id) }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {project.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                {project.region && <span><Server size={12} className="inline mr-1" />{project.region}</span>}
                {project.server_host && <span className="truncate">{project.server_host}</span>}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {project.environment_count} environment{project.environment_count !== 1 ? 's' : ''}
                </span>
                <Link to={`/projects/${project.id}`}
                  className="text-brand-600 hover:text-brand-700 text-sm font-medium flex items-center gap-1">
                  Open <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ProjectModal
          project={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
