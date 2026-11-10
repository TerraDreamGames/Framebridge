-- Shared declarative Studio controls, using the upstream React Roblox renderer.
local React = require(script.Parent.ReactLua.React)
local Clipboard = require(script.Parent.Clipboard)
local copyShortcut = Clipboard.shortcut()
local e = React.createElement
local Components = {}
local fallback = {
	bg = Color3.fromRGB(20, 20, 23),
	canvas = Color3.fromRGB(24, 24, 28),
	panel = Color3.fromRGB(29, 29, 34),
	raised = Color3.fromRGB(39, 39, 46),
	line = Color3.fromRGB(55, 55, 65),
	text = Color3.fromRGB(240, 240, 245),
	muted = Color3.fromRGB(156, 156, 171),
	blue = Color3.fromRGB(45, 99, 220),
	accent = Color3.fromRGB(145, 187, 255),
	selected = Color3.fromRGB(39, 57, 86),
	linked = Color3.fromRGB(161, 219, 171),
	warning = Color3.fromRGB(246, 192, 127),
}
local studio
pcall(function()
	studio = settings():GetService("Studio")
end)
local function palette(theme)
	local colors = table.clone(fallback)
	theme = theme or studio and studio.Theme
	if not theme then
		return colors
	end
	local roles = {
		bg = "MainBackground",
		canvas = "MainBackground",
		panel = "RibbonTab",
		raised = "Button",
		line = "Border",
		text = "MainText",
		muted = "DimmedText",
		blue = "DialogMainButton",
		accent = "LinkText",
		selected = "TableItem",
		selectedText = "MainText",
		hover = "Button",
		pressed = "Button",
		primaryHover = "DialogMainButton",
		primaryPressed = "DialogMainButton",
		input = "InputFieldBackground",
		inputBorder = "InputFieldBorder",
		buttonText = "ButtonText",
		primaryText = "DialogMainButtonText",
		warning = "WarningText",
	}
	local modifiers = {
		selected = "Selected",
		selectedText = "Selected",
		hover = "Hover",
		pressed = "Pressed",
		primaryHover = "Hover",
		primaryPressed = "Pressed",
	}
	for key, role in pairs(roles) do
		local ok, color = pcall(function()
			return theme:GetColor(
				Enum.StudioStyleGuideColor[role],
				Enum.StudioStyleGuideModifier[modifiers[key] or "Default"]
			)
		end)
		if ok then
			colors[key] = color
		end
	end
	colors.linked = theme.Name == "Light" and Color3.fromRGB(24, 116, 63) or Color3.fromRGB(129, 203, 153)
	return colors
end
fallback.input, fallback.inputBorder = fallback.bg, fallback.line
fallback.buttonText, fallback.primaryText = fallback.text, Color3.new(1, 1, 1)
fallback.selectedText, fallback.hover, fallback.pressed = fallback.text, fallback.raised, fallback.panel
fallback.primaryHover, fallback.primaryPressed = fallback.blue, fallback.blue
Components.colors = palette()
local ThemeContext = React.createContext and React.createContext(Components.colors)
function Components.useTheme()
	return ThemeContext and React.useContext(ThemeContext) or Components.colors
end
function Components.ThemeProvider(props)
	-- A fixed theme supports isolated component previews without changing Studio settings.
	local colors, setColors = React.useState(function()
		return palette(props.Theme)
	end)
	React.useEffect(function()
		if not studio then
			return
		end
		local changed = studio.ThemeChanged:Connect(function()
			setColors(palette(props.Theme))
		end)
		setColors(palette(props.Theme))
		return function()
			changed:Disconnect()
		end
	end, { props.Theme })
	return e(ThemeContext.Provider, { value = colors }, props.children)
end
local font = Font.fromEnum(Enum.Font.BuilderSans)
local bold = Font.fromEnum(Enum.Font.BuilderSansBold)
local function round(radius)
	return e("UICorner", { CornerRadius = UDim.new(0, radius or 6) })
end
-- Original Framebridge disclosure glyphs. Match assets/glyphs/interface.ts;
-- four native strips form the small filled triangle without texture or clipping dependencies.
function Components.Glyph(props)
	local C = Components.useTheme()
	local right, up = props.Glyph == "ChevronRight", props.Glyph == "ChevronUp"
	local bands = {}
	for index = 0, 3 do
		-- Sample each 1 px band at its center on the SVG's 16 px grid.
		local span = up and (1 + index * 2) or (7 - index * 2)
		bands["Band" .. (index + 1)] = e("Frame", {
			Position = right and UDim2.fromScale((6 + index) / 16, (16 - span) / 32)
				or UDim2.fromScale((16 - span) / 32, (6 + index) / 16),
			Size = right and UDim2.fromScale(1 / 16, span / 16) or UDim2.fromScale(span / 16, 1 / 16),
			BackgroundColor3 = props.Color or C.muted,
			BorderSizePixel = 0,
			Active = false,
			Selectable = false,
		}, { Corner = round(0.35) })
	end
	return e("Frame", {
		Name = props.Name or props.Glyph or "Glyph",
		Position = props.Position,
		Size = props.Size or UDim2.fromOffset(16, 16),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		Active = false,
		Selectable = false,
	}, bands)
end
function Components.Label(props)
	local C = Components.useTheme()
	return e("TextLabel", {
		Name = props.Name or "Label",
		Text = props.Text or "",
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size or UDim2.new(1, 0, 0, props.Height or 20),
		AutomaticSize = props.Wrap and not props.FixedHeight and Enum.AutomaticSize.Y or Enum.AutomaticSize.None,
		BackgroundTransparency = 1,
		TextColor3 = props.Color or C.text,
		TextSize = props.TextSize or 13,
		FontFace = props.Bold and bold or font,
		TextXAlignment = props.Align or Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Center,
		TextWrapped = props.Wrap or false,
		TextTruncate = props.Wrap and not props.FixedHeight and Enum.TextTruncate.None or Enum.TextTruncate.AtEnd,
	})
end
function Components.Note(props)
	local C = Components.useTheme()
	return e(
		Components.Label,
		{ Text = props.Text, Color = props.Color or C.muted, Wrap = true, Height = 0, LayoutOrder = props.LayoutOrder }
	)
end
function Components.Button(props)
	local C = Components.useTheme()
	local hovered, setHovered = React.useState(false)
	local focused, setFocused = React.useState(false)
	local pressed, setPressed = React.useState(false)
	return e("TextButton", {
		Name = props.Name or props.Text or "Button",
		Text = props.Text or "",
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size or UDim2.new(1, 0, 0, 32),
		Visible = props.Visible ~= false,
		BackgroundColor3 = props.Primary
				and not props.Disabled
				and (pressed and C.primaryPressed or hovered and C.primaryHover or C.blue)
			or props.Selected and C.selected
			or pressed and C.pressed
			or hovered and C.hover
			or C.raised,
		BackgroundTransparency = (props.Transparent or props.Quiet and not props.Selected and not hovered) and 1
			or props.Disabled and 0.45
			or (hovered or pressed) and 0
			or 0.16,
		BorderSizePixel = 0,
		TextColor3 = props.Disabled and C.muted
			or props.Color
			or (props.Primary and C.primaryText or props.Selected and C.selectedText or C.buttonText),
		TextSize = props.TextSize or 13,
		TextXAlignment = props.Align or Enum.TextXAlignment.Center,
		TextWrapped = props.Wrap == true,
		TextTruncate = props.Wrap and Enum.TextTruncate.None or Enum.TextTruncate.AtEnd,
		FontFace = props.Regular and font or bold,
		Selectable = not props.Disabled,
		Active = not props.Disabled,
		[React.Event.InputBegan] = function(item, input)
			if not props.Disabled and input.UserInputType == Enum.UserInputType.MouseButton1 then
				setPressed(true)
			end
			if props.OnInput then
				props.OnInput(item, input)
			end
		end,
		[React.Event.InputEnded] = function(_, input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 then
				setPressed(false)
			end
		end,
		[React.Event.MouseEnter] = function()
			setHovered(true)
		end,
		[React.Event.MouseLeave] = function()
			setHovered(false)
			setPressed(false)
		end,
		[React.Event.SelectionGained] = function()
			setFocused(true)
		end,
		[React.Event.SelectionLost] = function()
			setFocused(false)
		end,
		AutoButtonColor = false,
		[React.Event.Activated] = function()
			if not props.Disabled and props.OnClick then
				props.OnClick()
			end
		end,
	}, {
		Corner = round(props.Radius or 4),
		Padding = e("UIPadding", {
			PaddingLeft = UDim.new(0, (props.Padding or 8) + (props.Icon and 20 or 0)),
			PaddingRight = UDim.new(0, props.Padding or 8),
		}),
		-- Place the icon in the space reserved by the text's left padding.
		Icon = props.Icon and e(Components.Glyph, {
			Name = "Icon",
			Position = UDim2.new(0, -20, 0.5, -6),
			Size = UDim2.fromOffset(12, 12),
			Glyph = props.Icon,
			Color = props.IconColor or C.muted,
		}) or nil,
		Focus = e("UIStroke", {
			Color = focused and C.accent or C.line,
			Thickness = 1,
			Transparency = focused and 0 or (props.Primary or props.Quiet or props.Borderless) and 1 or 0,
			ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		}),
	})
end
function Components.Input(props)
	local C = Components.useTheme()
	local draft, setDraft = React.useState(tostring(props.Value or ""))
	local focused, setFocused = React.useState(false)
	local secret = props.Secret == true
	React.useEffect(function()
		setDraft(tostring(props.Value or ""))
	end, { props.Value })
	local inputProps = {
		ref = props.InputRef,
		Name = props.Name or "Input",
		Text = draft,
		PlaceholderText = props.Placeholder or "",
		PlaceholderColor3 = C.muted,
		LayoutOrder = props.LayoutOrder,
		Size = props.Size or UDim2.new(1, 0, 0, props.Multiline and 116 or 30),
		Position = props.Position,
		BackgroundColor3 = C.input,
		BorderSizePixel = 0,
		TextColor3 = props.Disabled and C.muted or C.text,
		-- Studio has no password TextBox. Keep native Text/editing untouched,
		-- hide its glyphs and derive the display only from the live draft.
		TextTransparency = secret and 1 or nil,
		TextStrokeTransparency = secret and 1 or nil,
		ClipsDescendants = secret or props.ClipText or nil,
		TextSize = props.TextSize or 13,
		FontFace = font,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = props.Multiline and Enum.TextYAlignment.Top or Enum.TextYAlignment.Center,
		ClearTextOnFocus = false,
		TextEditable = not props.ReadOnly and not props.Disabled,
		MultiLine = props.Multiline or false,
		TextWrapped = props.Multiline or false,
		TextTruncate = props.ClipText and (focused and Enum.TextTruncate.None or Enum.TextTruncate.AtEnd) or nil,
		[React.Change.Text] = function(item)
			setDraft(item.Text)
			if props.OnChange then
				props.OnChange(item.Text)
			end
		end,
		[React.Event.Focused] = function(item)
			setFocused(true)
			if props.ReadOnly then
				item.CursorPosition = 1
				item.SelectionStart = #item.Text + 1
			end
			if props.OnFocused then props.OnFocused(item) end
		end,
		[React.Event.FocusLost] = function(item)
			setFocused(false)
			if props.OnFocusLost then props.OnFocusLost(item) end
			if props.OnCommit and item.Text ~= tostring(props.Value or "") and props.OnCommit(item.Text) == false then
				setDraft(tostring(props.Value or ""))
			end
		end,
	}
	if props.OnPointerBegan then inputProps[React.Event.InputBegan] = props.OnPointerBegan end
	if props.OnPointerEnded then inputProps[React.Event.InputEnded] = props.OnPointerEnded end
	return e("TextBox", inputProps, {
		Corner = round(4),
		Stroke = e("UIStroke", {
			Color = focused and C.accent or C.inputBorder,
			Thickness = 1,
			ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		}),
		Padding = e("UIPadding", {
			PaddingLeft = UDim.new(0, 8),
			PaddingRight = UDim.new(0, 8),
			PaddingTop = UDim.new(0, 5),
			PaddingBottom = UDim.new(0, 5),
		}),
		SecretMask = secret and e("TextLabel", {
			Name = "SecretMask",
			Text = draft == "" and (props.Placeholder or "") or string.rep("•", utf8.len(draft) or #draft),
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			TextColor3 = (draft == "" or props.Disabled) and C.muted or C.text,
			TextSize = props.TextSize or 13,
			FontFace = font,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextYAlignment = props.Multiline and Enum.TextYAlignment.Top or Enum.TextYAlignment.Center,
			TextWrapped = props.Multiline or false,
			TextTruncate = Enum.TextTruncate.AtEnd,
			Active = false,
			Selectable = false,
			ZIndex = 2,
		}) or nil,
	})
end
function Components.CopyInput(props)
	local C = Components.useTheme()
	local inputRef, pressed, revision = React.useRef(nil), React.useRef(nil), React.useRef(0)
	local feedback, setFeedback = React.useState("")
	React.useEffect(function()
		revision.current += 1
		pressed.current = nil
		setFeedback("")
	end, {tostring(props.Value or ""), props.Disabled == true})
	React.useEffect(function()
		return function() revision.current += 1 end
	end, {})
	local function cancel()
		revision.current += 1
		pressed.current = nil
	end
	local function requestCopy(item)
		if props.Disabled or not item then return end
		revision.current += 1
		local expectedRevision, expectedText = revision.current, tostring(props.Value or "")
		-- Native pointer handling may move the caret after Focused. Copy only
		-- after that gesture, and cancel if focus, value or the widget changed.
		task.defer(function()
			if revision.current ~= expectedRevision or inputRef.current ~= item or not item.Parent
				or item.Text ~= expectedText or not item:IsFocused() then return end
			local copied = Clipboard.copy(item)
			if revision.current == expectedRevision then
				setFeedback(copied and "Copied to clipboard." or (copyShortcut
					and "Selected. Press " .. copyShortcut .. " to copy." or "Selected. Use your keyboard’s copy shortcut."))
			end
		end)
	end
	local function pointer(input)
		return input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	end
	return e(Components.Stack, {Name=(props.Name or "CopyInput") .. "Field", LayoutOrder=props.LayoutOrder, Gap=4, Items={
		e("Frame", {Name="CopyRow", Size=UDim2.new(1,0,0,30), BackgroundTransparency=1}, {
			Input=e(Components.Input, {Name=props.Name, InputRef=inputRef, Value=props.Value, ReadOnly=true, ClipText=true,
				Disabled=props.Disabled, TextSize=props.TextSize, Size=UDim2.new(1,-76,1,0),
				OnFocused=function() setFeedback("") end, OnFocusLost=cancel,
				OnPointerBegan=function(_,input) if pointer(input) and not props.Disabled then pressed.current=input end end,
				OnPointerEnded=function(item,input)
					if pressed.current ~= input then return end
					pressed.current=nil
					requestCopy(item)
				end,
			}),
			Copy=e(Components.Button, {Name=(props.Name or "CopyInput") .. "Copy", Text="Copy", Disabled=props.Disabled or tostring(props.Value or "")=="",
				Position=UDim2.new(1,-68,0,0), Size=UDim2.fromOffset(68,30), OnClick=function()
					local item=inputRef.current
					if props.Disabled or not item or not item.Parent then return end
					item:CaptureFocus()
					requestCopy(item)
				end}),
		}),
		e(Components.Note, {Name="CopyFeedback", Text=feedback~="" and feedback or (copyShortcut
			and "Click to copy · " .. copyShortcut .. " also works." or "Click the field or Copy to copy."), Color=feedback=="Copied to clipboard." and C.linked or C.muted}),
	}})
end
function Components.Stack(props)
	local C = Components.useTheme()
	local children = {
		Layout = e("UIListLayout", { Padding = UDim.new(0, props.Gap or 8), SortOrder = Enum.SortOrder.LayoutOrder }),
	}
	if props.Padding then
		children.Padding = e("UIPadding", {
			PaddingLeft = UDim.new(0, props.Padding),
			PaddingRight = UDim.new(0, props.Padding),
			PaddingTop = UDim.new(0, props.Padding),
			PaddingBottom = UDim.new(0, props.Padding),
		})
	end
	if props.Surface then
		children.Corner = round(4)
		children.Border =
			e("UIStroke", { Color = C.line, Thickness = 1, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
	end
	for index, child in ipairs(props.Items or {}) do
		children["Item" .. index] = React.cloneElement(child, { LayoutOrder = index })
	end
	return e("Frame", {
		Name = props.Name or "Content",
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size or UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = C.panel,
		BackgroundTransparency = props.Surface and 0 or 1,
		BorderSizePixel = 0,
	}, children)
end
function Components.Section(props)
	local items = { e(Components.Label, { Text = props.Title, TextSize = 13, Bold = true }) }
	for _, item in ipairs(props.Items or {}) do
		table.insert(items, item)
	end
	return e(
		Components.Stack,
		{ Name = props.Title, Items = items, Gap = 8, Padding = 12, Surface = true, LayoutOrder = props.LayoutOrder }
	)
end
function Components.Choices(props)
	local children = {}
	local count = #props.Options
	for index, option in ipairs(props.Options) do
		children[option.Value] = e(Components.Button, {
			Text = option.Label,
			Name = option.Value,
			Selected = props.Value == option.Value,
			Disabled = props.Disabled,
			Size = UDim2.new(1 / count, -(count - 1) * 4 / count, 1, 0),
			Position = UDim2.new((index - 1) / count, (index - 1) * 4 / count, 0, 0),
			Regular = true,
			Padding = 4,
			OnClick = function()
				props.OnChange(option.Value)
			end,
		})
	end
	return e("Frame", {
		Name = props.Name or "Choices",
		LayoutOrder = props.LayoutOrder,
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundTransparency = 1,
	}, children)
end
function Components.Tabs(props)
	local C = Components.useTheme()
	local children = {}
	local count = #props.Options
	for index, option in ipairs(props.Options) do
		local selected = props.Value == option.Value
		children[option.Value] = e("Frame", {
			Size = UDim2.new(1 / count, 0, 1, 0),
			Position = UDim2.new((index - 1) / count, 0, 0, 0),
			BackgroundTransparency = 1,
		}, {
			Button = e(Components.Button, {
				Text = option.Label,
				Name = "Tab",
				Quiet = true,
				Borderless = true,
				Radius = 0,
				Size = UDim2.fromScale(1, 1),
				Color = selected and C.text or C.muted,
				Regular = not selected,
				OnClick = function()
					props.OnChange(option.Value)
				end,
			}),
			Indicator = e(
				"Frame",
				{
					Position = UDim2.new(0, 0, 1, -2),
					Size = UDim2.new(1, 0, 0, 2),
					BackgroundColor3 = selected and C.accent or C.line,
					BorderSizePixel = 0,
				}
			),
		})
	end
	return e(
		"Frame",
		{
			Name = props.Name or "Tabs",
			LayoutOrder = props.LayoutOrder,
			Position = props.Position,
			Size = props.Size or UDim2.new(1, 0, 0, 36),
			BackgroundColor3 = C.panel,
			BorderSizePixel = 0,
		},
		children
	)
end
-- The menu stays in the scroll layout, so it remains usable in narrow docked panels.
function Components.Select(props)
	local C = Components.useTheme()
	local open, setOpen = React.useState(props.DefaultOpen == true)
	local label = props.Placeholder or "Choose an option"
	for _, option in ipairs(props.Options) do
		if option.Value == props.Value then
			label = option.Label
		end
	end
	local items = {
		e("Frame", { Name = "Trigger", Size = UDim2.new(1, 0, 0, 32), BackgroundTransparency = 1 }, {
			Button = e(Components.Button, {
				Name = "Select",
				Text = label,
				Align = Enum.TextXAlignment.Left,
				Regular = true,
				Selected = open,
				Disabled = props.Disabled,
				Size = UDim2.fromScale(1, 1),
				Padding = 10,
				OnClick = function()
					setOpen(not open)
				end,
				OnInput = function(_, input)
					if input.KeyCode == Enum.KeyCode.Escape then
						setOpen(false)
					end
				end,
			}),
			Caret = e(
				Components.Glyph,
				{
					Name = "Caret",
					Position = UDim2.new(1, -22, 0, 10),
					Size = UDim2.fromOffset(12, 12),
					Glyph = open and "ChevronUp" or "ChevronDown",
					Color = C.text,
				}
			),
		}),
	}
	if open and not props.Disabled then
		local options = {}
		for _, option in ipairs(props.Options) do
			table.insert(
				options,
				e(Components.Button, {
					Name = option.Value,
					Text = option.Label,
					Align = Enum.TextXAlignment.Left,
					Quiet = true,
					Regular = true,
					Selected = props.Value == option.Value,
					Size = UDim2.new(1, 0, 0, 28),
					OnClick = function()
						setOpen(false)
						props.OnChange(option.Value)
					end,
				})
			)
		end
		table.insert(
			items,
			e(Components.Stack, { Name = "Options", Items = options, Gap = 2, Padding = 4, Surface = true })
		)
	end
	return e(
		Components.Stack,
		{ Name = props.Name or "Select", LayoutOrder = props.LayoutOrder, Items = items, Gap = 4 }
	)
end
function Components.Toggle(props)
	local C = Components.useTheme()
	return e("Frame", {
		Name = props.Name or props.Text,
		LayoutOrder = props.LayoutOrder,
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundTransparency = 1,
	}, {
		Label = e(
			Components.Label,
			{ Text = props.Text, Size = UDim2.new(1, -64, 1, 0), Color = props.Disabled and C.muted or C.text }
		),
		Control = e(Components.Button, {
			Name = "Toggle",
			Text = props.Value and "On" or "Off",
			Selected = props.Value,
			Disabled = props.Disabled,
			Position = UDim2.new(1, -56, 0, 2),
			Size = UDim2.fromOffset(56, 26),
			Radius = 13,
			Regular = true,
			OnClick = function()
				props.OnChange(not props.Value)
			end,
		}),
	})
end
function Components.Accordion(props)
	local open, setOpen = React.useState(props.DefaultOpen == true)
	return e(Components.Stack, {
		Name = props.Title,
		LayoutOrder = props.LayoutOrder,
		Gap = 8,
		Padding = 12,
		Surface = true,
		Items = {
			e(Components.Button, {
				Name = "Disclosure",
				Text = props.Title,
				Align = Enum.TextXAlignment.Left,
				Quiet = true,
				Size = UDim2.new(1, 0, 0, 24),
				Icon = open and "ChevronDown" or "ChevronRight",
				OnClick = function()
					setOpen(not open)
				end,
			}),
			open and e(Components.Stack, { Name = "Fields", Items = props.Items, Gap = 8 }) or nil,
		},
	})
end
function Components.Vector(props)
	local C = Components.useTheme()
	local count = #props.Values
	local children = { Title = e(Components.Label, { Text = props.Title, TextSize = 11, Color = C.muted }) }
	for index, value in ipairs(props.Values) do
		children["Field" .. index] = e(Components.Input, {
			Name = props.Title .. " " .. props.Labels[index],
			Value = string.format("%.5g", value),
			Disabled = props.Disabled,
			Position = UDim2.new((index - 1) / count, 0, 0, 32),
			Size = UDim2.new(1 / count, -4, 0, 30),
			OnCommit = function(raw)
				local number = tonumber(raw)
				if not number or number ~= number or math.abs(number) >= 1000000000 then
					return false
				end
				local values = table.clone(props.Values)
				values[index] = number
				return props.OnChange(values)
			end,
		})
		children["Caption" .. index] = e(Components.Label, {
			Text = props.Labels[index],
			TextSize = 10,
			Color = C.muted,
			Position = UDim2.new((index - 1) / count, 0, 0, 16),
			Size = UDim2.new(1 / count, -4, 0, 14),
		})
	end
	return e("Frame", {
		Name = props.Title,
		LayoutOrder = props.LayoutOrder,
		Size = UDim2.new(1, 0, 0, 62),
		BackgroundTransparency = 1,
	}, children)
end
return Components
