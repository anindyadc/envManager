# Multi-Cloud ENV Manager

A production-standard secret and `.env` file manager for applications hosted across AWS, Azure, GCP, or on-premise infrastructure. Supports encrypted storage, role-based access control, team sharing, audit logging, and a CLI for developer workflows.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
  - [Mac — Native (no Docker)](#mac--native-no-docker)
  - [Linux Server — Docker](#linux-server--docker)
- [Environment Variables](#environment-variables)
- [First Login](#first-login)
- [User Guide](#user-guide)
- [CLI Tool](#cli-tool)
- [API Reference](#api-reference)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser / CLI                                              │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP
┌────────────────▼────────────────────────────────────────────┐
│  nginx (frontend container / host nginx)                    │
│  • Serves React SPA on port 80 / 8080                      │
│  • Proxies  /api/*  →  backend:8000                        │
└────────────────┬────────────────────────────────────────────┘
                 │ Internal Docker network / localhost
┌────────────────▼────────────────────────────────────────────┐
│  FastAPI backend  (Python 3.12)                             │
│  • JWT authentication  (python-jose, 8-hour tokens)        │
│  • AES-256 Fernet encryption for every secret at rest      │
│  • RBAC: global roles + per-project membership roles       │
│  • Async SQLAlchemy 2.0 ORM                                │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────▼─────────────────┐
        │  Database                │
        │  SQLite   (Mac/dev)      │
        │  PostgreSQL 16 (Docker)  │
        └──────────────────────────┘
```

**Tech stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State / data | React Query (@tanstack/react-query) |
| Backend | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 (async) |
| Encryption | Fernet (AES-256-CBC + HMAC-SHA256) via `cryptography` |
| Auth | JWT (HS256, 8-hour sessions) + bcrypt passwords |
| Database | SQLite (dev) / PostgreSQL 16 (production) |
| Container | Docker + Docker Compose |

---

## Features

- **Encrypted secrets at rest** — every value is AES-256 encrypted before storage; the encryption key never leaves the server
- **Sensitive value masking** — API keys, passwords, tokens are automatically detected and masked in the UI; an explicit "reveal" toggle per row is required to see the value
- **Multi-cloud project organisation** — tag each project with AWS / Azure / GCP / On-Premise / Multi-Cloud
- **Multiple environments per project** — Production, Staging, Development, Testing, Custom
- **Secret versioning** — every update archives the previous value; version history is viewable
- **Import / Export** — import a `.env` file (skips `#` comments), export back to `.env` format
- **Auto-detection of sensitive keys** — key names containing `PASSWORD`, `SECRET`, `KEY`, `TOKEN`, `AUTH`, etc. are marked sensitive automatically; a "Fix Sensitive Flags" button re-evaluates all keys
- **Role-based access control**
  - Global roles: `admin`, `editor`, `viewer`
  - Per-project membership: each project has its own member list with `admin` / `editor` / `viewer` roles
  - Project owner is automatically added as project admin
- **Team sharing** — invite any registered user to a project by email with a chosen role; admins can change roles or remove members
- **Temporary share links** — generate expiring read-only links (1 hour to 30 days) for an environment that can be opened without an account; sensitive values remain masked
- **Audit log** — every create / update / delete / login action is recorded with timestamp, user, and IP
- **CLI tool** — zero-dependency Python CLI (`envmanager`) for pull/push workflows from the terminal
- **API docs** — built-in Swagger UI at `/docs` and Redoc at `/redoc`

---

## Quick Start

### Mac — Native (no Docker)

**Requirements:** macOS 12+, internet connection for Homebrew installs

```bash
# 1. Clone the repository
git clone https://github.com/anindyadc/intellipaat_demo_new.git
cd intellipaat_demo_new

# 2. Switch to the feature branch
git checkout claude/multicloud-env-manager-a5rmmo

# 3. Run the one-command setup (installs Python 3.11, Node 20, dependencies, generates keys)
bash env-manager/setup-mac.sh
```

The script will:
- Install Homebrew if missing
- Install Python 3.11 and Node.js 20 via Homebrew
- Create a Python virtual environment inside `env-manager/backend/venv/`
- Install all Python and npm dependencies
- Generate a random `ENCRYPTION_KEY` and `SECRET_KEY` in `env-manager/backend/.env`
- Create `start.sh`, `stop.sh`, and `sync.sh` convenience scripts
- Optionally launch the app immediately

**After setup:**

```bash
# Start the app
bash env-manager/start.sh

# App opens automatically at http://localhost:5173
# API docs at http://localhost:8000/docs

# Stop the app
bash env-manager/stop.sh

# Pull latest code from GitHub and restart
bash env-manager/sync.sh
```

**To update after a git push:**

```bash
bash env-manager/sync.sh
# (pulls latest, reinstalls any new deps, restarts)
```

---

### Linux Server — Docker

**Requirements:** Ubuntu 20.04+, Docker Engine 24+, Docker Compose v2, Git

#### Step 1 — Install Docker (if needed)

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
newgrp docker          # apply group without logout
docker --version       # verify
```

#### Step 2 — Clone and switch branch

```bash
git clone https://github.com/anindyadc/intellipaat_demo_new.git
cd intellipaat_demo_new
git checkout claude/multicloud-env-manager-a5rmmo
cd env-manager
```

#### Step 3 — Configure environment (recommended for production)

```bash
cp backend/.env.example .env.prod
```

Edit `.env.prod`:

```ini
# Generate with: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=<your-32-byte-fernet-key>

# Generate with: openssl rand -hex 32
SECRET_KEY=<your-64-char-hex-secret>

POSTGRES_USER=envmgr
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=envmanager

# Set to your server's public IP or domain
SERVER_IP=10.10.10.102
# DOMAIN=myapp.example.com
```

#### Step 4 — Build and start

```bash
# With custom env file
docker compose --env-file .env.prod up -d --build

# Or with defaults (fine for internal/dev use)
docker compose up -d --build
```

#### Step 5 — Verify

```bash
docker compose ps
# All three containers should show "Up" with db "healthy" and backend "healthy" within ~60s

docker compose logs backend --tail=30
# Should end with: Application startup complete.
```

**Access the app** at `http://<server-ip>:8080`

| Port | What | Who uses it |
|---|---|---|
| `8080` | Web UI + API (via nginx proxy) | Browser |
| `8000` | Backend API directly | CLI tool, Swagger docs, direct API calls |

Swagger UI (direct): `http://<server-ip>:8000/docs`

#### Managing the deployment

```bash
# View logs
docker compose logs -f

# Restart after a git pull
git pull
docker compose up -d --build

# Stop
docker compose down

# Stop and wipe all data (DESTRUCTIVE — deletes the database)
docker compose down -v

# Update just the backend without rebuild
docker compose restart backend
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | random (insecure) | JWT signing key — **always set in production** |
| `ENCRYPTION_KEY` | dev key (insecure) | Fernet key for encrypting secrets — **always set in production** |
| `DATABASE_URL` | `sqlite+aiosqlite:///./envmanager.db` | SQLAlchemy async database URL |
| `POSTGRES_USER` | `envmgr` | PostgreSQL user (Docker only) |
| `POSTGRES_PASSWORD` | `changeme123` | PostgreSQL password (Docker only) |
| `POSTGRES_DB` | `envmanager` | PostgreSQL database name (Docker only) |
| `ALLOWED_ORIGINS` | `["http://localhost:5173"]` | JSON array of allowed CORS origins |
| `SERVER_IP` | `localhost` | Server's public IP (used in ALLOWED_ORIGINS) |
| `DOMAIN` | `localhost` | Server's public domain (used in ALLOWED_ORIGINS) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | JWT session duration (8 hours) |

**Generate a production Fernet key:**
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Generate a production secret key:**
```bash
openssl rand -hex 32
```

---

## First Login

The **first user to register** is automatically promoted to **global admin** — no pre-seeding needed.

1. Open the app and click **Register**
2. Enter your name, email, and a password (minimum 8 characters)
3. You are now the admin — subsequent registrations create `viewer` accounts by default

> **Note for Docker:** if you wiped the volume (`docker compose down -v`), all accounts are deleted and you must register again.

---

## User Guide

### Projects

- A **Project** represents one application or service (e.g. "My API Service – AWS")
- Each project has a **cloud provider** tag (AWS / Azure / GCP / On-Premise / Multi-Cloud), optional region, and optional server host
- Global admins see all projects; other users only see projects they are members of

### Environments

- Each project has one or more **Environments** (Production, Staging, Development, Testing, Custom)
- Navigate: Projects → select a project → select an environment

### Secrets

- A **Secret** is a key/value pair (e.g. `DATABASE_URL = postgres://...`)
- Sensitive values (passwords, keys, tokens) are **masked by default** for all users including admins
- Click the **eye icon** on a row to reveal that value temporarily
- Click the **pencil icon** to edit inline; every edit creates a new version
- Use **Fix Sensitive Flags** to re-evaluate all key names and correct the `sensitive` flag automatically

### Import / Export

- **Import:** paste `.env` content or upload a file; `#` comments are skipped; blank lines are skipped; duplicate keys can be overwritten or skipped
- **Export:** downloads a `.env` file with all keys (sensitive values are in plaintext in the export — handle the file carefully)

### Sharing a Project (registered users)

1. Open a project and click **Share Project** (top right)
2. Enter the person's email address (they must have an account)
3. Select a role:
   - **admin** — manage members, edit all settings
   - **editor** — add, edit, and delete secrets and environments
   - **viewer** — read-only; sensitive values are masked
4. Click the `+` button to invite

### Temporary Share Links (no account needed)

1. Open an environment and click **Share Link**
2. Choose an expiry duration (1 hour / 24 hours / 7 days / 30 days)
3. Add an optional note (e.g. "for the contractor")
4. Click **Generate Share Link** and copy the URL
5. Anyone with the link can view all keys at `http://<server>:8080/share/<token>`
   - Sensitive values remain masked (eye icon reveals them individually)
   - The link expires automatically
   - You can revoke it at any time from the same modal

### Audit Log

Available at **Audit Logs** in the sidebar. Admins see all events; other users see events filtered to their own actions. Filterable by action type and resource type.

### Team Management

Admins can manage global user accounts (name, role, active/inactive status) from the **Team** page.

---

## CLI Tool

A zero-dependency Python CLI for developer workflows. Requires only Python 3 stdlib.

**Installation:**

```bash
# Copy to a directory in PATH
cp env-manager/cli/envmanager.py /usr/local/bin/envmanager
chmod +x /usr/local/bin/envmanager

# Point it at the backend API port (8000 is directly accessible)
export ENV_MANAGER_API=http://10.10.10.102:8000/api/v1
# (add this to ~/.zshrc or ~/.bashrc to make it permanent)
```

**Usage:**

```bash
# Authenticate
envmanager login
# prompts for email and password; token saved to ~/.envmanager/config.json (chmod 600)

envmanager logout

# Projects
envmanager projects list
envmanager projects create "My API" --provider aws --region us-east-1

# Environments
envmanager envs list <project-id>
envmanager envs create <project-id> production --type production

# Secrets
envmanager secrets list <project-id> <env-id>
envmanager secrets list <project-id> <env-id> --reveal   # unmask sensitive values
envmanager secrets set  <project-id> <env-id> DATABASE_URL=postgres://...
envmanager secrets delete <project-id> <env-id> OLD_KEY

# Pull all secrets into a local .env file
envmanager pull <project-id> <env-id>
# creates .env in current directory

envmanager pull <project-id> <env-id> --output /path/to/.env

# Push a local .env file to the server
envmanager push <project-id> <env-id> .env
envmanager push <project-id> <env-id> .env --overwrite   # overwrite existing keys
```

---

## API Reference

Interactive Swagger docs: `http://<host>:8080/docs` (Docker) or `http://localhost:8000/docs` (Mac)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register a new user |
| `POST` | `/api/v1/auth/login` | Login, returns JWT token |
| `GET` | `/api/v1/auth/me` | Get current user |
| `GET` | `/api/v1/auth/users` | List all users (admin only) |
| `PATCH` | `/api/v1/auth/users/{id}` | Update user role / active status |
| `GET` | `/api/v1/projects` | List projects (filtered by membership) |
| `POST` | `/api/v1/projects` | Create project |
| `GET` | `/api/v1/projects/{id}` | Get project detail |
| `PATCH` | `/api/v1/projects/{id}` | Update project |
| `DELETE` | `/api/v1/projects/{id}` | Delete project |
| `GET` | `/api/v1/projects/{id}/members` | List project members |
| `POST` | `/api/v1/projects/{id}/members` | Add member by email |
| `PATCH` | `/api/v1/projects/{id}/members/{mid}` | Update member role |
| `DELETE` | `/api/v1/projects/{id}/members/{mid}` | Remove member |
| `GET` | `/api/v1/projects/{id}/environments` | List environments |
| `POST` | `/api/v1/projects/{id}/environments` | Create environment |
| `GET` | `/api/v1/projects/{id}/environments/{eid}` | Get environment |
| `PATCH` | `/api/v1/projects/{id}/environments/{eid}` | Update environment |
| `DELETE` | `/api/v1/projects/{id}/environments/{eid}` | Delete environment |
| `GET` | `/api/v1/projects/{id}/environments/{eid}/secrets` | List secrets (`?reveal=true` to unmask) |
| `POST` | `/api/v1/projects/{id}/environments/{eid}/secrets` | Add secret |
| `PATCH` | `/api/v1/projects/{id}/environments/{eid}/secrets/{sid}` | Update secret value |
| `DELETE` | `/api/v1/projects/{id}/environments/{eid}/secrets/{sid}` | Delete secret |
| `GET` | `/api/v1/projects/{id}/environments/{eid}/secrets/{sid}/versions` | Version history |
| `GET` | `/api/v1/projects/{id}/environments/{eid}/secrets/export/dotenv` | Export as `.env` file |
| `POST` | `/api/v1/projects/{id}/environments/{eid}/secrets/import/dotenv` | Import `.env` content |
| `POST` | `/api/v1/projects/{id}/environments/{eid}/secrets/reevaluate-sensitive` | Re-evaluate sensitive flags |
| `GET` | `/api/v1/projects/{id}/environments/{eid}/share-links` | List share links |
| `POST` | `/api/v1/projects/{id}/environments/{eid}/share-links` | Create share link |
| `DELETE` | `/api/v1/projects/{id}/environments/{eid}/share-links/{lid}` | Revoke share link |
| `GET` | `/api/v1/share/{token}` | **Public** — view shared environment (no auth) |
| `GET` | `/api/v1/audit` | Audit log (`?action=LOGIN&resource_type=secret`) |
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |

**Authentication:** all endpoints except `/auth/register`, `/auth/login`, `/share/{token}`, and `/health` require a Bearer token in the `Authorization` header.

---

## Security Notes

| Concern | Mitigation |
|---|---|
| Secrets at rest | AES-256-CBC Fernet encryption; ciphertext stored, key never in DB |
| Encryption key management | Set `ENCRYPTION_KEY` from KMS/Key Vault via env var; never commit it |
| Password storage | bcrypt (cost factor 12) |
| Session tokens | HS256 JWT, 8-hour expiry, revoked on logout by client token removal |
| Sensitive value masking | No admin bypass — all users see masked values unless they explicitly reveal |
| Network exposure | Backend binds to `127.0.0.1` only; only nginx (port 8080) is external-facing |
| Share links | Time-limited tokens stored in DB; revocable; sensitive values remain masked |
| Audit trail | All mutations logged with user ID, action, resource, and IP address |
| CORS | Configured via `ALLOWED_ORIGINS` env var; defaults to localhost only |
| SQL injection | SQLAlchemy parameterised queries only; no raw SQL |

**Production checklist:**
- [ ] Set `SECRET_KEY` to a random 64-char string (never use the default)
- [ ] Set `ENCRYPTION_KEY` to a freshly generated Fernet key
- [ ] Set `POSTGRES_PASSWORD` to a strong password
- [ ] Set `ALLOWED_ORIGINS` to your actual domain
- [ ] Place a TLS-terminating reverse proxy (nginx / Caddy / Traefik) in front of port 8080
- [ ] Keep backups of both the database and `ENCRYPTION_KEY` (secrets cannot be recovered without it)

---

## Troubleshooting

### `database "envmgr" does not exist`

The PostgreSQL healthcheck was connecting to the wrong database. Fixed in current code. Clean up with:
```bash
docker compose down -v
docker compose up -d --build
```

### Port 80 already in use

Something else (system nginx, Apache) is using port 80. The app defaults to **port 8080**. If you want port 80:
```bash
sudo systemctl stop nginx    # or apache2
sudo systemctl disable nginx
# then change docker-compose.yml "8080:80" → "80:80"
docker compose up -d
```

### Backend shows `(unhealthy)`

The backend health check has a 60-second start period. If it's still unhealthy after 2 minutes:
```bash
docker compose logs backend --tail=50
```
Common causes: missing `ENCRYPTION_KEY`, DB not reachable, Python import error.

### 500 on login / register

Most common cause: `email-validator` was not installed. Fixed in current code — rebuild the image:
```bash
git pull
docker compose up -d --build
```

### Can't reach the app from a remote machine

- Confirm port 8080 is open: `sudo ufw allow 8080`
- Confirm the container is bound correctly: `docker compose ps` should show `0.0.0.0:8080->80/tcp`
- Check firewall / security group rules if on a cloud VM

### Secrets look encrypted / garbled after restart (Mac)

The dev encryption key is deterministic and stable within a session. If you changed `ENCRYPTION_KEY` in `.env` after secrets were already stored, old secrets cannot be decrypted. Either restore the original key, or delete the database (`rm env-manager/backend/envmanager.db`) and start fresh.

### `git pull` doesn't reflect on running Mac app

Use `bash env-manager/sync.sh` instead of `git pull`. The sync script pulls, reinstalls any new dependencies, and restarts the app.

### WARN: `version` attribute is obsolete

This is a harmless warning from Docker Compose v2. The `version:` field has been removed from the compose file.
