-- Search a bounded command catalog; native Studio remains the editor.
local React = require(script.Parent.ReactLua.React)
local ReactRoblox = require(script.Parent.ReactLua.ReactRoblox)
local UI = require(script.Parent.Components)
local Commands = require(script.Parent.CommandTools)
local e = React.createElement
local Palette = {}
local function readable(value)
	return tostring(value):gsub("^.-:%d+: ", ""):sub(1, 1000)
end
local function App(props)
	local C = UI.useTheme()
	local state, api = props.state, props.api
	React.useEffect(function()
		if props.widget.Enabled and props.searchRef.current then
			props.searchRef.current:CaptureFocus()
		end
		local scroll = props.scrollRef.current
		if scroll then
			local function keepSelectedVisible()
				local top, bottom, y = (state.index - 1) * 36, state.index * 36, scroll.CanvasPosition.Y
				if top < y then
					scroll.CanvasPosition = Vector2.new(0, top)
				elseif bottom > y + scroll.AbsoluteSize.Y then
					scroll.CanvasPosition = Vector2.new(0, math.max(0, bottom - scroll.AbsoluteSize.Y))
				end
			end
			keepSelectedVisible()
			local resized = scroll:GetPropertyChangedSignal("AbsoluteSize"):Connect(keepSelectedVisible)
			return function()
				resized:Disconnect()
			end
		end
	end, { state.focusRevision, state.index })
	local rows = {}
	for index, command in ipairs(state.results) do
		rows[command.id] = e(UI.Button, {
			Name = command.id,
			Text = command.label,
			Regular = true,
			Align = Enum.TextXAlignment.Left,
			Selected = index == state.index,
			Position = UDim2.fromOffset(0, (index - 1) * 36),
			Size = UDim2.new(1, -8, 0, 32),
			OnClick = function()
				api.choose(index)
			end,
		})
	end
	if #state.results == 0 then
		rows.empty =
			e(UI.Label, { Text = "No commands found. Try frame, grid or scale.", Wrap = true, Color = C.muted })
	end
	return e("Frame", {
		Name = "FramebridgeCommands",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = C.bg,
		BorderSizePixel = 0,
		Active = true,
		[React.Event.InputBegan] = function(_, input)
			api.input(input)
		end,
	}, {
		Search = e("TextBox", {
			Name = "CommandSearch",
			ref = props.searchRef,
			Text = state.query,
			PlaceholderText = "Search UI commands…",
			PlaceholderColor3 = C.muted,
			ClearTextOnFocus = false,
			ShowNativeInput = false,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = C.text,
			FontFace = Font.fromEnum(Enum.Font.BuilderSans),
			TextSize = 14,
			BackgroundColor3 = C.panel,
			BorderSizePixel = 0,
			Position = UDim2.fromOffset(12, 12),
			Size = UDim2.new(1, -24, 0, 34),
			[React.Change.Text] = function(item)
				api.search(item.Text)
			end,
			[React.Event.InputBegan] = function(_, input)
				api.input(input)
			end,
			[React.Event.FocusLost] = function(_, enterPressed, input)
				if enterPressed == true and input and input.KeyCode == Enum.KeyCode.Return then
					api.execute()
				elseif input and input.KeyCode == Enum.KeyCode.Escape then
					api.close()
				end
			end,
		}, {
			Padding = e("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }),
			Corner = e("UICorner", { CornerRadius = UDim.new(0, 4) }),
		}),
		Help = e(UI.Label, {
			Text = "Search · select a command · Enter run · Esc close",
			Color = C.muted,
			Position = UDim2.fromOffset(12, 49),
			Size = UDim2.new(1, -24, 0, 20),
		}),
		Results = e("ScrollingFrame", {
			Name = "CommandResults",
			ref = props.scrollRef,
			Position = UDim2.fromOffset(12, 76),
			Size = UDim2.new(1, -24, 1, -184),
			CanvasSize = UDim2.fromOffset(0, #state.results * 36),
			ScrollBarThickness = 4,
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			ScrollingDirection = Enum.ScrollingDirection.Y,
		}, rows),
		Target = e(UI.Label, {
			Name = "CommandTarget",
			Text = state.message or state.preview.error or state.preview.label or "Choose a command.",
			Color = state.failed and C.warning or state.preview.error and C.warning or C.muted,
			Wrap = true,
			FixedHeight = true,
			Position = UDim2.new(0, 12, 1, -104),
			Size = UDim2.new(1, -24, 0, 50),
		}),
		Run = e(UI.Button, {
			Name = "RunCommand",
			Text = "Run command",
			Primary = true,
			Disabled = state.preview.error ~= nil or #state.results == 0,
			Position = UDim2.new(0, 12, 1, -44),
			Size = UDim2.new(1, -24, 0, 32),
			OnClick = api.execute,
		}),
	})
end
function Palette.mount(plugin, deps)
	local widget = plugin:CreateDockWidgetPluginGuiAsync(
		"FramebridgeCommands_v1",
		DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 460, 440, 360, 280)
	)
	widget.Title = "Framebridge · Commands"
	widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	local root = ReactRoblox.createRoot(widget)
	local searchRef, scrollRef = React.createRef(), React.createRef()
	local state = { query = "", results = Commands.query(""), index = 1, preview = {}, focusRevision = 0 }
	local api, connections, destroyed = {}, {}, false
	local function preview()
		local command = state.results[state.index]
		local selection = deps.selection:Get()
		state.expected = { selection = table.clone(selection) }
		state.preview = command and Commands.preview(command.id, selection, deps.starterGui) or {}
		state.expected.parent = state.preview.parent
		if state.preview.error then
			state.preview.error = readable(state.preview.error)
		end
		if deps.running() then
			state.preview.error = "Stop the play test before editing UI."
		elseif deps.busy() then
			state.preview.error = "Wait for the current Framebridge operation."
		end
	end
	local function render()
		if destroyed then
			return
		end
		root:render(e(UI.ThemeProvider, nil,
			e(
				App,
				{ state = table.clone(state), api = api, searchRef = searchRef, scrollRef = scrollRef, widget = widget }
			)
		))
	end
	local function focus()
		state.focusRevision += 1
		render()
	end
	function api.refresh()
		if destroyed then
			return
		end
		preview()
		render()
	end
	function api.search(query)
		query = tostring(query):sub(1, 200)
		if state.query == query then
			return
		end
		state.query = query
		state.results = Commands.query(query)
		state.index = 1
		state.message = nil
		state.failed = false
		api.refresh()
		if scrollRef.current then
			scrollRef.current.CanvasPosition = Vector2.zero
		end
	end
	function api.choose(index)
		state.index = math.clamp(index, 1, math.max(1, #state.results))
		state.message = nil
		state.failed = false
		api.refresh()
		focus()
		task.defer(function()
			local scroll = scrollRef.current
			if destroyed or not scroll then
				return
			end
			local top, bottom, y = (state.index - 1) * 36, state.index * 36, scroll.CanvasPosition.Y
			if top < y then
				scroll.CanvasPosition = Vector2.new(0, top)
			elseif bottom > y + scroll.AbsoluteSize.Y then
				scroll.CanvasPosition = Vector2.new(0, math.max(0, bottom - scroll.AbsoluteSize.Y))
			end
		end)
	end
	function api.move(delta)
		api.choose(state.index + delta)
	end
	local lastInput
	function api.input(input)
		if
			destroyed
			or not widget.Enabled
			or not searchRef.current
			or not searchRef.current:IsFocused()
			or input == lastInput
		then
			return
		end
		lastInput = input
		task.defer(function()
			if lastInput == input then
				lastInput = nil
			end
		end)
		if input.KeyCode == Enum.KeyCode.Up then
			api.move(-1)
		elseif input.KeyCode == Enum.KeyCode.Down then
			api.move(1)
		elseif input.KeyCode == Enum.KeyCode.Escape then
			api.close()
		end
	end
	function api.close()
		widget.Enabled = false
	end
	function api.open()
		state.query = ""
		state.results = Commands.query("")
		state.index = 1
		state.message = nil
		state.failed = false
		widget.Enabled = true
		api.refresh()
		focus()
	end
	function api.execute()
		if destroyed or not widget.Enabled then
			return false
		end
		local command = state.results[state.index]
		if not command or state.preview.error then
			api.refresh()
			focus()
			return false
		end
		local ok, result = pcall(Commands.run, command.id, deps, state.expected)
		if ok then
			local message = result.message or string.format("Updated %d UI elements.", result.count or 0)
			if result.skipped and #result.skipped > 0 then
				message ..= " " .. #result.skipped .. " skipped; use Studio Properties for layout-controlled values."
			end
			deps.tell(message, false)
			api.close()
		else
			state.message = readable(result)
			state.failed = true
			deps.tell(state.message, true)
			api.refresh()
			focus()
		end
		return ok
	end
	widget:BindToClose(api.close)
	table.insert(connections, widget.WindowFocused:Connect(focus))
	table.insert(
		connections,
		deps.selection.SelectionChanged:Connect(function()
			if widget.Enabled then
				state.message = nil
				state.failed = false
				api.refresh()
			end
		end)
	)
	local action = plugin:CreatePluginAction(
		"FramebridgeCommands",
		"Framebridge commands",
		"Search UI creation and sizing commands",
		"",
		true
	)
	table.insert(connections, action.Triggered:Connect(api.open))
	task.spawn(function()
		local signature
		while not destroyed do
			task.wait(0.5)
			if widget.Enabled and not destroyed then
				local nextSignature = tostring(deps.running()) .. tostring(deps.busy())
				if signature ~= nextSignature then
					signature = nextSignature
					api.refresh()
				end
			end
		end
	end)
	function api.destroy()
		if destroyed then
			return
		end
		destroyed = true
		for _, connection in ipairs(connections) do
			connection:Disconnect()
		end
		root:unmount()
		action:Destroy()
		widget:Destroy()
	end
	api.widget = widget
	return api
end
return Palette
