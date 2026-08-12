-- KwikShack behavioral verification (stubbed WoW globals)
-- Run via scripts/verify.sh — exercises every addon/probe file's core logic.
local fail = 0
local function ok(c, l) if c then io.write("  PASS " .. l .. "\n") else fail = fail + 1; io.write("  FAIL " .. l .. "\n") end end

local function newFrame()
	return {
		events = {},
		_scripts = {},
		RegisterEvent = function(self, e) self.events[e] = true end,
		SetScript = function(self, k, fn) self._scripts[k] = fn end,
	}
end

-- ============================= addon/Init.lua =============================
do
	local frame = newFrame()
	local chat = {}
	_G.CreateFrame = function() return frame end
	_G.SlashCmdList = {}
	_G.KwikShackDB = nil
	_G.GetTime = function() return 100 end
	_G.date = function() return "2026-08-12" end
	_G.Enum = { HousingBlueprintType = { House = 1, Interior = 2, Exterior = 3, Room = 4 } }
	_G.print = function(...) chat[#chat + 1] = table.concat({ ... }, " ") end
	_G.strsplit = function(delim, str)
		local t = {}
		for s in string.gmatch(str, "[^" .. delim .. "]+") do t[#t + 1] = s end
		return unpack(t)
	end
	local kwik = { Log = function(self, m) chat[#chat + 1] = m end,
		BlueprintManifest = { RegisterEvents = function() end,
			InspectCode = function() end, ExportBlueprint = function() end,
			ExportRoomBlueprint = function() end, GetLatestManifest = function() end } }
	local chunk = assert(loadfile("addon/Init.lua"))
	chunk("KwikShack", kwik)
	local handler = frame._scripts.OnEvent
	ok(type(handler) == "function", "Init: OnEvent handler set")
	handler(frame, "ADDON_LOADED", "KwikShack")
	ok(type(_G.KwikShackDB) == "table", "Init: KwikShackDB initialised")
	ok(type(_G.SlashCmdList["KWIKSHACK"]) == "function", "Init: slash command registered")
end

-- ======================== addon/BlueprintManifest.lua ======================
do
	_G.C_HousingCatalog = {
		GetCatalogEntryInfoByRecordID = function(catID, rid)
			if rid == 726 then return { itemID = 235523, iconTexture = "7413232" } end
			if rid == -1 then error("poisoned row") end
			return nil
		end,
	}
	_G.C_HousingBlueprint = { IsShareCodeValid = function() return true end,
		GetBlueprintTypeForCode = function() return 1 end,
		RequestBlueprintContents = function() end,
		ExportBlueprint = function() end, ExportRoomBlueprint = function() end }
	_G.HousingResultToErrorText = {}
	_G.KwikShackDB = { apiEndpoint = "", autoExport = false }
	_G.GetTime = function() return 200 end
	_G.date = function() return "2026-08-12" end
	local kwik = { BlueprintManifest = {}, Log = function() end, ExportToAPI = function() end,
		CompactCode = { EncodeLatest = function(self)
			return "TESTCOMPACT" .. (KwikShackDB._lastResolved or "")
		end } }
	local chunk = assert(loadfile("addon/BlueprintManifest.lua"))
	chunk("KwikShack", kwik)
	local BM = kwik.BlueprintManifest

	-- ResolveItemID
	local id, icon = BM:ResolveItemID(726)
	ok(id == 235523 and icon == "7413232", "Manifest: ResolveItemID normal path")
	local id2, _ = BM:ResolveItemID(-1)
	ok(id2 == nil, "Manifest: pcall guard on poisoned catalog")
	ok(BM:ResolveItemID("nope") == nil, "Manifest: non-number recordID returns nil")

	-- OnContentsReceived + GetLatestManifest
	local raw = {
		shareCode = "TEST01",
		contentGroups = { { contentType = 3, entries = { { recordID = 726, total = 1, name = "Chair" } } } },
		budgetInfo = { interiorBudgets = {}, exteriorBudgets = {} },
		blockingRequirementFlags = 0,
	}
	BM:OnContentsReceived(raw)
	ok(_G.KwikShackDB._lastResolved == "TEST01", "Manifest: _lastResolved set")
	ok(_G.KwikShackDB._lastCompact == "TESTCOMPACTTEST01", "Manifest: _lastCompact written")
	ok(_G.KwikShackDB.resolvedManifests["TEST01"] ~= nil, "Manifest: stored in DB")
	local latest = BM:GetLatestManifest()
	ok(latest and latest.shareCode == "TEST01", "Manifest: GetLatestManifest returns it")

	-- OnExportSuccess
	BM:OnExportSuccess("EXPORTED01")
	ok(_G.KwikShackDB.exportedCodes["EXPORTED01"] ~= nil, "Manifest: exported code stored")
	ok(_G.KwikShackDB._lastExported == "EXPORTED01", "Manifest: _lastExported set")

	-- RegisterEvents hook coverage
	local eventFrame = newFrame()
	_G.CreateFrame = function() return eventFrame end
	BM:RegisterEvents()
	ok(eventFrame.events["HOUSING_BLUEPRINT_EXPORT_SUCCESS"], "Manifest: export event registered")
	ok(eventFrame.events["HOUSING_BLUEPRINT_CONTENTS_RECEIVED"], "Manifest: contents event registered")
end

-- =================== probes/BlueprintEventShower/ ==========================
do
	local chatLines = {}
	local frame = newFrame()
	_G.CreateFrame = function() return frame end
	_G.GetTime = function() return 1234.5678 end
	_G.print = function(...) chatLines[#chatLines + 1] = table.concat({ ... }, " ") end
	_G.BlueprintEventShowerDB = nil
	local chunk = assert(loadfile("probes/BlueprintEventShower/BlueprintEventShower.lua"))
	chunk()
	local handler = frame._scripts.OnEvent
	handler(frame, "PLAYER_LOGIN")
	chatLines = {}
	handler(frame, "HOUSING_DECOR_CUSTOMIZATION_CHANGED", "Housing-1-5-726-abc", { x = 10.5, y = 20.25, z = 30 })
	local joined = table.concat(chatLines, "\n")
	ok(joined:find("x=10%.5") and joined:find("y=20%.25") and joined:find("z=30"), "EventShower: nested coords captured")
	local db = _G.BlueprintEventShowerDB
	for i = 1, 2005 do handler(frame, "HOUSING_DECOR_REMOVED", "Housing-1-5-" .. i .. "-x") end
	local count = 0
	for _ in pairs(db.logs) do count = count + 1 end
	ok(count <= 2000, "EventShower: ring buffer capped (" .. count .. ")")
end

-- ========================== probes/GuidInfoProbe/ =========================
do
	local chatLines = {}
	local frame = newFrame()
	_G.CreateFrame = function() return frame end
	_G.print = function(...) chatLines[#chatLines + 1] = table.concat({ ... }, " ") end
	_G.GuidInfoProbeDB = nil
	_G.C_HousingDecor = {
		GetDecorInstanceInfoForGUID = function(guid)
			if guid == "Housing-1-1443-19252-477D00ED" then
				return { decorID = 19252, name = "Trophy", position = { x = 1, y = 2, z = 3 }, roomGUID = "R-1", floor = 1, size = 66 }
			end
			return nil
		end,
		GetAllPlacedDecor = function() error("ADDON_ACTION_FORBIDDEN") end,
	}
	local chunk = assert(loadfile("probes/GuidInfoProbe/GuidInfoProbe.lua"))
	chunk()
	local handler = frame._scripts.OnEvent
	handler(frame, "PLAYER_LOGIN")
	chatLines = {}
	handler(frame, "HOUSING_DECOR_CUSTOMIZATION_CHANGED", "Housing-1-1443-19252-477D00ED")
	local joined = table.concat(chatLines, "\n")
	ok(joined:find("position=") and joined:find("x=1"), "GuidInfo: nested position captured")
	ok(joined:find("floor=1") and joined:find('roomGUID="R%-1"'), "GuidInfo: room/floor captured")
	ok(not joined:find("GetAllPlacedDecor"), "GuidInfo: GetAllPlacedDecor NOT called (popup fix)")
end

-- ========================== probes/BlueprintProbe/ ========================
do
	local chatLines = {}
	local frame = newFrame()
	_G.CreateFrame = function() return frame end
	_G.print = function(...) chatLines[#chatLines + 1] = table.concat({ ... }, " ") end
	_G.date = function() return "2026-08-12" end
	_G.BlueprintProbeDB = nil
	local chunk = assert(loadfile("probes/BlueprintProbe/BlueprintProbe.lua"))
	chunk()
	local handler = frame._scripts.OnEvent
	handler(frame, "PLAYER_LOGIN")
	handler(frame, "HOUSING_BLUEPRINT_CONTENTS_RECEIVED", {
		shareCode = "TESTCODE",
		contentGroups = { { contentType = 3, entries = { { recordID = 726, name = "Chair", total = 1 } } } },
		blockingRequirementFlags = 0,
	})
	ok(type(_G.BlueprintProbeDB["TESTCODE"]) == "table", "BlueprintProbe: payload stored")
end

io.write(string.format("\n%d failures\n", fail))
os.exit(fail == 0 and 0 or 1)
