-- Native measured geometry in a temporary widget; fake history, no game selection writes.
local native = PluginManager():CreatePlugin()
local widget = native:CreateDockWidgetPluginGuiAsync(
	"FramebridgeSelectionTest",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, true, 840, 640, 360, 480)
)
widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
widget.Enabled = true
local parent = Instance.new("Frame")
parent.Size = UDim2.fromOffset(400, 300)
parent.Position = UDim2.fromOffset(20, 20)
parent.Parent = widget
local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 10)
padding.PaddingRight = UDim.new(0, 20)
padding.PaddingTop = UDim.new(0, 5)
padding.PaddingBottom = UDim.new(0, 15)
padding.Parent = parent
local scale = Instance.new("UIScale")
scale.Scale = 1.5
scale.Parent = parent
local child = Instance.new("TextLabel")
child.Name = "Selected text"
child.Size = UDim2.new(0.2, 80, 0.1, 30)
child.Position = UDim2.new(0.3, 25, 0.4, 10)
child.AnchorPoint = Vector2.new(0.25, 0.5)
child.Parent = parent
local history = { begun = 0, finished = 0 }
function history:TryBeginRecording()
	self.begun += 1
	return "test"
end
function history:FinishRecording(_, operation)
	self.finished += 1
	self.operation = operation
end
local passed, failures = 0, {}
local function test(name, body)
	local ok, why = pcall(body)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local function settle()
	task.wait(0.15)
end
local function near(a, b)
	assert((a - b).Magnitude < 1, tostring(a) .. " differs from " .. tostring(b))
end
local function run(operation, options, selection)
	return Tools.run(selection or { child }, operation, options, history)
end
settle()
test("selection scope includes descendants only when requested and deduplicates", function()
	assert(#Tools.collect({ parent, child }, true) == 2)
	assert(#Tools.collect({ parent }, false) == 1)
	assert(Tools.describe({ parent }).descendants == 2)
end)
test("mixed geometry to scale preserves padding and ancestor UIScale bounds", function()
	local size, position = child.AbsoluteSize, child.AbsolutePosition
	local result = run("geometry", { units = "scale", scope = "both" })
	settle()
	assert(result.count == 1 and child.Size.X.Offset == 0 and child.Position.Y.Offset == 0)
	near(child.AbsoluteSize, size)
	near(child.AbsolutePosition, position)
end)
test("scale to pixels preserves current geometry", function()
	local size, position = child.AbsoluteSize, child.AbsolutePosition
	run("geometry", { units = "offset", scope = "both" })
	settle()
	assert(child.Size.X.Scale == 0 and child.Position.Y.Scale == 0)
	near(child.AbsoluteSize, size)
	near(child.AbsolutePosition, position)
end)
test("anchor presets keep the element in its visual position", function()
	local position = child.AbsolutePosition
	run("anchor", { anchor = Vector2.new(0.5, 0.5), keepPosition = true })
	settle()
	assert(child.AnchorPoint == Vector2.new(0.5, 0.5))
	near(child.AbsolutePosition, position)
end)
test("an element's own UIScale also preserves anchor position", function()
	local ownScale = Instance.new("UIScale")
	ownScale.Scale = 0.8
	ownScale.Parent = child
	settle()
	local position = child.AbsolutePosition
	run("anchor", { anchor = Vector2.new(1, 1), keepPosition = true })
	settle()
	near(child.AbsolutePosition, position)
	ownScale:Destroy()
end)
test("aspect utility preserves the rendered ratio and reuses a constraint", function()
	settle()
	local ratio = child.AbsoluteSize.X / child.AbsoluteSize.Y
	run("aspect", {})
	run("aspect", {})
	settle()
	local modifier = child:FindFirstChildWhichIsA("UIAspectRatioConstraint")
	assert(math.abs(modifier.AspectRatio - ratio) < 0.02)
	local count = 0
	for _, item in ipairs(child:GetChildren()) do
		if item:IsA("UIAspectRatioConstraint") then
			count += 1
		end
	end
	assert(count == 1)
	modifier:Destroy()
end)
test("size limits create once and update existing constraints", function()
	run("sizeLimits", { minimum = Vector2.new(20, 10), maximum = Vector2.new(200, 120) })
	run("sizeLimits", { minimum = Vector2.new(300, 150), maximum = Vector2.new(400, 200) })
	local modifier = child:FindFirstChildWhichIsA("UISizeConstraint")
	assert(modifier.MinSize == Vector2.new(300, 150) and modifier.MaxSize == Vector2.new(400, 200))
	modifier:Destroy()
end)
test("text scaling is bounded and reuses the text constraint", function()
	run("text", { minimum = 12, maximum = 28 })
	run("text", { minimum = 16, maximum = 32 })
	assert(
		child.TextScaled
			and child.UITextSizeConstraint.MinTextSize == 16
			and child.UITextSizeConstraint.MaxTextSize == 32
	)
	local count = 0
	for _, item in ipairs(child:GetChildren()) do
		if item:IsA("UITextSizeConstraint") then
			count += 1
		end
	end
	assert(count == 1)
end)
test("invalid constraints are rejected before a recording or mutation", function()
	local begun = history.begun
	assert(not pcall(run, "sizeLimits", { minimum = Vector2.new(30, 0), maximum = Vector2.new(20, 40) }))
	assert(not pcall(run, "text", { minimum = 32, maximum = 12 }))
	assert(history.begun == begun and child.UITextSizeConstraint.MaxTextSize == 32)
end)
test("list positions are respected while size remains convertible", function()
	local list = Instance.new("UIListLayout")
	list.Parent = parent
	settle()
	local position = child.Position
	local result = run("geometry", { units = "scale", scope = "both" })
	assert(child.Position == position and child.Size.X.Offset == 0 and #result.skipped == 1)
	assert(run("anchor", { anchor = Vector2.zero }).count == 0)
	assert(run("fill", {}).count == 0)
	list:Destroy()
end)
test("grid sizes and positions are not overwritten", function()
	local grid = Instance.new("UIGridLayout")
	grid.Parent = parent
	settle()
	local size, position, begun = child.Size, child.Position, history.begun
	local result = run("geometry", { units = "offset", scope = "both" })
	assert(result.count == 0 and #result.skipped == 2 and child.Size == size and child.Position == position)
	assert(history.begun == begun)
	grid:Destroy()
end)
test("automatic and zero-parent sizes are skipped", function()
	child.AutomaticSize = Enum.AutomaticSize.X
	assert(run("geometry", { units = "offset", scope = "size" }).count == 0)
	child.AutomaticSize = Enum.AutomaticSize.None
	parent.Size = UDim2.new()
	settle()
	assert(run("geometry", { units = "scale", scope = "both" }).count == 0)
	parent.Size = UDim2.fromOffset(400, 300)
	settle()
end)
test("rotated keep-position anchors are skipped without changing anchor", function()
	child.Rotation = 20
	local anchor = child.AnchorPoint
	assert(run("anchor", { anchor = Vector2.zero }).count == 0 and child.AnchorPoint == anchor)
	child.Rotation = 0
end)
test("a failed recording restores properties and removes new constraints", function()
	local old = child.Size
	local broken = {
		TryBeginRecording = function()
			return "rollback"
		end,
		FinishRecording = function(_, _, operation)
			if operation == Enum.FinishRecordingOperation.Commit then
				error("test failure")
			end
		end,
	}
	assert(not pcall(Tools.run, { child }, "fill", {}, broken))
	assert(child.Size == old)
	assert(not pcall(Tools.run, { child }, "aspect", {}, broken))
	assert(not child:FindFirstChildWhichIsA("UIAspectRatioConstraint"))
end)
test("fit-to-parent uses scale with a top-left anchor", function()
	run("fill", {})
	assert(child.Size == UDim2.fromScale(1, 1) and child.Position == UDim2.new() and child.AnchorPoint == Vector2.zero)
	assert(history.operation == Enum.FinishRecordingOperation.Commit)
end)
widget:Destroy()
native:Destroy()
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Detached temporary native UI and fake history; no game/selection changes",
}
