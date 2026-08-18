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
	local shownExports = {}
	local latestManifest = {
		shareCode = "TEST01",
		blueprintType = "1",
		contentGroups = { { contentType = 3, entries = { { recordID = 726, total = 2, name = "Chair" } } } },
		budgetInfo = { interiorBudgets = {}, exteriorBudgets = {} },
		blockingRequirements = {
			missingBudgets = false,
			missingRooms = false,
			missingDecor = false,
			factionMismatch = false,
			rawFlags = 0,
		},
	}
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
			ExportRoomBlueprint = function() end, GetLatestManifest = function() return latestManifest end },
		ExportDialog = { Show = function(self, text) shownExports[#shownExports + 1] = text end } }
	local chunk = assert(loadfile("addon/Init.lua"))
	chunk("KwikShack", kwik)
	local handler = frame._scripts.OnEvent
	ok(type(handler) == "function", "Init: OnEvent handler set")
	handler(frame, "ADDON_LOADED", "KwikShack")
	ok(type(_G.KwikShackDB) == "table", "Init: KwikShackDB initialised")
	ok(type(_G.SlashCmdList["KWIKSHACK"]) == "function", "Init: slash command registered")

	chat = {}
	_G.SlashCmdList["KWIKSHACK"]("copy")
	local expected = '{"blueprintType":"1","manifest":{"blockingRequirements":{"factionMismatch":false,"missingBudgets":false,"missingDecor":false,"missingRooms":false,"rawFlags":0},"blueprintType":"1","budgetInfo":{"exteriorBudgets":{},"interiorBudgets":{}},"contentGroups":[{"contentType":3,"entries":[{"name":"Chair","recordID":726,"total":2}]}],"shareCode":"TEST01"},"shareCode":"TEST01","title":"TEST01"}'
	ok(shownExports[1] == expected, "Init: /copy sends the exact expected manifest to the dialog")
	ok(#chat == 1 and chat[1]:find("Export ready") ~= nil, "Init: /copy prints only a short confirmation")
	ok(not table.concat(chat, "\n"):find('{"blueprintType"', 1, true), "Init: /copy does not dump JSON into chat")

	latestManifest = {
		shareCode = "TEST02",
		blueprintType = "2",
		contentGroups = {},
		budgetInfo = {},
		blockingRequirements = {},
	}
	_G.SlashCmdList["KWIKSHACK"]("copy")
	ok(#shownExports == 2 and shownExports[2]:find("TEST02", 1, true) ~= nil,
		"Init: rerunning /copy sends the latest manifest")
end

-- ========================= addon/ExportDialog.lua =========================
do
	local created = {}
	local function newWidget(kind)
		local widget = {
			_kind = kind,
			_scripts = {},
			_width = kind == "ScrollFrame" and 600 or 0,
			_height = kind == "ScrollFrame" and 300 or 0,
			_text = "",
			_shown = false,
		}
		function widget:SetScript(name, fn) self._scripts[name] = fn end
		function widget:SetSize(width, height)
			self._width, self._height = width, height
			if self._scripts.OnSizeChanged then self._scripts.OnSizeChanged(self, width, height) end
		end
		function widget:SetWidth(width) self._width = width end
		function widget:SetHeight(height) self._height = height end
		function widget:GetWidth() return self._width end
		function widget:GetHeight() return self._height end
		function widget:SetText(value)
			self._text = value
			if self._scripts.OnTextChanged then self._scripts.OnTextChanged(self) end
		end
		function widget:GetText() return self._text end
		function widget:GetNumLines() return math.max(1, math.ceil(#self._text / 80)) end
		function widget:GetFont() return "font.ttf", 14, "" end
		function widget:GetSpacing() return 0 end
		function widget:SetFocus() self._focused = true end
		function widget:ClearFocus() self._focused = false end
		function widget:HighlightText() self._highlighted = true end
		function widget:Show() self._shown = true end
		function widget:Hide() self._shown = false end
		function widget:IsShown() return self._shown end
		function widget:SetVerticalScroll(value) self._verticalScroll = value end
		function widget:CreateFontString()
			local child = newWidget("FontString")
			created[#created + 1] = child
			return child
		end
		widget.StartMoving = function() end
		widget.StopMovingOrSizing = function() end
		local noops = {
			"SetFrameStrata", "SetClampedToScreen", "EnableMouse", "SetMovable",
			"RegisterForDrag", "SetBackdrop", "SetBackdropColor", "SetBackdropBorderColor",
			"SetPoint", "SetTextColor", "SetJustifyH", "SetMultiLine", "SetAutoFocus",
			"SetFontObject", "SetTextInsets", "SetMaxLetters", "SetScrollChild",
			"UpdateScrollChildRect", "ClearAllPoints",
		}
		for _, method in ipairs(noops) do widget[method] = function() end end
		return widget
	end

	_G.UIParent = newWidget("UIParent")
	_G.UIParent._width = 1280
	_G.UIParent._height = 720
	_G.ChatFontNormal = {}
	_G.C_Timer = { After = function(_, fn) fn() end }
	_G.CreateFrame = function(kind)
		local widget = newWidget(kind)
		created[#created + 1] = widget
		return widget
	end

	local kwik = {}
	local chunk = assert(loadfile("addon/ExportDialog.lua"))
	chunk("KwikShack", kwik)
	local dialog = kwik.ExportDialog
	local longManifest = '{"manifest":"' .. string.rep("decor-entry-", 5000) .. '"}'
	dialog:Show(longManifest)
	local originalFrame = dialog.frame
	ok(dialog.editBox:GetText() == longManifest, "ExportDialog: long manifest is preserved exactly")
	ok(dialog.editBox._focused and dialog.editBox._highlighted, "ExportDialog: text is focused and selected")
	ok(dialog.editBox:GetHeight() > dialog.scrollFrame:GetHeight(), "ExportDialog: long manifest creates scrollable content")
	ok(dialog.frame:IsShown(), "ExportDialog: dialog opens")

	dialog.frame:Hide()
	dialog:Show('{"shareCode":"SECOND"}')
	ok(dialog.frame == originalFrame and dialog.frame:IsShown(), "ExportDialog: rerun reuses and reopens the dialog")
	ok(dialog.editBox:GetText() == '{"shareCode":"SECOND"}', "ExportDialog: rerun replaces the prior manifest")
	dialog.closeButton._scripts.OnClick()
	ok(not dialog.frame:IsShown() and not dialog.editBox._focused, "ExportDialog: Close hides the dialog and clears focus")
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
