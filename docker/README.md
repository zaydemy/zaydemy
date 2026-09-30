# Self-hosting with Docker Compose

Requirements: Docker with Compose v2. Postgres runs in the stack; nothing else
is required.

```sh
cp .env.example .env
# Set at least: APP_URL, APP_SECRET, POSTGRES_PASSWORD, EMAIL_TRANSPORT (+ its settings)
docker compose up -d --build
```

Startup order: Postgres → `migrate` (applies migrations once, then exits) →
`app`. If migrations fail, the app does not start. If the configuration is
invalid, the app exits and its log lists every problem
(`docker compose logs app`).

## First account

Registration is closed: accounts come from invitations. On a fresh install,
create the first account (a platform admin) and the first organization:

```sh
docker compose run --rm app node core/dist/setup.mjs \
  --name "Ada Lovelace" --email ada@example.com \
  --organization "Example Academy" --preset academy --locale en \
  --time-zone Europe/Istanbul
```

`--preset` is `individual`, `academy` or `school`. The command only works
while no account exists. Then sign in at `APP_URL` with a code sent to that
address.

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of the
app and set `APP_URL` to the public HTTPS address.

## Upgrading

```sh
git pull
docker compose up -d --build
```

Migrations run before the new version starts. Back up first.

## Backups

```sh
docker/backup.sh ./backups     # database dump + uploaded files
```

- Schedule it (cron, systemd timer). `BACKUP_KEEP_DAYS` (default 14) controls
  retention in the target directory.
- Copy the backups off the machine after each run; a backup on the same disk
  as the database dies with it.
- The dump is checked with `pg_restore --list` before it is kept, so a failed
  or truncated dump never replaces a good one.

## Restoring

```sh
docker/restore.sh ./backups/zaydemy-<stamp>.dump ./backups/zaydemy-<stamp>-uploads.tar.gz
```

Replaces the database (and uploaded files, when the archive is given). Works on
a fresh install too: migrations run first to create the database role that row
level security needs, then the dump replaces every table.

Restore a backup into a scratch install from time to time. A backup that was
never restored is not known to work.

## Files

With `STORAGE_DRIVER=local` (default), uploads live on the `uploads` volume and
are included in backups. With `STORAGE_DRIVER=s3`, back up the bucket with your
provider's tools.
