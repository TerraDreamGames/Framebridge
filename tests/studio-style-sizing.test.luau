assert(game.PlaceId == 0, "Run only in the separate blank QA place")
local gui = Instance.new("ScreenGui")
gui.Name = "FramebridgeStyleSizingQA"
gui.IgnoreGuiInset = true
gui.Parent = game:GetService("CoreGui")
local stages, hosts, controllers = {}, {}, {}
local passed, failures = 0, {}
local function test(name, body)
    local ok, why = xpcall(body, debug.traceback)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function near(value, expected)
    assert(math.abs(value - expected) < 1, tostring(value) .. " ~= " .. tostring(expected))
end
local function stage(pkg)
    local value = Importer.stage(pkg, {}, false, BehaviorSource)
    table.insert(stages, value)
    return value
end
local function display(name)
    local value = stage(cases[name])
    local host = Instance.new("Frame")
    host.Size = UDim2.fromOffset(400, 300)
    host.Parent = gui
    table.insert(hosts, host)
    value.byId.canvas.instance.Parent = host
    local controller = Runtime.mount(value.byId.canvas.instance)
    table.insert(controllers, controller)
    task.wait(0.15)
    return value, host
end
local function relative(value, id, axis)
    local object, panel = value.byId[id].instance, value.byId.panel.instance
    return (object.AbsolutePosition - panel.AbsolutePosition)[axis]
end
test("native border/corners/shadows keep authored dimensions and scale with the object", function()
    local value, host = display("scaledAppearance")
    for _, factor in ipairs({ 1, 0.5, 2 }) do
        host.Size = UDim2.fromOffset(400 * factor, 300 * factor)
        task.wait(0.12)
        local panel = value.byId.panel.instance
        local stroke = value.byId["panel/stroke"].instance
        assert(stroke.StrokeSizingMode == Enum.StrokeSizingMode.ScaledSize)
        near(stroke.Thickness * math.min(panel.AbsoluteSize.X, panel.AbsoluteSize.Y), 2 * factor)
        local corner = value.byId["panel/corner"].instance
        near(corner.TopRightRadius.Scale * math.min(panel.AbsoluteSize.X, panel.AbsoluteSize.Y), 8 * factor)
        local shadow = value.byId["panel/shadow"].instance
        near(shadow.BlurRadius.Scale * math.min(panel.AbsoluteSize.X, panel.AbsoluteSize.Y), 12 * factor)
        near(shadow.Offset.X.Scale * panel.AbsoluteSize.X, 3 * factor)
        near(shadow.Offset.Y.Scale * panel.AbsoluteSize.Y, -4 * factor)
        near(shadow.Spread.X.Scale * panel.AbsoluteSize.X, -2 * factor)
    end
    local text = value.byId["label/stroke"].instance
    assert(text.ApplyStrokeMode == Enum.ApplyStrokeMode.Contextual)
    near(text.Thickness * value.byId.label.instance.TextSize, 1)
end)
for _, name in ipairs({ "scaledList", "scaledManualScroll", "scaledAutoY", "scaledAutoX" }) do
    test(name .. " preserves source gaps and scales against the correct native basis", function()
        local value, host = display(name)
        local horizontal = name == "scaledAutoX"
        local axis = horizontal and "X" or "Y"
        for _, factor in ipairs({ 1, 0.5, 2 }) do
            host.Size = UDim2.fromOffset(400 * factor, 300 * factor)
            task.wait(0.12)
            local first, second = value.byId.first.instance, value.byId.second.instance
            near(relative(value, "first", axis), (name == "scaledAutoY" and 10 or horizontal and 20 or 10 * factor))
            near((second.AbsolutePosition - first.AbsolutePosition)[axis] - first.AbsoluteSize[axis], 8 * factor)
            local cross = horizontal and "Y" or "X"
            near(relative(value, "first", cross), (horizontal and 10 or 20) * factor)
        end
    end)
end
test("Hug height stays stable when rows are added and removed", function()
    local value, host = display("scaledHug")
    local panel = value.byId.panel.instance
    near(panel.AbsoluteSize.Y, 68)
    local third = value.byId.first.instance:Clone()
    third.LayoutOrder = 2
    third.Parent = panel
    task.wait(0.2)
    near(panel.AbsoluteSize.Y, 96)
    task.wait(0.2)
    near(panel.AbsoluteSize.Y, 96)
    host.Size = UDim2.fromOffset(800, 600)
    task.wait(0.15)
    near(panel.AbsoluteSize.Y, 96)
    near(relative(value, "first", "X"), 40)
    third:Destroy()
    task.wait(0.15)
    near(panel.AbsoluteSize.Y, 68)
end)
for _, name in ipairs({ "scaledAutoY", "scaledAutoX" }) do
    test(name .. " grows and remains scrollable without padding feedback", function()
        local value, host = display(name)
        local panel = value.byId.panel.instance
        local axis = name == "scaledAutoY" and "Y" or "X"
        for i = 2, 5 do
            local copy = value.byId.first.instance:Clone()
            copy.LayoutOrder = i
            copy.Parent = panel
        end
        task.wait(0.2)
        near(panel.AbsoluteCanvasSize[axis], axis == "Y" and 180 or 440)
        task.wait(0.2)
        near(panel.AbsoluteCanvasSize[axis], axis == "Y" and 180 or 440)
        panel.CanvasPosition = axis == "Y" and Vector2.new(0, 1000) or Vector2.new(1000, 0)
        task.wait(0.1)
        assert(panel.CanvasPosition[axis] > 0, "Expanded rows cannot scroll")
        host.Size = UDim2.fromOffset(800, 600)
        task.wait(0.2)
        near(panel.AbsoluteCanvasSize[axis], axis == "Y" and 220 or 480)
        assert(panel.AbsoluteCanvasSize[axis] > panel.AbsoluteSize[axis])
    end)
end
for _, name in ipairs({ "scaledFlexGrid", "scaledAutoGrid" }) do
    test(name .. " fits three flexible columns at source and resized widths", function()
        local value, host = display(name)
        for _, factor in ipairs({ 1, 0.5, 2 }) do
            host.Size = UDim2.fromOffset(400 * factor, 300 * factor)
            task.wait(0.15)
            local a, b, c = value.byId.cell0.instance, value.byId.cell1.instance, value.byId.cell2.instance
            local panel = value.byId.panel.instance
            local pad = name == "scaledAutoGrid" and 10 or 10 * factor
            near(relative(value, "cell0", "X"), pad)
            near(c.AbsolutePosition.Y, a.AbsolutePosition.Y)
            near((b.AbsolutePosition - a.AbsolutePosition).X - a.AbsoluteSize.X, 10 * factor)
            local edge, available = relative(value, "cell2", "X") + c.AbsoluteSize.X, panel.AbsoluteSize.X - pad
            assert(edge <= available + 0.1 and available - edge < 3, "Flex cells overflow or waste more than native whole-pixel rounding")
        end
    end)
end
test("fixed grids reflow while scaled gaps preserve their baseline", function()
    local value, host = display("scaledFixedGrid")
    near(value.byId.cell0.instance.AbsoluteSize.X, 80)
    near(relative(value, "cell1", "X") - relative(value, "cell0", "X"), 90)
    host.Size = UDim2.fromOffset(200, 150)
    task.wait(0.15)
    near(value.byId.cell0.instance.AbsoluteSize.X, 80)
    assert(value.byId.cell1.instance.AbsolutePosition.Y > value.byId.cell0.instance.AbsolutePosition.Y)
end)
test("stored Studio modifier overrides and attached scripts survive scale-aware reimport", function()
    local pkg = cases.scaledAppearance
    local config = Editor.change(pkg, {}, "panel/stroke", "Thickness", 3)
    config = Editor.change(pkg, config, "panel/stroke", "StrokeSizingMode", { type = "Enum", value = { "StrokeSizingMode", "FixedSize" } })
    local edited = Editor.prepare(pkg, config)
    local value = stage(edited)
    local destination = Instance.new("Folder")
    table.insert(hosts, destination)
    Importer.apply(value, edited, destination, false)
    local stroke = value.byId["panel/stroke"].instance
    assert(stroke.Thickness == 3 and stroke.StrokeSizingMode == Enum.StrokeSizingMode.FixedSize)
    stroke.Thickness = 4
    config = Editor.change(pkg, config, "panel/stroke", "Thickness", 4)
    local custom = Instance.new("LocalScript")
    custom.Name = "Application behavior"
    custom.Parent = value.byId.label.instance
    local changed = Importer.decode(game:GetService("HttpService"):JSONEncode(pkg))
    for _, child in ipairs(changed.roots[1].children[1].children[1].children) do
        if child.id == "panel/stroke" then child.properties.Thickness = 0.03 end
    end
    changed = Editor.prepare(changed, config)
    Importer.apply(stage(changed), changed, destination, true)
    assert(stroke.Parent and stroke.Thickness == 4 and stroke.StrokeSizingMode == Enum.StrokeSizingMode.FixedSize and custom.Parent == value.byId.label.instance)
end)
test("invalid stroke sizing enum values are rejected before native mutation", function()
    for _, wrong in ipairs({ { "AutomaticSize", "XY" }, { "StrokeSizingMode", "NoSuchMode" } }) do
        local pkg = Importer.decode(game:GetService("HttpService"):JSONEncode(cases.scaledAppearance))
        local panel = pkg.roots[1].children[1].children[1]
        for _, child in ipairs(panel.children) do
            if child.id == "panel/stroke" then child.properties.StrokeSizingMode = { type = "Enum", value = wrong } end
        end
        local ok, value = pcall(Importer.stage, pkg, {}, false, BehaviorSource)
        if ok then Importer.destroy(value) end
        assert(not ok, "Invalid enum reached the native importer")
    end
end)
for _, data in ipairs({ { "scaledPaddedParent", 990, 1120 }, { "scaledRemovedParentPadding", 1200, 1200 }, { "scaledNestedCanvas", 1740, 1520 } }) do
    test(data[1] .. " keeps source spacing with native parent overrides", function()
        local value = display(data[1])
        local panel = value.byId.panel.instance
        near(panel.AbsoluteCanvasSize.X, data[2])
        near(panel.AbsoluteCanvasSize.Y, data[3])
        near(relative(value, "first", "X"), 20)
        near(relative(value, "first", "Y"), 10)
        near((value.byId.second.instance.AbsolutePosition - value.byId.first.instance.AbsolutePosition).Y - value.byId.first.instance.AbsoluteSize.Y, 8)
    end)
end
test("decorated scrolling content grows with stable Hug spacing", function()
    local value, host = display("scaledDecoratedAutoY")
    local panel, holder = value.byId.panel.instance, value.byId["panel/content"].instance
    for i = 2, 5 do
        local copy = value.byId.first.instance:Clone()
        copy.LayoutOrder = i
        copy.Parent = holder
    end
    task.wait(0.2)
    near(holder.AbsoluteSize.Y, 180)
    assert(panel.AbsoluteCanvasSize.Y >= 180)
    host.Size = UDim2.fromOffset(800, 600)
    task.wait(0.2)
    near(holder.AbsoluteSize.Y, 180)
end)
test("automatic canvas survives zoom, scrolling, visibility and authored minimum edits", function()
    local value = display("scaledAutoY")
    local panel = value.byId.panel.instance
    local rows = {}
    for i = 2, 5 do
        local copy = value.byId.first.instance:Clone()
        copy.LayoutOrder = i
        copy.Parent = panel
        table.insert(rows, copy)
    end
    local zoom = Instance.new("UIScale")
    zoom.Scale = 0.5
    zoom.Parent = value.byId.canvas.instance
    task.wait(0.2)
    near(panel.AbsoluteCanvasSize.Y, 90)
    panel.CanvasPosition = Vector2.new(0, 1000)
    task.wait(0.12)
    near(panel.CanvasSize.Y.Offset, 180)
    for _, row in ipairs(rows) do row.Visible = false end
    task.wait(0.2)
    near(panel.CanvasSize.Y.Offset, 68)
    for _, row in ipairs(rows) do row:Destroy() end
    panel.CanvasSize = UDim2.fromOffset(0, 300)
    task.wait(0.2)
    near(panel.CanvasSize.Y.Offset, 300)
    panel.AutomaticCanvasSize = Enum.AutomaticSize.None
    task.wait(0.12)
    near(panel.CanvasSize.Y.Offset, 300)
    controllers[#controllers].destroy()
    assert(panel.CanvasSize == UDim2.fromOffset(0, 300))
end)
test("nested automatic canvas follows its parent's padded canvas minimum", function()
    local value = display("scaledAutoY")
    local parent = Instance.new("ScrollingFrame")
    parent.Size = UDim2.fromOffset(200, 100)
    parent.CanvasSize = UDim2.fromOffset(600, 400)
    parent.Parent = value.byId.canvas.instance
    local pad = Instance.new("UIPadding")
    pad.PaddingTop = UDim.new(0.1, 0)
    pad.PaddingBottom = UDim.new(0.1, 0)
    pad.Parent = parent
    local panel = value.byId.panel.instance
    panel.Parent = parent
    panel.CanvasSize = UDim2.new(0, 0, 0.5, 0)
    task.wait(0.2)
    near(panel.CanvasSize.Y.Offset, 160)
    parent.CanvasSize = UDim2.fromOffset(600, 600)
    task.wait(0.2)
    near(panel.CanvasSize.Y.Offset, 240)
    pad.PaddingBottom = UDim.new(0, 0)
    task.wait(0.2)
    near(panel.CanvasSize.Y.Offset, 270)
end)
test("automatic grid grows and shrinks without cutting off its last row", function()
    local value = display("scaledAutoGrid")
    local panel = value.byId.panel.instance
    local copies = {}
    for i = 6, 17 do
        local copy = value.byId.cell0.instance:Clone()
        copy.LayoutOrder = i
        copy.Parent = panel
        table.insert(copies, copy)
    end
    task.wait(0.25)
    local last = copies[#copies]
    near(panel.CanvasSize.Y.Offset, last.AbsolutePosition.Y - panel.AbsolutePosition.Y + last.AbsoluteSize.Y + 10)
    for _, row in ipairs(copies) do row:Destroy() end
    task.wait(0.25)
    assert(panel.AbsoluteCanvasSize.Y < 300)
end)
test("generated layout controllers release their listeners and canvas corrections", function()
    local value = display("scaledAutoY")
    local canvas = value.byId.panel.instance
    local controller = controllers[#controllers]
    assert(controller.connectionCount() > 0)
    controller.destroy()
    assert(controller.connectionCount() == 0)
    assert(canvas.CanvasSize == UDim2.new())
end)
for _, controller in ipairs(controllers) do controller.destroy() end
for _, value in ipairs(stages) do Importer.destroy(value) end
for _, host in ipairs(hosts) do host:Destroy() end
gui:Destroy()
return { passed = passed, failed = #failures, failures = failures, scope = "Blank QA CoreGui; detached import/update; no game assets" }
