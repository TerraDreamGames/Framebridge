// Trusted product code: native layout gaps stay editable; transfer data contains no script text.
export const LAYOUT_CANVAS_RUNTIME = String.raw`local LayoutCanvas = {}
local function disconnect(list)
    for _, connection in ipairs(list) do connection:Disconnect() end
    table.clear(list)
end
local function zoom(instance)
    local result = 1
    while instance do
        if instance:IsA("GuiObject") then
            local scale = instance:FindFirstChildOfClass("UIScale")
            if scale then result *= scale.Scale end
        end
        instance = instance.Parent
    end
    return result
end
local function axis(value, key)
    return value == Enum.AutomaticSize.XY or value == (key == "X" and Enum.AutomaticSize.X or Enum.AutomaticSize.Y)
end
local function pixels(value, size) return value.Scale * size + value.Offset end
local function paddingSize(frame)
    local size = frame.AbsoluteSize / zoom(frame)
    if not frame:IsA("ScrollingFrame") then return size end
    local parent = frame.Parent
    local parentSize = parent and parent:IsA("GuiBase2d") and parent.AbsoluteSize / zoom(parent) or size
    local padding = parent and not parent:IsA("ScrollingFrame") and parent:FindFirstChildOfClass("UIPadding")
    if padding then parentSize = Vector2.new(
        math.max(0, parentSize.X - pixels(padding.PaddingLeft, parentSize.X) - pixels(padding.PaddingRight, parentSize.X)),
        math.max(0, parentSize.Y - pixels(padding.PaddingTop, parentSize.Y) - pixels(padding.PaddingBottom, parentSize.Y))
    ) end
    return Vector2.new(math.max(size.X, pixels(frame.CanvasSize.X, parentSize.X)), math.max(size.Y, pixels(frame.CanvasSize.Y, parentSize.Y)))
end
function LayoutCanvas.mount(root)
    local connections, live, entries = {}, {}, {}
    local destroyed, queued, rebuildQueued = false, false, false
    local function restore(frame, entry)
        if frame.Parent and entry.last and frame.CanvasSize == entry.last then frame.CanvasSize = entry.original end
    end
    local function update()
        if destroyed then return end
        for frame, entry in pairs(entries) do
            local layout = frame:FindFirstChildOfClass("UIListLayout") or frame:FindFirstChildOfClass("UIGridLayout")
            local scale = zoom(frame)
            if frame.Parent and layout and scale > 0 and scale < math.huge then
                local size = paddingSize(frame)
                local padding = frame:FindFirstChildOfClass("UIPadding")
                local right = padding and pixels(padding.PaddingRight, size.X) or 0
                local bottom = padding and pixels(padding.PaddingBottom, size.Y) or 0
                local extent = Vector2.zero
                for _, child in ipairs(frame:GetChildren()) do
                    if child:IsA("GuiObject") and child.Visible then
                        local edge = (child.AbsolutePosition - frame.AbsolutePosition + child.AbsoluteSize + frame.CanvasPosition) / scale
                        extent = Vector2.new(math.max(extent.X, edge.X), math.max(extent.Y, edge.Y))
                    end
                end
                local parent = frame.Parent
                local parentScale = zoom(parent)
                local parentSize = parent:IsA("ScrollingFrame") and parent.AbsoluteCanvasSize / parentScale or parent:IsA("GuiBase2d") and parent.AbsoluteSize / parentScale or frame.AbsoluteSize / scale
                local parentPadding = parent:FindFirstChildOfClass("UIPadding")
                if parentPadding then
                    local paddingBounds = paddingSize(parent)
                    parentSize = Vector2.new(
                        math.max(0, parentSize.X - pixels(parentPadding.PaddingLeft, paddingBounds.X) - pixels(parentPadding.PaddingRight, paddingBounds.X)),
                        math.max(0, parentSize.Y - pixels(parentPadding.PaddingTop, paddingBounds.Y) - pixels(parentPadding.PaddingBottom, paddingBounds.Y))
                    )
                end
                local automatic, original = frame.AutomaticCanvasSize, entry.original
                local function dimension(key, endPadding)
                    local authored = pixels(original[key], parentSize[key])
                    local measured = math.clamp(math.ceil(extent[key] + endPadding - 0.001), 0, 1000000)
                    return axis(automatic, key) and UDim.new(0, math.max(math.ceil(authored), measured)) or original[key]
                end
                local value = UDim2.new(dimension("X", right), dimension("Y", bottom))
                if frame.CanvasSize ~= value then
                    entry.last = value
                    frame.CanvasSize = value
                end
            end
        end
    end
    local function schedule()
        if destroyed or queued then return end
        queued = true
        task.defer(function() queued = false; update() end)
    end
    local function watch(signal, callback, list)
        table.insert(list or live, signal:Connect(function(...) if not destroyed then callback(...) end end))
    end
    local rebuild
    local function requestRebuild()
        if destroyed or rebuildQueued then return end
        rebuildQueued = true
        task.defer(function() rebuildQueued = false; if not destroyed then rebuild() end end)
    end
    rebuild = function()
        disconnect(live)
        local retained = {}
        local descendants = root:GetDescendants()
        if root:IsA("ScrollingFrame") then table.insert(descendants, root) end
        if #descendants > 15000 then
            for frame, entry in pairs(entries) do restore(frame, entry) end
            table.clear(entries)
            return
        end
        for _, frame in ipairs(descendants) do
            if frame:IsA("ScrollingFrame") and frame:GetAttribute("FramebridgeLayoutCanvas") == "true" and frame:GetAttribute("FramebridgeSource") == root:GetAttribute("FramebridgeSource") then
                local entry = entries[frame] or { original = frame.CanvasSize }
                retained[frame] = entry
                watch(frame:GetPropertyChangedSignal("CanvasSize"), function()
                    if frame.CanvasSize ~= entry.last then entry.original = frame.CanvasSize; schedule() end
                end)
                for _, property in ipairs({ "AbsoluteSize", "AutomaticCanvasSize", "CanvasPosition" }) do
                    watch(frame:GetPropertyChangedSignal(property), schedule)
                end
                watch(frame:GetAttributeChangedSignal("FramebridgeLayoutCanvas"), requestRebuild)
                local parent = frame.Parent
                if parent and parent:IsA("GuiObject") then
                    watch(parent:GetPropertyChangedSignal(parent:IsA("ScrollingFrame") and "AbsoluteCanvasSize" or "AbsoluteSize"), schedule)
                    local parentPadding = parent:FindFirstChildOfClass("UIPadding")
                    if parentPadding then
                        for _, property in ipairs({ "PaddingLeft", "PaddingRight", "PaddingTop", "PaddingBottom" }) do watch(parentPadding:GetPropertyChangedSignal(property), schedule) end
                    end
                end
                for _, child in ipairs(frame:GetChildren()) do
                    if child:IsA("GuiObject") then
                        for _, property in ipairs({ "AbsolutePosition", "AbsoluteSize", "Visible" }) do watch(child:GetPropertyChangedSignal(property), schedule) end
                    elseif child:IsA("UIPadding") then
                        for _, property in ipairs({ "PaddingLeft", "PaddingRight", "PaddingTop", "PaddingBottom" }) do watch(child:GetPropertyChangedSignal(property), schedule) end
                    elseif child:IsA("UIListLayout") or child:IsA("UIGridLayout") then
                        watch(child:GetPropertyChangedSignal("AbsoluteContentSize"), schedule)
                    end
                end
            end
        end
        for frame, entry in pairs(entries) do if not retained[frame] then restore(frame, entry) end end
        entries = retained
        schedule()
    end
    watch(root.DescendantAdded, requestRebuild, connections)
    watch(root.DescendantRemoving, requestRebuild, connections)
    rebuild()
    local controller = {}
    function controller.connectionCount() return #connections + #live end
    function controller.destroy()
        if destroyed then return end
        destroyed = true
        disconnect(connections); disconnect(live)
        for frame, entry in pairs(entries) do restore(frame, entry) end
        table.clear(entries)
    end
    return controller
end
return LayoutCanvas`;
