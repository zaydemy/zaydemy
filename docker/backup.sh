#!/usr/bin/env sh
# Backs up a Docker Compose install: the database and the uploaded files.
#
#   docker/backup.sh [target directory]      (default: ./backups)
#
# Writes zaydemy-<timestamp>.dump (pg_dump custom format) and, when the local
# storage driver holds files, zaydemy-<timestamp>-uploads.tar.gz. Keeps
# BACKUP_KEEP_DAYS days (default 14) of backups in the target directory.
#
# A backup on the same disk as the database is not a backup: copy the target
# directory somewhere else (rclone, restic, your provider's object storage)
# after each run. And restore one regularly (docker/restore.sh); an untested
# backup is not a backup either.
set -eu
cd "$(dirname "$0")/.."

target="${1:-./backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$target/zaydemy-$stamp.dump"
uploads="$target/zaydemy-$stamp-uploads.tar.gz"

mkdir -p "$target"
# Dumps contain personal data: readable by the owner only.
umask 077

echo "[backup] dumping the database"
# The server's own pg_dump: never older than the server, which pg_dump requires.
if ! docker compose exec -T postgres pg_dump -U zaydemy -d zaydemy --format=custom >"$dump.partial"; then
  rm -f "$dump.partial"
  echo "[backup] pg_dump failed" >&2
  exit 1
fi

# A truncated or empty dump must never replace a good backup: check that
# pg_restore can read its table of contents and that it holds our schema.
if ! docker compose exec -T postgres pg_restore --list <"$dump.partial" | grep -q "TABLE public organization"; then
  rm -f "$dump.partial"
  echo "[backup] the dump is unreadable or incomplete; nothing was written" >&2
  exit 1
fi
mv "$dump.partial" "$dump"
echo "[backup] $dump ($(wc -c <"$dump" | tr -d ' ') bytes)"

if docker compose exec -T app sh -c 'test -n "$(ls -A /data/uploads 2>/dev/null)"'; then
  echo "[backup] archiving uploaded files"
  docker compose exec -T app tar czf - -C /data uploads >"$uploads"
  echo "[backup] $uploads ($(wc -c <"$uploads" | tr -d ' ') bytes)"
fi

# Retention: timestamps sort lexically, so compare file names to a cutoff.
cutoff="$(date -u -d "-$keep_days days" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -v-"$keep_days"d +%Y%m%dT%H%M%SZ)"
for file in "$target"/zaydemy-*; do
  [ -e "$file" ] || continue
  name="$(basename "$file")"
  file_stamp="${name#zaydemy-}"
  file_stamp="${file_stamp%%[-.]*}"
  if [ "$file_stamp" \< "$cutoff" ]; then
    echo "[backup] removing $name (older than $keep_days days)"
    rm -f "$file"
  fi
done

echo "[backup] done"
