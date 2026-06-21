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
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, new_password: string) =>
    api.post('/auth/reset-password', { token, new_password }),
  verifyEmail: (token: string) =>
    api.get(`/auth/verify-email/${token}`),
  resendVerification: () =>
    api.post('/auth/verify-email/resend'),
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

// Applications
export const appsApi = {
  list: (projectId: string, envId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}/applications`),
  get: (projectId: string, envId: string, appId: string) =>
    api.get(`/projects/${projectId}/environments/${envId}/applications/${appId}`),
  create: (projectId: string, envId: string, data: object) =>
    api.post(`/projects/${projectId}/environments/${envId}/applications`, data),
  update: (projectId: string, envId: string, appId: string, data: object) =>
    api.patch(`/projects/${projectId}/environments/${envId}/applications/${appId}`, data),
  delete: (projectId: string, envId: string, appId: string) =>
    api.delete(`/projects/${projectId}/environments/${envId}/applications/${appId}`),
}

const _base = (pid: string, eid: string, aid: string) =>
  `/projects/${pid}/environments/${eid}/applications/${aid}/secrets`

// Secrets
export const secretsApi = {
  list: (projectId: string, envId: string, appId: string, reveal = false) =>
    api.get(_base(projectId, envId, appId), { params: { reveal } }),
  create: (projectId: string, envId: string, appId: string, data: object) =>
    api.post(_base(projectId, envId, appId), data),
  update: (projectId: string, envId: string, appId: string, secretId: string, data: object) =>
    api.patch(`${_base(projectId, envId, appId)}/${secretId}`, data),
  delete: (projectId: string, envId: string, appId: string, secretId: string) =>
    api.delete(`${_base(projectId, envId, appId)}/${secretId}`),
  versions: (projectId: string, envId: string, appId: string, secretId: string) =>
    api.get(`${_base(projectId, envId, appId)}/${secretId}/versions`),
  exportDotenv: (projectId: string, envId: string, appId: string) =>
    api.get(`${_base(projectId, envId, appId)}/export/dotenv`, { responseType: 'blob' }),
  importDotenv: (projectId: string, envId: string, appId: string, content: string, overwrite = false) =>
    api.post(
      `${_base(projectId, envId, appId)}/import/dotenv`,
      { env_content: content },
      { params: { overwrite } }
    ),
  reevaluateSensitive: (projectId: string, envId: string, appId: string) =>
    api.post(`${_base(projectId, envId, appId)}/reevaluate-sensitive`),
  sshFetch: (
    projectId: string,
    envId: string,
    appId: string,
    params: {
      credential_id?: string
      host?: string; port?: number; username?: string; private_key?: string
      path: string
    }
  ) => api.post(`${_base(projectId, envId, appId)}/fetch/ssh`, params),
}

const _shareBase = (pid: string, eid: string, aid: string) =>
  `/projects/${pid}/environments/${eid}/applications/${aid}/share-links`

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

// Share links (now scoped to an application)
export const shareLinksApi = {
  create: (projectId: string, envId: string, appId: string, hours: number, note?: string) =>
    api.post(_shareBase(projectId, envId, appId), { hours, note }),
  list: (projectId: string, envId: string, appId: string) =>
    api.get(_shareBase(projectId, envId, appId)),
  revoke: (projectId: string, envId: string, appId: string, linkId: string) =>
    api.delete(`${_shareBase(projectId, envId, appId)}/${linkId}`),
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

export function getApiError(err: any, fallback = 'An error occurred'): string {
  const detail = err?.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((d: any) => d.msg).join(', ')
  if (typeof detail === 'string') return detail
  return fallback
}
