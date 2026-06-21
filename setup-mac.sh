#!/bin/bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Run IN PLACE — the repo folder IS the app folder, so git pull = instant sync
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Multi-Cloud ENV Manager — Mac Setup    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Installing into: ${BOLD}$INSTALL_DIR${NC}"
echo ""

# ─── 1. Homebrew ──────────────────────────────────────────────────────────────
info "Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ $(uname -m) == "arm64" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  fi
fi
log "Homebrew ready  ($(brew --version | head -1))"

# ─── 2. Python 3.11 ───────────────────────────────────────────────────────────
info "Checking Python 3.11..."
if ! brew list python@3.11 &>/dev/null; then
  info "Installing Python 3.11..."
  brew install python@3.11
fi
PYTHON=$(brew --prefix python@3.11)/bin/python3.11
log "Python ready  ($($PYTHON --version))"

# ─── 3. Node.js 20 ────────────────────────────────────────────────────────────
info "Checking Node.js..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
  [[ "$NODE_VER" -ge 18 ]] && NODE_OK=true
fi
if ! $NODE_OK; then
  info "Installing Node.js 20..."
  brew install node@20
  export PATH="$(brew --prefix node@20)/bin:$PATH"
  echo "export PATH=\"$(brew --prefix node@20)/bin:\$PATH\"" >> "$HOME/.zprofile"
fi
log "Node.js ready  ($(node --version))"

# ─── 4. Backend — virtual environment + dependencies ─────────────────────────
info "Setting up Python virtual environment..."
cd "$INSTALL_DIR/backend"
$PYTHON -m venv venv
source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
log "Python dependencies installed"

# ─── 5. Generate .env if missing ─────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
  info "Generating secure keys and .env config..."
  ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  SECRET_KEY=$(openssl rand -hex 32)

  cat > "$INSTALL_DIR/backend/.env" << EOF
APP_NAME=Multi-Cloud ENV Manager
SECRET_KEY=$SECRET_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
DATABASE_URL=sqlite+aiosqlite:///./envmanager.db
ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:3000"]
ACCESS_TOKEN_EXPIRE_MINUTES=480
EOF
  log ".env created with fresh encryption keys"
else
  warn ".env already exists — skipping key generation"
fi

deactivate

# ─── 6. Frontend — npm install ────────────────────────────────────────────────
info "Installing frontend dependencies (this takes ~1 min)..."
cd "$INSTALL_DIR/frontend"
npm install --silent
log "npm packages installed"

# ─── 7. Write start.sh ────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/start.sh" << STARTSCRIPT
#!/bin/bash
GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
INSTALL_DIR="$INSTALL_DIR"

lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo -e "\${BOLD}Starting ENV Manager...\${NC}"

cd "\$INSTALL_DIR/backend"
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/envmanager-backend.log 2>&1 &
BACKEND_PID=\$!
deactivate

echo -ne "\${BLUE}[→]\${NC} Waiting for backend"
for i in {1..20}; do
  if curl -s http://localhost:8000/health &>/dev/null; then echo ""; break; fi
  echo -n "."; sleep 1
done

cd "\$INSTALL_DIR/frontend"
npm run dev > /tmp/envmanager-frontend.log 2>&1 &
FRONTEND_PID=\$!

sleep 2
echo ""
echo -e "\${GREEN}\${BOLD}✓ ENV Manager is running!\${NC}"
echo ""
echo -e "  \${BOLD}Web UI:\${NC}   http://localhost:5173"
echo -e "  \${BOLD}API:\${NC}      http://localhost:8000"
echo -e "  \${BOLD}API Docs:\${NC} http://localhost:8000/docs"
echo ""
echo -e "  Backend log:  /tmp/envmanager-backend.log"
echo -e "  Frontend log: /tmp/envmanager-frontend.log"
echo ""
echo -e "  Press \${BOLD}Ctrl+C\${NC} to stop"
echo ""
sleep 1 && open http://localhost:5173

trap "kill \$BACKEND_PID \$FRONTEND_PID 2>/dev/null; echo 'Stopped.'; exit 0" INT TERM
wait
STARTSCRIPT
chmod +x "$INSTALL_DIR/start.sh"

# ─── 8. Write stop.sh ─────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/stop.sh" << 'STOPSCRIPT'
#!/bin/bash
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "Backend stopped" || echo "Backend was not running"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "Frontend stopped" || echo "Frontend was not running"
STOPSCRIPT
chmod +x "$INSTALL_DIR/stop.sh"

# ─── 9. Write sync.sh ─────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/sync.sh" << SYNCSCRIPT
#!/bin/bash
GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
INSTALL_DIR="$INSTALL_DIR"

echo -e "\${BOLD}Syncing latest changes from GitHub...\${NC}"

# Go to git repo root (two levels up from env-manager/)
cd "\$INSTALL_DIR/../.."
git pull origin claude/multicloud-env-manager-a5rmmo
echo ""

# Re-install backend deps in case requirements.txt changed
cd "\$INSTALL_DIR/backend"
source venv/bin/activate
pip install --quiet -r requirements.txt
deactivate
echo -e "\${GREEN}[✓]\${NC} Backend dependencies up to date"

# Re-install frontend deps in case package.json changed
cd "\$INSTALL_DIR/frontend"
npm install --silent
echo -e "\${GREEN}[✓]\${NC} Frontend dependencies up to date"

echo ""
echo -e "\${GREEN}\${BOLD}✓ Sync complete!\${NC} Restarting app..."
echo ""

bash "\$INSTALL_DIR/stop.sh"
sleep 1
bash "\$INSTALL_DIR/start.sh"
SYNCSCRIPT
chmod +x "$INSTALL_DIR/sync.sh"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║          Setup complete!                 ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}To start:${NC}  bash $INSTALL_DIR/start.sh"
echo -e "  ${BOLD}To stop:${NC}   bash $INSTALL_DIR/stop.sh"
echo -e "  ${BOLD}To sync:${NC}   bash $INSTALL_DIR/sync.sh"
echo ""

read -p "Launch the app now? [Y/n] " -n 1 -r REPLY
echo ""
if [[ "$REPLY" =~ ^[Yy]$ ]] || [[ -z "$REPLY" ]]; then
  exec bash "$INSTALL_DIR/start.sh"
fi
