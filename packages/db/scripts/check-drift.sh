#!/usr/bin/env sh
# Fails when the Drizzle schema changed without a generated migration:
# `drizzle-kit generate` must report that there is nothing to generate.
#
# drizzle-kit exits 0 on some errors, so only its explicit "no changes"
# message counts as a pass. Whatever generate writes is reverted, so a failed
# check leaves the working tree untouched.
set -eu
cd "$(dirname "$0")/.."

backup=$(mktemp -d)
cp -R migrations "$backup/"
restore() {
  rm -rf migrations
  cp -R "$backup/migrations" migrations
  rm -rf "$backup"
}
trap restore EXIT

pnpm exec drizzle-kit check
output=$(pnpm exec drizzle-kit generate 2>&1) || true

case "$output" in
  *"No schema changes"*) echo "Migrations match the schema." ;;
  *)
    echo "$output" >&2
    echo "Schema changes without a migration (or drizzle-kit failed). Run 'pnpm db:generate' and commit the result." >&2
    exit 1
    ;;
esac
