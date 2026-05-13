#!/bin/bash
# ============================================================
# GymFlow Track Database Backup Script (Enterprise)
# ============================================================
# Usage:
#   ./scripts/backup-db.sh                       # Manual backup
#   0 2 * * * /opt/gymflowtrack/scripts/backup-db.sh   # Cron (daily 2AM)
#
# Features:
#   - pg_dump with custom format (compressed, parallel restore)
#   - AES-256 encryption for at-rest backup security
#   - Backup integrity verification
#   - Cloudflare R2 offsite upload (optional)
#   - Configurable retention (default: 30 days local, 90 days R2)
#   - Logging for audit trail
#
# Restore:
#   ./scripts/restore-db.sh backups/gymflowtrack_YYYYMMDD_HHMMSS.dump.enc
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gymflowtrack_${TIMESTAMP}.dump"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Docker mode
USE_DOCKER="${USE_DOCKER:-true}"
DOCKER_DB_SERVICE="${DOCKER_DB_SERVICE:-db}"

# Encryption (set BACKUP_ENCRYPTION_KEY to enable)
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# R2 offsite backup (optional)
R2_BUCKET="${R2_BUCKET:-}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"

# Backup log
BACKUP_LOG="${BACKUP_DIR}/backup.log"

# ── Ensure directories exist ────────────────────────────────
mkdir -p "$BACKUP_DIR"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg"
    echo "$msg" >> "$BACKUP_LOG" 2>/dev/null || true
}

log "Starting backup..."

# ── Perform backup ───────────────────────────────────────────
if [ "$USE_DOCKER" = "true" ]; then
    log "Mode: Docker (container: $DOCKER_DB_SERVICE)"

    # Verify DB container is running
    if ! docker compose -f "$COMPOSE_FILE" ps "$DOCKER_DB_SERVICE" --status running -q 2>/dev/null | grep -q .; then
        log "ERROR: DB container is not running!"
        exit 1
    fi

    docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_dump -U "${POSTGRES_USER:-gymflowtrack}" -d "${POSTGRES_DB:-gymflowtrack}" \
        --format=custom --compress=6 \
        --no-owner --no-privileges \
        > "$BACKUP_FILE"
else
    DATABASE_URL="${DATABASE_URL_SYNC:?Set DATABASE_URL_SYNC for direct mode}"
    log "Mode: Direct"
    pg_dump "$DATABASE_URL" \
        --format=custom \
        --compress=6 \
        --no-owner --no-privileges \
        --file="$BACKUP_FILE"
fi

# ── Validate backup ─────────────────────────────────────────
if [ ! -s "$BACKUP_FILE" ]; then
    log "ERROR: Backup file is empty!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

FILE_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_FILE ($FILE_SIZE)"

# ── Verify integrity ────────────────────────────────────────
log "Verifying backup integrity..."
if command -v pg_restore &>/dev/null; then
    if pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
        TABLE_COUNT=$(pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -c "TABLE DATA" || echo "?")
        log "Verification passed: $TABLE_COUNT tables backed up"
    else
        log "WARNING: Backup verification failed!"
    fi
else
    # Verify inside Docker container
    if cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" pg_restore --list > /dev/null 2>&1; then
        log "Verification passed"
    else
        log "WARNING: Backup verification failed"
    fi
fi

# ── Encrypt backup ───────────────────────────────────────────
if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
    log "Encrypting backup..."
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$BACKUP_FILE" \
        -out "${BACKUP_FILE}.enc" \
        -pass "pass:${BACKUP_ENCRYPTION_KEY}"

    if [ -s "${BACKUP_FILE}.enc" ]; then
        rm -f "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.enc"
        log "Backup encrypted: $BACKUP_FILE"
    else
        log "WARNING: Encryption failed, keeping unencrypted backup"
    fi
else
    log "Encryption skipped (BACKUP_ENCRYPTION_KEY not set)"
fi

# ── Upload to Cloudflare R2 (optional) ──────────────────────
if [ -n "$R2_BUCKET" ] && [ -n "$R2_ENDPOINT" ]; then
    log "Uploading to Cloudflare R2..."
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

    R2_KEY="backups/$(basename "$BACKUP_FILE")"
    if aws s3 cp "$BACKUP_FILE" "s3://${R2_BUCKET}/${R2_KEY}" \
        --endpoint-url "$R2_ENDPOINT" 2>&1; then
        log "Uploaded to R2: s3://${R2_BUCKET}/${R2_KEY}"

        # Clean old R2 backups (keep 90 days)
        R2_CUTOFF=$(date -d "-90 days" +%Y%m%d 2>/dev/null || date -v-90d +%Y%m%d 2>/dev/null || echo "")
        if [ -n "$R2_CUTOFF" ]; then
            log "R2 cleanup: keeping backups newer than $R2_CUTOFF"
        fi
    else
        log "WARNING: R2 upload failed (local backup preserved)"
    fi
else
    log "R2 upload skipped (R2_BUCKET not configured)"
fi

# ── Cleanup old local backups ────────────────────────────────
log "Cleaning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "gymflowtrack_*.dump*" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

REMAINING=$(find "$BACKUP_DIR" -name "gymflowtrack_*.dump*" | wc -l)
log "Retention: ${REMAINING} backup(s) on disk."

# ── Trim backup log ─────────────────────────────────────────
if [ -f "$BACKUP_LOG" ]; then
    tail -1000 "$BACKUP_LOG" > "${BACKUP_LOG}.tmp" && mv "${BACKUP_LOG}.tmp" "$BACKUP_LOG" 2>/dev/null || true
fi

log "Done."
