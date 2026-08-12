#!/usr/bin/env python3
"""
KwikShack companion — watches WoW SavedVariables for new resolved manifests
and auto-submits them to the kwikshack.com API. Zero deps (stdlib only).

The addon writes a compact code to KwikShackDB._lastCompact on each resolution.
This watcher reads that string, decodes the binary format, builds a payload,
and POSTs it. No fragile Lua-table parsing needed.
"""
import json, os, re, sys, time, urllib.request
from pathlib import Path

DEFAULT_CONFIG = {
    "api_url": "http://localhost:5173/api/builds",
    "author_name": "Postblink-Agamaggan",
    "submit_key": "",   # set to match KWIKSHACK_SUBMIT_KEY once deployed publicly
    "poll_interval": 5,
    "manifest_file": str(Path.home() /
        "Faugus/battlenet/drive_c/Program Files (x86)/World of Warcraft/_retail_/WTF/Account/F4LSE/SavedVariables/KwikShack.lua"),
}

def load_config(path: str | None = None) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    for p in [path, "watchdog_config.json", str(Path(__file__).parent.parent / "watchdog_config.json")]:
        try:
            with open(p) as f:
                cfg.update(json.load(f))
        except (FileNotFoundError, json.JSONDecodeError, TypeError):
            pass
    return cfg

# ── compact code decoder ─────────────────────────────────────────────────────
B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

def decode_compact(code: str) -> tuple[str, list[tuple[int, int]]]:
    """Decode a v1 compact code. Returns (shareCode, [(itemID, count), ...])."""
    s = code.strip()
    out = bytearray()
    for i in range(0, len(s), 4):
        a = B64.index(s[i])
        b = B64.index(s[i + 1]) if i + 1 < len(s) else -1
        c = B64.index(s[i + 2]) if i + 2 < len(s) else -1
        d = B64.index(s[i + 3]) if i + 3 < len(s) else -1
        if a < 0:
            raise ValueError(f"bad b64 char at {i}")
        v = a * 262144 + (max(0, b)) * 4096 + (max(0, c)) * 64 + max(0, d)
        out.append((v >> 16) & 0xff)
        if b >= 0: out.append((v >> 8) & 0xff)
        if c >= 0: out.append(v & 0xff)
    if out[0] != 1:
        raise ValueError(f"unknown version {out[0]}")
    n = out[1] | (out[2] << 8)
    items = []
    off = 3
    for _ in range(n):
        itemID = out[off] + (out[off + 1] << 8) + (out[off + 2] << 16) + (out[off + 3] * 16777216)
        count = out[off + 4] | (out[off + 5] << 8)
        items.append((itemID, count))
        off += 6
    shareCode = bytes(out[off:]).decode("ascii", errors="ignore").strip("\x00")
    return shareCode, items

def build_payload(shareCode: str, items: list[tuple[int, int]], author: str) -> dict:
    return {
        "shareCode": shareCode,
        "title": shareCode,
        "blueprintType": "House",
        "authorName": author,
        "manifest": {
            "shareCode": shareCode,
            "blueprintType": "House",
            "contentGroups": [{
                "contentType": 3,
                "entries": [{"itemID": iid, "total": n} for iid, n in items],
            }],
            "budgetInfo": {"interiorBudgets": [], "exteriorBudgets": []},
            "blockingRequirements": {
                "missingBudgets": False, "missingRooms": False,
                "missingDecor": False, "factionMismatch": False, "rawFlags": 0,
            },
        },
    }

# ── extraction from SavedVariables ───────────────────────────────────────────

def extract_compact_code(text: str) -> str | None:
    """Find `["_lastCompact"] = "..."` in KwikShack.lua."""
    m = re.search(r'_lastCompact"\]\s*=\s*"([^"]+)"', text)
    return m.group(1) if m else None

# ── main loop ───────────────────────────────────────────────────────────────

def main():
    cfg = load_config(sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--config" else None)
    mf = Path(cfg["manifest_file"]).expanduser()
    sent_file = mf.parent / "kwikshack_sent.json"
    sent = set()

    if sent_file.exists():
        try:
            sent = set(json.loads(sent_file.read_text()))
        except Exception:
            pass

    print(f"[kwikshack-watchdog] watching {mf}")
    print(f"[kwikshack-watchdog] API: {cfg['api_url']} | author: {cfg['author_name']}")

    last_mtime = 0
    while True:
        try:
            st = mf.stat()
            if st.st_mtime != last_mtime:
                last_mtime = st.st_mtime
                text = mf.read_text(encoding="utf-8", errors="ignore")
                code = extract_compact_code(text)
                if not code:
                    continue
                shareCode, items = decode_compact(code)
                if shareCode in sent:
                    continue
                payload = build_payload(shareCode, items, cfg["author_name"])
                data = json.dumps(payload).encode()
                headers = {"Content-Type": "application/json"}
                if cfg.get("submit_key"):
                    headers["x-kwikshack-key"] = cfg["submit_key"]
                req = urllib.request.Request(cfg["api_url"], data=data, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    resp_data = json.loads(resp.read())
                print(f"[kwikshack-watchdog] submitted {shareCode} -> {resp_data.get('id', '?')} ({len(items)} items)")
                sent.add(shareCode)
                sent_file.write_text(json.dumps(list(sent)))
        except Exception as e:
            print(f"[kwikshack-watchdog] error: {e}", file=sys.stderr)

        time.sleep(cfg["poll_interval"])

if __name__ == "__main__":
    main()
