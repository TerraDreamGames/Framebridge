-- Copy only the focused, read-only plugin field that the user activated.
-- Studio can withhold virtual input; keep native selection as the fallback.
local Clipboard = {}

function Clipboard.shortcut(userInput, guiService)
	local detected, platform = pcall(function()
		return (userInput or game:GetService("UserInputService")):GetPlatform()
	end)
	if detected then
		if platform == Enum.Platform.OSX then return "⌘C" end
		if platform == Enum.Platform.Windows or platform == Enum.Platform.Linux then return "Ctrl+C" end
	end
	-- GetPlatform is restricted in some plugin contexts. Studio's legacy
	-- desktop-host flag is plugin-readable on Windows and macOS.
	local available, windows = pcall(function()
		return (guiService or game:GetService("GuiService")).IsWindows
	end)
	if available and type(windows) == "boolean" then return windows and "Ctrl+C" or "⌘C" end
	return nil
end

function Clipboard.selectAll(textbox)
	if not textbox or not textbox.Parent or not textbox:IsFocused() then return false end
	textbox.CursorPosition = 1
	textbox.SelectionStart = #textbox.Text + 1
	return true
end

function Clipboard.copy(textbox, userInput)
	if not textbox or not textbox.Parent or textbox.TextEditable or textbox.Text == ""
		or not textbox:FindFirstAncestorOfClass("DockWidgetPluginGui") then return false end
	if not Clipboard.selectAll(textbox) then return false end
	local input
	local available = pcall(function()
		userInput = userInput or game:GetService("UserInputService")
		-- Do not release or interfere with physical keys the user is holding.
		for _, key in ipairs({Enum.KeyCode.LeftControl, Enum.KeyCode.RightControl,
			Enum.KeyCode.LeftMeta, Enum.KeyCode.RightMeta, Enum.KeyCode.LeftAlt, Enum.KeyCode.RightAlt,
			Enum.KeyCode.LeftShift, Enum.KeyCode.RightShift, Enum.KeyCode.C}) do
			if userInput:IsKeyDown(key) then return end
		end
		input = userInput:CreateVirtualInput()
	end)
	if not available or not input then return false end
	local control, key = false, false
	local copied = pcall(function()
		control = true
		input:SendKey(true, Enum.KeyCode.LeftControl, false)
		key = true
		input:SendKey(true, Enum.KeyCode.C, false)
	end)
	-- Always release attempted keys, even when a send fails partway through.
	local releasedKey = not key or pcall(function() input:SendKey(false, Enum.KeyCode.C, false) end)
	local releasedControl = not control or pcall(function() input:SendKey(false, Enum.KeyCode.LeftControl, false) end)
	return copied and releasedKey and releasedControl
end

return Clipboard
