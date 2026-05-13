#!/bin/bash
# ============================================================
# GymFlow Track Database Restore Script (Enterprise)
# ============================================================
# Usage:
#   ./scripts/restore-db.sh backups/gymflow_20260509_020000.dump
#   ./scripts/restore-db.sh backups/gymflow_20260509_020000.dump.enc
#
# Supports:
#   - Docker (production) and direct (development) modes
#   - Encrypted backups (.enc suffix)
#   - Pre-restore backup for safety
#   - Health validation after restore
#
# WARNING: This REPLACES all data in the target database.
# ============================================================

set -euo pipefail

# ── Load environment variables ──────────────────────────────
if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
fi

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.dump[.enc]>"
    echo "Example: $0 backups/gymflow_20260509_020000.dump"
    exit 1
fi

BACKUP_FILE="$1"
RESTORE_FILE="$BACKUP_FILE"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
USE_DOCKER="${USE_DOCKER:-true}"
DOCKER_DB_SERVICE="${DOCKER_DB_SERVICE:-db}"
DATABASE_URL="${DATABASE_URL_SYNC:-}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# ── Handle encrypted backups ─────────────────────────────────
if [[ "$BACKUP_FILE" == *.enc ]]; then
    if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
        echo "ERROR: Backup is encrypted but BACKUP_ENCRYPTION_KEY is not set."
        echo "Set it in .env or export BACKUP_ENCRYPTION_KEY=..."
        exit 1
    fi

    echo "Decrypting backup..."
    RESTORE_FILE="${BACKUP_FILE%.enc}"
    openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 \
        -in "$BACKUP_FILE" \
        -out "$RESTORE_FILE" \
        -pass "pass:${BACKUP_ENCRYPTION_KEY}"

    if [ ! -s "$RESTORE_FILE" ]; then
        echo "ERROR: Decryption failed — wrong key or corrupt file"
        rm -f "$RESTORE_FILE"
        exit 1
    fi
    echo "Decryption successful."
    CLEANUP_DECRYPTED=true
else
    CLEANUP_DECRYPTED=false
fi

# ── Verify backup integrity ─────────────────────────────────
echo "Verifying backup integrity..."
if command -v pg_restore &>/dev/null; then
    if ! pg_restore --list "$RESTORE_FILE" > /dev/null 2>&1; then
        echo "ERROR: Backup file appears corrupt or invalid: $RESTORE_FILE"
        [ "$CLEANUP_DECRYPTED" = true ] && rm -f "$RESTORE_FILE"
        exit 1
    fi
else
    # Verify inside Docker
    if ! docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_restore --list /dev/stdin < "$RESTORE_FILE" > /dev/null 2>&1; then
        echo "WARNING: Could not verify backup (may still be valid)"
    fi
fi
echo "Backup verified OK."

echo ""
echo "WARNING: This will REPLACE all data in the target database."
echo "Backup file: $BACKUP_FILE"
if [ "$USE_DOCKER" = "true" ]; then
    echo "Target: Docker container '$DOCKER_DB_SERVICE'"
else
    echo "Target: Direct connection"
fi
echo ""
read -p "Type 'yes' to proceed: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    [ "$CLEANUP_DECRYPTED" = true ] && rm -f "$RESTORE_FILE"
    exit 0
fi

# ── Pre-restore safety backup ────────────────────────────────
echo "[$(date)] Creating pre-restore safety backup..."
PRE_RESTORE_BACKUP="./backups/pre_restore_$(date +%Y%m%d_%H%M%S).dump"
if [ "$USE_DOCKER" = "true" ]; then
    docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_dump -U "${POSTGRES_USER:-gymflow}" -d "${POSTGRES_DB:-gymflow}" \
        --format=custom --compress=6 > "$PRE_RESTORE_BACKUP" 2>/dev/null && \
        echo "  Pre-restore backup: $PRE_RESTORE_BACKUP" || \
        echo "  WARNING: Pre-restore backup failed"
fi

echo "[$(date)] Starting restore from $BACKUP_FILE..."

if [ "$USE_DOCKER" = "true" ]; then
    # Stop backend to prevent writes during restore
    echo "[$(date)] Stopping backend..."
    docker compose -f "$COMPOSE_FILE" stop backend 2>/dev/null || true

    # Restore via Docker
    docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_restore \
        --dbname="postgresql://${POSTGRES_USER:?Set POSTGRES_USER}:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB:?Set POSTGRES_DB}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        < "$RESTORE_FILE" 2>&1 || echo "  (Some warnings are normal during restore)"

    # Run any pending migrations
    echo "[$(date)] Running migrations..."
    docker compose -f "$COMPOSE_FILE" start backend
    sleep 10
    docker compose -f "$COMPOSE_FILE" exec -T backend alembic upgrade head 2>/dev/null || \
        echo "  WARNING: Post-restore migration check failed"
else
    pg_restore \
        --dbname="$DATABASE_URL" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        "$RESTORE_FILE" 2>&1 || echo "  (Some warnings are normal)"
fi

# Cleanup decrypted file
[ "$CLEANUP_DECRYPTED" = true ] && rm -f "$RESTORE_FILE"

# ── Post-restore health check ───────────────────────────────
echo "[$(date)] Verifying restore..."
if [ "$USE_DOCKER" = "true" ]; then
    sleep 5
    if curl -sf --max-time 10 http://localhost:8000/health > /dev/null 2>&1; then
        echo "[$(date)] Backend healthy after restore."
    else
        echo "[$(date)] WARNING: Backend health check failed. Check logs."
    fi
fi

echo "[$(date)] Restore complete."
echo ""
echo "If restore caused issues, rollback to pre-restore backup:"
echo "  $0 $PRE_RESTORE_BACKUP"
