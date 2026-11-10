-- Pure package/configuration tests; also runnable under Lune without Roblox services.
local passed, failures, tests = 0, {}, {}
local function test(name, body)
	local ok, why = pcall(body)
	if ok then
		passed += 1
		table.insert(tests, name)
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local function u(a, b, c, d)
	return { type = "UDim2", value = { a, b, c, d } }
end
local function node(id, size, position, children)
	return {
		id = id,
		name = id,
		className = "Frame",
		properties = {
			Size = size,
			Position = position or u(0, 0, 0, 0),
			AnchorPoint = { type = "Vector2", value = {
				0.5,
				0.5,
			} },
		},
		children = children or {},
	}
end
local function fixture()
	return {
		format = "framebridge",
		version = 1,
		sourceId = "responsive-test",
		name = "Responsive",
		assets = {},
		issues = {},
		roots = {
			{
				id = "screen",
				name = "Screen",
				className = "ScreenGui",
				referenceSize = { 1000, 800 },
				properties = {},
				children = {
					node("canvas", u(1, 0, 1, 0), nil, {
						node("panel", u(0.2, 200, 0.25, 200), u(0.5, -100, 0.5, -100), {
							node("child", u(0, 80, 0, 100), u(0, 40, 0, 50)),
						}),
						node("zero", u(0, 0, 0, 0), nil, { node("inside-zero", u(0, 20, 0, 20)) }),
					}),
				},
			},
		},
	}
end
local function near(value, target)
	assert(math.abs(value - target) < 0.000001, tostring(value) .. " ~= " .. target)
end
local function find(package, id)
	return Editor.find(package, id)
end
test("scale is the default, mixed geometry retains authored dimensions", function()
	local p = fixture()
	local result = Editor.prepare(p, Editor.restore(p, nil))
	local panel = find(result, "panel")
	near(panel.properties.Size.value[1], 0.4)
	near(panel.properties.Size.value[3], 0.5)
	near(panel.properties.Position.value[1], 0.4)
	near(panel.properties.Position.value[3], 0.375)
	assert(panel.properties.Size.value[2] == 0 and panel.properties.Size.value[4] == 0)
	assert(panel.properties.AnchorPoint.value[1] == 0.5)
	assert(find(p, "panel").properties.Size.value[2] == 200, "Source delivery mutated")
end)
test("nested percentages use the authored parent size", function()
	local p = fixture()
	local result = Editor.prepare(p, { mode = "scale", layers = {} })
	local child = find(result, "child")
	near(child.properties.Size.value[1], 0.2)
	near(child.properties.Size.value[3], 0.25)
	near(child.properties.Position.value[1], 0.1)
	near(child.properties.Position.value[3], 0.125)
end)
test("padded parents and grid cells use their available content bounds", function()
	local p = fixture()
	local panel = find(p, "panel")
	table.insert(panel.children, {
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
	})
	table.insert(
		panel.children,
		{
			id = "grid",
			name = "Grid",
			className = "UIGridLayout",
			properties = { CellSize = u(0, 80, 0, 100) },
			children = {},
		}
	)
	local result = Editor.prepare(p, {})
	near(find(result, "child").properties.Size.value[1], 0.25)
	near(find(result, "child").properties.Size.value[3], 100 / 360)
	near(find(result, "grid").properties.CellSize.value[1], 0.25)
	local bounds = Editor.bounds(p, "child")
	assert(bounds[1] == 320 and bounds[2] == 360)
end)
test("source constraints and grid cells determine nested parent bounds", function()
	local p = fixture()
	local panel = find(p, "panel")
	table.insert(
		panel.children,
		{ id = "aspect", name = "Aspect", className = "UIAspectRatioConstraint", properties = { AspectRatio = 2 }, children = {} }
	)
	local result = Editor.prepare(p, {})
	near(find(result, "child").properties.Size.value[3], 0.5)
	panel.children[#panel.children] = nil
	table.insert(
		panel.children,
		{ id = "grid", name = "Grid", className = "UIGridLayout", properties = { CellSize = u(0, 80, 0, 100) }, children = {} }
	)
	table.insert(find(p, "child").children, node("grandchild", u(0, 20, 0, 30)))
	result = Editor.prepare(p, {})
	near(find(result, "grandchild").properties.Size.value[1], 0.25)
	near(find(result, "grandchild").properties.Size.value[3], 0.3)
end)
test("automatic scroll axes retain stable pixel content in Scale mode", function()
	for _, axis in ipairs({ "X", "Y", "XY", "None" }) do
		local p = fixture()
		local panel = find(p, "panel")
		panel.className = "ScrollingFrame"
		panel.properties.AutomaticCanvasSize = { type = "Enum", value = { "AutomaticSize", axis } }
		panel.children[#panel.children + 1] = { id = "grid", name = "Grid", className = "UIGridLayout", properties = { CellSize = u(0, 80, 0, 100), CellPadding = u(0, 8, 0, 10) }, children = {} }
		local result = Editor.prepare(p, {})
		local size = find(result, "child").properties.Size.value
		local cell = find(result, "grid").properties.CellSize.value
		local gap = find(result, "grid").properties.CellPadding.value
		local x, y = axis == "X" or axis == "XY", axis == "Y" or axis == "XY"
		near(size[1], x and 0 or 0.2); near(size[2], x and 80 or 0)
		near(size[3], y and 0 or 0.25); near(size[4], y and 100 or 0)
		near(cell[2], x and 80 or 0); near(cell[4], y and 100 or 0)
		near(gap[2], x and 8 or 0); near(gap[4], y and 10 or 0)
		assert(find(p, "child").properties.Size.value[4] == 100, "Source changed")
	end
end)
test("pixels resolve existing scale, source mode leaves geometry intact", function()
	local p = fixture()
	local pixels = Editor.prepare(p, { mode = "offset", layers = {} })
	assert(find(pixels, "panel").properties.Size.value[2] == 400)
	assert(find(pixels, "canvas").properties.Size.value[2] == 1000)
	local source = Editor.prepare(p, { mode = "source", layers = {} })
	assert(find(source, "panel").properties.Size.value[2] == 200)
	assert(find(source, "canvas").properties.Size.value[1] == 1)
end)
test("zero parent sizes are reported without infinities", function()
	local p = fixture()
	local result, notices = Editor.prepare(p, { mode = "scale", layers = {} })
	assert(#notices == 1)
	assert(find(result, "inside-zero").properties.Size.value[2] == 20)
end)
test("per-layer units, explicit geometry and reset survive config restoration", function()
	local p = fixture()
	local config = Editor.restore(p, nil)
	config = Editor.change(p, config, "panel", "sizeMode", "offset")
	config = Editor.change(p, config, "child", "Size", u(0.3, 12, 0.4, 8))
	local result = Editor.prepare(p, Editor.restore(p, config))
	assert(find(result, "panel").properties.Size.value[2] == 400)
	assert(find(result, "child").properties.Size.value[2] == 12)
	config = Editor.change(p, config, "child", "reset", true)
	assert(not config.layers.child)
	local reset = Editor.prepare(p, config)
	near(find(reset, "child").properties.Size.value[1], 0.2)
end)
test("layouts own child geometry; grid cells are editable", function()
	local p = fixture()
	local panel = find(p, "panel")
	table.insert(
		panel.children,
		{
			id = "grid",
			name = "Grid",
			className = "UIGridLayout",
			properties = { CellSize = u(0, 80, 0, 80) },
			children = {},
		}
	)
	local result = Editor.prepare(p, { mode = "scale", layers = {} })
	assert(find(result, "child").properties.Position.value[2] == 40)
	assert(not pcall(Editor.change, p, {}, "child", "Position", u(0, 0, 0, 0)))
	assert(not pcall(Editor.change, p, {}, "child", "Size", u(1, 0, 1, 0)))
	local config = Editor.change(p, {}, "grid", "CellSize", u(0.25, 0, 0.25, 0))
	result = Editor.prepare(p, config)
	assert(find(result, "grid").properties.CellSize.value[1] == 0.25)
end)
test("aspect, size and text constraints have stable IDs and update source helpers", function()
	local p = fixture()
	local child = find(p, "child")
	child.className = "TextLabel"
	table.insert(
		child.children,
		{
			id = "existing-aspect",
			name = "Aspect",
			className = "UIAspectRatioConstraint",
			properties = { AspectRatio = 2 },
			children = {},
		}
	)
	local config = Editor.change(p, {}, "child", "aspectRatio", 1)
	config = Editor.change(
		p,
		config,
		"child",
		"sizeBounds",
		{ min = { type = "Vector2", value = { 20, 20 } }, max = { type = "Vector2", value = { 400, 400 } } }
	)
	config = Editor.change(p, config, "child", "TextScaled", true)
	config = Editor.change(p, config, "child", "textBounds", { min = 12, max = 24 })
	local result = Editor.prepare(p, config)
	child = find(result, "child")
	assert(#child.children == 3 and find(result, "existing-aspect").properties.AspectRatio == 1)
	assert(child.properties.TextScaled)
	assert(find(result, "child/studio-text").properties.MaxTextSize == 24)
	assert(find(Editor.prepare(p, config), "child/studio-text"))
	assert(not pcall(Editor.change, p, config, "child", "textBounds", { min = 24, max = 12 }))
end)
test("saved settings discard removed nodes and unsupported properties", function()
	local p = fixture()
	local config = Editor.restore(p, {
		mode = "evil",
		layers = {
			removed = { properties = { Text = "old" } },
			child = { properties = { Source = "code", Size = u(0 / 0, 1, 0, 1), Visible = false } },
		},
	})
	assert(config.mode == "scale" and not config.layers.removed)
	assert(not config.layers.child.properties.Source and not config.layers.child.properties.Size)
	assert(config.layers.child.properties.Visible == false)
	assert(not pcall(Editor.change, p, config, "child", "BackgroundTransparency", 2))
end)
test("legacy packages infer an explicit canvas; missing bounds remain source", function()
	local p = fixture()
	p.roots[1].referenceSize = nil
	find(p, "canvas").properties.Size = u(0, 1000, 0, 800)
	local result = Editor.prepare(p, {})
	assert(result.roots[1].referenceSize[1] == 1000)
	p.roots[1].children = { node("unknown", u(1, 0, 1, 0)) }
	local result, notices = Editor.prepare(p, {})
	assert(#notices == 1 and find(result, "unknown").properties.Size.value[1] == 1)
end)
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	tests = tests,
	scope = "Pure responsive packages; no place or settings changed",
}
