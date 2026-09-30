#!/usr/bin/env sh
# Restores a backup made by docker/backup.sh into this Compose install.
#
#   docker/restore.sh <backup.dump> [uploads.tar.gz] [--yes]
#
# REPLACES the current database (and uploaded files, when an archive is given).
# The app is stopped during the restore and started again afterwards.
set -eu
cd "$(dirname "$0")/.."

dump=""
uploads=""
confirmed=""
for arg in "$@"; do
  case "$arg" in
    --yes) confirmed=1 ;;
    *.dump) dump="$arg" ;;
    *.tar.gz) uploads="$arg" ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
[ -n "$dump" ] && [ -f "$dump" ] || { echo "Usage: docker/restore.sh <backup.dump> [uploads.tar.gz] [--yes]" >&2; exit 2; }
[ -z "$uploads" ] || [ -f "$uploads" ] || { echo "No such file: $uploads" >&2; exit 2; }

if [ -z "$confirmed" ]; then
  printf "This replaces the current database%s. Type 'restore' to continue: " "${uploads:+ and uploaded files}"
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

echo "[restore] stopping the app"
docker compose stop app

# Migrations first: they create the database role that row level security
# policies refer to (roles are not part of a dump). The restore then replaces
# every table, including the migration journal, with the backup's.
docker compose up -d --wait postgres
docker compose run --rm migrate

echo "[restore] restoring the database"
docker compose exec -T postgres pg_restore -U zaydemy -d zaydemy \
  --clean --if-exists --no-owner --single-transaction <"$dump"

if [ -n "$uploads" ]; then
  echo "[restore] restoring uploaded files"
  docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'find /data/uploads -mindepth 1 -delete && tar xzf - -C /data' <"$uploads"
fi

echo "[restore] starting the app"
docker compose up -d --wait app
echo "[restore] done"
