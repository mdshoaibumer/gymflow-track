#!/bin/bash
# ============================================================
# GymFlow Track — Rollback Script
# ============================================================
# Usage:
#   ./scripts/rollback.sh                    # Rollback to last deploy point
#   ./scripts/rollback.sh <commit-hash>      # Rollback to specific commit
#   ./scripts/rollback.sh --with-db <file>   # Rollback code + restore DB
#
# Safety:
#   - Creates a backup before rollback
#   - Validates health after rollback
#   - Logs all actions for audit trail
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gymflow}"
COMPOSE_FILE="docker-compose.prod.yml"
ROLLBACK_LOG="/var/log/gymflow-rollback.log"
TARGET_COMMIT=""
DB_RESTORE_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --with-db)
            DB_RESTORE_FILE="$2"
            shift 2
            ;;
        *)
            TARGET_COMMIT="$1"
            shift
            ;;
    esac
done

cd "$APP_DIR"

# Source environment
if [ -f .env ]; then
    set -a; source .env; set +a
fi

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ROLLBACK: $1"
    echo "$msg"
    echo "$msg" >> "$ROLLBACK_LOG" 2>/dev/null || true
}

# ── Determine rollback target ────────────────────────────────
if [ -z "$TARGET_COMMIT" ]; then
    if [ -f "$APP_DIR/.last_deploy" ]; then
        source "$APP_DIR/.last_deploy"
        TARGET_COMMIT="$COMMIT"
        log "Using last deploy point: $TARGET_COMMIT"
    else
        log "ERROR: No commit specified and no .last_deploy file found."
        echo "Usage: $0 <commit-hash>"
        echo "  or:  $0  (uses last deploy point)"
        exit 1
    fi
fi

echo "============================================="
echo "GymFlow Track — ROLLBACK"
echo "============================================="
log "Current commit: $(git rev-parse HEAD)"
log "Target commit:  $TARGET_COMMIT"
if [ -n "$DB_RESTORE_FILE" ]; then
    log "DB restore:     $DB_RESTORE_FILE"
fi
echo ""

read -p "Proceed with rollback? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    log "Rollback aborted by user"
    exit 0
fi

# ── Step 1: Pre-rollback backup ──────────────────────────────
log "[1/5] Creating pre-rollback backup..."
if docker compose -f "$COMPOSE_FILE" ps db --status running -q 2>/dev/null | grep -q .; then
    BACKUP_DIR="$APP_DIR/backups" bash "$APP_DIR/scripts/backup-db.sh" || \
        log "WARNING: Pre-rollback backup failed"
fi

# ── Step 2: Checkout target commit ───────────────────────────
log "[2/5] Checking out commit: $TARGET_COMMIT"
git fetch origin
git checkout "$TARGET_COMMIT"

# ── Step 3: Rebuild and restart ──────────────────────────────
log "[3/5] Rebuilding containers..."
docker compose -f "$COMPOSE_FILE" build backend frontend

log "  Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d db redis
sleep 5
docker compose -f "$COMPOSE_FILE" up -d backend
sleep 5
docker compose -f "$COMPOSE_FILE" up -d frontend
sleep 3
docker compose -f "$COMPOSE_FILE" up -d caddy

# ── Step 4: DB Restore (optional) ────────────────────────────
if [ -n "$DB_RESTORE_FILE" ]; then
    log "[4/5] Restoring database from $DB_RESTORE_FILE..."
    if [ ! -f "$DB_RESTORE_FILE" ]; then
        log "ERROR: DB restore file not found: $DB_RESTORE_FILE"
        exit 1
    fi

    docker compose -f "$COMPOSE_FILE" stop backend
    docker compose -f "$COMPOSE_FILE" exec -T db \
        pg_restore \
        --dbname="postgresql://${POSTGRES_USER:-gymflow}:${POSTGRES_PASSWORD:-gymflow}@localhost:5432/${POSTGRES_DB:-gymflow}" \
        --clean --if-exists --no-owner --no-privileges \
        < "$DB_RESTORE_FILE" 2>&1 || log "WARNING: Some restore warnings (may be normal)"

    docker compose -f "$COMPOSE_FILE" start backend
    sleep 10
else
    log "[4/5] Skipping DB restore (code-only rollback)"
    # Run migrations for the rolled-back version
    docker compose -f "$COMPOSE_FILE" exec -T backend alembic upgrade head 2>/dev/null || \
        log "WARNING: Migration at rollback target may need manual review"
fi

# ── Step 5: Health validation ────────────────────────────────
log "[5/5] Validating health..."
RETRY=0
HEALTHY=false
while [ $RETRY -lt 20 ]; do
    if curl -sf --max-time 5 http://localhost:8000/health/live > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    RETRY=$((RETRY + 1))
    sleep 3
done

if [ "$HEALTHY" = true ]; then
    log "ROLLBACK SUCCESSFUL"
    log "  Running commit: $(git rev-parse HEAD)"
    docker compose -f "$COMPOSE_FILE" ps
else
    log "ROLLBACK COMPLETED but backend may be unhealthy"
    log "  Check: docker compose -f $COMPOSE_FILE logs backend --tail=50"
fi

echo ""
echo "============================================="
log "Rollback complete: $(date)"
echo "============================================="
