# syntax=docker/dockerfile:1

# zaydemy application image. Build from the repository root:
#   docker build -t zaydemy .
#
# One image, two commands:
#   node apps/web/server.js      the web server (default)
#   node db/dist/migrate.mjs     applies database migrations, then exits
#   node core/dist/setup.mjs     creates the first account (first run only)
#
# The build never connects to a database: the same image must run against any
# database, and migrations are a separate deployment step.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- prune: only the packages the web app and the migrator need ---------------
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @zaydemy/web @zaydemy/db @zaydemy/core --docker

# --- install: dependency layer, cached until a manifest or the lockfile changes -
FROM base AS install
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# --- build -------------------------------------------------------------------
FROM install AS build
COPY --from=prune /repo/out/full/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@zaydemy/web --filter=@zaydemy/db --filter=@zaydemy/core
# Git does not track empty directories; the runtime stage copies public/.
RUN mkdir -p apps/web/public

# --- runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/data/uploads

RUN addgroup -g 1001 -S zaydemy && adduser -S -u 1001 -G zaydemy zaydemy \
 && mkdir -p /data/uploads && chown -R zaydemy:zaydemy /data

# Standalone server: traced node_modules plus the app under apps/web.
COPY --from=build --chown=zaydemy:zaydemy /repo/apps/web/.next/standalone ./
COPY --from=build --chown=zaydemy:zaydemy /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=zaydemy:zaydemy /repo/apps/web/public ./apps/web/public

# Command-line tools: single bundled files (and the SQL the migrator applies).
COPY --from=build --chown=zaydemy:zaydemy /repo/packages/db/dist/migrate.mjs ./db/dist/migrate.mjs
COPY --from=build --chown=zaydemy:zaydemy /repo/packages/db/migrations ./db/migrations
COPY --from=build --chown=zaydemy:zaydemy /repo/packages/core/dist/setup.mjs ./core/dist/setup.mjs

USER zaydemy
VOLUME ["/data/uploads"]
EXPOSE 3000

# Liveness only: /api/health does not touch the database, so a database
# outage shows up in logs and requests, not as a restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# exec form: SIGTERM reaches Node directly, so shutdowns are graceful.
CMD ["node", "apps/web/server.js"]
