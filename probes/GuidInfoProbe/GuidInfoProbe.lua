-- GuidInfoProbe.lua
-- Dumps the COMPLETE return of C_HousingDecor.GetDecorInstanceInfoForGUID for
-- every decor GUID the game hands us (CUSTOMIZATION_CHANGED / PLACE_SUCCESS /
-- REMOVED). Housing Decor Guide only read decorID + name from this table; if
-- position/rotation/room/floor hide anywhere in the instance info, this finds it.
--
-- Usage: log in, open the house editor, place / move / remove a piece (or do
-- another blueprint import). Results saved to
-- WTF/Account/<acct>/SavedVariables/GuidInfoProbe.lua and printed to chat.

local MAX_RECURSE = 4
local MAX_ENTRIES = 500

local function deepDump(v, depth)
    depth = depth or 0
    local t = type(v)
    if t == "string" then return string.format("%q", v)
    elseif t == "number" or t == "boolean" then return tostring(v)
    elseif t ~= "table" then return "<" .. t .. ">"
    elseif depth >= MAX_RECURSE then return "{...}"
    end
    local parts = {}
    -- Deterministic order: numeric keys first, then sorted string keys
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
        -- Skip userdata/function values and self-references; keep the rest
        if type(kv) ~= "userdata" and type(kv) ~= "function" then
            parts[#parts + 1] = k .. "=" .. deepDump(kv, depth + 1)
        end
    end
    return "{" .. table.concat(parts, ", ") .. "}"
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")

frame:SetScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_LOGIN" then
        GuidInfoProbeDB = GuidInfoProbeDB or { logs = {}, seq = 0 }
        print("|cFF00FF00[GuidInfo]|r Loaded. Open the house editor and place/move/remove a piece.")
        frame:RegisterEvent("HOUSING_DECOR_CUSTOMIZATION_CHANGED")
        frame:RegisterEvent("HOUSING_DECOR_PLACE_SUCCESS")
        frame:RegisterEvent("HOUSING_DECOR_REMOVED")
        return
    end

    local guid = ...
    if type(guid) ~= "string" or guid:sub(1, 9) ~= "Housing-1" then
        print("|cFF00FF00[GuidInfo]|r " .. event .. " | arg1 not a housing GUID: " .. tostring(guid))
        return
    end

    local line = event .. " | guid=" .. guid
    -- The main event: what does GetDecorInstanceInfoForGUID actually return?
    if _G.C_HousingDecor and _G.C_HousingDecor.GetDecorInstanceInfoForGUID then
        local ok, info = pcall(_G.C_HousingDecor.GetDecorInstanceInfoForGUID, guid)
        if ok and type(info) == "table" then
            line = line .. " | info=" .. deepDump(info)
        else
            line = line .. " | info=ERR(" .. tostring(info) .. ")"
        end
    else
        line = line .. " | info=NO_API"
    end

    -- CONFIRMED 2026-08-12: calling C_HousingDecor.GetAllPlacedDecor from an
    -- addon pops Blizzard's "blocked from an action only available to the
    -- Blizzard UI" dialog (ADDON_ACTION_FORBIDDEN policy gate, per HDG docs).
    -- Do NOT call it from addon code — the popup names the addon and the call
    -- fails. Direct enumeration stays off-limits until Blizzard reopens it.

    print("|cFF00FF00[GuidInfo]|r " .. (string.len(line) > 400 and string.sub(line, 1, 400) .. "…" or line))
    local db = GuidInfoProbeDB
    db.seq = db.seq + 1
    db.logs[db.seq % MAX_ENTRIES] = line
end)
