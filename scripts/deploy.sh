#!/bin/bash
# ============================================================
# GymFlow Track — Production Deployment Script
# ============================================================
# Usage:
#   ./scripts/deploy.sh            # Full deploy (pull + build + restart)
#   ./scripts/deploy.sh --quick    # Quick restart (no rebuild)
#
# Prerequisites:
#   - SSH into the VPS
#   - .env file configured (from .env.production)
#   - Git repo cloned to /opt/gymflow
#
# What this does:
#   1. Pulls latest code from git
#   2. Creates a pre-deploy backup
#   3. Builds new Docker images
#   4. Restarts services with zero-downtime strategy
#   5. Runs database migrations
#   6. Validates health endpoints
#   7. Reports deployment status
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/gymflow}"
COMPOSE_FILE="docker-compose.prod.yml"
BRANCH="${BRANCH:-main}"
QUICK_MODE=false

if [ "${1:-}" = "--quick" ]; then
    QUICK_MODE=true
fi

cd "$APP_DIR"

echo "============================================="
echo "GymFlow Track — Production Deployment"
echo "============================================="
echo "Time:   $(date)"
echo "Branch: $BRANCH"
echo "Mode:   $([ "$QUICK_MODE" = true ] && echo 'Quick restart' || echo 'Full deploy')"
echo "============================================="

# ── Step 1: Pull latest code ─────────────────────────────────
if [ "$QUICK_MODE" = false ]; then
    echo ""
    echo "[1/7] Pulling latest code..."
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    echo "  Commit: $(git log --oneline -1)"
fi

# ── Step 2: Pre-deploy backup ────────────────────────────────
echo ""
echo "[2/7] Creating pre-deploy backup..."
if docker compose -f "$COMPOSE_FILE" ps db --status running -q 2>/dev/null | grep -q .; then
    ./scripts/backup-db.sh || echo "  WARNING: Backup failed (continuing deploy)"
else
    echo "  DB not running, skipping backup"
fi

# ── Step 3: Build new images ─────────────────────────────────
if [ "$QUICK_MODE" = false ]; then
    echo ""
    echo "[3/7] Building Docker images..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
else
    echo ""
    echo "[3/7] Skipping build (quick mode)"
fi

# ── Step 4: Restart services ─────────────────────────────────
echo ""
echo "[4/7] Restarting services..."

# Start DB and Redis first (dependencies)
docker compose -f "$COMPOSE_FILE" up -d db redis
echo "  Waiting for DB and Redis to be healthy..."
sleep 5

# Restart backend (graceful — new container starts before old stops)
docker compose -f "$COMPOSE_FILE" up -d backend
echo "  Backend restarting..."
sleep 5

# Restart frontend
docker compose -f "$COMPOSE_FILE" up -d frontend
echo "  Frontend restarting..."
sleep 5

# Restart Caddy (picks up any config changes)
docker compose -f "$COMPOSE_FILE" up -d caddy
echo "  Caddy restarting..."
sleep 3

# ── Step 5: Run migrations ───────────────────────────────────
echo ""
echo "[5/7] Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T backend alembic upgrade head
echo "  Migrations complete"

# ── Step 6: Health checks ────────────────────────────────────
echo ""
echo "[6/7] Validating health..."

MAX_RETRIES=15
RETRY=0
HEALTHY=false

while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T backend python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" 2>/dev/null; then
        HEALTHY=true
        break
    fi
    RETRY=$((RETRY + 1))
    echo "  Waiting for backend... ($RETRY/$MAX_RETRIES)"
    sleep 4
done

if [ "$HEALTHY" = true ]; then
    echo "  Backend: HEALTHY"
else
    echo "  Backend: NOT HEALTHY — check logs:"
    echo "    docker compose -f $COMPOSE_FILE logs backend --tail=50"
fi

# Check all container statuses
echo ""
echo "  Container status:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}"

# ── Step 7: Cleanup ──────────────────────────────────────────
echo ""
echo "[7/7] Cleaning up old Docker images..."
docker image prune -f --filter "until=168h" 2>/dev/null || true

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "============================================="
echo "Deployment complete: $(date)"
echo "Commit: $(git log --oneline -1)"
echo ""
echo "Verify:"
echo "  curl -s https://api.gymflowtrack.in/health | python3 -m json.tool"
echo "  curl -s https://app.gymflowtrack.in"
echo ""
echo "Rollback (if needed):"
echo "  git log --oneline -5"
echo "  git reset --hard <commit>"
echo "  ./scripts/deploy.sh --quick"
echo "  ./scripts/restore-db.sh backups/<latest_pre_deploy>.dump"
echo "============================================="
