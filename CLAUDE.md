# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Layout

```
envManager/               ← repo root (also the working directory)
├── backend/              FastAPI backend (Python 3.12)
├── frontend/             React 18 + TypeScript + Vite SPA
├── cli/                  Zero-dependency Python CLI (stdlib only)
├── docker-compose.yml    Three services: db, backend, frontend
├── nginx.conf            Host-level nginx config (Mac native / bare-metal)
└── setup-mac.sh          One-command Mac dev setup
```

Ignore root-level `file1`, `file2`, `pom.xml`, `python.py` — unrelated artefacts.

## Development Commands

### Mac (native, no Docker)

```bash
# First-time setup (installs Python 3.12, Node 20, deps, generates keys)
bash setup-mac.sh

# Start / stop / sync (pull + restart)
bash start.sh
bash stop.sh
bash sync.sh
```

- Backend: `http://localhost:8000` (Uvicorn)
- Frontend dev server: `http://localhost:5173` (Vite)
- Swagger UI: `http://localhost:8000/docs`

### Frontend (Vite)

```bash
cd frontend
npm install
npm run dev        # start Vite dev server
npm run build      # tsc + vite build → dist/
npm run lint       # eslint src --ext ts,tsx
```

### Backend (FastAPI)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker (Linux / production)

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose ps

# Redeploy after a git pull (safe — does NOT wipe data)
git pull origin feature/app-model
docker compose up -d --build

# DESTRUCTIVE — deletes the pgdata volume and all stored data
docker compose down -v
```

## Architecture

### Data Hierarchy

```
Project → Environment → Application → Secret
```

Each **Project** has one or more **Environments** (development, staging, production…).
Each **Environment** has one or more **Applications** (backend, frontend, worker…).
Each **Application** owns its **Secrets** and optionally an SSH server link for `.env` file import.
**ShareLinks** are scoped to an Application (not an Environment).

### Backend (`backend/app/`)

| Module | Purpose |
|---|---|
| `main.py` | FastAPI app, CORS middleware, router registration, lifespan `init_db()` |
| `database.py` | Async SQLAlchemy engine, `get_db()` session factory, `init_db()` + `_migrate()` |
| `config.py` | Pydantic `Settings` (reads env vars; `get_settings()` cached via `@lru_cache`) |
| `core/encryption.py` | `EncryptionService` — Fernet AES-256 wrap/unwrap; singleton via `get_encryption_service()` |
| `core/security.py` | JWT create/decode (HS256, 8-hour expiry) |
| `core/dependencies.py` | `get_current_user`, `require_role`, `require_admin`, `require_editor` FastAPI deps |
| `models/` | SQLAlchemy 2.0 declarative models |
| `schemas/` | Pydantic v2 request/response schemas |
| `api/` | One router file per domain — all prefixed `/api/v1` |
| `services/audit_service.py` | Writes `AuditLog` rows; called from every mutating endpoint |

**Models:**
- `User` — global roles: `admin`, `editor`, `viewer`; first registered user → admin
- `Project` — name + cloud provider tag
- `ProjectMember` — per-project membership with its own role
- `Environment` — belongs to Project; `env_type` enum (development/staging/production/testing/custom)
- `Application` — belongs to Environment; holds `ssh_credential_id` + `remote_path` for SSH import recall; secrets and share links cascade-delete with it
- `Secret` — encrypted `value` (via `EncryptionService`); linked to `Application` via `application_id`; keeps version history in `SecretVersion`
- `ShareLink` — time-limited read-only token scoped to an `Application`
- `SSHCredential` — per-user SSH server entry; `encrypted_private_key` and `encrypted_password` via `EncryptionService`; never returned in plaintext; supports `auth_type: "key"` or `"password"`
- `AuditLog` — immutable event log

**API routes (all under `/api/v1`):**

| Router file | Prefix |
|---|---|
| `auth.py` | `/auth` |
| `projects.py` | `/projects` |
| `environments.py` | `/projects/{pid}/environments` |
| `applications.py` | `/projects/{pid}/environments/{eid}/applications` |
| `secrets.py` | `/projects/{pid}/environments/{eid}/applications/{app_id}/secrets` |
| `share.py` | `/projects/{pid}/environments/{eid}/applications/{app_id}/share-links` |
| `members.py` | `/projects/{pid}/members` |
| `ssh_credentials.py` | `/ssh-credentials` |
| `audit.py` | `/audit` |

**DB migrations:**
`create_all` handles fresh installs automatically. New columns/tables on existing PostgreSQL deployments go in `database._migrate()` as raw SQL. Each statement is wrapped in a `SAVEPOINT` so one failing `ALTER TABLE` (e.g. column already exists) does not abort the whole transaction and silently skip subsequent data-migration steps:

```python
for i, sql in enumerate(ddl):
    sp = f"sp_migrate_{i}"
    try:
        await conn.exec_driver_sql(f"SAVEPOINT {sp}")
        await conn.exec_driver_sql(sql.strip())
        await conn.exec_driver_sql(f"RELEASE SAVEPOINT {sp}")
    except Exception:
        await conn.exec_driver_sql(f"ROLLBACK TO SAVEPOINT {sp}")
```

`_migrate()` is a no-op for SQLite. Never use Alembic.

**`onupdate` / server-default pitfall:**
Columns with `server_default=func.now()` or `onupdate=func.now()` are marked expired by SQLAlchemy after any write. Pydantic's sync `model_validate()` then triggers a lazy async SELECT → `MissingGreenlet` error. Always call `await db.flush(); await db.refresh(obj)` before `model_validate()` in any endpoint that creates or updates a row.

### Frontend (`frontend/src/`)

| File/Dir | Purpose |
|---|---|
| `App.tsx` | React Router v6 route tree; `ProtectedRoute` checks JWT in localStorage |
| `api/client.ts` | Axios instance (`baseURL /api/v1`); 401 interceptor → `/login`; named API helpers below |
| `types/index.ts` | Shared TypeScript interfaces for all domain entities |
| `hooks/useAuth.ts` | Auth state (token + user) backed by localStorage |
| `pages/` | Full-page components (one per route) |
| `components/Layout.tsx` | Sidebar nav + `<Outlet>` — add new nav items here |
| `components/SSHImportModal.tsx` | SSH import wizard; props: `app: Application, appId, projectId, envId` |
| `components/ShareLinkModal.tsx` | Share link manager; props: `appId, appName, projectId, envId` |

**API helpers in `client.ts`:**

| Helper | Scope |
|---|---|
| `authApi` | `/auth/*` |
| `projectsApi` | `/projects` |
| `envsApi` | `/projects/{pid}/environments` |
| `appsApi` | `/projects/{pid}/environments/{eid}/applications` |
| `secretsApi` | `…/applications/{appId}/secrets` |
| `shareLinksApi` | `…/applications/{appId}/share-links` |
| `sshCredentialsApi` | `/ssh-credentials` |
| `auditApi` | `/audit` |
| `membersApi` | `/projects/{pid}/members` |

**Route tree:**
```
/login, /register, /forgot-password, /reset-password, /verify-email
/share/:token                            ← public ShareView (no auth)
/ (ProtectedRoute → Layout)
  /                                      Dashboard
  /projects                              Projects list
  /projects/:projectId                   ProjectDetail  (shows environments)
  /projects/:projectId/environments/:envId              EnvironmentDetail  (shows applications)
  /projects/:projectId/environments/:envId/applications/:appId  ApplicationDetail  (shows secrets)
  /ssh-servers                           SSHServers
  /audit                                 AuditLogs
  /team                                  TeamManagement
```

**React Query conventions:**
- Query keys: `['projects']`, `['environments', projectId]`, `['applications', envId]`, `['application', projectId, envId, appId]`, `['secrets', appId]`, `['share-links', appId]`, `['ssh-credentials']`
- Use `useQuery` for reads, `useMutation` + `qc.invalidateQueries()` for writes.

### Nginx

- `frontend/nginx.conf` — inside the frontend Docker container; proxies `/api/` → `backend:8000`
- `nginx.conf` — host-level config for Mac native / bare-metal deploy

### SSH Import Flow

1. User opens `SSHImportModal` from `ApplicationDetail` (passes the current `app` object)
2. Modal pre-fills `app.ssh_credential_id` and `app.remote_path` if previously linked
3. On submit → `POST …/applications/{app_id}/secrets/fetch/ssh`
4. Backend resolves auth from a saved `SSHCredential` (decrypted server-side) or accepts inline credentials; uses `paramiko` wrapped in `asyncio.to_thread` (20 s timeout); `AutoAddPolicy` required in Docker (no `known_hosts`)
5. On success the backend persists `ssh_credential_id` + `remote_path` directly on the `Application` row (no client-side save needed)
6. Frontend invalidates `['application', …]` and `['applications', envId]` queries

## Key Conventions

- **Encryption:** all secret values and SSH credentials go through `EncryptionService.encrypt()` before being stored; never store or return plaintext
- **Auth type:** SSH credentials support `auth_type: "key"` (PEM private key) or `"password"`
- **RBAC:** use `Depends(require_admin)` / `Depends(require_editor)` in route signatures; project-level membership checked inline in endpoint logic
- **No Alembic:** schema migrations via raw SQL in `database._migrate()` with SAVEPOINT isolation (see above)
- **Frontend API base:** Vite proxies `/api` → `localhost:8000` via `vite.config.ts`; in Docker, nginx does the same. Never hardcode the backend host.
- **`flush` + `refresh` before serialisation:** required for any row with server-computed timestamps (see pitfall note above)

## Deployment

**Active branch:** `feature/app-model`
**Server:** `10.10.10.102` — web UI on `:8080`, API on `:8000`
**Docker container names:** `envmanager-db-1`, `envmanager-backend-1`, `envmanager-frontend-1`
**DB credentials (defaults):** user `envmgr`, database `envmanager`

**Critical:** `ENCRYPTION_KEY` must be preserved across deployments. If it changes, all stored secrets become unreadable. Keep it in a `.env` file alongside `docker-compose.yml` and never commit it.

### Manual data recovery (run once after first deploy of `feature/app-model`)

If secrets appear missing after the first deploy, the data migration may not have populated `application_id`. Run this inside the DB container:

```bash
docker exec -it envmanager-db-1 psql -U envmgr -d envmanager
```

```sql
-- Create one default application per environment
INSERT INTO applications (id, name, environment_id, ssh_credential_id, remote_path, created_at, updated_at)
SELECT gen_random_uuid()::varchar, e.name, e.id, e.ssh_credential_id, e.remote_path, NOW(), NOW()
FROM environments e
WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.environment_id = e.id);

-- Link existing secrets to their environment's default application
UPDATE secrets
SET application_id = (
    SELECT a.id FROM applications a WHERE a.environment_id = secrets.environment_id LIMIT 1
)
WHERE application_id IS NULL AND environment_id IS NOT NULL;

-- Link existing share_links similarly
UPDATE share_links
SET application_id = (
    SELECT a.id FROM applications a WHERE a.environment_id = share_links.environment_id LIMIT 1
)
WHERE application_id IS NULL AND environment_id IS NOT NULL;
```
