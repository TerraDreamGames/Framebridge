-- Mounted production palette regression; requires the real Roblox GUI engine.
-- The owned viewport is resized through API. This is not native border-drag acceptance.
return function(Palette, SelectionTools)
	local runService = game:GetService("RunService")
	assert(game.PlaceId == 0 and runService:IsEdit(), "Blank stopped Edit QA only")
	local storage, starter, http = game:GetService("ServerStorage"), game:GetService("StarterGui"), game:GetService("HttpService")
	local owner = http:GenerateGUID(false):gsub("%-", "")
	local name = "__FramebridgePaletteResizeTest_" .. owner
	assert(not storage:FindFirstChild(name), "Inspect existing QA first")
	local beforeStarter, beforeStorage = #starter:GetChildren(), #storage:GetChildren()
	local previousSelection = game:GetService("Selection"):Get()
	local root = Instance.new("Folder")
	root.Name = name
	root:SetAttribute("Owner", owner)
	root.Parent = storage
	local native, api, widget
	local observations = {}
	local function cleanup()
		local errors = {}
		local function attempt(fn)
			local clean, errorMessage = pcall(fn)
			if not clean then table.insert(errors, tostring(errorMessage)) end
		end
		if api then attempt(api.destroy) end
		if native then attempt(function() native:Destroy() end) end
		attempt(function()
			assert(root:GetAttribute("Owner") == owner, "Exact owned fixture only")
			root:Destroy()
		end)
		assert(#errors == 0, table.concat(errors, "\n"))
	end
	local ok, why = pcall(function()
		local changed = Instance.new("BindableEvent")
		changed.Parent = root
		native = PluginManager():CreatePlugin()
		local plugin = {}
		function plugin:CreateDockWidgetPluginGuiAsync(id, info)
			return native:CreateDockWidgetPluginGuiAsync(id .. "_ResizeQA_" .. owner, info)
		end
		function plugin:CreatePluginAction(id, ...)
			return native:CreatePluginAction(id .. "_ResizeQA_" .. owner, ...)
		end
		api = Palette.mount(plugin, {
			selection = { Get = function() return {} end, SelectionChanged = changed.Event },
			starterGui = starter,
			history = game:GetService("ChangeHistoryService"),
			tools = SelectionTools,
			running = function() return false end,
			busy = function() return false end,
			tell = function() error("The resize fixture must not run commands") end,
		})
		widget = api.widget
		widget.Title = "Framebridge · Resize regression QA"
		api.open()
		task.wait(.25)
		local app = assert(widget:FindFirstChild("FramebridgeCommands"))
		local viewport = Instance.new("Frame")
		viewport.Name = "OwnedResizeViewport"
		viewport.Size = UDim2.fromOffset(460, 440)
		viewport.BackgroundTransparency = 1
		viewport.BorderSizePixel = 0
		viewport.ClipsDescendants = true
		viewport.Parent = widget
		app.Parent = viewport
		local scroll = assert(app:FindFirstChild("CommandResults"))
		local function visible(label, rowName)
			task.wait(.25)
			local row = assert(scroll:FindFirstChild(rowName))
			local top, bottom = row.AbsolutePosition.Y, row.AbsolutePosition.Y + row.AbsoluteSize.Y
			local viewportTop, viewportBottom = scroll.AbsolutePosition.Y, scroll.AbsolutePosition.Y + scroll.AbsoluteSize.Y
			local fits = top >= viewportTop - .5 and bottom <= viewportBottom + .5
			table.insert(observations, {
				label = label, row = rowName, rowTop = top, rowBottom = bottom,
				viewportTop = viewportTop, viewportBottom = viewportBottom,
				viewportSize = { viewport.AbsoluteSize.X, viewport.AbsoluteSize.Y },
				scrollSize = { scroll.AbsoluteSize.X, scroll.AbsoluteSize.Y },
				canvasY = scroll.CanvasPosition.Y, visible = fits,
			})
			assert(fits, label .. ": the selected command is outside the visible results")
		end
		task.wait(.25)
		api.choose(29)
		visible("Last command before shrink", "tool:text")
		viewport.Size = UDim2.fromOffset(460, 280)
		visible("Last command after height shrink", "tool:text")
		viewport.Size = UDim2.fromOffset(640, 520)
		visible("Last command after grow", "tool:text")
		viewport.Size = UDim2.fromOffset(360, 280)
		visible("Last command after width and height shrink", "tool:text")
		api.search("create textlabel")
		viewport.Size = UDim2.fromOffset(460, 440)
		visible("Query resets selection before resize", "create:TextLabel")
		assert(scroll.CanvasPosition.Y == 0, "Query reset must keep the first result at the top")
		api.search("")
		api.choose(29)
		visible("Reselected last command", "tool:text")
		viewport.Size = UDim2.fromOffset(360, 280)
		visible("Repeated shrink after query change", "tool:text")
	end)
	local cleaned, cleanupError = pcall(cleanup)
	task.wait(.55)
	assert(cleaned, tostring(cleanupError))
	assert(not widget or widget.Parent == nil, "Owned widget must be removed")
	assert(not storage:FindFirstChild(name), "Owned fixture must be removed")
	assert(#starter:GetChildren() == beforeStarter and #storage:GetChildren() == beforeStorage, "Fixture must preserve scene contents")
	local selection = game:GetService("Selection"):Get()
	assert(#selection == #previousSelection, "Fixture must preserve Selection")
	for i, instance in ipairs(selection) do assert(instance == previousSelection[i], "Fixture must preserve Selection identity") end
	assert(ok, tostring(why))
	return {
		passed = true, observations = observations, ownedWidgetRemoved = true,
		ownedFixtureRemoved = true, scenePreserved = true, selectionPreserved = true,
		nativeBorderDragAcceptance = false, commandsExecuted = 0,
	}
end
