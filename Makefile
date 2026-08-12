.PHONY: verify
verify:
	@echo "== luac + luacheck + behavioral (Lua addon + probes) =="
	@./scripts/verify.sh
	@echo "== svelte-check (web TS) =="
	@cd web && pnpm run check
	@echo "== companion test (Python) =="
	@python3 -c "import sys; sys.path.insert(0,'scripts'); from watchdog import extract_compact_code,decode_compact; c=extract_compact_code('[\"_lastCompact\"] = \"AQUA46UDAAEA89oDAAEAM7sDAAEAWMEDAAIAbL4DAAIAQWdFS1FyRlhia3BKVjVzbkJualVHblRG\"'); assert c; sc,items=decode_compact(c); assert sc=='AgEKQrFXbkpJV5snBnjUGnTF'; print('companion extraction+decode OK')"
	@echo "VERIFY ALL GREEN"
