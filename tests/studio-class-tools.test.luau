assert(game.PlaceId == 0, "Run class tools QA only in the approved blank place")
local passed, failures = 0, {}
local folder = Instance.new("Folder")
local history = { begun = 0 }
function history:TryBeginRecording()
	self.begun += 1
	return "class-qa"
end
function history:FinishRecording(_, operation)
	self.operation = operation
end
local function test(name, body)
	local ok, why = pcall(body)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
	folder:ClearAllChildren()
end
local function make(class, parent)
	local instance = Instance.new(class)
	instance.Name = class .. " QA"
	instance.Parent = parent or folder
	return instance
end
test("review is read only and reports incompatible nondefault properties", function()
	local image = make("ImageLabel")
	image.Image = "rbxassetid://123456789"
	local review = Tools.review({ image }, "TextButton")
	assert(review.count == 1 and #review.losses == 1 and review.losses[1]:find("Image", 1, true))
	assert(image.Parent == folder and image.ClassName == "ImageLabel" and #folder:GetChildren() == 1)
	assert(Tools.describe({ image }).preferred == "ImageButton")
end)
test("Frame to TextButton preserves geometry, children, tags, attributes and imported identity", function()
	local frame = make("Frame")
	frame.Name = "Purchase"
	frame.Size = UDim2.new(0.2, 48, 0.1, 30)
	frame.Position = UDim2.new(0.3, 12, 0.4, 8)
	frame.AnchorPoint = Vector2.new(0.5, 0.5)
	frame.Rotation = 17
	frame.BackgroundColor3 = Color3.fromRGB(40, 60, 80)
	frame.AutomaticSize = Enum.AutomaticSize.Y
	frame:SetAttribute("GameValue", 42)
	frame:SetAttribute("FramebridgeId", "purchase")
	frame:SetAttribute("FramebridgeSource", "class-qa")
	frame:SetAttribute("FramebridgeProperties", '["Size","Position","Style"]')
	frame:AddTag("PurchaseButton")
	local label = make("TextLabel", frame)
	label.Text = "Buy"
	local scriptChild = make("LocalScript", frame)
	scriptChild.Source = "-- application logic"
	local result = Tools.run({ frame }, "TextButton", history)
	local button = result.selection[1]
	assert(
		button.ClassName == "TextButton"
			and button.Name == frame.Name
			and button.Size == frame.Size
			and button.Position == frame.Position
			and button.AnchorPoint == frame.AnchorPoint
			and button.Rotation == 17
			and button.BackgroundColor3 == frame.BackgroundColor3
			and button.AutomaticSize == frame.AutomaticSize
	)
	assert(
		frame.Parent == nil
			and label.Parent == button
			and scriptChild.Parent == button
			and scriptChild.Source == "-- application logic"
	)
	assert(
		button:GetAttribute("GameValue") == 42
			and button:GetAttribute("FramebridgeId") == "purchase"
			and button:HasTag("PurchaseButton")
	)
	assert(button.Active and button.Selectable and not button.AutoButtonColor and button.Text == "")
	assert(button:GetAttribute("FramebridgeProperties") == '["Size","Position"]')
	frame:Destroy()
end)
test("ImageLabel and ImageButton round trip retain image crop, slice and tint", function()
	local image = make("ImageLabel")
	image.Image = "rbxassetid://123456789"
	image.ImageColor3 = Color3.fromRGB(120, 80, 40)
	image.ImageTransparency = 0.4
	image.ImageRectOffset = Vector2.new(2, 3)
	image.ImageRectSize = Vector2.new(64, 80)
	image.ScaleType = Enum.ScaleType.Slice
	image.SliceCenter = Rect.new(4, 6, 56, 72)
	image.SliceScale = 0.7
	image.TileSize = UDim2.new(0.3, 2, 0.4, 3)
	image.ResampleMode = Enum.ResamplerMode.Pixelated
	image:SetAttribute("FramebridgeAsset", "image:source")
	local button = Tools.run({ image }, "ImageButton", history).selection[1]
	assert(
		button.Image == image.Image
			and button.ImageColor3 == image.ImageColor3
			and button.ImageRectOffset == image.ImageRectOffset
			and button.SliceCenter == image.SliceCenter
			and button.SliceScale == image.SliceScale
			and button.TileSize == image.TileSize
			and button.ResampleMode == image.ResampleMode
	)
	button.AutoButtonColor = true
	button.Interactable = false
	local label = Tools.run({ button }, "ImageLabel", history).selection[1]
	assert(
		label.Image == image.Image
			and label.ImageTransparency == image.ImageTransparency
			and not label.Interactable
			and label:GetAttribute("FramebridgeAsset") == "image:source"
	)
	image:Destroy()
	button:Destroy()
end)
test("native text, FontFace and disabled state survive label/button/input conversion", function()
	local text = make("TextLabel")
	text.Text = "<b>Hello</b>"
	text.RichText = true
	text.FontFace = Font.new("rbxasset://fonts/families/Roboto.json", Enum.FontWeight.Bold, Enum.FontStyle.Italic)
	text.TextSize = 19
	text.TextWrapped = true
	text.LineHeight = 1.3
	text.AutoLocalize = false
	text.Interactable = false
	local button = Tools.run({ text }, "TextButton", history).selection[1]
	assert(
		button.Text == text.Text
			and button.FontFace == text.FontFace
			and button.TextSize == 19
			and button.RichText
			and button.LineHeight == text.LineHeight
			and not button.Interactable
	)
	local input = Tools.run({ button }, "TextBox", history).selection[1]
	assert(
		input.Text == text.Text and input.FontFace == text.FontFace and not input.ClearTextOnFocus and input.TextWrapped
	)
	text:Destroy()
	button:Destroy()
end)
test("nested selection is order independent and remaps child references between replacements", function()
	local parent = make("Frame")
	local child = make("Frame", parent)
	local label = make("TextLabel", child)
	local ref = make("ObjectValue", label)
	ref.Value = parent
	child.NextSelectionUp = parent
	parent.NextSelectionDown = child
	local result = Tools.run({ child, parent, child }, "TextButton", history)
	local newChild, newParent = result.mapping[child], result.mapping[parent]
	assert(
		result.count == 2 and newParent.Parent == folder and newChild.Parent == newParent and label.Parent == newChild
	)
	assert(ref.Value == newParent and newChild.NextSelectionUp == newParent and newParent.NextSelectionDown == newChild)
	assert(result.selection[1] == newChild and result.selection[2] == newParent)
	parent:Destroy()
	child:Destroy()
end)
test("scroll class properties are reported and obsolete asset metadata is removed", function()
	local scroll = make("ScrollingFrame")
	scroll.CanvasSize = UDim2.fromOffset(0, 1200)
	scroll:SetAttribute("FramebridgeAsset_TopImage", "top")
	scroll:SetAttribute("FramebridgeProperties", '["Size","TopImage","CanvasSize"]')
	local review = Tools.review({ scroll }, "Frame")
	assert(#review.losses > 0 and review.losses[1]:find("CanvasSize", 1, true))
	local frame = Tools.run({ scroll }, "Frame", history).selection[1]
	assert(
		frame:GetAttribute("FramebridgeAsset_TopImage") == nil
			and frame:GetAttribute("FramebridgeProperties") == '["Size"]'
	)
	scroll:Destroy()
end)
test("a selected same-class parent keeps its identity and receives remapped navigation", function()
	local parent = make("TextButton")
	parent.Interactable = false
	local child = make("Frame", parent)
	parent.NextSelectionDown = child
	local result = Tools.run({ parent, child }, "TextButton", history)
	local button = result.mapping[child]
	assert(
		result.count == 1
			and result.selection[1] == parent
			and parent.Parent == folder
			and button.Parent == parent
			and parent.NextSelectionDown == button
			and not parent.Interactable
	)
	child:Destroy()
end)
test("same-class instances keep their identity without opening a history recording", function()
	local frame = make("Frame")
	local begun = history.begun
	local result = Tools.run({ frame, frame }, "Frame", history)
	assert(result.count == 0 and result.selection[1] == frame and history.begun == begun)
end)
test("invalid targets and mixed unsupported selections fail atomically", function()
	local frame = make("Frame")
	local part = make("Part")
	local begun = history.begun
	assert(not pcall(Tools.run, { frame }, "Script", history))
	assert(not pcall(Tools.run, { frame, part }, "TextButton", history))
	assert(not pcall(Tools.run, {}, "TextButton", history))
	assert(frame.Parent == folder and history.begun == begun and #folder:GetChildren() == 2)
end)
test("a stale plan is rejected without moving source children", function()
	local frame = make("Frame")
	local plan = Tools.plan({ frame }, "TextButton")
	local child = make("TextLabel", frame)
	local begun = history.begun
	assert(not pcall(Tools.apply, plan, history))
	assert(frame.Parent == folder and child.Parent == frame and history.begun == begun)
end)
test("failed history commit rolls back nested moves and internal references", function()
	local frame = make("Frame")
	local child = make("Frame", frame)
	local ref = make("ObjectValue", child)
	ref.Value = frame
	local cancelled = false
	local failing = {
		TryBeginRecording = function()
			return "rollback"
		end,
		FinishRecording = function(_, _, operation)
			if operation == Enum.FinishRecordingOperation.Commit then
				error("injected commit failure")
			else
				cancelled = true
			end
		end,
	}
	assert(not pcall(Tools.run, { frame, child }, "TextButton", failing))
	assert(
		cancelled
			and frame.Parent == folder
			and child.Parent == frame
			and ref.Parent == child
			and ref.Value == frame
			and #folder:GetChildren() == 1
	)
end)
test("busy recording leaves originals and children intact", function()
	local frame = make("Frame")
	local child = make("TextLabel", frame)
	assert(not pcall(Tools.run, { frame }, "TextButton", {
		TryBeginRecording = function()
			return nil
		end,
	}))
	assert(frame.Parent == folder and child.Parent == frame and #folder:GetChildren() == 1)
end)
test("reapplying a committed plan cannot destroy the replacement or its children", function()
	local frame = make("Frame")
	local child = make("TextLabel", frame)
	local plan = Tools.plan({ frame }, "TextButton")
	local button = Tools.apply(plan, history).selection[1]
	assert(not pcall(Tools.apply, plan, history) and button.Parent == folder and child.Parent == button)
	frame:Destroy()
end)
test("reimport requires matching Figma class and resets obsolete imported properties safely", function()
	local pkg = Http:JSONDecode(fixture)
	local staged = Importer.stage(pkg, {}, false)
	local roots = Importer.apply(staged, pkg, folder, false)
	local root = roots[1]
	local frame = root:FindFirstChild("Class target", true)
	local button = Tools.run({ frame }, "TextButton", history).selection[1]
	local mismatch = Importer.stage(pkg, {}, false)
	local accepted = pcall(Importer.apply, mismatch, pkg, folder, true)
	Importer.destroy(mismatch)
	assert(not accepted and root:FindFirstChild("Class target", true) == button)
	local function match(node)
		if node.id == button:GetAttribute("FramebridgeId") then
			node.className = "TextButton"
			node.properties.Text = "Updated"
			node.properties.AutoButtonColor = false
		end
		for _, child in ipairs(node.children) do
			match(child)
		end
	end
	for _, node in ipairs(pkg.roots) do
		match(node)
	end
	local updated = Importer.apply(Importer.stage(pkg, {}, false), pkg, folder, true)
	assert(updated[1] == root and root:FindFirstChild("Class target", true) == button and button.Text == "Updated")
	frame:Destroy()
end)
folder:Destroy()
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Detached native class conversion, metadata, reference remapping, reimport and rollback; synthetic history boundary",
}
