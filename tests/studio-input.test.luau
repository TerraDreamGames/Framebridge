-- Execute the real shared Input and access callback without Studio or UI.
-- Native pointer, caret, selection painting and clipboard checks remain separate.
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local passed = 0
local function check(name, fn)
	local ok, why = pcall(fn)
	assert(ok, name .. ": " .. tostring(why))
	passed += 1
end
local current
local React = {
	Change = { Text = {} },
	Event = { Focused = {}, FocusLost = {} },
}
function React.useState(initial)
	current.index += 1
	local slot, host = current.index, current
	if host.state[slot] == nil then host.state[slot] = initial end
	return host.state[slot], function(value)
		if host.state[slot] ~= value then host.dirty = true end
		host.state[slot] = value
	end
end
function React.useEffect(fn, dependencies)
	local host = current
	if not host.effectSet or host.value ~= dependencies[1] then
		host.effectSet, host.value = true, dependencies[1]
		table.insert(host.effects, fn)
	end
end
function React.createElement(class, props, children)
	return { class = class, props = props, children = children or {} }
end
local reactNode, clipboardNode = {}, {}
local clipboard = assert(loadstring(fs.readFile("plugins/studio/src/Clipboard.luau")))()
local module = assert(loadstring(fs.readFile("plugins/studio/src/Components.luau")))
setfenv(module, setmetatable({
	script = { Parent = { ReactLua = { React = reactNode }, Clipboard = clipboardNode } },
	require = function(node) if node == clipboardNode then return clipboard end; assert(node == reactNode); return React end,
	Color3 = roblox.Color3,
	UDim = roblox.UDim,
	UDim2 = roblox.UDim2,
	Vector2 = roblox.Vector2,
	Enum = roblox.Enum,
	Font = { fromEnum = function(value) return value end },
}, { __index = getfenv() }))
local UI = module()
check("filled disclosure glyphs preserve direction, theme color and inert presentation", function()
	local color = roblox.Color3.fromRGB(20, 30, 40)
	for _, name in ipairs({ "ChevronDown", "ChevronUp", "ChevronRight" }) do
		local glyph = UI.Glyph({ Glyph = name, Color = color, Size = roblox.UDim2.fromOffset(12, 12) })
		assert(glyph.class == "Frame" and glyph.props.BackgroundTransparency == 1)
		assert(glyph.props.Size == roblox.UDim2.fromOffset(12, 12))
		assert(not glyph.props.Active and not glyph.props.Selectable)
		for _, band in pairs(glyph.children) do
			assert(band.class == "Frame" and band.props.BackgroundColor3 == color)
			assert(not band.props.Active and not band.props.Selectable)
			assert(band.props.BorderSizePixel == 0 and band.props.Image == nil)
			assert(band.props.Rotation == nil and band.props.ClipsDescendants == nil)
		end
		local first, last = glyph.children.Band1.props.Size, glyph.children.Band4.props.Size
		if name == "ChevronDown" then assert(first.X.Scale > last.X.Scale)
		elseif name == "ChevronUp" then assert(first.X.Scale < last.X.Scale)
		else assert(first.Y.Scale > last.Y.Scale) end
	end
end)
local function host(props)
	local h = { state = {}, props = props, effects = {} }
	function h.render()
		local element
		for _ = 1, 5 do
			current = h
			h.index, h.dirty, h.effects = 0, false, {}
			element = UI.Input(h.props)
			for _, effect in ipairs(h.effects) do effect() end
			if not h.dirty then return element end
		end
		error("Input did not settle")
	end
	return h
end
local function bullets(value)
	return string.rep("•", utf8.len(value) or #value)
end
check("mask preserves native text, bounds and inert presentation", function()
	local value = "synthetic-private-value"
	local element = host({ Value = value, Secret = true, Placeholder = "Access code" }).render()
	local p, mask = element.props, element.children.SecretMask
	assert(element.class == "TextBox" and p.Text == value and p.TextEditable)
	assert(p.ClearTextOnFocus == false and p.TextTransparency == 1 and p.TextStrokeTransparency == 1)
	assert(p.ClipsDescendants and mask.class == "TextLabel" and mask.props.Text == bullets(value))
	assert(mask.props.Size == roblox.UDim2.fromScale(1, 1) and not mask.props.TextWrapped)
	assert(mask.props.TextTruncate == roblox.Enum.TextTruncate.AtEnd)
	assert(not mask.props.Active and not mask.props.Selectable and mask.props.BackgroundTransparency == 1)
	assert(not p.Tooltip and not mask.props.Tooltip)
end)
check("input focus stroke borders the control instead of outlining raw text", function()
	for _, secret in ipairs({ false, true }) do
		local h = host({ Value = "synthetic", Secret = secret })
		local element = h.render()
		assert(element.children.Stroke.props.ApplyStrokeMode == roblox.Enum.ApplyStrokeMode.Border)
		assert(element.children.Stroke.props.Color == UI.colors.line)
		element.props[React.Event.Focused]({ Text = "synthetic" })
		element = h.render()
		assert(element.children.Stroke.props.ApplyStrokeMode == roblox.Enum.ApplyStrokeMode.Border)
		assert(element.children.Stroke.props.Color == UI.colors.accent)
	end
end)
check("native typing updates bullets and calls change with the raw value", function()
	local changes = {}
	local h = host({ Value = "", Secret = true, OnChange = function(value) table.insert(changes, value) end })
	local element = h.render()
	local item = { Text = "synthetic-typed", CursorPosition = 7, SelectionStart = 3 }
	element.props[React.Change.Text](item)
	local updated = h.render()
	assert(updated.props.Text == item.Text and updated.children.SecretMask.props.Text == bullets(item.Text))
	assert(#changes == 1 and changes[1] == item.Text)
	assert(item.CursorPosition == 7 and item.SelectionStart == 3)
end)
check("paste and clear retain focus-commit values and empty placeholder", function()
	local committed
	local h = host({ Value = "", Secret = true, Placeholder = "Private beta access code", OnCommit = function(value) committed = value end })
	local element = h.render()
	local item = { Text = string.rep("a", 64), CursorPosition = 65, SelectionStart = -1 }
	element.props[React.Change.Text](item)
	element = h.render()
	assert(element.children.SecretMask.props.Text == bullets(item.Text))
	element.props[React.Event.FocusLost](item)
	assert(committed == item.Text and item.CursorPosition == 65 and item.SelectionStart == -1)
	h.props.Value = committed
	element = h.render()
	item.Text = ""
	element.props[React.Change.Text](item)
	element = h.render()
	assert(element.props.Text == "" and element.children.SecretMask.props.Text == h.props.Placeholder)
	assert(element.children.SecretMask.props.TextColor3 == UI.colors.muted)
	element.props[React.Event.FocusLost](item)
	assert(committed == "")
end)
check("rejected commit restores the existing value and its mask", function()
	local h = host({ Value = "saved-synthetic", Secret = true, OnCommit = function() return false end })
	local element = h.render()
	local item = { Text = "rejected-synthetic" }
	element.props[React.Change.Text](item)
	element = h.render()
	element.props[React.Event.FocusLost](item)
	element = h.render()
	assert(element.props.Text == h.props.Value and element.children.SecretMask.props.Text == bullets(h.props.Value))
end)
check("parent value changes update both native value and mask", function()
	local h = host({ Value = "first", Secret = true })
	h.render()
	h.props.Value = "replacement"
	local element = h.render()
	assert(element.props.Text == "replacement" and element.children.SecretMask.props.Text == bullets("replacement"))
end)
check("disabled and readonly inputs retain existing edit rules", function()
	local disabled = host({ Value = "synthetic", Secret = true, Disabled = true }).render()
	assert(not disabled.props.TextEditable and disabled.children.SecretMask.props.TextColor3 == UI.colors.muted)
	local readonly = host({ Value = "synthetic", Secret = true, ReadOnly = true }).render()
	local item = { Text = "synthetic", CursorPosition = -1, SelectionStart = -1 }
	readonly.props[React.Event.Focused](item)
	assert(not readonly.props.TextEditable and item.CursorPosition == 1 and item.SelectionStart == #item.Text + 1)
end)
check("ordinary inputs keep visible text and existing events", function()
	local committed
	local element = host({ Value = "ordinary", Placeholder = "Ordinary placeholder", OnCommit = function(value) committed = value end }).render()
	assert(element.props.Text == "ordinary" and element.props.PlaceholderText == "Ordinary placeholder")
	assert(element.props.TextTransparency == nil and element.props.TextStrokeTransparency == nil)
	assert(element.props.ClipsDescendants == nil and not element.children.SecretMask)
	element.props[React.Event.FocusLost]({ Text = "ordinary edit" })
	assert(committed == "ordinary edit")
end)
check("long copyable links stay inside their field without losing the full value", function()
	local value = "https://framebridge.terradream.games/#docs/studio-import"
	local h = host({ Value = value, ReadOnly = true, ClipText = true })
	local element = h.render()
	assert(element.props.Text == value and element.props.ClipsDescendants)
	assert(element.props.TextTruncate == roblox.Enum.TextTruncate.AtEnd)
	local item = { Text = value, CursorPosition = -1, SelectionStart = -1 }
	element.props[React.Event.Focused](item)
	element = h.render()
	assert(element.props.Text == value and element.props.TextTruncate == roblox.Enum.TextTruncate.None)
	assert(item.CursorPosition == 1 and item.SelectionStart == #value + 1)
	element.props[React.Event.FocusLost](item)
	assert(h.render().props.TextTruncate == roblox.Enum.TextTruncate.AtEnd)
end)
check("Unicode and malformed bytes never appear in display text", function()
	for _, value in ipairs({ "é🙂", string.char(255) }) do
		local element = host({ Value = value, Secret = true }).render()
		assert(element.props.Text == value and element.children.SecretMask.props.Text == bullets(value))
	end
end)
-- Execute the actual plugin callback rather than copying its behavior here.
-- The real View snapshots its state; a commit must update both Input props.
local betaAccessSource = assert(fs.readFile("plugins/studio/src/Plugin.server.luau")
	:match("(function actions%.betaAccess%(value%)\n.-\nend)\nfunction actions%.import"), "Missing real beta access callback")
local betaAccessFactory = assert(loadstring("return function(state, view)\nlocal actions = {}\n" .. betaAccessSource .. "\nreturn actions.betaAccess\nend"))()
local function sharedInputs(initial)
	local state = { betaAccess = initial, busy = false, connecting = false }
	local first = host({ Value = initial, Secret = true, Placeholder = "Access code" })
	local second = host({ Value = initial, Secret = true, Placeholder = "Access code" })
	local renders = 0
	local callback = betaAccessFactory(state, { render = function(nextState)
		local snapshot = table.clone(nextState)
		renders += 1
		first.props.Value, second.props.Value = snapshot.betaAccess, snapshot.betaAccess
	end })
	first.props.OnCommit, second.props.OnCommit = callback, callback
	local function commit(raw)
		local element = first.render()
		local item = { Text = raw }
		element.props[React.Change.Text](item)
		element = first.render()
		element.props[React.Event.FocusLost](item)
		return first.render(), second.render()
	end
	return { state = state, commit = commit, renders = function() return renders end }
end
check("real beta access callback redraws both inputs with the normalized commit", function()
	local inputs = sharedInputs("synthetic-original")
	local first, second = inputs.commit(" new\t synthetic\n value ")
	assert(inputs.renders() == 1 and inputs.state.betaAccess == "newsyntheticvalue")
	assert(first.props.Text == inputs.state.betaAccess and second.props.Text == inputs.state.betaAccess)
	assert(first.children.SecretMask.props.Text == bullets(inputs.state.betaAccess))
	assert(second.children.SecretMask.props.Text == bullets(inputs.state.betaAccess))
end)
check("real beta access clear replaces the sibling's previous value and mask", function()
	local inputs = sharedInputs("synthetic-previous")
	local first, second = inputs.commit("")
	assert(inputs.renders() == 1 and inputs.state.betaAccess == "")
	assert(first.props.Text == "" and second.props.Text == "")
	assert(first.children.SecretMask.props.Text == "Access code" and second.children.SecretMask.props.Text == "Access code")
end)
check("real beta access busy/connecting guards keep state and skip redraw", function()
	for _, flag in ipairs({ "busy", "connecting" }) do
		local state = { betaAccess = "synthetic-original", busy = false, connecting = false }
		state[flag] = true
		local renders = 0
		betaAccessFactory(state, { render = function() renders += 1 end })("replacement")
		assert(state.betaAccess == "synthetic-original" and renders == 0)
	end
end)
print("Studio shared Input presentation/value checks: " .. passed)
