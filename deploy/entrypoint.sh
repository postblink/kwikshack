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

# adapter-node behind a TLS proxy: build request URLs from the proxy headers
# (Railway terminates TLS and forwards x-forwarded-*). Without this, adapter-node
# assumes https and SvelteKit's same-origin CSRF check rejects browser uploads.
export PROTOCOL_HEADER="${PROTOCOL_HEADER:-x-forwarded-proto}"
export HOST_HEADER="${HOST_HEADER:-x-forwarded-host}"

echo "[entrypoint] DATABASE_URL=$DATABASE_URL"
echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR"
exec node build/index.js
