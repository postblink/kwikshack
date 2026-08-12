#!/usr/bin/env bash
# KwikShack verification gate — the canonical command for this repo.
# Usage: ./scripts/verify.sh   (or: make verify)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== luac syntax =="
for f in $(find addon probes -name '*.lua'); do
	luac -p "$f"
	echo "  OK $f"
done

echo "== luacheck (0 errors gate) =="
LINT=$(luacheck addon/ probes/ 2>&1 || true)
echo "$LINT" | grep -E "Total:" | tail -1
if echo "$LINT" | grep -qE " [1-9][0-9]* errors"; then
	echo "LINT ERRORS — failing gate"
	exit 1
fi

echo "== behavioral harness =="
lua scripts/verify_behavior.lua

echo "VERIFY OK"
