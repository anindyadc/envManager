import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Auth
export const authApi = {
  register: (data: { email: string; full_name: string; password: string }) =>
    api.post('/auth/register', data),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  listUsers: () => api.get('/auth/users'),
  updateUser: (id: string, data: object) => api.patch(`/auth/users/${id}`, data),
}

// Projects
export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: object) => api.post('/projects', data),
  update: (id: string, data: object) => api.patch(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
}

// Environments
export const envsApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/environments`),
  get: (projectId: string, envId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}`),
  create: (projectId: string, data: object) =>
    api.post(`/projects/${projectId}/environments`, data),
  update: (projectId: string, envId: string, data: object) =>
    api.patch(`/projects/${projectId}/environments/${envId}`, data),
  delete: (projectId: string, envId: string) =>
    api.delete(`/projects/${projectId}/environments/${envId}`),
}

// Secrets
export const secretsApi = {
  list: (projectId: string, envId: string, reveal = false) =>
    api.get(`/projects/${projectId}/environments/${envId}/secrets`, { params: { reveal } }),
  create: (projectId: string, envId: string, data: object) =>
    api.post(`/projects/${projectId}/environments/${envId}/secrets`, data),
  update: (projectId: string, envId: string, secretId: string, data: object) =>
    api.patch(`/projects/${projectId}/environments/${envId}/secrets/${secretId}`, data),
  delete: (projectId: string, envId: string, secretId: string) =>
    api.delete(`/projects/${projectId}/environments/${envId}/secrets/${secretId}`),
  versions: (projectId: string, envId: string, secretId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}/secrets/${secretId}/versions`),
  exportDotenv: (projectId: string, envId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}/secrets/export/dotenv`, {
      responseType: 'blob'
    }),
  importDotenv: (projectId: string, envId: string, content: string, overwrite = false) =>
    api.post(
      `/projects/${projectId}/environments/${envId}/secrets/import/dotenv`,
      { env_content: content },
      { params: { overwrite } }
    ),
  reevaluateSensitive: (projectId: string, envId: string) =>
    api.post(`/projects/${projectId}/environments/${envId}/secrets/reevaluate-sensitive`),
  sshFetch: (
    projectId: string,
    envId: string,
    params: {
      credential_id?: string
      host?: string; port?: number; username?: string; private_key?: string
      path: string
    }
  ) => api.post(`/projects/${projectId}/environments/${envId}/secrets/fetch/ssh`, params),
}

// Members
export const membersApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/members`),
  add: (projectId: string, email: string, role: string) =>
    api.post(`/projects/${projectId}/members`, { email, role }),
  updateRole: (projectId: string, memberId: string, role: string) =>
    api.patch(`/projects/${projectId}/members/${memberId}`, { role }),
  remove: (projectId: string, memberId: string) =>
    api.delete(`/projects/${projectId}/members/${memberId}`),
}

// Share links
export const shareLinksApi = {
  create: (projectId: string, envId: string, hours: number, note?: string) =>
    api.post(`/projects/${projectId}/environments/${envId}/share-links`, { hours, note }),
  list: (projectId: string, envId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}/share-links`),
  revoke: (projectId: string, envId: string, linkId: string) =>
    api.delete(`/projects/${projectId}/environments/${envId}/share-links/${linkId}`),
  getPublic: (token: string) =>
    api.get(`/share/${token}`),
}

// SSH Credentials
export const sshCredentialsApi = {
  list: () => api.get('/ssh-credentials'),
  create: (data: {
    label: string; host: string; port: number; username: string
    auth_type: 'key' | 'password'; private_key?: string; password?: string
  }) => api.post('/ssh-credentials', data),
  update: (id: string, data: object) => api.patch(`/ssh-credentials/${id}`, data),
  delete: (id: string) => api.delete(`/ssh-credentials/${id}`),
}

// Audit
export const auditApi = {
  list: (params?: object) => api.get('/audit', { params }),
}
