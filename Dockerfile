# KwikShack — Railway/Docker deploy

FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@11.14.0
WORKDIR /app
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml web/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# SvelteKit's postbuild analyse imports the server code, which opens SQLite —
# give it a valid (empty) DB path so the build doesn't crash.
ENV DATABASE_URL=/app/data/kwikshack.db
RUN mkdir -p /app/data
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# su-exec lets the entrypoint fix the (root-owned) data volume, then drop to the
# unprivileged `node` user before running migrations and the server.
RUN apk add --no-cache su-exec
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Migration runner + SQL, so the entrypoint can migrate before the app starts.
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/src/lib/server/db/apply-migrations.js ./src/lib/server/db/apply-migrations.js
# Scheduled jobs. `maintenance.mjs` enforces Blizzard's 30-day retention rule and
# must be run by the deployment scheduler — see docs/retention.md.
COPY --from=build /app/scripts/maintenance.mjs ./scripts/maintenance.mjs
COPY --from=build /app/scripts/sync-decor.mjs ./scripts/sync-decor.mjs
COPY --from=build /app/src/lib/server/decor-sync.js ./src/lib/server/decor-sync.js
COPY --from=build /app/src/lib/server/blizzard-game-data.js ./src/lib/server/blizzard-game-data.js
COPY deploy/entrypoint.sh ./entrypoint.sh
COPY deploy/kwikshack.db ./seed/kwikshack.db
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
