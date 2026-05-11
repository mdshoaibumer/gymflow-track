#!/bin/bash
# ============================================================
# GymFlow Track Database Backup Script
# ============================================================
# Usage:
#   ./scripts/backup.sh                       # Manual backup
#   0 2 * * * /opt/gymflow/scripts/backup.sh   # Cron (daily 2AM)
#
# Modes:
#   - Docker: Runs pg_dump inside the db container (default for production)
#   - Direct: Runs pg_dump locally (for dev or direct DB access)
#
# Strategy:
#   - pg_dump with custom format (compressed, supports parallel restore)
#   - Retains last N daily backups (configurable via RETENTION_DAYS)
#   - Optional Cloudflare R2 offsite upload
#   - Verifiable backups with pg_restore --list
#
# Restore:
#   ./scripts/restore-db.sh backups/gymflow_YYYYMMDD_HHMMSS.dump
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gymflow_${TIMESTAMP}.dump"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Docker mode: run pg_dump inside the db container
USE_DOCKER="${USE_DOCKER:-true}"
DOCKER_DB_SERVICE="${DOCKER_DB_SERVICE:-db}"

# Database credentials (only needed for non-Docker mode)
DATABASE_URL="${DATABASE_URL_SYNC:-postgresql://gymflow:gymflow@localhost:5432/gymflow}"

# R2 offsite backup (optional)
R2_BUCKET="${R2_BUCKET:-}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"

# ── Ensure backup directory exists ───────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# ── Perform backup ───────────────────────────────────────────
if [ "$USE_DOCKER" = "true" ]; then
    echo "[$(date)] Mode: Docker (container: $DOCKER_DB_SERVICE)"
    docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_dump -U "${POSTGRES_USER:-gymflow}" -d "${POSTGRES_DB:-gymflow}" \
        --format=custom --compress=6 > "$BACKUP_FILE"
else
    echo "[$(date)] Mode: Direct (DATABASE_URL)"
    pg_dump "$DATABASE_URL" \
        --format=custom \
        --compress=6 \
        --file="$BACKUP_FILE"
fi

if [ ! -s "$BACKUP_FILE" ]; then
    echo "[$(date)] ERROR: Backup file is empty!" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

FILE_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup created: $BACKUP_FILE ($FILE_SIZE)"

# ── Verify backup integrity ─────────────────────────────────
echo "[$(date)] Verifying backup integrity..."
if pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
    echo "[$(date)] Verification passed: backup is valid"
else
    echo "[$(date)] WARNING: Backup verification failed!" >&2
fi

# ── Upload to Cloudflare R2 (optional) ──────────────────────
if [ -n "$R2_BUCKET" ] && [ -n "$R2_ENDPOINT" ]; then
    echo "[$(date)] Uploading to Cloudflare R2..."
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

    R2_KEY="backups/gymflow_${TIMESTAMP}.dump"
    if aws s3 cp "$BACKUP_FILE" "s3://${R2_BUCKET}/${R2_KEY}" \
        --endpoint-url "$R2_ENDPOINT" 2>&1; then
        echo "[$(date)] Uploaded to R2: s3://${R2_BUCKET}/${R2_KEY}"
    else
        echo "[$(date)] WARNING: R2 upload failed (local backup preserved)" >&2
    fi
else
    echo "[$(date)] R2 upload skipped (R2_BUCKET not configured)"
fi

# ── Cleanup old local backups ────────────────────────────────
echo "[$(date)] Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "gymflow_*.dump" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

REMAINING=$(find "$BACKUP_DIR" -name "gymflow_*.dump" | wc -l)
echo "[$(date)] Retention: ${REMAINING} backup(s) on disk."
echo "[$(date)] Done."
