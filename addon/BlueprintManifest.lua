-- KwikShack BlueprintManifest.lua
-- =============================================================================
-- Owns C_HousingBlueprint. Resolves share codes into structured manifests.
-- Hooks HOUSING_BLUEPRINT_CONTENTS_RECEIVED and parses the payload into a
-- deterministic format suitable for export to the website.
--
-- Verified API surface (12.1.0, via Vamoose's Housing Decor Guide source):
--   C_HousingBlueprint.IsShareCodeValid(code)
--   C_HousingBlueprint.GetBlueprintTypeForCode(code)
--   C_HousingBlueprint.RequestBlueprintContents(shareCode [, houseGUID])
--   C_HousingBlueprint.RequestBlueprintContentsForContext(shareCode, houseGUID)
--   C_HousingBlueprint.ExportBlueprint(typeEnum, name)
--   C_HousingBlueprint.ExportRoomBlueprint(name, roomGUID)
--   C_HousingBlueprint.RenameBlueprint(blueprintID, newName)
--   C_HousingBlueprint.DeleteBlueprint(blueprintID)
--   C_HousingBlueprint.GetBlueprintHyperlink(shareCode)
--   HousingFramesUtil.ShowBlueprintImport(shareCode)
--
-- Events:
--   HOUSING_BLUEPRINT_CONTENTS_RECEIVED  (payload: shareCode, contentGroups,
--        budgetInfo, blockingRequirementFlags, ...)
--   HOUSING_BLUEPRINT_CONTENTS_FAILURE   (shareCode, reasonCode)
--   HOUSING_BLUEPRINT_EXPORT_SUCCESS     (shareCode)
--   HOUSING_BLUEPRINT_EXPORT_FAILURE     (reasonCode)
--   HOUSING_BLUEPRINT_COLLECTION_RECEIVED
--   HOUSING_BLUEPRINT_COLLECTION_FAILURE
--   HOUSING_BLUEPRINT_RENAME_SUCCESS
--   HOUSING_BLUEPRINT_RENAME_FAILURE
--   HOUSING_BLUEPRINT_DELETE_SUCCESS
--   HOUSING_BLUEPRINT_DELETE_FAILURE
--
-- Known manifest structure (from HDGR PTR testing):
--   .shareCode               — the code this manifest belongs to
--   .contentGroups[]         — each group has a type and entries
--     Decor=3  — items with counts, dye variants
--     Dye=4    — dye info
--     Room/Fixture/HouseType — structural types
--   .budgetInfo              — { interiorBudgets, exteriorBudgets }
--     Budget array by type:
--       [0] = Rooms, [1] = Interior decor, [2] = Pet decor
--       each: { cost, max, current }
--   .blockingRequirementFlags — bitmask of what's missing
--     bit 1 = budgets, bit 2 = rooms, bit 8 = decor
--     bit 32 = faction mismatch
--   .numMissing — per content group, for acquirable types
--
-- WARNING: server can silently drop requests for certain foreign codes.
-- Manifest requests take 5-10s for large builds.
-- Blueprint codes are NOT permanent — they die when author deletes the blueprint.
-- =============================================================================

local ADDON_NAME, KwikShack = ...

KwikShack.BlueprintManifest = KwikShack.BlueprintManifest or {}
local BM = KwikShack.BlueprintManifest

-- =============================================================================
-- Public API
-- =============================================================================

--- Validate a share code format (no server call).
---@param code string
---@return boolean
function BM:IsValidCode(code)
    if not code or code == "" then return false end
    return C_HousingBlueprint.IsShareCodeValid(code)
end

--- Resolve a blueprint code. Results arrive async via BLUEPRINT_CONTENTS_RECEIVED.
---@param code string
function BM:InspectCode(code)
    if not self:IsValidCode(code) then
        KwikShack:Log("Invalid blueprint code")
        return
    end
    KwikShack:Log("Requesting blueprint contents for: " .. code)
    -- 12.1 API: if the player owns a house, the server defaults the target.
    -- For non-owners, pass a houseGUID via RequestBlueprintContentsForContext.
    C_HousingBlueprint.RequestBlueprintContents(code)
end

--- Open Blizzard's import dialog pre-filled with a code.
---@param code string
function BM:OpenImportDialog(code)
    if HousingFramesUtil and HousingFramesUtil.ShowBlueprintImport then
        HousingFramesUtil.ShowBlueprintImport(code)
    end
end

--- Get share code hyperlink (for chat sharing).
---@param code string
---@return string hyperlink
function BM:GetHyperlink(code)
    return C_HousingBlueprint.GetBlueprintHyperlink(code)
end

--- Export own blueprint.
---@param typeEnum HousingBlueprintType (Enum.HousingBlueprintType)
---@param name string
function BM:ExportBlueprint(typeEnum, name)
    C_HousingBlueprint.ExportBlueprint(typeEnum, name)
end

--- Export room blueprint (must be standing in the room).
---@param name string
function BM:ExportRoomBlueprint(name)
    local roomGUID = KwikShack:GetCurrentRoomGUID()  -- TODO: implement in
    if not roomGUID then
        KwikShack:Log("Must be inside a room to export it")
        return
    end
    C_HousingBlueprint.ExportRoomBlueprint(name, roomGUID)
end

-- =============================================================================
-- Event: CONTENTS_RECEIVED — the main data pipeline
-- =============================================================================

--- @class ManifestPayload
--- @field shareCode string
--- @field contentGroups table[]
--- @field budgetInfo table
--- @field blockingRequirementFlags integer

--- Normalise the raw Blizzard payload into a stable JSON-exportable structure.
--- Shape verified live 2026-08-11 (see docs/research.md): groups carry
--- `contentType`, entries carry `recordID` (decor catalog ID) + `name` +
--- `total` (count). NO itemID in the payload — resolved in-game via
--- C_HousingCatalog where available (decorID -> itemID mapping).
---@param raw table
---@return table
function BM:NormaliseManifest(raw)
    local m = {
        shareCode = raw.shareCode,
        blueprintType = tostring(C_HousingBlueprint.GetBlueprintTypeForCode(raw.shareCode)),
        contentGroups = {},
        budgetInfo = {},
        blockingRequirements = {},
    }
    -- Content groups — contentType: 1=house type, 2=room, 3=decor, 5=fixture
    if raw.contentGroups then
        for _, group in ipairs(raw.contentGroups) do
            local g = {
                contentType = group.contentType,
                entries = {},
            }
            if group.entries then
                for _, entry in ipairs(group.entries) do
                    local itemID, icon = self:ResolveItemID(entry.recordID)
                    table.insert(g.entries, {
                        recordID = entry.recordID,
                        name = entry.name,
                        total = entry.total,
                        invalid = entry.invalid,
                        numMissing = entry.numMissing,
                        itemID = itemID,       -- nil unless catalog lookup available
                        icon = icon,           -- FileDataID or atlas name
                    })
                end
            end
            table.insert(m.contentGroups, g)
        end
    end
    -- Budget info — keep raw arrays; budgetType: 0=rooms, 1=decor, 2=pet decor
    if raw.budgetInfo then
        m.budgetInfo = {
            interiorBudgets = raw.budgetInfo.interiorBudgets or {},
            exteriorBudgets = raw.budgetInfo.exteriorBudgets or {},
        }
    end
    -- Blocking requirements
    if raw.blockingRequirementFlags then
        local flags = raw.blockingRequirementFlags
        m.blockingRequirements = {
            missingBudgets = flags % 2 == 1,
            missingRooms    = math.floor(flags / 2) % 2 == 1,
            missingDecor    = math.floor(flags / 8) % 2 == 1,
            factionMismatch = math.floor(flags / 32) % 2 == 1,
            rawFlags = flags,
        }
    end
    return m
end

--- Resolve a decor catalog recordID to an itemID (+ icon when available).
--- Verified signature (from Housing Decor Guide source): catalog 1 is
--- Blizzard's housing catalog; GetCatalogEntryInfoByRecordID returns the
--- entry info incl. itemID and iconTexture. Defensive: returns nil on any
--- failure — the site falls back to display name + recordID.
---@param recordID number
---@return number|nil, string|nil  -- itemID, iconTexture (FileDataID or atlas)
function BM:ResolveItemID(recordID)
    if type(recordID) ~= "number" then return nil, nil end
    local cat = _G.C_HousingCatalog
    if not (cat and cat.GetCatalogEntryInfoByRecordID) then return nil, nil end
    local ok, info = pcall(cat.GetCatalogEntryInfoByRecordID, 1, recordID)
    if not ok or type(info) ~= "table" then return nil, nil end
    local itemID = type(info.itemID) == "number" and info.itemID or nil
    local icon = nil
    if type(info.iconTexture) == "string" then
        icon = info.iconTexture
    elseif type(info.iconTexture) == "number" then
        icon = tostring(info.iconTexture)  -- fileDataID may arrive as a number
    end
    if not icon and type(info.iconAtlas) == "string" then icon = info.iconAtlas end
    return itemID, icon
end

--- @return table|nil  -- the most recently resolved normalised manifest
function BM:GetLatestManifest()
    if not KwikShackDB.resolvedManifests then return nil end
    local latest, code
    for c, m in pairs(KwikShackDB.resolvedManifests) do
        if type(m) == "table" and m.shareCode then
            if not code or (m._resolvedAt or 0) > (latest and latest._resolvedAt or 0) then
                latest, code = m, c
            end
        end
    end
    return latest
end

--- Fires when the server returns blueprint contents.
--- Normalise + log; pass to the export pipeline if auto-export is enabled.
function BM:OnContentsReceived(raw)
    local m = self:NormaliseManifest(raw)
    m._resolvedAt = GetTime()
    local itemCount = 0
    for _, g in ipairs(m.contentGroups or {}) do
        if g.contentType == 3 then  -- decor groups
            for _, e in ipairs(g.entries or {}) do
                itemCount = itemCount + 1
            end
        end
    end
    KwikShack:Log(string.format(
        "Resolved: %s | type=%s | items=%d | %s",
        m.shareCode,
        m.blueprintType,
        itemCount,
        (m.blockingRequirements or {}).factionMismatch and "faction-mismatch" or "importable"
    ))
    -- Store in saved variables for the session
    KwikShackDB.resolvedManifests = KwikShackDB.resolvedManifests or {}
    KwikShackDB.resolvedManifests[m.shareCode] = m
    KwikShackDB._lastResolved = m.shareCode
    print("|cFF00FF00[KwikShack]|r Manifest ready. /kshack copy to view JSON — paste at kwikshack.com/submit")
    -- Auto-export if enabled
    if KwikShackDB.autoExport then
        KwikShack:ExportToAPI(m)
    end
end

function BM:OnContentsFailure(shareCode, reasonCode)
    KwikShack:Log("Blueprint contents failed: " .. tostring(shareCode) .. " reason=" .. tostring(reasonCode))
end

-- =============================================================================
-- Export capture — hooks EXPORT_SUCCESS to record the generated share code
-- =============================================================================

function BM:OnExportSuccess(shareCode)
    KwikShackDB.exportedCodes = KwikShackDB.exportedCodes or {}
    KwikShackDB.exportedCodes[shareCode] = {
        code = shareCode,
        exportedAt = date(),
    }
    KwikShackDB._lastExported = shareCode
    print("|cFF00FF00[KwikShack]|r Exported! Share code: " .. shareCode)
end

function BM:OnExportFailure(reasonCode)
    local map = _G.HousingResultToErrorText
    KwikShack:Log("Export failed: " .. (map and map[reasonCode] or "unknown reason (" .. tostring(reasonCode) .. ")"))
end

-- =============================================================================
-- Register events (hooked during ADDON_LOADED in Init.lua)
-- =============================================================================

function BM:RegisterEvents()
    local frame = CreateFrame("Frame")
    frame:RegisterEvent("HOUSING_BLUEPRINT_CONTENTS_RECEIVED")
    frame:RegisterEvent("HOUSING_BLUEPRINT_CONTENTS_FAILURE")
    frame:RegisterEvent("HOUSING_BLUEPRINT_EXPORT_SUCCESS")
    frame:RegisterEvent("HOUSING_BLUEPRINT_EXPORT_FAILURE")
    frame:RegisterEvent("HOUSING_BLUEPRINT_COLLECTION_RECEIVED")
    frame:SetScript("OnEvent", function(_, event, ...)
        if event == "HOUSING_BLUEPRINT_CONTENTS_RECEIVED" then
            BM:OnContentsReceived(...)
        elseif event == "HOUSING_BLUEPRINT_CONTENTS_FAILURE" then
            BM:OnContentsFailure(...)
        elseif event == "HOUSING_BLUEPRINT_EXPORT_SUCCESS" then
            BM:OnExportSuccess(...)
        elseif event == "HOUSING_BLUEPRINT_EXPORT_FAILURE" then
            BM:OnExportFailure(...)
        elseif event == "HOUSING_BLUEPRINT_COLLECTION_RECEIVED" then
            -- collection updated (export/delete/rename side effect); no action needed
        end
    end)
end
