#!/bin/bash
set -e

# Load environment variables if available
if [ -f .env.production ]; then
  export $(cat .env.production | xargs)
fi

DB_USER=${POSTGRES_USER:-toru}
DB_NAME=${POSTGRES_DB:-toru_test}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/toru_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

echo "Starting database backup to $BACKUP_FILE..."

# Assuming docker-compose setup where postgres container is named 'toru-postgres-1'
# Or 'postgres' service
CONTAINER_NAME=$(docker compose -f docker-compose.prod.yml ps -q postgres || echo "campus_chat_postgres")

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: Postgres container not found."
  exit 1
fi

docker exec -t $CONTAINER_NAME pg_dump -U $DB_USER -d $DB_NAME -F c -f /tmp/backup.dump
docker cp $CONTAINER_NAME:/tmp/backup.dump $BACKUP_FILE
docker exec -t $CONTAINER_NAME rm /tmp/backup.dump

echo "Backup completed: $BACKUP_FILE"

# Note: Push $BACKUP_FILE to S3 here
