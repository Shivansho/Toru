#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/restore.sh <path_to_backup_file>"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file $BACKUP_FILE does not exist."
  exit 1
fi

if [ -f .env.production ]; then
  export $(cat .env.production | xargs)
fi

DB_USER=${POSTGRES_USER:-toru}
DB_NAME=${POSTGRES_DB:-toru_test}

CONTAINER_NAME=$(docker compose -f docker-compose.prod.yml ps -q postgres || echo "campus_chat_postgres")

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: Postgres container not found."
  exit 1
fi

echo "Warning: This will DROP existing connections and RESTORE the database."
read -p "Are you sure? (y/N): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  echo "Restore cancelled."
  exit 1
fi

docker cp $BACKUP_FILE $CONTAINER_NAME:/tmp/restore.dump
docker exec -t $CONTAINER_NAME pg_restore -U $DB_USER -d $DB_NAME -c --if-exists /tmp/restore.dump
docker exec -t $CONTAINER_NAME rm /tmp/restore.dump

echo "Restore completed from $BACKUP_FILE"
