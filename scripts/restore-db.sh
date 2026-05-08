#!/bin/bash
# ============================================================
# GymFlow Database Restore Script
# ============================================================
# Usage:
#   ./scripts/restore-db.sh backups/gymflow_20260509_020000.dump
#
# WARNING: This DROPS and RECREATES the target database.
# Only use for disaster recovery or staging environment setup.
# ============================================================

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.dump>"
    echo "Example: $0 backups/gymflow_20260509_020000.dump"
    exit 1
fi

BACKUP_FILE="$1"
DATABASE_URL="${DATABASE_URL_SYNC:-postgresql://gymflow:gymflow@localhost:5432/gymflow}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will REPLACE all data in the target database."
echo "Backup file: $BACKUP_FILE"
echo "Target: $DATABASE_URL"
echo ""
read -p "Type 'yes' to proceed: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "[$(date)] Starting restore from $BACKUP_FILE..."

pg_restore \
    --dbname="$DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --verbose \
    "$BACKUP_FILE" 2>&1

echo "[$(date)] Restore complete."
