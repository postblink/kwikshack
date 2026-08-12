-- KwikShack Core.lua
-- Shared utilities, event bus, HTTP helpers.

local ADDON_NAME, KwikShack = ...

-- =============================================================================
-- Logging
-- =============================================================================

function KwikShack:Log(msg)
    print("|cFF00FF00[KwikShack]|r " .. tostring(msg))
end

-- =============================================================================
-- HTTP export to the website API
-- =============================================================================

function KwikShack:ExportToAPI(payload)
    if not KwikShackDB.apiEndpoint then
        KwikShack:Log("No API endpoint configured. Set it in /kshack config.")
        return
    end
    KwikShack:Log("Exporting to " .. KwikShackDB.apiEndpoint .. " ...")
    -- TODO: actual HTTP POST with the manifest/placement payload
    -- Use self:OnExportSuccess / self:OnExportError callbacks
end
