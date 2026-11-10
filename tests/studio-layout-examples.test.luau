-- Runs inside Studio against the actual exported JSON and production importer/editor.
local plugin = PluginManager():CreatePlugin()
local widget = plugin:CreateDockWidgetPluginGui("FramebridgeLayoutVerification", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, true, 760, 600, 320, 420))
widget.Title = "Framebridge · Layout examples"
local host = Instance.new("Frame", widget)
host.Size = UDim2.fromOffset(640, 480)
host.BackgroundTransparency = 1
local results, failures = {}, {}
local function check(condition, message)
	assert(condition, message)
end
local function test(name, callback)
	local ok, message = pcall(callback)
	if ok then table.insert(results, name) else table.insert(failures, name .. ": " .. tostring(message)) end
end
local function rows(scroll)
	local found = {}
	for _, child in ipairs(scroll:GetChildren()) do if child:IsA("GuiObject") then table.insert(found, child) end end
	table.sort(found, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
	return found
end
local function settle() task.wait(0.25) end
local function reachable(scroll)
	local children = rows(scroll)
	local last = children[#children]
	local axis = scroll.ScrollingDirection == Enum.ScrollingDirection.X and "X" or "Y"
	local overflow = scroll.AbsoluteCanvasSize[axis] - scroll.AbsoluteWindowSize[axis]
	check(overflow > 10, scroll.Name .. " must overflow")
	local before = last.AbsolutePosition[axis]
	scroll.CanvasPosition = axis == "X" and Vector2.new(overflow, 0) or Vector2.new(0, overflow)
	settle()
	check(last.AbsolutePosition[axis] < before - 10, "CanvasPosition did not move content")
	check(last.AbsolutePosition[axis] + last.AbsoluteSize[axis] <= scroll.AbsolutePosition[axis] + scroll.AbsoluteSize[axis] + 2, "Last entry is clipped at the end: " .. scroll.Name .. " canvas=" .. tostring(scroll.AbsoluteCanvasSize) .. " window=" .. tostring(scroll.AbsoluteWindowSize) .. " position=" .. tostring(scroll.CanvasPosition) .. " last=" .. tostring(last.AbsolutePosition - scroll.AbsolutePosition) .. " size=" .. tostring(last.AbsoluteSize) .. " layout=" .. tostring((scroll:FindFirstChildOfClass("UIGridLayout") or scroll:FindFirstChildOfClass("UIListLayout")).AbsoluteContentSize))
	scroll.CanvasPosition = Vector2.zero
end
for _, fixture in ipairs(fixtures) do
	for _, mode in ipairs({"source", "scale", "offset"}) do
		test(fixture.key .. " / " .. mode .. ": import, layout, scrolling, resize, update", function()
			host:ClearAllChildren(); host.Size = UDim2.fromOffset(640, 480)
			local decoded = Importer.decode(game:GetService("HttpService"):JSONEncode(fixture.package))
			local package, notices = Editor.prepare(decoded, {mode = mode})
			check(#notices == 0, "Unexpected sizing notices")
			check(#package.assets == 0 and #package.issues == 0, "Example needs assets or has review notes")
			local destination = Instance.new("Folder")
			local stage = Importer.stage(package, {}, false)
			local imported, stats = Importer.apply(stage, package, destination, false)
			check(stats.created == package.instanceCount, "Instance count mismatch")
			local canvas = imported[1]:GetChildren()[1]
			canvas.Parent = host
			settle()
			local scrolls = {}
			for _, child in ipairs(canvas:GetDescendants()) do if child:IsA("ScrollingFrame") then table.insert(scrolls, child) end end
			check(#scrolls == (fixture.key == "nested-panels" and 2 or 1), "Scrolling frame count mismatch")
			for _, scroll in ipairs(scrolls) do
				local expected = fixture.key == "quest-list" and 10 or fixture.key == "inventory-grid" and 18 or 8
				check(#rows(scroll) == expected, "Wrong number of entries")
				local layout = scroll:FindFirstChildOfClass("UIGridLayout") or scroll:FindFirstChildOfClass("UIListLayout")
				check(layout ~= nil and layout.AbsoluteContentSize.Magnitude > 0, "Native layout did not resolve")
				check(scroll:FindFirstChildOfClass("UIPadding") ~= nil, "Missing padding")
				reachable(scroll)
				local added = rows(scroll)[1]:Clone(); added.Name = "Runtime entry"; added.LayoutOrder = 999; added.Parent = scroll
				settle(); reachable(scroll); added:Destroy()
			end
			if fixture.key == "inventory-grid" and mode == "source" then
				local scroll = scrolls[1]; local grid = scroll:FindFirstChildOfClass("UIGridLayout")
				check(grid.AbsoluteCellCount.X == 4, "Expected four columns at 640px")
				host.Size = UDim2.fromOffset(320, 480); settle()
				check(grid.AbsoluteCellCount.X < 4, "Grid did not reflow at 320px")
				reachable(scroll)
			elseif mode == "scale" then
				host.Size = UDim2.fromOffset(400, 640); settle()
				for _, scroll in ipairs(scrolls) do reachable(scroll) end
			end
			canvas.Parent = imported[1]
			local custom = Instance.new("LocalScript", canvas); custom.Name = "UserBehavior"
			local nextStage = Importer.stage(package, {}, false)
			local updated, updateStats = Importer.apply(nextStage, package, destination, true)
			check(updated[1] == imported[1] and updated[1]:GetChildren()[1] == canvas, "Update replaced references")
			check(custom.Parent == canvas and updateStats.created == 0, "Update lost custom behavior")
			destination:Destroy()
		end)
	end
end
host:Destroy(); widget:Destroy(); plugin:Destroy()
return { passed = #results, failed = #failures, tests = results, failures = failures }
