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
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY deploy/entrypoint.sh ./entrypoint.sh
COPY deploy/kwikshack.db ./seed/kwikshack.db
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
