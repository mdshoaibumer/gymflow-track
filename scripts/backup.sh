#!/bin/bash
# ==============================================================
# GymFlow Database Backup Script
# ==============================================================
# This script dumps the PostgreSQL database and (optionally)
# uploads it to an S3-compatible storage (like Cloudflare R2).
#
# Prerequisite:
# - Run from the root of the project
# - S3 credentials in environment or rclone config
# ==============================================================

# Set variables
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="gymflow_db_$TIMESTAMP.sql.gz"
CONTAINER_NAME="gymflow-db-1" # Check your docker compose project name

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "Starting backup of $CONTAINER_NAME..."

# Run pg_dump inside the container and compress it
docker exec $CONTAINER_NAME pg_dump -U gymflow gymflow | gzip > "$BACKUP_DIR/$FILENAME"

if [ $? -eq 0 ]; then
    echo "Backup successful: $BACKUP_DIR/$FILENAME"
    
    # --- Optional: Upload to S3/R2 using rclone ---
    # if command -v rclone &> /dev/null; then
    #     echo "Uploading to R2..."
    #     rclone copy "$BACKUP_DIR/$FILENAME" r2:gymflow-backups/database/
    #     if [ $? -eq 0 ]; then
    #         echo "Upload successful."
    #         # Optional: Remove local file after upload
    #         # rm "$BACKUP_DIR/$FILENAME"
    #     else
    #         echo "Upload failed."
    #     fi
    # fi

    # Keep only the last 7 days of local backups
    find $BACKUP_DIR -type f -name "*.sql.gz" -mtime +7 -delete
    echo "Cleanup of old local backups complete."
else
    echo "Backup failed!"
    exit 1
fi
