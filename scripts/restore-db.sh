#!/bin/bash
# ============================================================
# GymFlow Track Database Restore Script
# ============================================================
# Usage:
#   ./scripts/restore-db.sh backups/gymflow_20260509_020000.dump
#
# Supports both Docker (production) and direct (development) modes.
#
# WARNING: This REPLACES all data in the target database.
# Only use for disaster recovery or staging environment setup.
# ============================================================

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.dump>"
    echo "Example: $0 backups/gymflow_20260509_020000.dump"
    exit 1
fi

BACKUP_FILE="$1"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
USE_DOCKER="${USE_DOCKER:-true}"
DOCKER_DB_SERVICE="${DOCKER_DB_SERVICE:-db}"
DATABASE_URL="${DATABASE_URL_SYNC:-postgresql://gymflow:gymflow@localhost:5432/gymflow}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify backup before restore
echo "Verifying backup integrity..."
if ! pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
    echo "ERROR: Backup file appears corrupt or invalid: $BACKUP_FILE"
    exit 1
fi
echo "Backup verified OK."

echo ""
echo "WARNING: This will REPLACE all data in the target database."
echo "Backup file: $BACKUP_FILE"
if [ "$USE_DOCKER" = "true" ]; then
    echo "Target: Docker container '$DOCKER_DB_SERVICE'"
else
    echo "Target: $DATABASE_URL"
fi
echo ""
read -p "Type 'yes' to proceed: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "[$(date)] Starting restore from $BACKUP_FILE..."

if [ "$USE_DOCKER" = "true" ]; then
    # Stop backend to prevent writes during restore
    echo "[$(date)] Stopping backend..."
    docker compose -f "$COMPOSE_FILE" stop backend || true

    # Restore via Docker
    docker compose -f "$COMPOSE_FILE" exec -T "$DOCKER_DB_SERVICE" \
        pg_restore \
        --dbname="postgresql://${POSTGRES_USER:-gymflow}:${POSTGRES_PASSWORD:-gymflow}@localhost:5432/${POSTGRES_DB:-gymflow}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        < "$BACKUP_FILE" 2>&1

    # Restart backend
    echo "[$(date)] Restarting backend..."
    docker compose -f "$COMPOSE_FILE" start backend
else
    pg_restore \
        --dbname="$DATABASE_URL" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        "$BACKUP_FILE" 2>&1
fi

echo "[$(date)] Restore complete."
echo "[$(date)] Verify: docker compose -f $COMPOSE_FILE exec backend python -c 'from app.core.database import ...; ...'"
