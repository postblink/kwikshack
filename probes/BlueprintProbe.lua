-- BlueprintProbe.lua
-- Drop this folder into _retail_/Interface/AddOns/
-- Log in, open the Housing screen, try to inspect (NOT import) a blueprint
-- code you have access to. Results are saved to WTF/Account/<acct>/SavedVariables/BlueprintProbe.lua
-- and also dumped to chat on receipt.

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")

local function dumpTable(t, indent)
    indent = indent or ""
    local result = ""
    for k, v in pairs(t) do
        local kstr = tostring(k)
        if type(v) == "table" then
            result = result .. indent .. kstr .. " = {\n" .. dumpTable(v, indent .. "  ") .. indent .. "}\n"
        else
            result = result .. indent .. kstr .. " = " .. tostring(v) .. " (" .. type(v) .. ")\n"
        end
    end
    return result
end

frame:SetScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_LOGIN" then
        BlueprintProbeDB = BlueprintProbeDB or {}
        print("|cFF00FF00[BlueprintProbe]|r Loaded. Paste a blueprint code in the Import window, then inspect it.")
        frame:RegisterEvent("HOUSING_BLUEPRINT_CONTENTS_RECEIVED")
        frame:RegisterEvent("HOUSING_BLUEPRINT_CONTENTS_FAILURE")
    elseif event == "HOUSING_BLUEPRINT_CONTENTS_RECEIVED" then
        local info = ...
        print("|cFF00FF00[BlueprintProbe]|r CONTENTS RECEIVED")
        print("|cFF00FF00shareCode:|r " .. tostring(info.shareCode))
        local dump = dumpTable(info)
        print(dump)
        BlueprintProbeDB[info.shareCode] = {
            timestamp = date(),
            payload = info,
        }
        print("|cFFFFFFFF[BlueprintProbe]|r Saved to BlueprintProbeDB")
    elseif event == "HOUSING_BLUEPRINT_CONTENTS_FAILURE" then
        local shareCode, reasonCode = ...
        print("|cFFFF0000[BlueprintProbe]|r CONTENTS FAILURE: code=" .. tostring(shareCode) .. " reason=" .. tostring(reasonCode))
    end
end)
