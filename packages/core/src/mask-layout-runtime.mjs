// Trusted product code. Transfer data contains identities, never executable text.
export const MASK_LAYOUT_RUNTIME = String.raw`local MaskLayout = {}
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
local function contentRect(parent)
    local scale = zoom(parent)
    local position, size = parent.AbsolutePosition, parent.AbsoluteSize
    if parent:IsA("ScrollingFrame") then
        -- CanvasPosition is already measured in rendered pixels, including UIScale.
        position -= parent.CanvasPosition
        size = parent.AbsoluteCanvasSize
    end
    local padding = parent:FindFirstChildOfClass("UIPadding")
    if padding then
        local left = padding.PaddingLeft.Scale * size.X + padding.PaddingLeft.Offset * scale
        local right = padding.PaddingRight.Scale * size.X + padding.PaddingRight.Offset * scale
        local top = padding.PaddingTop.Scale * size.Y + padding.PaddingTop.Offset * scale
        local bottom = padding.PaddingBottom.Scale * size.Y + padding.PaddingBottom.Offset * scale
        position += Vector2.new(left, top)
        size = Vector2.new(math.max(0, size.X-left-right), math.max(0, size.Y-top-bottom))
    end
    return position, size
end
function MaskLayout.mount(root)
    local source = root:GetAttribute("FramebridgeSource")
    local controller, connections, live, entries = {}, {}, {}, {}
    local destroyed, queued, rebuilding, rebuildQueued = false, false, false, false
    local function update()
        if destroyed then return end
        for _, entry in ipairs(entries) do
            if entry.decoration then
                local image, parent, rect = entry.decoration, entry.parent, entry.rect
                if image.Parent == parent and parent.Parent then
                    local position, size = contentRect(parent)
                    local ownerPosition, ownerSize = parent.AbsolutePosition, parent.AbsoluteSize
                    local sizingSize = size
                    if parent:IsA("ScrollingFrame") and parent.AutomaticCanvasSize ~= Enum.AutomaticSize.None then
                        -- AutomaticCanvasSize changes the native UDim2 sizing basis on both axes.
                        -- Position uses the viewport only on automatic axes; padding still sets its origin.
                        sizingSize = ownerSize
                        local axis = parent.AutomaticCanvasSize
                        size = Vector2.new((axis == Enum.AutomaticSize.X or axis == Enum.AutomaticSize.XY) and ownerSize.X or size.X, (axis == Enum.AutomaticSize.Y or axis == Enum.AutomaticSize.XY) and ownerSize.Y or size.Y)
                    end
                    if size.X > 0 and size.Y > 0 and sizingSize.X > 0 and sizingSize.Y > 0 and (entry.position ~= position or entry.size ~= size or entry.sizingSize ~= sizingSize or entry.ownerPosition ~= ownerPosition or entry.ownerSize ~= ownerSize) then
                        entry.position, entry.size, entry.sizingSize, entry.ownerPosition, entry.ownerSize = position, size, sizingSize, ownerPosition, ownerSize
                        -- The background belongs to the viewport, not the scroll canvas or padding box.
                        image.Position = UDim2.fromScale((ownerPosition.X+rect[1]*ownerSize.X-position.X)/size.X, (ownerPosition.Y+rect[2]*ownerSize.Y-position.Y)/size.Y)
                        image.Size = UDim2.fromScale(rect[3]*ownerSize.X/sizingSize.X, rect[4]*ownerSize.Y/sizingSize.Y)
                    end
                end
            else
            local basis, parent, clip = entry.basis, entry.parent, entry.clip
            if basis.Parent == clip and parent.Parent and basis:IsDescendantOf(parent) and (parent.AbsoluteSize.X > 0 or parent.AbsoluteSize.Y > 0) then
                local scale = zoom(clip)
                local sourceScale = zoom(parent)
                local coordinateScale = basis:FindFirstChildOfClass("UIScale")
                if coordinateScale and scale > 0 and scale < math.huge and sourceScale > 0 and sourceScale < math.huge then
                    local position, size = contentRect(parent)
                    local clipPosition, clipSize = contentRect(clip)
                    local canvasSize, automatic = size, Enum.AutomaticSize.None
                    if basis:IsA("ScrollingFrame") and parent:IsA("ScrollingFrame") and parent.AutomaticCanvasSize ~= Enum.AutomaticSize.None then
                        size, automatic = parent.AbsoluteSize, parent.AutomaticCanvasSize
                    end
                    if clipSize.X > 0 and clipSize.Y > 0 and (entry.position ~= position or entry.size ~= size or entry.canvasSize ~= canvasSize or entry.automatic ~= automatic or entry.clipPosition ~= clipPosition or entry.clipSize ~= clipSize or entry.scale ~= scale or entry.sourceScale ~= sourceScale) then
                        entry.position, entry.size, entry.canvasSize, entry.automatic, entry.clipPosition, entry.clipSize, entry.scale, entry.sourceScale = position, size, canvasSize, automatic, clipPosition, clipSize, scale, sourceScale
                        coordinateScale.Scale = sourceScale / scale
                        -- Offset components truncate fractional coordinates in Roblox.
                        -- Relative values retain the subpixel crop and original sizing region.
                        basis.Position = UDim2.fromScale((position.X-clipPosition.X)/clipSize.X, (position.Y-clipPosition.Y)/clipSize.Y)
                        basis.Size = UDim2.fromScale(size.X/clipSize.X*scale/sourceScale, size.Y/clipSize.Y*scale/sourceScale)
                        if basis:IsA("ScrollingFrame") then
                            -- Reproduce the engine's independent position/canvas and size/viewport bases.
                            basis.CanvasSize = UDim2.fromScale(canvasSize.X/clipSize.X*scale/sourceScale, canvasSize.Y/clipSize.Y*scale/sourceScale)
                            basis.AutomaticCanvasSize = automatic
                        end
                    end
                end
            end
            end
        end
    end
    local function schedule()
        if queued or destroyed then return end
        queued = true
        task.defer(function() queued = false; update() end)
    end
    local rebuild
    local function requestRebuild()
        if destroyed or rebuildQueued then return end
        rebuildQueued = true
        task.defer(function() rebuildQueued = false; if not destroyed then rebuild() end end)
    end
    local function watch(signal, callback, list)
        table.insert(list or live, signal:Connect(function(...) if not destroyed then callback(...) end end))
    end
    rebuild = function()
        if destroyed or rebuilding then return end
        rebuilding = true
        disconnect(live); table.clear(entries)
        local descendants = root:GetDescendants()
        if root:IsA("GuiObject") then table.insert(descendants, 1, root) end
        if #descendants > 15000 then rebuilding = false; warn("Framebridge: mask layout exceeds 15,000 instances."); return end
        local byId, duplicates = {}, {}
        for _, instance in ipairs(descendants) do
            if instance:IsA("GuiObject") and instance:GetAttribute("FramebridgeSource") == source then
                local id = instance:GetAttribute("FramebridgeId")
                if type(id) == "string" then
                    if byId[id] then duplicates[id] = true else byId[id] = instance end
                end
                if instance:GetAttribute("FramebridgeMaskBasis") ~= nil then watch(instance:GetAttributeChangedSignal("FramebridgeMaskBasis"), requestRebuild) end
                if instance:GetAttribute("FramebridgeDecorationRect") ~= nil then watch(instance:GetAttributeChangedSignal("FramebridgeDecorationRect"), requestRebuild) end
            end
        end
        local observed, modifiers, propertySignals = {}, {}, {}
        local function observe(instance)
            if observed[instance] then return end
            observed[instance] = true
            if instance:IsA("ScrollingFrame") then
                watch(instance:GetPropertyChangedSignal("AbsoluteCanvasSize"), schedule)
                watch(instance:GetPropertyChangedSignal("CanvasPosition"), schedule)
            end
            local current = instance
            while current and current ~= root.Parent do
                if current:IsA("GuiObject") and not propertySignals[current] then
                    propertySignals[current] = true
                    for _, property in ipairs({"Position", "Size", "AnchorPoint", "AutomaticSize", "SizeConstraint", "AbsolutePosition", "AbsoluteSize"}) do watch(current:GetPropertyChangedSignal(property), schedule) end
                end
                for _, child in ipairs(current:GetChildren()) do
                    if child:IsA("UIScale") and not modifiers[child] then modifiers[child] = true; watch(child:GetPropertyChangedSignal("Scale"), schedule)
                    elseif child:IsA("UIPadding") and not modifiers[child] then
                        modifiers[child] = true
                        for _, property in ipairs({"PaddingLeft", "PaddingRight", "PaddingTop", "PaddingBottom"}) do watch(child:GetPropertyChangedSignal(property), schedule) end
                    end
                end
                current = current.Parent
            end
        end
        for _, basis in ipairs(descendants) do
            local target = basis:GetAttribute("FramebridgeMaskBasis")
            if (basis:IsA("Frame") or basis:IsA("ScrollingFrame")) and type(target) == "string" and #target <= 256 and basis:GetAttribute("FramebridgeSource") == source then
                local parent, clip = byId[target], basis.Parent
                if parent and not duplicates[target] and clip and clip:IsA("CanvasGroup") and basis:IsDescendantOf(parent) and parent ~= clip and parent:GetAttribute("FramebridgeSource") == source then
                    table.insert(entries, {basis=basis, parent=parent, clip=clip})
                    observe(parent); observe(clip)
                end
            end
            local raw, parent = basis:GetAttribute("FramebridgeDecorationRect"), basis.Parent
            if basis:IsA("ImageLabel") and type(raw) == "string" and #raw <= 512 and parent and parent:IsA("GuiObject") and parent:GetAttribute("FramebridgeSource") == source and basis:GetAttribute("FramebridgeSource") == source then
                local parentId, id = parent:GetAttribute("FramebridgeId"), basis:GetAttribute("FramebridgeId")
                if type(parentId) == "string" and (id == parentId.."/decoration" or id == parentId.."/effect") and not duplicates[parentId] and not duplicates[id] then
                    local ok, rect = pcall(function() return game:GetService("HttpService"):JSONDecode(raw) end)
                    local valid = ok and type(rect) == "table" and #rect == 4
                    if valid then
                        for _, value in ipairs(rect) do
                            if type(value) ~= "number" or value ~= value or math.abs(value) > 1000 then valid = false; break end
                        end
                        valid = valid and rect[3] > 0 and rect[4] > 0
                    end
                    if valid then table.insert(entries, {decoration=basis, parent=parent, rect=rect}); observe(parent) end
                end
            end
        end
        rebuilding = false
        update()
    end
    function controller.destroy()
        if destroyed then return end
        destroyed = true; disconnect(connections); disconnect(live); table.clear(entries)
    end
    function controller.connectionCount() return #connections + #live end
    function controller.update() update() end
    watch(root.DescendantAdded, requestRebuild, connections)
    watch(root.DescendantRemoving, requestRebuild, connections)
    watch(root.AncestryChanged, requestRebuild, connections)
    watch(root.Destroying, controller.destroy, connections)
    watch(game:GetService("RunService").Heartbeat, update, connections)
    rebuild()
    return controller
end
-- Keeps imported coordinate helpers live while editing with the Studio plugin loaded.
function MaskLayout.watch(container, runService)
    local mounted, connections, destroyed = {}, {}, false
    local function refresh()
        if destroyed then return end
        for root, controller in pairs(mounted) do
            if not root:IsDescendantOf(container) or not runService:IsEdit() then controller.destroy(); mounted[root] = nil end
        end
        if not runService:IsEdit() then return end
        for _, root in ipairs(container:GetChildren()) do
            if root:IsA("LayerCollector") and type(root:GetAttribute("FramebridgeSource")) == "string" and not mounted[root] then mounted[root] = MaskLayout.mount(root) end
        end
    end
    table.insert(connections, container.ChildAdded:Connect(refresh))
    table.insert(connections, container.ChildRemoved:Connect(refresh))
    local editing = runService:IsEdit()
    table.insert(connections, runService.Heartbeat:Connect(function()
        local nextEditing = runService:IsEdit()
        if editing ~= nextEditing then editing = nextEditing; refresh() end
    end))
    refresh()
    return {destroy=function()
        if destroyed then return end
        destroyed = true; disconnect(connections)
        for _, controller in pairs(mounted) do controller.destroy() end
        table.clear(mounted)
    end}
end
return MaskLayout`;
