-- Real engine setters, detached import/update, and original source identity.
local HttpService = game:GetService("HttpService")
local passed, failures, stages = {}, {}, {}
local destination = Instance.new("Folder")
local function test(name, body)
    local ok, why = pcall(body)
    if ok then table.insert(passed, name) else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function stage(package)
    local result = Importer.stage(package, {}, false)
    table.insert(stages, result)
    return result
end
test("native shadows, individual corners, stacked fills and borders stage without images", function()
    local package = Importer.decode(fixture)
    assert(#package.assets == 0)
    local result = stage(package)
    local panel = result.byId["visual-panel"].instance
    local corners = panel:FindFirstChildOfClass("UICorner")
    assert(corners.TopLeftRadius == UDim.new(0,0))
    assert(corners.TopRightRadius == UDim.new(0,12))
    assert(corners.BottomRightRadius == UDim.new(0,24))
    assert(corners.BottomLeftRadius == UDim.new(0,6))
    local shadow = panel:FindFirstChildOfClass("UIShadow")
    assert(shadow and shadow.BlurRadius == UDim.new(0,12))
    assert(shadow.Offset == UDim2.fromOffset(3,4))
    assert(shadow.Spread == UDim2.fromOffset(2,2))
    assert(shadow.Transparency == 0.75)
    local strokes = 0
    for _, child in ipairs(panel:GetChildren()) do if child:IsA("UIStroke") then strokes += 1 end end
    assert(strokes == 2)
    local content = result.byId["visual-panel/content"].instance
    assert(content:FindFirstChildOfClass("UIListLayout"))
    assert(result.byId["visual-card"].instance.Parent == content)
    assert(result.byId["visual-panel/fill:0"].instance.Parent == panel)
end)
test("reimport edits native styling and retains source/script references", function()
    local package = Importer.decode(fixture)
    local first = stage(package)
    Importer.apply(first, package, destination, false)
    local panel, card = first.byId["visual-panel"].instance, first.byId["visual-card"].instance
    local script = Instance.new("LocalScript")
    script.Name = "Custom behavior"; script.Parent = card
    local changed = Importer.decode(fixture)
    local corner = changed.roots[1].children[1].children
    for _, n in ipairs(corner) do
        if n.className == "UICorner" then n.properties.TopLeftRadius = {type="UDim",value={0,16}} end
        if n.className == "UIShadow" then n.properties.Transparency = 0.5 end
    end
    Importer.apply(stage(changed), changed, destination, true)
    assert(panel == destination:GetChildren()[1]:GetChildren()[1])
    assert(card.Parent and script.Parent == card)
    assert(panel:FindFirstChildOfClass("UICorner").TopLeftRadius == UDim.new(0,16))
    assert(panel:FindFirstChildOfClass("UIShadow").Transparency == 0.5)
end)
test("global corner radius is applied before explicit per-corner values", function()
    local package = Importer.decode(fixture)
    for _, n in ipairs(package.roots[1].children[1].children) do
        if n.className == "UICorner" then n.properties.CornerRadius = {type="UDim",value={0,8}} end
    end
    local corners = stage(package).byId["visual-panel/corner"].instance
    assert(corners.TopLeftRadius == UDim.new(0,0) and corners.TopRightRadius == UDim.new(0,12))
end)
for _, result in ipairs(stages) do Importer.destroy(result) end
destination:Destroy()
return {passed=#passed,failed=#failures,failures=failures,tests=passed,scope="Detached instances; no place content changed"}
