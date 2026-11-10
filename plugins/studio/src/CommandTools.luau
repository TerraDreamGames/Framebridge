-- Explicit native UI commands. Search text never becomes source code.
local Commands = {}
local classes = {
	"ScreenGui",
	"Frame",
	"CanvasGroup",
	"ScrollingFrame",
	"TextLabel",
	"TextButton",
	"TextBox",
	"ImageLabel",
	"ImageButton",
	"ViewportFrame",
	"UIListLayout",
	"UIGridLayout",
	"UIPadding",
	"UICorner",
	"UIStroke",
	"UIGradient",
	"UIScale",
	"UIAspectRatioConstraint",
	"UISizeConstraint",
	"UITextSizeConstraint",
	"UIFlexItem",
}
local modifiers = {}
local catalog, byId = {}, {}
for _, class in ipairs(classes) do
	local entry = {
		id = "create:" .. class,
		label = "Create " .. class,
		kind = "create",
		class = class,
		hint = class == "ScreenGui" and "Add a screen to StarterGui" or "Add under one selected UI container",
		keywords = "add insert new " .. class,
	}
	if class:sub(1, 2) == "UI" then
		modifiers[class] = true
	end
	table.insert(catalog, entry)
	byId[entry.id] = entry
end
for _, spec in ipairs({
	{ "scale-both", "Convert size and position to Scale", "geometry", { units = "scale", scope = "both" } },
	{ "scale-size", "Convert size to Scale", "geometry", { units = "scale", scope = "size" } },
	{ "scale-position", "Convert position to Scale", "geometry", { units = "scale", scope = "position" } },
	{ "pixels-both", "Convert size and position to Pixels", "geometry", { units = "offset", scope = "both" } },
	{ "aspect", "Match the current aspect ratio", "aspect", {} },
	{ "fill", "Fit element to parent", "fill", {} },
	{
		"anchor-center",
		"Center anchor and retain visual position",
		"anchor",
		{ anchor = Vector2.new(0.5, 0.5), keepPosition = true },
	},
	{ "text", "Scale text with its element", "text", { minimum = 12, maximum = 32 } },
}) do
	local entry = {
		id = "tool:" .. spec[1],
		label = spec[2],
		kind = "tool",
		operation = spec[3],
		options = spec[4],
		hint = "Use the current Explorer UI selection",
		keywords = "selection utility responsive " .. spec[2],
	}
	table.insert(catalog, entry)
	byId[entry.id] = entry
end
function Commands.query(value)
	local terms, results = {}, {}
	for word in tostring(value or ""):sub(1, 200):lower():gmatch("%S+") do
		table.insert(terms, word)
	end
	for _, entry in ipairs(catalog) do
		local haystack = (entry.label .. " " .. entry.keywords):lower()
		local matches = true
		for _, word in ipairs(terms) do
			if not haystack:find(word, 1, true) then
				matches = false
				break
			end
		end
		if matches then
			table.insert(results, entry)
		end
	end
	return results
end
local function parentFor(command, selection, starterGui)
	if command.class == "ScreenGui" then
		assert(typeof(starterGui) == "Instance" and starterGui:IsA("StarterGui"), "StarterGui is unavailable.")
		return starterGui
	end
	assert(#selection == 1, "Select exactly one UI container in Explorer.")
	local parent = selection[1]
	assert(typeof(parent) == "Instance" and parent:IsDescendantOf(game), "Select attached UI in Explorer.")
	if modifiers[command.class] then
		assert(parent:IsA("GuiObject"), "Select a Frame, text or image instance for this modifier.")
		if command.class == "UITextSizeConstraint" then
			assert(
				parent:IsA("TextLabel") or parent:IsA("TextButton") or parent:IsA("TextBox"),
				"Select text for a text-size constraint."
			)
		end
		if command.class == "UIListLayout" or command.class == "UIGridLayout" then
			assert(
				not parent:FindFirstChildWhichIsA("UIGridStyleLayout"),
				"This container already has a layout. Edit it in Properties."
			)
		else
			assert(
				not parent:FindFirstChildWhichIsA(command.class),
				"This element already has " .. command.class .. ". Edit it in Properties."
			)
		end
	else
		assert(
			parent:IsA("GuiObject") or parent:IsA("LayerCollector"),
			"Select a ScreenGui, SurfaceGui, BillboardGui or UI container."
		)
	end
	return parent
end
function Commands.preview(id, selection, starterGui)
	local command = byId[id]
	if not command then
		return { error = "Choose a listed command." }
	end
	local ok, result = pcall(function()
		if command.kind == "create" then
			local parent = parentFor(command, selection, starterGui)
			return { command = command, parent = parent, label = command.label .. " → " .. parent:GetFullName() }
		end
		assert(#selection > 0 and #selection <= 200, "Select from 1 to 200 UI instances in Explorer.")
		for _, instance in ipairs(selection) do
			assert(
				typeof(instance) == "Instance" and instance:IsA("GuiObject") and instance:IsDescendantOf(game),
				"Select attached UI objects for this utility."
			)
		end
		return { command = command, label = command.label .. " → " .. #selection .. " selected UI elements" }
	end)
	return ok and result or { command = command, error = tostring(result) }
end
local function defaults(instance)
	if instance:IsA("GuiObject") then
		instance.Size = UDim2.fromScale(0.25, 0.12)
		instance.Position = UDim2.fromScale(0.1, 0.1)
	elseif instance:IsA("ScreenGui") then
		instance.ResetOnSpawn = false
	end
	if instance:IsA("ScrollingFrame") then
		instance.AutomaticCanvasSize = Enum.AutomaticSize.Y
		instance.CanvasSize = UDim2.fromScale(0, 0)
	elseif instance:IsA("UIGridLayout") then
		instance.CellSize = UDim2.fromScale(0.25, 0.25)
		instance.CellPadding = UDim2.fromScale(0.02, 0.02)
	elseif instance:IsA("UITextSizeConstraint") then
		instance.MinTextSize = 12
		instance.MaxTextSize = 32
	end
end
function Commands.run(id, deps, expected)
	assert(not deps.running(), "Stop the play test before editing UI.")
	assert(not deps.busy(), "Wait for the current Framebridge operation.")
	local selection = deps.selection:Get()
	local preview = Commands.preview(id, selection, deps.starterGui)
	assert(not preview.error, preview.error)
	if expected then
		assert(
			preview.parent == expected.parent and #selection == #expected.selection,
			"Selection changed. Review the new target and try again."
		)
		for index, instance in ipairs(selection) do
			assert(instance == expected.selection[index], "Selection changed. Review the new target and try again.")
		end
	end
	local command = preview.command
	if command.kind == "tool" then
		return deps.tools.run(selection, command.operation, command.options, deps.history)
	end
	local instance = Instance.new(command.class)
	local ok, why = pcall(defaults, instance)
	if not ok then
		instance:Destroy()
		error(why, 0)
	end
	local name, suffix = command.class, 2
	while preview.parent:FindFirstChild(name) do
		name = command.class .. suffix
		suffix += 1
	end
	instance.Name = name
	local recording
	ok, recording = pcall(function()
		return deps.history:TryBeginRecording("FramebridgeCreateUI", command.label)
	end)
	if not ok or not recording then
		instance:Destroy()
		error(ok and "Another Studio operation is recording. Try again." or tostring(recording), 0)
	end
	ok, why = pcall(function()
		instance.Parent = preview.parent
		deps.selection:Set({ instance })
		deps.history:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end)
	if not ok then
		instance:Destroy()
		pcall(function()
			deps.selection:Set(selection)
		end)
		pcall(function()
			deps.history:FinishRecording(recording, Enum.FinishRecordingOperation.Cancel)
		end)
		error(why, 0)
	end
	return {
		count = 1,
		instance = instance,
		skipped = {},
		message = command.label .. " in " .. preview.parent:GetFullName(),
	}
end
return Commands
