-- KwikShack CompactCode.lua
-- Encodes the manifest into a short base64url string for easy copy-paste.
-- Binary format (v1): version(1) + numEntries(2LE) + [itemID(4LE) + count(2LE)]*N + shareCode(24)
-- Only encodes decor entries (contentType 3) that have itemIDs.

local ADDON_NAME, KwikShack = ...
local CC = {}
KwikShack.CompactCode = CC

local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

local function _base64url(bytes)
    local result = {}
    local n = #bytes
    local i = 1
    while i <= n do
        local a = (i <= n) and string.byte(bytes, i) or 0
        local b = (i + 1 <= n) and string.byte(bytes, i + 1) or 0
        local c = (i + 2 <= n) and string.byte(bytes, i + 2) or 0
        local v = a * 65536 + b * 256 + c
        result[#result + 1] = string.sub(B64_CHARS, math.floor(v / 262144) % 64 + 1, math.floor(v / 262144) % 64 + 1)
        result[#result + 1] = string.sub(B64_CHARS, math.floor(v / 4096) % 64 + 1, math.floor(v / 4096) % 64 + 1)
        result[#result + 1] = string.sub(B64_CHARS, math.floor(v / 64) % 64 + 1, math.floor(v / 64) % 64 + 1)
        result[#result + 1] = string.sub(B64_CHARS, v % 64 + 1, v % 64 + 1)
        i = i + 3
    end
    -- Remove padding (base64url is unpadded)
    local pad = (3 - (n % 3)) % 3
    for _ = 1, pad do result[#result] = nil end
    return table.concat(result)
end

local function _packU16(n)
    return string.char(bit.band(n, 0xFF)) .. string.char(bit.band(bit.rshift(n, 8), 0xFF))
end

local function _packU32(n)
    return string.char(bit.band(n, 0xFF))
        .. string.char(bit.band(bit.rshift(n, 8), 0xFF))
        .. string.char(bit.band(bit.rshift(n, 16), 0xFF))
        .. string.char(bit.band(bit.rshift(n, 24), 0xFF))
end

--- Encode the latest resolved manifest as a compact base64url string.
--- Returns nil, errorMsg if nothing is available or encoding fails.
function CC:EncodeLatest()
    local BP = KwikShack.BlueprintManifest
    if not BP or not BP.GetLatestManifest then return nil, "No manifest resolver loaded" end
    local m = BP:GetLatestManifest()
    if not m then return nil, "No manifest captured yet. /kshack inspect <code> first." end

    -- Collect decor entries with itemIDs
    local items = {}
    for _, g in ipairs(m.contentGroups or {}) do
        if g.contentType == 3 then  -- decor only
            for _, e in ipairs(g.entries or {}) do
                if type(e.itemID) == "number" and e.itemID > 0 then
                    items[#items + 1] = { itemID = e.itemID, count = e.total or e.count or 1 }
                end
            end
        end
    end

    if #items == 0 then return nil, "No items with resolved itemIDs in this manifest" end

    local parts = {}
    -- version
    parts[#parts + 1] = string.char(1)
    -- num entries
    parts[#parts + 1] = _packU16(#items)
    for _, it in ipairs(items) do
        parts[#parts + 1] = _packU32(it.itemID)
        parts[#parts + 1] = _packU16(math.min(it.count, 65535))
    end
    -- share code (truncate to 32 chars)
    local code = m.shareCode or ""
    parts[#parts + 1] = code:sub(1, 32)

    return _base64url(table.concat(parts))
end
