# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Layout

The active project lives entirely in `env-manager/`:

```
env-manager/
├── backend/          FastAPI backend (Python 3.12)
├── frontend/         React 18 + TypeScript + Vite SPA
├── cli/              Zero-dependency Python CLI (stdlib only)
├── docker-compose.yml  Three services: db, backend, frontend
└── setup-mac.sh      One-command Mac dev setup
```

Ignore the root-level `file1`, `file2`, `pom.xml`, `python.py` — they are unrelated artefacts.

## Development Commands

### Mac (native, no Docker)

```bash
# First-time setup (installs Python 3.11, Node 20, deps, generates keys)
bash env-manager/setup-mac.sh

# Start / stop / sync (pull + restart)
bash env-manager/start.sh
bash env-manager/stop.sh
bash env-manager/sync.sh
```

- Backend runs on `http://localhost:8000` (Uvicorn, hot-reload not configured)
- Frontend dev server on `http://localhost:5173` (Vite)
- Swagger UI: `http://localhost:8000/docs`

### Frontend (Vite)

```bash
cd env-manager/frontend
npm install
npm run dev        # start Vite dev server
npm run build      # tsc + vite build → dist/
npm run lint       # eslint src --ext ts,tsx
```

### Backend (FastAPI)

```bash
cd env-manager/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker (Linux / production)

```bash
cd env-manager

# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose ps

# Redeploy after a git pull (safe — does NOT wipe data)
git pull origin claude/multicloud-env-manager-a5rmmo
docker compose up -d --build

# DESTRUCTIVE — deletes the pgdata volume and all stored data
docker compose down -v
```

## Architecture

### Backend (`env-manager/backend/app/`)

| Module | Purpose |
|---|---|
| `main.py` | FastAPI app, CORS middleware, router registration, lifespan startup |
| `database.py` | Async SQLAlchemy engine, `get_db()` session factory, `init_db()` + `_migrate()` |
| `config.py` | Pydantic `Settings` (reads env vars; `get_settings()` is cached via `@lru_cache`) |
| `core/encryption.py` | `EncryptionService` — Fernet AES-256 wrap/unwrap; singleton via `get_encryption_service()` |
| `core/security.py` | JWT create/decode (HS256, 8-hour expiry) |
| `core/dependencies.py` | `get_current_user`, `require_role`, `require_admin`, `require_editor` FastAPI deps |
| `models/` | SQLAlchemy 2.0 declarative models (see below) |
| `schemas/` | Pydantic v2 request/response schemas |
| `api/` | One router file per domain — all prefixed with `/api/v1` |
| `services/audit_service.py` | Writes `AuditLog` rows; called from every mutating endpoint |

**Models:**
- `User` — global roles: `admin`, `editor`, `viewer`; first registered user → admin
- `Project` — cloud provider tag, optional region/server host
- `ProjectMember` — per-project membership with own role
- `Environment` — belongs to Project; stores `ssh_credential_id` FK + `remote_path` for SSH import recall
- `Secret` — encrypted `value` (via `EncryptionService`); keeps a `versions` JSON column
- `ShareLink` — time-limited read-only token for an environment
- `SSHCredential` — per-user SSH server creds; `encrypted_private_key` and `encrypted_password` stored via `EncryptionService`; never returned in plaintext
- `AuditLog` — immutable event log

**DB migrations:** `create_all` does **not** alter existing tables. New columns on existing PostgreSQL deployments must be added in `database._migrate()` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. SQLite (`create_all`) handles fresh installs automatically; the `_migrate()` function is a no-op for SQLite.

### Frontend (`env-manager/frontend/src/`)

| File/Dir | Purpose |
|---|---|
| `App.tsx` | React Router v6 route tree; `ProtectedRoute` checks `localStorage('token')` |
| `api/client.ts` | Axios instance (baseURL `/api/v1`); 401 interceptor redirects to `/login`; named API helpers: `authApi`, `projectsApi`, `envsApi`, `secretsApi`, `membersApi`, `shareLinksApi`, `sshCredentialsApi`, `auditApi` |
| `types/index.ts` | Shared TypeScript interfaces for all domain entities |
| `hooks/useAuth.ts` | Auth state (token + user) backed by localStorage |
| `pages/` | Full-page components (one per route) |
| `components/Layout.tsx` | Sidebar nav + `<Outlet>` — add new nav items here |
| `components/SSHImportModal.tsx` | SSH/SFTP import modal; accepts `env: Environment` to pre-fill saved credential + remote path |

**Data fetching:** React Query (`@tanstack/react-query`) everywhere — use `useQuery` for reads and `useMutation` for writes. Query keys follow `['resource', id]` convention.

### Nginx

Two nginx configs:
- `env-manager/frontend/nginx.conf` — used inside the frontend Docker container; proxies `/api/` → `backend:8000`
- `env-manager/nginx.conf` — host-level nginx config (used for Mac native setup or bare-metal deploy)

### SSH Import Flow

1. User opens `SSHImportModal` from `EnvironmentDetail` (passing the current `env` object)
2. Modal pre-fills saved `env.ssh_credential_id` and `env.remote_path` if present
3. On submit, `POST /api/v1/projects/{pid}/environments/{eid}/secrets/fetch/ssh` resolves auth from a saved `SSHCredential` (decrypted server-side) or accepts inline credentials
4. Backend uses `paramiko` (blocking I/O wrapped in `asyncio.to_thread` with 20s timeout); `AutoAddPolicy` required in Docker (no known_hosts)
5. On success, the modal calls `envsApi.update()` to persist `ssh_credential_id` + `remote_path` back to the environment

## Key Conventions

- **Encryption:** all secret values and SSH credentials go through `EncryptionService.encrypt()` before being stored; never store or return plaintext secrets
- **Auth type:** SSH credentials support `auth_type: "key"` (PEM private key) or `"password"`
- **RBAC checks:** use `Depends(require_admin)` or `Depends(require_editor)` in route signatures; project-level membership is checked inline in the endpoint logic
- **No Alembic:** schema migrations are handled by the `_migrate()` raw SQL function in `database.py`
- **Frontend API base:** the Vite dev server proxies `/api` → `localhost:8000` via `vite.config.ts`; in Docker, nginx does the same proxy. Never hardcode the backend host in frontend code.

## Deployment Branch

Active feature branch: `claude/multicloud-env-manager-a5rmmo`
Server: `10.10.10.102` — web UI on `:8080`, API on `:8000`

**Critical:** `ENCRYPTION_KEY` must be preserved across deployments. If it changes, all stored secrets become unreadable. Persist it in a `.env` file alongside `docker-compose.yml` and never commit it.
