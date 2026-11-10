assert(game.PlaceId == 0, "Blank QA only")
local gui = game:GetService("Players").LocalPlayer.PlayerGui:FindFirstChild("FramebridgeDevicePreviewQA")
assert(gui and gui:GetAttribute("FramebridgeDevicePreviewQA"), "Missing owned device QA")
local function id(key)
    for _, instance in ipairs(gui:GetDescendants()) do
        if instance:GetAttribute("FramebridgeId") == key then return instance end
    end
    error("Missing exported instance: " .. key)
end
local canvas, inventory = id("device-inventory"), id("inventory")
assert(inventory:IsA("ScrollingFrame") and inventory.AutomaticCanvasSize == Enum.AutomaticSize.Y)
assert(inventory:FindFirstChildOfClass("UIGridLayout") and inventory:FindFirstChildOfClass("UIPadding"))
local original = canvas.Size
local function near(actual, expected, name)
    assert(math.abs(actual - expected) < 0.2, name .. ": expected " .. expected .. ", received " .. actual)
end
local reports = {}
local cases = {
    {name="Phone", width=390, height=844, columns=2},
    {name="Tablet", width=1024, height=768, columns=6},
    {name="Desktop", width=1920, height=1080, columns=12},
    {name="Phone landscape", width=844, height=390, columns=5},
    {name="Custom", width=240, height=400, columns=1},
}
local ok, why = pcall(function()
    for _, case in ipairs(cases) do
        canvas.Size = UDim2.fromOffset(case.width, case.height)
        for _=1,4 do game:GetService("RunService").RenderStepped:Wait() end
        near(inventory.AbsoluteSize.X, case.width - 48, case.name .. " viewport width")
        near(inventory.AbsoluteSize.Y, case.height - 120, case.name .. " viewport height")
        for index=0,11 do
            local item = id("card-" .. index)
            local relative = item.AbsolutePosition - inventory.AbsolutePosition
            near(relative.X, 12 + (index % case.columns) * 144, case.name .. " item x " .. index)
            near(relative.Y, 12 + math.floor(index / case.columns) * 128, case.name .. " item y " .. index)
            near(item.AbsoluteSize.X, 132, case.name .. " card width")
            near(item.AbsoluteSize.Y, 116, case.name .. " card height")
        end
        if case.columns == 1 then
            assert(inventory.AbsoluteCanvasSize.Y > inventory.AbsoluteSize.Y, "Custom canvas did not overflow")
            inventory.CanvasPosition = Vector2.new(0, 100000)
            for _=1,3 do game:GetService("RunService").RenderStepped:Wait() end
            local last = id("card-11")
            assert(last.AbsolutePosition.Y + last.AbsoluteSize.Y <= inventory.AbsolutePosition.Y + inventory.AbsoluteSize.Y + 0.2, "Last inventory item cannot be reached")
            inventory.CanvasPosition = Vector2.zero
        end
        table.insert(reports, {name=case.name, width=inventory.AbsoluteSize.X, height=inventory.AbsoluteSize.Y, columns=case.columns, canvasHeight=inventory.AbsoluteCanvasSize.Y})
    end
end)
canvas.Size = original
assert(ok, why)
return {passed=#reports, cases=reports, originalSizeRestored=canvas.Size == original}
