#!/bin/bash
# ============================================================
# GymFlow Database Backup Script
# ============================================================
# Usage:
#   ./scripts/backup-db.sh                    # Manual backup
#   0 2 * * * /path/to/backup-db.sh           # Cron (daily 2AM)
#
# Strategy:
#   - pg_dump with custom format (compressed, supports parallel restore)
#   - Retains last 7 daily backups (configurable)
#   - Logs success/failure for monitoring
#
# For SaaS:
#   - Railway: Built-in daily backups (use this script for extra safety)
#   - Render: pg_dump to S3/Backblaze B2 via cron
#   - VPS: This script + cron + optional rclone to cloud storage
#
# Restore:
#   pg_restore -d gymflow backup_file.dump
#   OR: ./scripts/restore-db.sh backup_file.dump
# ============================================================

set -euo pipefail

# Configuration (override via environment variables)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gymflow_${TIMESTAMP}.dump"

# Database URL from environment or .env
DATABASE_URL="${DATABASE_URL_SYNC:-postgresql://gymflow:gymflow@localhost:5432/gymflow}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# pg_dump with custom format (compressed, parallel-restore capable)
if pg_dump "$DATABASE_URL" \
    --format=custom \
    --compress=6 \
    --verbose \
    --file="$BACKUP_FILE" 2>&1; then
    
    FILE_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup complete: $BACKUP_FILE ($FILE_SIZE)"
else
    echo "[$(date)] ERROR: Backup failed!" >&2
    exit 1
fi

# Cleanup old backups (keep last N days)
echo "[$(date)] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "gymflow_*.dump" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

REMAINING=$(find "$BACKUP_DIR" -name "gymflow_*.dump" | wc -l)
echo "[$(date)] Retention: ${REMAINING} backup(s) on disk."
echo "[$(date)] Done."
