export type UserRole = 'admin' | 'editor' | 'viewer'
export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'on_premise' | 'multi_cloud'
export type EnvironmentType = 'development' | 'staging' | 'production' | 'testing' | 'custom'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface Project {
  id: string
  name: string
  slug: string
  description: string | null
  cloud_provider: CloudProvider
  region: string | null
  server_host: string | null
  owner_id: string
  created_at: string
  updated_at: string
  environment_count: number
}

export interface Environment {
  id: string
  name: string
  env_type: EnvironmentType
  project_id: string
  ssh_credential_id: string | null
  remote_path: string | null
  created_at: string
  updated_at: string
  secret_count: number
}

export interface Secret {
  id: string
  key: string
  value: string | null
  is_sensitive: boolean
  environment_id: string
  created_by: string
  created_at: string
  updated_at: string
  version: number
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string
  resource_id: string | null
  resource_name: string | null
  detail: string | null
  ip_address: string | null
  timestamp: string
}

export interface ProjectMember {
  id: string
  user_id: string
  email: string
  full_name: string
  role: UserRole
  added_at: string
}

export interface ShareLink {
  id: string
  token: string
  environment_id: string
  project_id: string
  expires_at: string
  note: string | null
  view_count: number
  created_at: string
}

export interface SSHCredential {
  id: string
  label: string
  host: string
  port: number
  username: string
  auth_type: 'key' | 'password'
  has_credential: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}
