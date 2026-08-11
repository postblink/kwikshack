-- KwikShack Init.lua
-- Entry point — loads on ADDON_LOADED, registers slash commands, defers heavy init.

local ADDON_NAME, KwikShack = ...

KwikShack.DEFAULTS = {
    apiEndpoint = "https://kwikshack.com/api",
    autoExport = false,       -- auto-export when inspecting a blueprint
}

-- Initialise saved variables, back-filling missing defaults
local function _InitDB()
    KwikShackDB = KwikShackDB or {}
    for k, v in pairs(KwikShack.DEFAULTS) do
        if KwikShackDB[k] == nil then
            KwikShackDB[k] = v
        end
    end
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(_, event, addonName)
    if event == "ADDON_LOADED" and addonName == ADDON_NAME then
        _InitDB()
        print("|cFF00FF00[KwikShack]|r Loaded. /kwikshack for help.")
    end
end)

-- Slash commands
SLASH_KWIKSHACK1 = "/kwikshack"
SLASH_KWIKSHACK2 = "/kshack"
SlashCmdList["KWIKSHACK"] = function(msg)
    local cmd = strsplit(" ", msg:lower())
    if cmd == "help" or cmd == "" then
        print("|cFF00FF00[KwikShack]|r Commands:")
        print("  /kshack inspect <code> — resolve a blueprint share code")
        print("  /kshack export — export your current house layout")
        print("  /kshack config — open settings")
    elseif cmd == "inspect" then
        -- TODO: hook BlueprintManifest inspection
        print("|cFFFFAA00[KwikShack]|r Inspect coming soon — paste the code in Blizzard's Import window first")
    elseif cmd == "export" then
        print("|cFFFFAA00[KwikShack]|r Export coming soon")
    elseif cmd == "config" then
        print("|cFFFFAA00[KwikShack]|r Config coming soon")
    end
end

KwikShack:Log("KwikShack initialised")
