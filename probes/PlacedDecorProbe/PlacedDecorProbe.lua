-- PlacedDecorProbe.lua
-- Purpose: does C_HousingDecor.GetAllPlacedDecor work from addon code, and does
-- its return include POSITION/ROTATION data? A previous probe observed
-- "GetAllPlacedDecor=OK(nil)" — the call did NOT hit the documented policy
-- gate (ADDON_ACTION_FORBIDDEN), it just returned nil. Probably a wrong
-- signature. This tries every plausible signature and dumps the results.
--
-- Usage: log in, enter your house, open the House Editor (or just be inside),
-- then run:
--   /gpd run
-- Results saved to WTF/Account/<acct>/SavedVariables/PlacedDecorProbe.lua
-- and printed to chat. The houseGUID is "Opaque-1" in prior captures, but we
-- also try to read it live from the housing API.

local ADDON_NAME, _ = ...

PlacedDecorProbeDB = PlacedDecorProbeDB or {}
PlacedDecorProbeDB.logs = PlacedDecorProbeDB.logs or {}

local MAX_RECURSE = 5

local function deepDump(v, depth)
    depth = depth or 0
    local t = type(v)
    if t == "string" then return string.format("%q", v)
    elseif t == "number" or t == "boolean" then return tostring(v)
    elseif t == "nil" then return "nil"
    elseif t ~= "table" then return "<" .. t .. ">"
    elseif depth >= MAX_RECURSE then return "{...}"
    end
    local parts = {}
    local numKeys, strKeys = {}, {}
    for k in pairs(v) do
        if type(k) == "number" then numKeys[#numKeys + 1] = k
        elseif type(k) == "string" then strKeys[#strKeys + 1] = k end
    end
    table.sort(numKeys)
    table.sort(strKeys)
    for _, k in ipairs(numKeys) do
        parts[#parts + 1] = "[" .. k .. "]=" .. deepDump(v[k], depth + 1)
    end
    for _, k in ipairs(strKeys) do
        local kv = v[k]
        if type(kv) ~= "userdata" and type(kv) ~= "function" then
            parts[#parts + 1] = k .. "=" .. deepDump(kv, depth + 1)
        end
    end
    return "{" .. table.concat(parts, ", ") .. "}"
end

local function logLine(msg)
    print("|cFF00FF00[PlacedDecorProbe]|r " .. msg)
    table.insert(PlacedDecorProbeDB.logs, 1, os.date("%c") .. " | " .. msg)
    if #PlacedDecorProbeDB.logs > 500 then
        for _ = 501, #PlacedDecorProbeDB.logs do PlacedDecorProbeDB.logs[#PlacedDecorProbeDB.logs] = nil end
    end
end

local function tryCall(label, ...)
    local fn = C_HousingDecor and C_HousingDecor.GetAllPlacedDecor
    if not fn then
        logLine("C_HousingDecor.GetAllPlacedDecor does not exist")
        return
    end
    local args = { ... }
    local ok, res = pcall(fn, ...)
    if not ok then
        logLine(string.format("CALL %s -> ERROR: %s", label, tostring(res)))
    elseif type(res) == "table" then
        logLine(string.format("CALL %s -> TABLE (%d keys): %s", label, #res, deepDump(res, 0)))
    else
        logLine(string.format("CALL %s -> %s", label, tostring(res)))
    end
end

local function getHouseGUID()
    if C_Housing and C_Housing.GetCurrentHouseGUID then
        local g = C_Housing.GetCurrentHouseGUID()
        if g and g ~= "" then return g end
    end
    if C_Housing and C_Housing.GetPlayerOwnedHouses then
        -- returns nothing directly; async. skip.
    end
    return "Opaque-1"  -- observed in prior captures
end

local function runProbe()
    logLine("=== GetAllPlacedDecor signature discovery ===")
    logLine("C_HousingDecor exists: " .. tostring(C_HousingDecor ~= nil))
    local houseGUID = getHouseGUID()
    logLine("houseGUID: " .. tostring(houseGUID))

    -- The captured decor GUIDs look like "Housing-1-1443-19252-477D00ED"
    -- so areaID (2nd segment) = 1443 for this plot. Try both 1443 and the
    -- house GUID as the first arg in various orders.
    local areaID = 1443
    tryCall("()", )
    tryCall("(areaID)", areaID)
    tryCall("(houseGUID)", houseGUID)
    tryCall("(areaID, houseGUID)", areaID, houseGUID)
    tryCall("(houseGUID, areaID)", houseGUID, areaID)
    tryCall("(areaID, houseGUID, true)", areaID, houseGUID, true)
    tryCall("(houseGUID, areaID, true)", houseGUID, areaID, true)

    -- Variants (unknown names are ignored; pcall guards them)
    for _, name in ipairs({ "GetAllPlacedDecorInArea", "GetPlacedDecorList", "GetPlacedDecorInfo" }) do
        local fn = C_HousingDecor and C_HousingDecor[name]
        if fn then
            local ok, res = pcall(fn, areaID, houseGUID)
            logLine(string.format("variant %s -> ok=%s res=%s", name, tostring(ok),
                ok and (type(res) == "table" and ("TABLE " .. deepDump(res, 0)) or tostring(res)) or tostring(res)))
        end
    end

    -- Also probe the related C_HousingLayout / C_HouseEditor for position APIs
    for ns, funcs in pairs({
        C_HousingLayout = { "GetRoomPlacementBudget", "GetViewedFloor", "GetNumFloors", "GetRoomPlayerIsIn" },
        C_HouseEditor = { "GetPlacementInfo", "GetPlacementPosition", "GetPlacingItemID", "GetCursorPosition" },
    }) do
        for _, f in ipairs(funcs) do
            local fn = _G[ns] and _G[ns][f]
            if fn then
                local ok, res = pcall(fn)
                logLine(string.format("%s.%s -> ok=%s res=%s", ns, f, tostring(ok),
                    ok and (type(res) == "table" and ("TABLE " .. deepDump(res, 0)) or tostring(res)) or tostring(res)))
            end
        end
    end
    logLine("=== done ===")
end

SLASH_GPD1 = "/gpd"
SlashCmdList["GPD"] = function(msg)
    if msg:lower() == "run" then runProbe()
    else print("|cFF00FF00[PlacedDecorProbe]|r Usage: /gpd run") end
end

-- Auto-run once on login if inside a house context (with a short delay to let
-- housing APIs warm up).
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
local didAuto = false
frame:SetScript("OnEvent", function()
    if didAuto then return end
    didAuto = true
    C_Timer.After(8, function()
        logLine("auto-run on login")
        runProbe()
    end)
end)
