-- BlueprintEventShower.lua
-- Dumps EVERY housing event with full raw args to chat + SavedVariables.
-- Purpose: find whether import-time events (HOUSING_DECOR_CUSTOMIZATION_CHANGED,
-- HOUSING_DECOR_PLACE_SUCCESS, HOUSE_EDITOR_MODE_CHANGED, blueprint import
-- events) carry spatial transforms that the contents payload lacks.
--
-- Usage: enable, log in, do a FULL blueprint import. Watch chat for
-- "EVENT <name>" lines. Data lands in
-- WTF/Account/<acct>/SavedVariables/BlueprintEventShower.lua (ring-buffered).

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")

-- Candidates — the housing event families that fire during editor/import flow.
-- Unknown names are ignored by RegisterEvent, so extras are harmless.
local EVENTS = {
    -- Blueprint flow
    "HOUSING_BLUEPRINT_CONTENTS_RECEIVED",
    "HOUSING_BLUEPRINT_CONTENTS_FAILURE",
    "HOUSING_BLUEPRINT_EXPORT_SUCCESS",
    "HOUSING_BLUEPRINT_EXPORT_FAILURE",
    "HOUSING_BLUEPRINT_COLLECTION_RECEIVED",
    "HOUSING_BLUEPRINT_COLLECTION_FAILURE",
    "HOUSING_BLUEPRINT_RENAME_SUCCESS",
    "HOUSING_BLUEPRINT_RENAME_FAILURE",
    "HOUSING_BLUEPRINT_DELETE_SUCCESS",
    "HOUSING_BLUEPRINT_DELETE_FAILURE",
    -- Editor / placement flow
    "HOUSE_EDITOR_MODE_CHANGED",
    "HOUSING_DECOR_PLACE_SUCCESS",
    "HOUSING_DECOR_PLACE_FAILURE",
    "HOUSING_DECOR_CUSTOMIZATION_CHANGED",
    "HOUSING_DECOR_REMOVED",
    -- House meta
    "PLAYER_HOUSE_LIST_UPDATED",
    "HOUSE_LEVEL_FAVOR_UPDATED",
}

local MAX_ENTRIES = 2000  -- ring buffer cap

-- Stringify one arg (no recursion — keep it flat and cheap)
local function argString(v, i)
    local t = type(v)
    if t == "string" then return string.format("arg%d = %q", i, v)
    elseif t == "number" or t == "boolean" then return string.format("arg%d = %s", i, tostring(v))
    elseif t == "table" then
        -- Table: dump key=value pairs one level deep (position info may hide here)
        local parts = {}
        for k, val in pairs(v) do
            local kt, vt = type(k), type(val)
            if (kt == "string" or kt == "number") and (vt == "string" or vt == "number" or vt == "boolean") then
                parts[#parts + 1] = kt == "string" and k .. "=" .. tostring(val) or "[" .. k .. "]=" .. tostring(val)
            end
        end
        if #parts > 0 then
            return string.format("arg%d = TABLE {%s}", i, table.concat(parts, ", "))
        end
        return string.format("arg%d = TABLE(empty)", i)
    else
        return string.format("arg%d = <%s>", i, t)
    end
end

frame:SetScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_LOGIN" then
        BlueprintEventShowerDB = BlueprintEventShowerDB or { logs = {}, seq = 0 }
        print("|cFF00FF00[EventShower]|r Loaded. " .. #EVENTS .. " events hooked. Do a full import now.")
        for _, e in ipairs(EVENTS) do frame:RegisterEvent(e) end
        return
    end

    local n = select("#", ...)
    local parts = {}
    for i = 1, n do parts[i] = argString(select(i, ...), i) end
    local line = string.format("%d | %s | %d args", math.floor(GetTime()), event, n)
    if #parts > 0 then line = line .. " :: " .. table.concat(parts, " ; ") end

    -- Chat (truncated to 250 chars to avoid spam)
    print("|cFF00FF00[EventShower]|r " .. (string.len(line) > 250 and string.sub(line, 1, 250) .. "…" or line))

    -- SavedVariables ring buffer
    local db = BlueprintEventShowerDB
    db.seq = db.seq + 1
    db.logs[db.seq % MAX_ENTRIES] = line
end)
