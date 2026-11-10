-- Real Roblox geometry and detached update tests. Imports never target the place.
local native = PluginManager():CreatePlugin()
local widget = native:CreateDockWidgetPluginGuiAsync(
	"FramebridgeResponsiveNative",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, true, 900, 550, 360, 480)
)
widget.Enabled = true
local stages, destinations = {}, {}
local passed, failures = 0, {}
local function test(name, body)
	local ok, why = pcall(body)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local function u(a, b, c, d)
	return { type = "UDim2", value = { a, b, c, d } }
end
local function fixture(grid)
	local children = {
		{
			id = "text",
			name = "Text",
			className = "TextLabel",
			properties = {
				Text = "Original",
				TextSize = 16,
				TextScaled = false,
				Position = u(0, 40, 0, 50),
				Size = u(0, 80, 0, 100),
				AnchorPoint = { type = "Vector2", value = { 0.5, 0.5 } },
			},
			children = {},
		},
		{
			id = "padding",
			name = "Padding",
			className = "UIPadding",
			properties = {
				PaddingLeft = { type = "UDim", value = { 0, 40 } },
				PaddingRight = { type = "UDim", value = { 0, 40 } },
				PaddingTop = { type = "UDim", value = { 0, 20 } },
				PaddingBottom = { type = "UDim", value = { 0, 20 } },
			},
			children = {},
		},
	}
	if grid then
		table.insert(children, {
			id = "grid",
			name = "Grid",
			className = "UIGridLayout",
			properties = { CellSize = u(0, 80, 0, 100), CellPadding = u(0, 10, 0, 10) },
			children = {},
		})
	end
	return {
		format = "framebridge",
		version = 1,
		sourceId = "responsive-native",
		name = "Responsive",
		assets = {},
		issues = {},
		roots = {
			{
				id = "screen",
				name = "Screen",
				className = "ScreenGui",
				properties = {},
				referenceSize = { 400, 400 },
				children = {
					{
						id = "canvas",
						name = "Canvas",
						className = "Frame",
						properties = { Size = u(0, 400, 0, 400), Position = u(0, 0, 0, 0) },
						children = children,
					},
				},
			},
		},
	}
end
local function stage(package)
	local value = Importer.stage(package, {}, false)
	table.insert(stages, value)
	return value
end
local function display(s, x, width, height)
	local host = Instance.new("Frame")
	host.Position = UDim2.fromOffset(x, 0)
	host.Size = UDim2.fromOffset(width or 400, height or 400)
	host.Parent = widget
	s.byId.canvas.instance.Parent = host
	return host
end
local function near(value, expected)
	assert(math.abs(value - expected) <= 1, tostring(value) .. " ~= " .. expected)
end
for _, grid in ipairs({ false, true }) do
	test(
		grid and "grid scale cells preserve native authored dimensions"
			or "scale preserves padded child bounds and anchors in Roblox",
		function()
			local package = fixture(grid)
			local source = stage(package)
			local scaled = stage(Editor.prepare(package, {}))
			display(source, 0)
			local host = display(scaled, 440)
			task.wait(0.2)
			local a, b = source.byId.text.instance, scaled.byId.text.instance
			near(a.AbsoluteSize.X, b.AbsoluteSize.X)
			near(a.AbsoluteSize.Y, b.AbsoluteSize.Y)
			near(
				a.AbsolutePosition.X - source.byId.canvas.instance.AbsolutePosition.X,
				b.AbsolutePosition.X - scaled.byId.canvas.instance.AbsolutePosition.X
			)
			near(
				a.AbsolutePosition.Y - source.byId.canvas.instance.AbsolutePosition.Y,
				b.AbsolutePosition.Y - scaled.byId.canvas.instance.AbsolutePosition.Y
			)
			assert(b.Size.X.Offset == 0 and b.Size.Y.Offset == 0)
			host.Size = UDim2.fromOffset(720, 800)
			task.wait(0.2)
			near(scaled.byId.canvas.instance.AbsoluteSize.X, 720)
			-- Padding remains 80 px in total; .25 of the remaining width is 160 px.
			near(b.AbsoluteSize.X, 160)
		end
	)
end
test("source aspect constraints preserve descendants in the native engine", function()
	local package = fixture(false)
	table.insert(
		package.roots[1].children[1].children,
		{ id = "aspect", name = "Aspect", className = "UIAspectRatioConstraint", properties = { AspectRatio = 2 }, children = {} }
	)
	local source = stage(package)
	local scaled = stage(Editor.prepare(package, {}))
	display(source, 0)
	display(scaled, 440)
	task.wait(0.2)
	near(source.byId.canvas.instance.AbsoluteSize.Y, 200)
	near(source.byId.text.instance.AbsoluteSize.X, scaled.byId.text.instance.AbsoluteSize.X)
	near(source.byId.text.instance.AbsoluteSize.Y, scaled.byId.text.instance.AbsoluteSize.Y)
end)
test("Studio edits and generated constraints survive detached import, update and reset", function()
	local package = fixture(false)
	local config = Editor.change(package, {}, "text", "Text", "Edited in Studio")
	config = Editor.change(package, config, "text", "TextScaled", true)
	config = Editor.change(package, config, "text", "aspectRatio", 0.8)
	config = Editor.change(package, config, "text", "textBounds", { min = 12, max = 24 })
	config = Editor.change(
		package,
		config,
		"text",
		"sizeBounds",
		{ min = { type = "Vector2", value = { 20, 20 } }, max = { type = "Vector2", value = { 400, 500 } } }
	)
	local effective = Editor.prepare(package, config)
	local destination = Instance.new("Folder")
	table.insert(destinations, destination)
	local roots = Importer.apply(stage(effective), effective, destination, false)
	local text = roots[1].Canvas.Text
	local behavior = Instance.new("LocalScript")
	behavior.Name = "CustomBehavior"
	behavior.Parent = text
	assert(text.Text == "Edited in Studio" and text.TextScaled)
	assert(text:FindFirstChildOfClass("UITextSizeConstraint").MaxTextSize == 24)
	near(text:FindFirstChildOfClass("UIAspectRatioConstraint").AspectRatio, 0.8)
	assert(text.Size.X.Scale == 0.25 and text.Size.X.Offset == 0)
	config = Editor.change(package, config, "text", "Text", "Updated again")
	effective = Editor.prepare(package, config)
	local updated = Importer.apply(stage(effective), effective, destination, true)
	assert(updated[1].Canvas.Text == text and behavior.Parent == text and text.Text == "Updated again")
	effective = Editor.prepare(package, Editor.restore(package, nil))
	local reset = Importer.apply(stage(effective), effective, destination, true)
	assert(reset[1].Canvas.Text == text and text.Text == "Original" and not text.TextScaled)
	assert(not text:FindFirstChildOfClass("UIAspectRatioConstraint"))
	assert(behavior.Parent == text)
end)
for _, s in ipairs(stages) do
	pcall(Importer.destroy, s)
end
for _, destination in ipairs(destinations) do
	destination:Destroy()
end
widget:Destroy()
native:Destroy()
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Temporary widgets and detached folders; no place or settings changed",
}
