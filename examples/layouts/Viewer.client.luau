-- Demo-only viewer. The exported UI packages contain no scripts.
local playerGui = script.Parent.Parent
local viewer = script.Parent
viewer.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
viewer.IgnoreGuiInset = false
local names = { "Quest list", "Reward carousel", "Inventory grid", "Nested panels" }
local templates = {}
for _, name in ipairs(names) do
	local screen = playerGui:WaitForChild(name)
	screen.Enabled = false
	templates[name] = screen:FindFirstChildOfClass("Frame")
end
local background = Instance.new("Frame", viewer)
background.Name = "Viewer"
background.Size = UDim2.fromScale(1, 1)
background.BackgroundColor3 = Color3.fromRGB(8, 13, 22)
background.BorderSizePixel = 0
local toolbar = Instance.new("ScrollingFrame", background)
toolbar.Name = "Navigation"
toolbar.Size = UDim2.new(1, 0, 0, 56)
toolbar.BackgroundTransparency = 1
toolbar.BorderSizePixel = 0
toolbar.CanvasSize = UDim2.new()
toolbar.AutomaticCanvasSize = Enum.AutomaticSize.X
toolbar.ScrollingDirection = Enum.ScrollingDirection.X
toolbar.ScrollBarThickness = 3
local layout = Instance.new("UIListLayout", toolbar)
layout.FillDirection = Enum.FillDirection.Horizontal
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
local padding = Instance.new("UIPadding", toolbar)
padding.PaddingLeft = UDim.new(0, 12); padding.PaddingTop = UDim.new(0, 10)
local body = Instance.new("Frame", background)
body.Name = "Examples"
body.Position = UDim2.fromOffset(0, 56)
body.Size = UDim2.new(1, 0, 1, -56)
body.BackgroundTransparency = 1
local buttons = {}
local current = "All examples"
local function show(name)
	current = name
	body:ClearAllChildren()
	if name == "All examples" then
		local grid = Instance.new("UIGridLayout", body)
		grid.CellSize = UDim2.new(0.5, -18, 0.5, -18)
		grid.CellPadding = UDim2.fromOffset(12, 12)
		grid.SortOrder = Enum.SortOrder.LayoutOrder
		local pad = Instance.new("UIPadding", body)
		pad.PaddingLeft = UDim.new(0, 12); pad.PaddingTop = UDim.new(0, 12)
		for i, title in ipairs(names) do
			local host = Instance.new("Frame", body)
			host.Name = title; host.LayoutOrder = i; host.ClipsDescendants = true; host.BorderSizePixel = 0
			local clone = templates[title]:Clone(); clone.Parent = host
		end
	else
		local clone = templates[name]:Clone(); clone.Parent = body
	end
	for title, button in pairs(buttons) do
		button.BackgroundColor3 = title == name and Color3.fromRGB(40, 94, 159) or Color3.fromRGB(30, 43, 63)
	end
end
local function button(title, order, callback)
	local b = Instance.new("TextButton", toolbar)
	b.Name = title; b.Text = title; b.LayoutOrder = order
	b.Size = UDim2.fromOffset(title == "Add entry" and 100 or 140, 34)
	b.BackgroundColor3 = Color3.fromRGB(30, 43, 63); b.BorderSizePixel = 0
	b.TextColor3 = Color3.fromRGB(235, 242, 255); b.Font = Enum.Font.GothamMedium; b.TextSize = 14
	local corner = Instance.new("UICorner", b); corner.CornerRadius = UDim.new(0, 6)
	b.Activated:Connect(callback)
	return b
end
buttons["All examples"] = button("All examples", 0, function() show("All examples") end)
for i, name in ipairs(names) do buttons[name] = button(name, i, function() show(name) end) end
button("Add entry", 5, function()
	for _, scroll in ipairs(body:GetDescendants()) do
		if scroll:IsA("ScrollingFrame") then
			local first, lastOrder = nil, 0
			for _, child in ipairs(scroll:GetChildren()) do
				if child:IsA("GuiObject") then first = first or child; lastOrder = math.max(lastOrder, child.LayoutOrder) end
			end
			if first then
				local clone = first:Clone(); clone.Name = "Added entry " .. lastOrder + 1; clone.LayoutOrder = lastOrder + 1
				local text = clone:FindFirstChildWhichIsA("TextLabel", true)
				if text then text.Text = "Added at runtime\nEntry " .. lastOrder + 1 end
				clone.Parent = scroll
			end
		end
	end
end)
button("Reset", 6, function() show(current) end)
show("All examples")
