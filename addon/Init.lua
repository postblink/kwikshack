-- KwikShack Init.lua
-- Entry point — loads on ADDON_LOADED, registers slash commands + blueprint events.

local ADDON_NAME, KwikShack = ...

KwikShack.DEFAULTS = {
    apiEndpoint = "https://kwikshack.com/api",
    autoExport = false,
}

local function _InitDB()
    KwikShackDB = KwikShackDB or {}
    for k, v in pairs(KwikShack.DEFAULTS) do
        if KwikShackDB[k] == nil then KwikShackDB[k] = v end
    end
end

local BP  -- BlueprintManifest reference, set after module load
local AddOnLoaded = false

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(_, event, addonName)
    if event == "ADDON_LOADED" and addonName == ADDON_NAME and not AddOnLoaded then
        AddOnLoaded = true
        _InitDB()
        BP = KwikShack.BlueprintManifest
        BP:RegisterEvents()
        print("|cFF00FF00[KwikShack]|r Loaded. /kshack inspect <code> | /kshack export <type> <name>")
    end
end)

-- =============================================================================
-- Slash commands
-- =============================================================================

SLASH_KWIKSHACK1 = "/kwikshack"
SLASH_KWIKSHACK2 = "/kshack"

local function _split(msg)
    local cmd, rest = msg:match("^(%S+)%s*(.*)$")
    return (cmd or ""):lower(), rest or ""
end

local function _printJSON(label, tbl)
    -- WoW Lua: no built-in JSON library. Serialise with minimal escaping.
    -- Lists are {...}, dicts are {...} with quoted keys. Handles nil, string, number, boolean.
    local function esc(s) return s:gsub('"', '\\"'):gsub('\n', '\\n') end
    local function _ser(v, depth)
        depth = depth or 0
        if depth > 20 then return '"<max depth>"' end
        local t = type(v)
        if v == nil then return "null"
        elseif t == "boolean" then return v and "true" or "false"
        elseif t == "number" then return tostring(v)
        elseif t == "string" then return '"' .. esc(v) .. '"'
        elseif t ~= "table" then return "null"
        end
        -- Table: detect if it's an array (consecutive integer keys starting at 1)
        local isArray = true
        local maxk = 0
        for k in pairs(v) do
            if type(k) ~= "number" or k < 1 or k ~= math.floor(k) then isArray = false; break end
            if k > maxk then maxk = k end
        end
        if isArray and next(v) and maxk <= #v + 10 then
            isArray = true  -- treat as array-like
        else
            isArray = false
        end
        local parts = {}
        if isArray then
            for i = 1, maxk do
                parts[i] = _ser(v[i], depth + 1)
            end
            return "[" .. table.concat(parts, ",") .. "]"
        else
            local keys = {}
            for k in pairs(v) do keys[#keys + 1] = tostring(k) end
            table.sort(keys)
            for _, k in ipairs(keys) do
                parts[#parts + 1] = '"' .. esc(k) .. '":' .. _ser(v[k], depth + 1)
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
    end
    local json = _ser(tbl)
    print("|cFFFFFFFF[KwikShack]|r " .. label .. " (" .. #json .. " chars)")
    -- Chunk print into WoW-chat-friendly segments (chat line limit ~2000 chars)
    local pos, chunk = 1, 1
    while pos <= #json do
        local seg = json:sub(pos, pos + 1499)
        print("|cFFAAAAAA" .. chunk .. "|r " .. seg)
        pos = pos + 1500
        chunk = chunk + 1
    end
    print("|cFFFFFFFF[KwikShack]|r --- end ---")
end

SlashCmdList["KWIKSHACK"] = function(msg)
    local cmd, rest = _split(msg)
    if cmd == "" or cmd == "help" then
        print("|cFF00FF00[KwikShack]|r Commands:")
        print("  /kshack inspect <code>         — resolve a blueprint share code")
        print("  /kshack copy                   — print the last resolved manifest as JSON")
        print("  /kshack code                   — print the last share code")
        print("  /kshack export <type> <name>   — export this house (types: house, interior, exterior, room)")

    elseif cmd == "inspect" then
        if rest == "" then
            print("|cFFFF0000[KwikShack]|r Usage: /kshack inspect <code>")
        else
            BP:InspectCode(rest)
        end

    elseif cmd == "copy" then
        if not BP.GetLatestManifest then
            print("|cFFFF0000[KwikShack]|r No manifest captured yet. Inspect a blueprint code first.")
            return
        end
        local m = BP:GetLatestManifest()
        if not m then
            print("|cFFFF0000[KwikShack]|r No manifest captured yet.")
            return
        end
        local payload = {
            shareCode = m.shareCode,
            title = m.shareCode,
            blueprintType = m.blueprintType,
            faction = nil,
            manifest = m,
        }
        _printJSON("Manifest for " .. m.shareCode, payload)

    elseif cmd == "code" then
        if not BP.GetLatestManifest then
            print("|cFFFF0000[KwikShack]|r No code captured yet. Inspect a blueprint code first.")
            return
        end
        local m = BP:GetLatestManifest()
        if m then
            print("|cFFFFFFFF[KwikShack]|r Last code: " .. m.shareCode)
        else
            print("|cFFFF0000[KwikShack]|r No code captured yet.")
        end

    elseif cmd == "export" then
        if rest == "" then
            print("|cFFFF0000[KwikShack]|r Usage: /kshack export <type> <name>")
            print("  types: house, interior, exterior, room")
            return
        end
        local etype, ename = _split(rest)
        local typeMap = {
            house = _G.Enum and _G.Enum.HousingBlueprintType and _G.Enum.HousingBlueprintType.House,
            interior = _G.Enum and _G.Enum.HousingBlueprintType and _G.Enum.HousingBlueprintType.Interior,
            exterior = _G.Enum and _G.Enum.HousingBlueprintType and _G.Enum.HousingBlueprintType.Exterior,
            room = _G.Enum and _G.Enum.HousingBlueprintType and _G.Enum.HousingBlueprintType.Room,
        }
        local t = typeMap[etype]
        if not t then
            print("|cFFFF0000[KwikShack]|r Unknown export type: " .. etype .. ". Use: house, interior, exterior, room")
            return
        end
        if ename == "" then ename = "My " .. etype end
        if etype == "room" then
            BP:ExportRoomBlueprint(ename)
        else
            BP:ExportBlueprint(t, ename)
        end

    elseif cmd == "config" then
        print("|cFFFFAA00[KwikShack]|r Config: use /run KwikShackDB.autoExport=true (coming soon)")

    else
        print("|cFFFF0000[KwikShack]|r Unknown command: " .. cmd .. ". Try /kshack help")
    end
end
