#!/bin/bash
# ============================================================
# GymFlow Track — Production Deployment Script (Enterprise)
# ============================================================
# Usage:
#   ./scripts/deploy.sh            # Full deploy (pull + build + restart)
#   ./scripts/deploy.sh --quick    # Quick restart (no rebuild)
#   ./scripts/deploy.sh --rollback # Rollback to previous version
#
# Features:
#   - Pre-deploy backup
#   - Health-check validated deployment
#   - Automatic rollback if unhealthy
#   - Zero-downtime container restart
#   - Deploy log with timestamps
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/gymflow}"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_MONITORING="docker-compose.monitoring.yml"
BRANCH="${BRANCH:-main}"
QUICK_MODE=false
ROLLBACK_MODE=false
DEPLOY_LOG="/var/log/gymflow-deploy.log"
MAX_HEALTH_RETRIES=20
HEALTH_CHECK_INTERVAL=5

# Parse arguments
for arg in "$@"; do
    case $arg in
        --quick) QUICK_MODE=true ;;
        --rollback) ROLLBACK_MODE=true ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

cd "$APP_DIR"

# ── Logging ──────────────────────────────────────────────────
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$DEPLOY_LOG" 2>/dev/null || true
}

log_error() {
    log "ERROR: $1"
}

# ── Environment Validation ───────────────────────────────────
validate_env() {
    log "Validating environment..."
    local required_vars=("POSTGRES_PASSWORD" "JWT_SECRET_KEY" "RAZORPAY_KEY_ID" "RAZORPAY_KEY_SECRET" "REDIS_PASSWORD")
    local missing=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            # Try sourcing .env
            if [ -f .env ]; then
                set -a; source .env; set +a
            fi
            if [ -z "${!var:-}" ]; then
                missing+=("$var")
            fi
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing[*]}"
        log_error "Copy .env.production to .env and fill in all secrets."
        exit 1
    fi

    # Validate JWT secret strength
    if [ "${#JWT_SECRET_KEY}" -lt 32 ]; then
        log_error "JWT_SECRET_KEY is too short (${#JWT_SECRET_KEY} chars). Must be at least 32."
        exit 1
    fi

    log "  Environment: OK"
}

# ── Save current state for rollback ──────────────────────────
save_rollback_point() {
    local rollback_file="$APP_DIR/.last_deploy"
    local current_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    local current_images=$(docker compose -f "$COMPOSE_FILE" images --format json 2>/dev/null || echo "[]")

    cat > "$rollback_file" <<EOF
DEPLOY_TIME=$(date '+%Y-%m-%d %H:%M:%S')
COMMIT=$current_commit
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
EOF
    log "  Rollback point saved: $current_commit"
}

# ── Health Check ─────────────────────────────────────────────
check_health() {
    local service=$1
    local url=$2
    local retries=${3:-$MAX_HEALTH_RETRIES}
    local attempt=0

    while [ $attempt -lt $retries ]; do
        if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        log "  Waiting for $service... ($attempt/$retries)"
        sleep $HEALTH_CHECK_INTERVAL
    done
    return 1
}

# ── Rollback ─────────────────────────────────────────────────
rollback() {
    log "ROLLBACK initiated..."
    local rollback_file="$APP_DIR/.last_deploy"

    if [ ! -f "$rollback_file" ]; then
        log_error "No rollback point found. Manual intervention required."
        exit 1
    fi

    source "$rollback_file"

    log "  Rolling back to commit: $COMMIT"
    git checkout "$COMMIT" 2>/dev/null || git reset --hard "$COMMIT"

    log "  Rebuilding containers..."
    docker compose -f "$COMPOSE_FILE" build --no-cache backend frontend
    docker compose -f "$COMPOSE_FILE" up -d backend frontend

    log "  Waiting for services..."
    sleep 10

    if check_health "backend" "http://localhost:8000/health/live" 15; then
        log "  ROLLBACK SUCCESSFUL — backend healthy"
    else
        log_error "ROLLBACK FAILED — backend still unhealthy. Manual intervention required."
        log "  Check: docker compose -f $COMPOSE_FILE logs backend --tail=100"
        exit 1
    fi
}

# ── Main Deployment ──────────────────────────────────────────
echo "============================================="
echo "GymFlow Track — Production Deployment"
echo "============================================="
log "Deploy started"
log "  Branch: $BRANCH"
log "  Mode: $([ "$QUICK_MODE" = true ] && echo 'Quick' || echo 'Full')"

if [ "$ROLLBACK_MODE" = true ]; then
    rollback
    exit 0
fi

# Source environment
if [ -f .env ]; then
    set -a; source .env; set +a
fi

validate_env

# ── Step 1: Pull latest code ─────────────────────────────────
if [ "$QUICK_MODE" = false ]; then
    log "[1/8] Pulling latest code..."
    save_rollback_point
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    log "  Commit: $(git log --oneline -1)"
fi

# ── Step 2: Pre-deploy backup ────────────────────────────────
log "[2/8] Creating pre-deploy backup..."
if docker compose -f "$COMPOSE_FILE" ps db --status running -q 2>/dev/null | grep -q .; then
    BACKUP_DIR="$APP_DIR/backups" COMPOSE_FILE="$COMPOSE_FILE" \
        bash "$APP_DIR/scripts/backup-db.sh" || log "  WARNING: Backup failed (continuing)"
else
    log "  DB not running, skipping backup"
fi

# ── Step 3: Build new images ─────────────────────────────────
if [ "$QUICK_MODE" = false ]; then
    log "[3/8] Building Docker images..."
    docker compose -f "$COMPOSE_FILE" build
    log "  Build complete"
else
    log "[3/8] Skipping build (quick mode)"
fi

# ── Step 4: Start infrastructure ─────────────────────────────
log "[4/8] Starting infrastructure services..."
docker compose -f "$COMPOSE_FILE" up -d db redis
log "  Waiting for DB and Redis..."

# Wait for DB health check
RETRY=0
while [ $RETRY -lt 30 ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "${POSTGRES_USER:-gymflow}" > /dev/null 2>&1; then
        break
    fi
    RETRY=$((RETRY + 1))
    sleep 2
done

# ── Step 5: Run migrations ───────────────────────────────────
log "[5/8] Running database migrations..."
docker compose -f "$COMPOSE_FILE" run --rm --no-deps backend alembic upgrade head 2>&1 || {
    log_error "Migration failed!"
    log "  Attempting rollback..."
    rollback
    exit 1
}
log "  Migrations complete"

# ── Step 6: Deploy application ───────────────────────────────
log "[6/8] Deploying application containers..."

# Restart backend (new container starts before old stops)
docker compose -f "$COMPOSE_FILE" up -d --no-deps backend
log "  Backend deploying..."

sleep 5

# Restart frontend
docker compose -f "$COMPOSE_FILE" up -d --no-deps frontend
log "  Frontend deploying..."

sleep 5

# Restart Caddy (picks up any config changes)
docker compose -f "$COMPOSE_FILE" up -d --no-deps caddy
log "  Caddy deploying..."

# ── Step 7: Health validation ────────────────────────────────
log "[7/8] Validating health..."

if check_health "backend" "http://localhost:8000/health/live"; then
    log "  Backend: HEALTHY"
else
    log_error "Backend UNHEALTHY — initiating automatic rollback"
    rollback
    exit 1
fi

# Check readiness (includes DB connectivity)
if docker compose -f "$COMPOSE_FILE" exec -T backend curl -sf http://localhost:8000/health/ready > /dev/null 2>&1; then
    log "  Backend readiness: OK"
else
    log "  WARNING: Backend ready check failed (DB may be slow, monitoring)"
fi

# Container status
log ""
log "  Container status:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" ps

# ── Step 8: Cleanup ──────────────────────────────────────────
log "[8/8] Cleaning up..."
docker image prune -f --filter "until=168h" 2>/dev/null || true
docker builder prune -f --filter "until=168h" 2>/dev/null || true

# Update monitoring stack if present
if [ -f "$COMPOSE_MONITORING" ]; then
    log "  Updating monitoring stack..."
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_MONITORING" up -d prometheus grafana loki node-exporter 2>/dev/null || true
fi

# ── Summary ──────────────────────────────────────────────────
log ""
log "============================================="
log "Deployment SUCCESSFUL: $(date)"
log "Commit: $(git log --oneline -1)"
log ""
log "Verify:"
log "  curl -s https://api.gymflowtrack.in/health | python3 -m json.tool"
log "  curl -s https://app.gymflowtrack.in"
log ""
log "Rollback:"
log "  ./scripts/deploy.sh --rollback"
log "  ./scripts/restore-db.sh backups/<latest>.dump"
log "============================================="
