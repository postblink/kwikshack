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

if [ -z "${KWIKSHACK_SUBMIT_KEY:-}" ]; then
  echo "[entrypoint] WARNING: KWIKSHACK_SUBMIT_KEY is unset; production submissions will return 503"
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
