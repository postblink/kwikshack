#!/bin/sh
# KwikShack entrypoint — first-boot seeding + runtime env wiring.
# Runs inside the Docker image (WORKDIR /app); data lives on a mounted volume.
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"

# First boot: seed the database from the image copy.
if [ ! -f "$DATA_DIR/kwikshack.db" ]; then
  cp /app/seed/kwikshack.db "$DATA_DIR/kwikshack.db"
  echo "[entrypoint] seeded database from image"
fi

export DATABASE_URL="${DATABASE_URL:-$DATA_DIR/kwikshack.db}"
export UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
# Adapter-node defaults to 512K, which is smaller than a legitimate screenshot.
# Endpoint-specific checks enforce tighter JSON and 5MB image limits.
export BODY_SIZE_LIMIT="${BODY_SIZE_LIMIT:-6M}"

# Schema evolution happens here, before the server opens the database, so a
# failed migration stops the deploy instead of half-starting the app. The
# runner takes a timestamped backup of an existing database first and rolls
# each migration back on error. The server also self-migrates on boot, so this
# step is belt-and-braces for the hosted deploy.
if [ -f /app/scripts/migrate.mjs ]; then
  node /app/scripts/migrate.mjs --database "$DATABASE_URL"
else
  echo "[entrypoint] WARNING: migration runner missing from image; relying on server-side migration"
fi

if [ -z "${KWIKSHACK_SUBMIT_KEY:-}" ]; then
  echo "[entrypoint] WARNING: KWIKSHACK_SUBMIT_KEY is unset; production submissions will return 503"
fi

if [ -z "${BNET_CLIENT_ID:-}" ] || [ -z "${BNET_CLIENT_SECRET:-}" ]; then
  echo "[entrypoint] NOTE: BNET_CLIENT_ID/BNET_CLIENT_SECRET unset; Sign in with Battle.net is disabled"
fi

# adapter-node behind a TLS proxy: build request URLs from the proxy headers
# (Railway terminates TLS and forwards x-forwarded-*). Without this, adapter-node
# assumes https and SvelteKit's same-origin CSRF check rejects browser uploads.
export PROTOCOL_HEADER="${PROTOCOL_HEADER:-x-forwarded-proto}"
export HOST_HEADER="${HOST_HEADER:-x-forwarded-host}"

echo "[entrypoint] DATABASE_URL=$DATABASE_URL"
echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR"
echo "[entrypoint] BODY_SIZE_LIMIT=$BODY_SIZE_LIMIT"
exec node build/index.js
