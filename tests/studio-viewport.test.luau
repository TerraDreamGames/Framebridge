-- Native Studio only. Everything stays in detached folders; no place writes.
local Http = game:GetService("HttpService")
local passed, failures = 0, {}
local function test(name, body)
    local ok, problem = pcall(body)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(problem)) end
end
local function package() return Importer.decode(fixture) end
local function near(actual, expected) assert(math.abs(actual - expected) < 0.000001, tostring(actual) .. " ~= " .. tostring(expected)) end
local function prepared(mode) return Editor.prepare(package(), { mode = mode, layers = {} }) end
test("editable viewport supports scale and pixels without touching lighting", function()
    for _, mode in ipairs({ "scale", "offset", "source" }) do
        local p = prepared(mode)
        local node = Editor.find(p, "viewport")
        assert(Editor.isGui(node) and Editor.isEditable(node))
        assert(node.properties.LightDirection.type == "Vector3" and node.properties.LightDirection.value[2] == -2)
        if mode == "scale" then
            near(node.properties.Size.value[1], 0.4); near(node.properties.Size.value[3], 0.4)
            assert(node.properties.Size.value[2] == 0 and node.properties.Size.value[4] == 0)
        else assert(node.properties.Size.value[2] == 320 and node.properties.Size.value[4] == 240) end
    end
end)
test("native import applies lighting, tint, opacity and editable overlays", function()
    local stage = Importer.stage(prepared("scale"), {}, false)
    local ok, why = pcall(function()
        local v = stage.byId.viewport.instance
        assert(v:IsA("ViewportFrame") and v.CurrentCamera == nil)
        assert(v.LightDirection == Vector3.new(1, -2, -3))
        near(v.Ambient.G, 0.3); near(v.LightColor.B, 0.5); near(v.ImageColor3.R, 0.8); near(v.ImageTransparency, 0.15)
        assert(stage.byId["item-name"].instance.Parent == v and stage.byId["item-name"].instance:IsA("TextLabel"))
        assert(stage.byId["rarity-icon"].instance.Image == "rbxassetid://123456789")
        assert(v:FindFirstChildOfClass("UICorner"))
    end)
    Importer.destroy(stage)
    assert(ok, why)
end)
test("sizing tools add aspect and size constraints to viewport", function()
    local p = package()
    local config = Editor.change(p, {}, "viewport", "aspectRatio", 4/3)
    config = Editor.change(p, config, "viewport", "sizeBounds", { min = { type = "Vector2", value = { 160, 120 } }, max = { type = "Vector2", value = { 640, 480 } } })
    local stage = Importer.stage(Editor.prepare(p, config), {}, false)
    local v = stage.byId.viewport.instance
    local ok, why = pcall(function()
        near(v:FindFirstChildOfClass("UIAspectRatioConstraint").AspectRatio, 4/3)
        assert(v:FindFirstChildOfClass("UISizeConstraint").MinSize == Vector2.new(160,120))
    end)
    Importer.destroy(stage); assert(ok, why)
end)
test("repeated updates preserve scene, camera, script, connection and UI identity", function()
    local host = Instance.new("Folder")
    local stage
    local ok, why = pcall(function()
        local p = prepared("scale")
        stage = Importer.stage(p, {}, false)
        Importer.apply(stage, p, host, false)
        local v = stage.byId.viewport.instance
        local label = stage.byId["item-name"].instance
        local world = Instance.new("WorldModel"); world.Parent = v
        local part = Instance.new("Part"); part.Anchored = true; part.Parent = world
        local camera = Instance.new("Camera"); camera.CFrame = CFrame.new(0,0,8); camera.Parent = v; v.CurrentCamera = camera
        local logic = Instance.new("LocalScript"); logic.Name = "UserLogic"; logic.Parent = v
        local changes = 0
        local connection = v:GetPropertyChangedSignal("ImageTransparency"):Connect(function() changes += 1 end)
        for _, opacity in ipairs({0.25,0.5}) do
            local nextPackage = prepared("scale")
            local nextNode = Editor.find(nextPackage, "viewport")
            nextNode.properties.ImageTransparency = opacity
            nextNode.properties.LightDirection = { type = "Vector3", value = {-2,-1,1} }
            Editor.find(nextPackage, "item-name").properties.Text = "Updated backpack"
            stage = Importer.stage(nextPackage, {}, false)
            local _, stats = Importer.apply(stage, nextPackage, host, true)
            assert(stats.created == 0 and stats.updated > 0)
            assert(v.Parent and v.CurrentCamera == camera and camera.Parent == v)
            assert(world.Parent == v and part.Parent == world and logic.Parent == v)
            assert(label.Parent == v and label.Text == "Updated backpack")
            assert(v.LightDirection == Vector3.new(-2,-1,1))
            near(v.ImageTransparency, opacity)
        end
        local resetPackage = prepared("scale")
        local resetNode = Editor.find(resetPackage, "viewport")
        resetNode.properties.LightDirection = nil
        resetNode.properties.ImageTransparency = nil
        stage = Importer.stage(resetPackage, {}, false)
        Importer.apply(stage, resetPackage, host, true)
        assert(v.LightDirection == Vector3.new(-1,-1,-1) and v.ImageTransparency == 0)
        assert(v.CurrentCamera == camera and world.Parent == v and logic.Parent == v)
        task.wait()
        assert(connection.Connected and changes > 0); connection:Disconnect()
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy(); assert(ok, why)
end)
test("class changes and removing a viewport with custom scene fail before mutation", function()
    local host = Instance.new("Folder")
    local stage, nextStage
    local ok, why = pcall(function()
        local p = package(); stage = Importer.stage(p, {}, false); Importer.apply(stage, p, host, false)
        local v = stage.byId.viewport.instance
        local model = Instance.new("WorldModel"); model.Parent = v
        local changed = package(); local node = Editor.find(changed, "viewport")
        node.className = "Frame"
        for _, key in ipairs({"Ambient","LightColor","LightDirection","ImageColor3","ImageTransparency"}) do node.properties[key] = nil end
        nextStage = Importer.stage(changed, {}, false)
        assert(not pcall(Importer.apply, nextStage, changed, host, true))
        assert(v.Parent ~= nil and model.Parent == v)
        Importer.destroy(nextStage); nextStage = nil
        local removed = package(); Editor.find(removed,"inventory").children = {}
        nextStage = Importer.stage(removed, {}, false)
        assert(not pcall(Importer.apply, nextStage, removed, host, true))
        assert(v.Parent ~= nil and model.Parent == v)
    end)
    if nextStage then Importer.destroy(nextStage) end
    if stage then Importer.destroy(stage) end
    host:Destroy(); assert(ok, why)
end)
for _, value in ipairs({
    { type = "Vector3", value = {1,2} }, { type = "Vector3", value = {1,2,3,4} },
    { type = "Vector3", value = {1,"2",3} }, { type = "Vector3", value = {1,1e12,3} },
}) do
    test("malformed direction " .. Http:JSONEncode(value) .. " leaves no imported root", function()
        local p = package(); Editor.find(p,"viewport").properties.LightDirection = value
        local ok, stage = pcall(Importer.stage, p, {}, false)
        if ok then Importer.destroy(stage) end
        assert(not ok)
    end)
end
for _, property in ipairs({"CurrentCamera","Image"}) do
    test("rejects unsupported viewport property " .. property, function()
        local p = package(); Editor.find(p,"viewport").properties[property] = "arbitrary"
        assert(not pcall(Importer.decode, Http:JSONEncode(p)))
    end)
end
return { passed = passed, failed = #failures, failures = failures }
