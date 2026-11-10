assert(game.PlaceId == 0, "Blank QA only")
local passed, failures = 0, {}
local starter = game:GetService("StarterGui")
local root = Instance.new("ScreenGui")
root.Name = "__FramebridgeCommandsNativeQA"
root.Parent = starter
local selected, running, busy = {}, false, false
local selection = {
	Get = function()
		return table.clone(selected)
	end,
	Set = function(_, value)
		selected = table.clone(value)
	end,
}
local history = { commits = 0, cancels = 0 }
function history:TryBeginRecording()
	return "qa"
end
function history:FinishRecording(_, op)
	if op == Enum.FinishRecordingOperation.Commit then
		self.commits += 1
	else
		self.cancels += 1
	end
end
local deps = {
	starterGui = starter,
	selection = selection,
	history = history,
	tools = Tools,
	running = function()
		return running
	end,
	busy = function()
		return busy
	end,
}
local function test(name, fn)
	local ok, why = pcall(fn)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local function run(id, parent)
	selected = { parent }
	return Commands.run(id, deps)
end
test("bounded literal catalog search", function()
	assert(#Commands.query("") == 29)
	assert(#Commands.query("new grid") == 1 and Commands.query("new grid")[1].id == "create:UIGridLayout")
	assert(#Commands.query("new IMAGE") == 2 and #Commands.query(".*") == 0)
	assert(#Commands.query("os.execute") == 0 and #Commands.query(string.rep("x", 10000)) == 0)
end)
test("all supported native classes create with valid parents and relative geometry", function()
	for _, command in ipairs(Commands.query("new")) do
		local parent = Instance.new("TextLabel")
		parent.Parent = root
		local result = run(command.id, parent)
		local instance = result.instance
		assert(instance.ClassName == command.class)
		assert(instance.Parent == (command.class == "ScreenGui" and starter or parent))
		assert(selected[1] == instance and result.count == 1)
		if instance:IsA("GuiObject") then
			assert(instance.Size.X.Scale == 0.25 and math.abs(instance.Size.Y.Scale - 0.12) < 0.000001 and instance.Size.X.Offset == 0)
		end
		if instance:IsA("ScreenGui") then
			assert(instance.ResetOnSpawn == false)
			instance:Destroy()
		end
		if instance:IsA("ScrollingFrame") then
			assert(
				instance.AutomaticCanvasSize == Enum.AutomaticSize.Y and instance.CanvasSize == UDim2.fromScale(0, 0)
			)
		end
		parent:Destroy()
	end
end)
test("preview does not create, arbitrary IDs and invalid parents do not mutate", function()
	local before = #root:GetDescendants()
	selected = { root }
	assert(Commands.preview("create:Frame", selected, starter).parent == root)
	assert(Commands.preview("create:UIStroke", selected, starter).error)
	assert(Commands.preview("print('run')", selected, starter).error)
	assert(not pcall(Commands.run, "create:Script", deps))
	selected = { Instance.new("Folder") }
	assert(not pcall(Commands.run, "create:Frame", deps))
	selected[1]:Destroy()
	selected = {}
	assert(not pcall(Commands.run, "create:Frame", deps))
	assert(#root:GetDescendants() == before)
end)
test("duplicate layouts/modifiers and non-text constraints are blocked", function()
	local frame = run("create:Frame", root).instance
	run("create:UIGridLayout", frame)
	assert(not pcall(run, "create:UIListLayout", frame))
	assert(not pcall(run, "create:UIGridLayout", frame))
	run("create:UICorner", frame)
	assert(not pcall(run, "create:UICorner", frame))
	assert(not pcall(run, "create:UITextSizeConstraint", frame))
	frame:Destroy()
end)
test("clear target rejects changed or deleted selection, busy and Play", function()
	local frame = run("create:Frame", root).instance
	local expected = { parent = root, selection = { root } }
	selected = { frame }
	assert(not pcall(Commands.run, "create:Frame", deps, expected))
	selected = { root }
	busy = true
	assert(not pcall(Commands.run, "create:Frame", deps))
	busy = false
	running = true
	assert(not pcall(Commands.run, "create:Frame", deps))
	running = false
	selected = { frame }
	frame:Destroy()
	assert(not pcall(Commands.run, "create:Frame", deps))
	local huge = {}
	for _ = 1, 201 do
		table.insert(huge, root)
	end
	assert(Commands.preview("tool:fill", huge, starter).error)
end)
test("native text utility uses existing history and preserves application script", function()
	local label = run("create:TextLabel", root).instance
	local custom = Instance.new("LocalScript")
	custom.Source = "-- application"
	custom.Parent = label
	selected = { label }
	local result = Commands.run("tool:text", deps)
	assert(
		result.count == 1
			and label.TextScaled
			and label:FindFirstChildWhichIsA("UITextSizeConstraint").MaxTextSize == 32
	)
	assert(custom.Parent == label and custom.Source == "-- application")
	label:Destroy()
end)
test("creation names are unique and failed selection change rolls back", function()
	local first = run("create:Frame", root).instance
	local second = run("create:Frame", root).instance
	assert(first.Name == "Frame" and second.Name == "Frame2")
	local count = #root:GetChildren()
	local bad = table.clone(deps)
	bad.selection = {
		Get = function()
			return { root }
		end,
		Set = function()
			error("selection unavailable")
		end,
	}
	assert(not pcall(Commands.run, "create:Frame", bad))
	assert(#root:GetChildren() == count and history.cancels == 1)
	local locked = table.clone(deps)
	locked.history = {
		TryBeginRecording = function()
			return nil
		end,
	}
	selected = { root }
	assert(not pcall(Commands.run, "create:Frame", locked))
	assert(#root:GetChildren() == count)
end)
root:Destroy()
return { passed = passed, failed = #failures, failures = failures }
