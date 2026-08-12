#!/usr/bin/env bash
# KwikShack SQLite volume backup — pulls the live DB from the Railway volume to
# local disk. Idempotent; keeps the last N backups.
#
# Usage:  bash scripts/backup_volume.sh            # quiet on success
#         KWIKSHACK_BACKUP_NOTIFY=1 bash scripts/backup_volume.sh   # print on success
# Env:    KWIKSHACK_BACKUP_DIR (default ~/.kwikshack/backups)
#         KWIKSHACK_KEEP       (default 14)
#
# Designed for a Hermes no_agent cron: silent (empty stdout) on success so the
# cron doesn't spam, and a non-zero exit on failure so it alerts.
#
# NOTE: this runs on haxtop and needs the railway CLI (auth via `railway login`).
# A cloud-side Railway cron is the more robust alternative if you want backups
# independent of this machine.
set -uo pipefail

export PATH="$HOME/.railway/bin:$PATH"
BACKUP_DIR="${KWIKSHACK_BACKUP_DIR:-$HOME/.kwikshack/backups}"
KEEP="${KWIKSHACK_KEEP:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

if ! railway volume files --volume kwikshack-volume download /data/kwikshack.db "$BACKUP_DIR/kwikshack-$TS.db" --overwrite; then
  echo "[kwikshack-backup] FAILED: railway download error" >&2
  exit 1
fi

# sanity check the downloaded file is a real SQLite DB
if ! head -c 16 "$BACKUP_DIR/kwikshack-$TS.db" | grep -q "SQLite format 3"; then
  echo "[kwikshack-backup] FAILED: downloaded file is not a SQLite DB" >&2
  exit 1
fi

# prune old backups (keep newest KEEP)
ls -1t "$BACKUP_DIR"/kwikshack-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

if [ -n "${KWIKSHACK_BACKUP_NOTIFY:-}" ]; then
  echo "[kwikshack-backup] OK $TS ($(du -h "$BACKUP_DIR/kwikshack-$TS.db" | cut -f1))"
fi
