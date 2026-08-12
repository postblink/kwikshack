-- KwikShack behavioral verification (stubbed WoW globals)
-- Run via scripts/verify.sh — exercises every addon/probe file's core logic.
-- Each section rebuilds its stubs; SavedVariables globals reset between.
local fail = 0
local function ok(c, l) if c then io.write("  PASS " .. l .. "\n") else fail = fail + 1; io.write("  FAIL " .. l .. "\n") end end

-- Shared frame stub (WoW UI frame with event registration)
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
	_G.print = function(...) chat[#chat + 1] = table.concat({ ... }, " ") end
	local kwik = { Log = function(self, m) chat[#chat + 1] = m end }
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
	_G.C_HousingBlueprint = {}
	local kwik = { BlueprintManifest = {}, Log = function() end }
	local chunk = assert(loadfile("addon/BlueprintManifest.lua"))
	chunk("KwikShack", kwik)
	local BM = kwik.BlueprintManifest
	local id, icon = BM:ResolveItemID(726)
	ok(id == 235523 and icon == "7413232", "Manifest: ResolveItemID normal path")
	local id2, icon2 = BM:ResolveItemID(-1)
	ok(id2 == nil and icon2 == nil, "Manifest: pcall guard on poisoned catalog")
	local id3 = BM:ResolveItemID("nope")
	ok(id3 == nil, "Manifest: non-number recordID returns nil")
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
	ok(type(handler) == "function", "EventShower: OnEvent handler set")
	handler(frame, "PLAYER_LOGIN")
	ok(frame.events["HOUSING_DECOR_CUSTOMIZATION_CHANGED"], "EventShower: events registered")
	chatLines = {}
	handler(frame, "HOUSING_DECOR_CUSTOMIZATION_CHANGED", "Housing-1-5-726-abc", { x = 10.5, y = 20.25, z = 30, roomGUID = "Room-1" })
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
