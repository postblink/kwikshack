-- KwikShack ExportDialog.lua
-- Presents generated manifest text in a reusable EditBox so the player can
-- explicitly copy it with Ctrl+C. WoW addons cannot write arbitrary text to
-- the operating-system clipboard without a user keyboard action.

-- luacheck: globals UIParent ChatFontNormal
local _, KwikShack = ...

KwikShack.ExportDialog = KwikShack.ExportDialog or {}
local ExportDialog = KwikShack.ExportDialog

local function _focusAndSelect(self, generation)
    local editBox = self.editBox
    if not editBox or self.selectionGeneration ~= generation then return end

    editBox:SetFocus()
    editBox:HighlightText()
    self.scrollFrame:SetVerticalScroll(0)
end

function ExportDialog:Create()
    if self.frame then return end

    local frame = CreateFrame("Frame", "KwikShackExportDialog", UIParent, "BackdropTemplate")
    frame:SetFrameStrata("DIALOG")
    frame:SetClampedToScreen(true)
    frame:EnableMouse(true)
    frame:SetMovable(true)
    frame:RegisterForDrag("LeftButton")
    frame:SetScript("OnDragStart", frame.StartMoving)
    frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
    frame:SetBackdrop({
        bgFile = "Interface/Tooltips/UI-Tooltip-Background",
        edgeFile = "Interface/Tooltips/UI-Tooltip-Border",
        tile = true,
        tileSize = 16,
        edgeSize = 16,
        insets = { left = 4, right = 4, top = 4, bottom = 4 },
    })
    frame:SetBackdropColor(0.055, 0.045, 0.03, 0.98)
    frame:SetBackdropBorderColor(0.78, 0.62, 0.25, 1)

    local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    title:SetPoint("TOPLEFT", 24, -20)
    title:SetText("KwikShack Export Ready")
    title:SetTextColor(1, 0.82, 0.35)

    local instructions = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    instructions:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -10)
    instructions:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -24, -52)
    instructions:SetJustifyH("LEFT")
    instructions:SetText("Press Ctrl+C to copy this build, then paste it at kwikshack.com/submit.")

    local scrollFrame = CreateFrame("ScrollFrame", nil, frame, "ScrollFrameTemplate")
    scrollFrame:SetPoint("TOPLEFT", frame, "TOPLEFT", 24, -88)
    scrollFrame:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -48, 62)

    local editBox = CreateFrame("EditBox", nil, scrollFrame)
    editBox:SetMultiLine(true)
    editBox:SetAutoFocus(false)
    editBox:SetFontObject(ChatFontNormal)
    editBox:SetTextInsets(8, 8, 8, 8)
    editBox:SetMaxLetters(0)
    editBox:SetScript("OnEscapePressed", function(box)
        box:ClearFocus()
        frame:Hide()
    end)
    editBox:SetScript("OnTextChanged", function(box)
        local _, fontHeight = box:GetFont()
        local lineHeight = (fontHeight or 14) + (box:GetSpacing() or 0)
        local contentHeight = math.max(1, box:GetNumLines()) * lineHeight + 20
        box:SetHeight(math.max(scrollFrame:GetHeight(), contentHeight))
        scrollFrame:UpdateScrollChildRect()
    end)
    scrollFrame:SetScrollChild(editBox)

    local closeButton = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    closeButton:SetSize(112, 28)
    closeButton:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -24, 20)
    closeButton:SetText("Close")
    closeButton:SetScript("OnClick", function()
        editBox:ClearFocus()
        frame:Hide()
    end)

    frame:SetScript("OnSizeChanged", function(_, width)
        editBox:SetWidth(math.max(120, width - 76))
    end)

    self.frame = frame
    self.scrollFrame = scrollFrame
    self.editBox = editBox
    self.closeButton = closeButton
end

---@param manifestText string Complete, serialized KwikShack submission payload.
function ExportDialog:Show(manifestText)
    self:Create()

    self.selectionGeneration = (self.selectionGeneration or 0) + 1
    local generation = self.selectionGeneration

    local parentWidth = UIParent:GetWidth()
    local parentHeight = UIParent:GetHeight()
    self.frame:SetSize(
        math.min(720, math.max(480, parentWidth - 80)),
        math.min(500, math.max(340, parentHeight - 100))
    )
    self.frame:ClearAllPoints()
    self.frame:SetPoint("CENTER", UIParent, "CENTER")

    self.editBox:SetText(manifestText)
    self.frame:Show()
    _focusAndSelect(self, generation)

    -- Focus can be reassigned while the frame is first being shown. Repeat on
    -- the next frame when available, but only if this is still the active text.
    if C_Timer and C_Timer.After then
        C_Timer.After(0, function()
            _focusAndSelect(self, generation)
        end)
    end
end
