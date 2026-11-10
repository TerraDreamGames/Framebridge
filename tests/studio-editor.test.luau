-- All instances remain detached from the DataModel.
local HttpService = game:GetService("HttpService")
local stages, destinations = {}, {}
local passed, failures = {}, {}
local function test(name, body)
    local ok, err = pcall(body)
    if ok then table.insert(passed, name) else table.insert(failures, name .. ": " .. tostring(err)) end
end
local function stage(package)
    local value = Importer.stage(package, {}, false)
    table.insert(stages, value)
    return value
end
test("every inspector class and property default stages in Roblox", function()
    local s = stage(Importer.decode(fixture))
    assert(#s.entries > 60)
    assert(s.roots[1].Parent == nil)
    assert(s.byId["editor:ScrollingFrame"].instance.AutomaticCanvasSize == Enum.AutomaticSize.Y)
    assert(s.byId["editor:TextBox"].instance.TextEditable)
    assert(s.byId["editor:TextLabel/UITextSizeConstraint"].instance.MaxTextSize == 36)
    assert(s.byId["editor:Frame/UIGridLayout"].instance.CellSize == UDim2.fromOffset(80, 80))
end)
test("configured scrolling, input, button and constraints survive import and update", function()
    local p = Importer.decode(fixture)
    local frame, input, button
    for _, n in ipairs(p.roots[1].children) do
        if n.className == "ScrollingFrame" then frame = n end
        if n.className == "TextBox" then input = n end
        if n.className == "TextButton" then button = n end
    end
    frame.properties.ScrollBarThickness = 12
    frame.properties.CanvasSize = {type="UDim2", value={0, 400, 0, 1200}}
    input.properties.PlaceholderText = "Search inventory"
    input.properties.MultiLine = true
    input.properties.TextScaled = true
    button.properties.AutoButtonColor = false
    for _, n in ipairs(input.children) do
        if n.className == "UITextSizeConstraint" then n.properties.MinTextSize = 12; n.properties.MaxTextSize = 24 end
    end
    local destination = Instance.new("Folder"); table.insert(destinations, destination)
    local roots = Importer.apply(stage(p), p, destination, false)
    local ui = roots[1]:FindFirstChild("TextBox")
    assert(ui.PlaceholderText == "Search inventory" and ui.MultiLine and ui.TextScaled)
    assert(ui:FindFirstChildOfClass("UITextSizeConstraint").MaxTextSize == 24)
    assert(roots[1]:FindFirstChild("ScrollingFrame").CanvasSize.Y.Offset == 1200)
    assert(not roots[1]:FindFirstChild("TextButton").AutoButtonColor)
    input.properties.Text = "Updated input"
    local updated = Importer.apply(stage(p), p, destination, true)
    assert(updated[1]:FindFirstChild("TextBox") == ui and ui.Text == "Updated input")
end)
for _, s in ipairs(stages) do pcall(Importer.destroy, s) end
for _, d in ipairs(destinations) do d:Destroy() end
return {passed=#passed, failed=#failures, failures=failures, tests=passed, scope="Detached instances only"}
