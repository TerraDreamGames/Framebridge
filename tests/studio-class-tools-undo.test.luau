assert(game.PlaceId == 0, "Blank QA only")
local history = game:GetService("ChangeHistoryService")
local passed, failures = 0, {}
local function test(name, body)
	local setup = history:TryBeginRecording("FramebridgeClassQASetup", "Create class QA fixture")
	assert(setup, "QA cannot start while another recording is active")
	local root = Instance.new("ScreenGui")
	root.Name = "FramebridgeClassToolsUndoQA"
	root.Parent = game:GetService("StarterGui")
	history:FinishRecording(setup, Enum.FinishRecordingOperation.Commit)
	local ok, why = pcall(body, root)
	root:Destroy()
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
test("native Frame/button nested conversion supports real Undo and Redo", function(root)
	local setup = history:TryBeginRecording("FramebridgeClassQAChildren", "Create class QA children")
	assert(setup)
	local parent = Instance.new("Frame")
	parent.Name = "Parent"
	parent.Size = UDim2.fromOffset(240, 120)
	parent.Parent = root
	local child = Instance.new("Frame")
	child.Name = "Child"
	child.Parent = parent
	local label = Instance.new("TextLabel")
	label.Text = "Buy"
	label.Parent = child
	local app = Instance.new("LocalScript")
	app.Name = "Application"
	app.Source = "-- custom logic"
	app.Parent = child
	local ref = Instance.new("ObjectValue")
	ref.Value = parent
	ref.Parent = label
	history:FinishRecording(setup, Enum.FinishRecordingOperation.Commit)
	local result = Tools.run({ child, parent }, "TextButton", history)
	local p, c = result.mapping[parent], result.mapping[child]
	assert(p.Parent == root and c.Parent == p and label.Parent == c and app.Parent == c and ref.Value == p)
	local can, name = history:GetCanUndo()
	assert(can and (name == "Convert selected UI class" or name == "FramebridgeClass"), tostring(name))
	history:Undo()
	task.wait()
	assert(
		parent.Parent == root
			and child.Parent == parent
			and label.Parent == child
			and app.Parent == child
			and ref.Value == parent
	)
	assert(p.Parent == nil and c.Parent == nil and root:FindFirstChild("Parent") == parent)
	history:Redo()
	task.wait()
	assert(
		root:FindFirstChild("Parent") == p
			and c.Parent == p
			and label.Parent == c
			and app.Parent == c
			and app.Source == "-- custom logic"
			and ref.Value == p
	)
	parent:Destroy()
	child:Destroy()
end)
test("native image conversion and reverse conversion preserve children through Undo/Redo", function(root)
	local setup = history:TryBeginRecording("FramebridgeClassQAImage", "Create image QA fixture")
	assert(setup)
	local image = Instance.new("ImageLabel")
	image.Name = "Icon"
	image.Image = "rbxassetid://123456789"
	image.SliceCenter = Rect.new(4, 4, 60, 60)
	image.Parent = root
	local corner = Instance.new("UICorner")
	corner.Parent = image
	history:FinishRecording(setup, Enum.FinishRecordingOperation.Commit)
	local button = Tools.run({ image }, "ImageButton", history).selection[1]
	assert(button.Image == image.Image and corner.Parent == button)
	history:Undo()
	task.wait()
	assert(image.Parent == root and corner.Parent == image)
	history:Redo()
	task.wait()
	assert(button.Parent == root and corner.Parent == button)
	local back = Tools.run({ button }, "ImageLabel", history).selection[1]
	assert(back.Image == image.Image and back.SliceCenter == image.SliceCenter and corner.Parent == back)
	history:Undo()
	task.wait()
	assert(button.Parent == root and corner.Parent == button)
	history:Redo()
	task.wait()
	assert(back.Parent == root and corner.Parent == back)
	image:Destroy()
	button:Destroy()
end)
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Real native change recordings and Undo/Redo in owned blank-place fixtures; mock image ID checks properties only",
}
