// Trusted product runtime. Design packages contain bounded settings only.
export const MOTION_RUNTIME = String.raw`local RunService = game:GetService("RunService")
local GuiService = game:GetService("GuiService")
local InputService = game:GetService("UserInputService")
local TextService = game:GetService("TextService")
local function mountMotion(root, nodes, configs, options)
    local records, alpha, values, helpers, connections, sizingWrites = {}, {}, {}, {}, {}, {}
    local destroyed = false
    local controller = {}
    local function connect(signal, callback)
        table.insert(connections, signal:Connect(function(...) if not destroyed then callback(...) end end))
    end
    local function remember(instance, property)
        values[instance] = values[instance] or {}
        if values[instance][property] == nil then values[instance][property] = instance[property] end
        return values[instance][property]
    end
    -- Keyframe transforms have their own external-edit-aware owner. The shared
    -- reservation sizer owns only the Size values it actually measures.
    local function rememberSizing(instance,property,changed)
        local value=remember(instance,property)
        connect(instance:GetPropertyChangedSignal(property),function()
            if not sizingWrites[instance] or sizingWrites[instance][property]~=instance[property] then
                values[instance][property]=instance[property]
                if changed then changed(instance[property]) end
            end
        end)
        return value
    end
    local function sizingWrite(instance,property,value)
        sizingWrites[instance]=sizingWrites[instance] or {};sizingWrites[instance][property]=value;instance[property]=value
    end
    local function helper(class, parent, name)
        local instance = Instance.new(class)
        instance.Name = "Framebridge " .. name
        instance:SetAttribute("FramebridgeMotionHelper", true)
        table.insert(helpers, instance)
        -- Mark before parenting: hierarchy listeners ignore owned visual helpers.
        instance.Parent = parent
        return instance
    end
    local function isVisible(instance)
        local current = instance
        while current and current ~= root do
            if current:IsA("GuiObject") and not current.Visible then return false end
            current = current.Parent
        end
        if current ~= root then return false end
        if root:IsA('LayerCollector') then return root.Enabled end
        while current do
            if current:IsA('GuiObject') and not current.Visible then return false end
            if current:IsA('LayerCollector') then return current.Enabled end
            current=current.Parent
        end
        return true
    end
    local function direction(angle) local radians = math.rad(angle); return math.sin(radians), -math.cos(radians) end
    local function reduced()
        if options.reducedMotion ~= nil then return options.reducedMotion end
        local ok, value = pcall(function() return GuiService.ReducedMotionEnabled end)
        return ok and value
    end
    local function addAlpha(instance, property, record)
        local entry = alpha[instance]
        if not entry then entry = {}; alpha[instance] = entry end
        if not entry[property] then entry[property] = {value=remember(instance, property), effects={}} end
        local target = entry[property]
        if record then table.insert(target.effects, record) end
        return target
    end
    local function collectAlpha(instance, record)
        if instance:GetAttribute("FramebridgeMotionHelper") or instance:GetAttribute("FramebridgeParticleHelper") or instance:GetAttribute("FramebridgeTextDecorationHelper") then return end
        if instance:IsA("CanvasGroup") then addAlpha(instance, "GroupTransparency", record); return end
        if instance:IsA("GuiObject") then addAlpha(instance,"BackgroundTransparency",record) end
        if instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("TextBox") then
            addAlpha(instance,"TextTransparency",record); addAlpha(instance,"TextStrokeTransparency",record)
        end
        if instance:IsA("ImageLabel") or instance:IsA("ImageButton") then addAlpha(instance,"ImageTransparency",record) end
        if instance:IsA("UIStroke") or instance:IsA("UIShadow") then addAlpha(instance,"Transparency",record) end
        for _, child in ipairs(instance:GetChildren()) do collectAlpha(child, record) end
    end
    local function opacity(target)
        local result = 1
        for _, effect in ipairs(target.effects) do result *= effect.opacity end
        return result
    end
    for id, config in pairs(configs) do
        local settings, instance = config.motion or (config.keyframes and config.keyframes.slot and {slot=config.keyframes.slot}), nodes[id]
        if type(settings)=="table" and instance then
            local record = {keyframeSizerOnly=not config.motion, node=instance, settings=settings, slot=nodes[settings.slot], owner=nodes[settings.owner], time=0, visible=false, opacity=1, scale=1, rotation=0, lift=0, tint=0, mx=0, my=0, entered=false, lastPress=-math.huge, shineStart=-math.huge}
            table.insert(records, record)
            if record.slot then
                record.position = record.keyframeSizerOnly and instance.Position or remember(instance,"Position")
                if instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("TextBox") then
                    record.sizeBase=record.keyframeSizerOnly and rememberSizing(instance,"Size",function(value) record.sizeBase=value;record.textDirty=true end) or remember(instance,"Size"); record.textDirty=true
                    for _,property in ipairs({"Text","FontFace","TextSize","RichText","TextWrapped","TextScaled","LineHeight","AutomaticSize"}) do
                        connect(instance:GetPropertyChangedSignal(property),function() record.textDirty=true end)
                    end
                end
                if record.keyframeSizerOnly then rememberSizing(record.slot,"Size") else remember(record.slot,"Size") end
                record.rotationBase = record.keyframeSizerOnly and instance.Rotation or remember(instance,"Rotation")
                -- The reservation controls sibling placement; the content also needs
                -- the same limits when AutomaticSize measures larger than its slot.
                for class,properties in pairs({UISizeConstraint={"MinSize","MaxSize"},UIAspectRatioConstraint={"AspectRatio","AspectType","DominantAxis"}}) do
                    local source=record.slot:FindFirstChildOfClass(class)
                    if source and not instance:FindFirstChildOfClass(class) then
                        local constraint=helper(class,instance,"Motion " .. class)
                        for _,property in ipairs(properties) do
                            constraint[property]=source[property]
                            connect(source:GetPropertyChangedSignal(property),function() constraint[property]=source[property] end)
                        end
                    end
                end
                local scale = instance:FindFirstChildOfClass("UIScale")
                if not scale then scale = helper("UIScale",instance,"Motion scale") end
                record.scaleObject = scale
                record.scaleBase = record.keyframeSizerOnly and scale.Scale or remember(scale,"Scale")
                local function visible() record.slot.Visible=instance.Visible end
                visible()
                connect(instance:GetPropertyChangedSignal("Visible"),visible)
            end
            if settings.hover and settings.hover.tint then
                record.colorProperty = (instance:IsA("TextLabel") or instance:IsA("TextButton") or instance:IsA("TextBox")) and "TextColor3" or (instance:IsA("ImageLabel") or instance:IsA("ImageButton")) and "ImageColor3" or "BackgroundColor3"
                record.colorBase = remember(instance, record.colorProperty)
                record.colorTarget = Color3.new(table.unpack(settings.hover.tint))
            end
        end
    end
    -- Collect authored opacity before drift hides its original image.
    for _, record in ipairs(records) do
        if record.settings.blink or record.settings.enter then collectAlpha(record.node,record) end
    end
    local function play(sound, record)
        if sound and record.owner and isVisible(record.owner) and record.owner.Active and record.owner.Interactable then
            sound.TimePosition=0; sound:Play()
        end
    end
    for _, record in ipairs(records) do
        local instance, settings = record.node, record.settings
        if settings.shine then
            local overlay = helper("Frame",instance,"Shine")
            overlay.Size=UDim2.fromScale(1,1); overlay.BackgroundColor3=Color3.new(table.unpack(settings.shine.color)); overlay.BackgroundTransparency=1-settings.shine.opacity
            overlay.BorderSizePixel=0; overlay.Active=false; overlay.ZIndex=instance.ZIndex+1
            local corner=instance:FindFirstChildOfClass("UICorner")
            if corner then
                local copy=corner:Clone(); copy:SetAttribute("FramebridgeMotionHelper",true); table.insert(helpers,copy); copy.Parent=overlay
            end
            local gradient=helper("UIGradient",overlay,"Shine gradient")
            gradient.Rotation=settings.shine.direction
            local width=settings.shine.width
            gradient.Transparency=NumberSequence.new({NumberSequenceKeypoint.new(0,1),NumberSequenceKeypoint.new(0.5-width/2,1),NumberSequenceKeypoint.new(0.5,0),NumberSequenceKeypoint.new(0.5+width/2,1),NumberSequenceKeypoint.new(1,1)})
            gradient.Offset=Vector2.new(-2,0)
            overlay.Visible=false
            record.shine, record.shineGradient = overlay, gradient
        end
        if settings.drift then
            local original=addAlpha(instance,"ImageTransparency",nil)
            original.drift=record
            local holder=helper("Frame",instance,"Texture viewport")
            holder.Size=UDim2.fromScale(1,1); holder.BackgroundTransparency=1; holder.BorderSizePixel=0; holder.ClipsDescendants=true; holder.Active=false; holder.ZIndex=instance.ZIndex
            local corner=instance:FindFirstChildOfClass("UICorner")
            if corner then local copy=corner:Clone(); copy:SetAttribute("FramebridgeMotionHelper",true); table.insert(helpers,copy); copy.Parent=holder end
            local texture=helper("ImageLabel",holder,"Moving texture")
            texture.BackgroundTransparency=1; texture.BorderSizePixel=0; texture.ScaleType=Enum.ScaleType.Tile; texture.Active=false; texture.ZIndex=instance.ZIndex
            record.texture,record.textureHolder,record.textureAlpha=texture,holder,original
            instance.ImageTransparency=1
        end
        if settings.sounds and record.owner then
            for _, kind in ipairs({"hover","press"}) do
                local asset=settings.sounds[kind]
                if asset then
                    local sound=helper("Sound",record.owner,kind .. " sound")
                    sound.SoundId=asset:match("^rbxassetid://") and asset or "rbxassetid://" .. asset
                    sound.Volume=settings.sounds.volume; sound.Looped=false
                    record[kind .. "Sound"]=sound
                end
            end
            connect(record.owner.Activated,function()
                if record.time-record.lastPress>0.15 then play(record.pressSound,record); record.lastPress=record.time end
            end)
        end
    end
    local function logicalScale(instance)
        local scale=1
        local parent=instance
        while parent and parent~=root do
            if parent:IsA("GuiObject") then
                for _, child in ipairs(parent:GetChildren()) do if child:IsA("UIScale") then scale*=child.Scale end end
            end
            parent=parent.Parent
        end
        return math.max(0.001,scale)
    end
    local function measureText(record, width)
        local node=record.node
        if not record.sizeBase or node.TextScaled or node.AutomaticSize==Enum.AutomaticSize.None then return end
        local autoX=node.AutomaticSize==Enum.AutomaticSize.X or node.AutomaticSize==Enum.AutomaticSize.XY
        local autoY=node.AutomaticSize==Enum.AutomaticSize.Y or node.AutomaticSize==Enum.AutomaticSize.XY
        local padding=node:FindFirstChildOfClass("UIPadding")
        local size=node.AbsoluteSize/logicalScale(node)
        local left,right,top,bottom=0,0,0,0
        if padding then
            left=padding.PaddingLeft.Scale*size.X+padding.PaddingLeft.Offset; right=padding.PaddingRight.Scale*size.X+padding.PaddingRight.Offset
            top=padding.PaddingTop.Scale*size.Y+padding.PaddingTop.Offset; bottom=padding.PaddingBottom.Scale*size.Y+padding.PaddingBottom.Offset
        end
        local available=not autoX and node.TextWrapped and math.max(1,width-left-right) or 0
        local paddingX,paddingY=left+right,top+bottom
        if not record.textDirty and math.abs((record.textWidth or -1)-available)<0.01 and record.textPaddingX==paddingX and record.textPaddingY==paddingY then return end
        record.textDirty=false; record.textWidth=available; record.textPaddingX=paddingX; record.textPaddingY=paddingY
        local font=node.FontFace
        local preferred=""
        pcall(function() preferred=tostring(GuiService.PreferredTextSize) end)
        local key=table.concat({node.Text,font.Family,tostring(font.Weight),tostring(font.Style),tostring(node.TextSize),tostring(node.RichText),tostring(node.LineHeight),tostring(math.round(available*100)/100),tostring(left+right),tostring(top+bottom),preferred},"\0")
        if key==record.textKey then return end
        record.textKey=key
        local text,textSize,rich,lineHeight=node.Text,node.TextSize,node.RichText,node.LineHeight
        -- A fixed layout slot limits native TextBounds to its current height. Measure
        -- outside that boundary on text/font/width changes, never once per frame.
        task.spawn(function()
            local params=Instance.new("GetTextBoundsParams")
            params.Text=text; params.Font=font; params.Size=textSize; params.Width=available; params.RichText=rich
            local ok,offset=pcall(TextService.GetTextSizeOffsetAsync,TextService,textSize,font)
            if ok then params.Size=textSize+offset end
            local success,bounds=pcall(TextService.GetTextBoundsAsync,TextService,params)
            local measuredSize=params.Size
            params:Destroy()
            if not success or destroyed or record.textKey~=key or not node.Parent then return end
            local height=bounds.Y+math.max(0,bounds.Y-measuredSize)*(lineHeight-1)+top+bottom
            local base=record.sizeBase
            local measured=UDim2.new(autoX and 0 or base.X.Scale,autoX and bounds.X+left+right or base.X.Offset,autoY and 0 or base.Y.Scale,autoY and height or base.Y.Offset)
            if record.keyframeSizerOnly then sizingWrite(node,"Size",measured) else node.Size=measured end
        end)
    end
    local function approach(current, target, dt, duration)
        if duration<=0 then return target end
        local value=current+(target-current)*(1-math.exp(-dt*5/duration))
        return math.abs(value-target)<0.001 and target or value
    end
    function controller.refreshVisibility()
        if destroyed then return end
        for _, record in ipairs(records) do
            local showing=isVisible(record.node)
            if showing and not record.visible then record.restart=true end
            record.visible=showing
        end
    end
    local visibilityWatchers={}
    for _, record in ipairs(records) do
        local ancestor=record.node
        while ancestor and ancestor~=root do
            if ancestor:IsA("GuiObject") then visibilityWatchers[ancestor]=true end
            ancestor=ancestor.Parent
        end
    end
    for instance in pairs(visibilityWatchers) do connect(instance:GetPropertyChangedSignal("Visible"),controller.refreshVisibility) end
    connect(root:GetPropertyChangedSignal(root:IsA('LayerCollector') and "Enabled" or "Visible"),controller.refreshVisibility)
    if root:IsA('GuiObject') then
        local ancestor=root.Parent
        while ancestor do
            if ancestor:IsA('GuiObject') then connect(ancestor:GetPropertyChangedSignal("Visible"),controller.refreshVisibility)
            elseif ancestor:IsA('LayerCollector') then connect(ancestor:GetPropertyChangedSignal("Enabled"),controller.refreshVisibility);break end
            ancestor=ancestor.Parent
        end
    end
    pcall(function()
        connect(GuiService:GetPropertyChangedSignal("PreferredTextSize"),function() for _,record in ipairs(records) do if record.sizeBase then record.textDirty=true end end end)
    end)
    function controller.step(dt)
        if destroyed then return end
        dt=math.max(0,math.min(dt,1))
        local calm=reduced()
        for _, record in ipairs(records) do
            local node, settings, slot=record.node,record.settings,record.slot
            local showing=isVisible(node)
            if record.restart or (showing and not record.visible) then record.time=0; record.shineStart=-math.huge; record.lastPress=-math.huge; record.engaged=false; record.state=nil; record.restart=nil end
            record.visible=showing
            if showing then record.time+=dt end
            local time=record.time
            local state=record.owner and record.owner:GetAttribute("FramebridgeState") or "default"
            local engaged=state=="hover" or state=="selected" or state=="pressed"
            local hovered=state=="hover" or state=="selected"
            if showing and engaged and not record.engaged then play(record.hoverSound,record); record.shineStart=time end
            if showing and state=="pressed" and record.state~="pressed" then play(record.pressSound,record); record.lastPress=time end
            record.engaged,record.state=engaged,state
            local hover=settings.hover
            local press=settings.press
            local duration=(state=="pressed" and press and press.duration) or (hover and hover.duration) or 0.15
            local scale=not calm and ((state=="pressed" and press and press.scale) or (hovered and hover and hover.scale)) or 1
            record.scale=approach(record.scale,scale or 1,dt,duration)
            record.rotation=approach(record.rotation,not calm and hovered and hover and hover.rotation or 0,dt,duration)
            record.lift=approach(record.lift,not calm and hovered and hover and hover.lift or 0,dt,duration)
            record.tint=approach(record.tint,hovered and 1 or 0,dt,hover and hover.duration or 0.15)
            local x,y,rotation,zoom,fade=0,-record.lift,record.rotation,record.scale,1
            if not calm and showing then
                if settings.float then local f=settings.float; local dx,dy=direction(f.direction); local phase=math.sin(time/f.period*2*math.pi)*f.distance/2; x+=dx*phase; y+=dy*phase end
                if settings.spin then rotation+=(time*settings.spin.speed)%360 end
                if settings.pulse then local p=settings.pulse; zoom*=1+(p.scale-1)*(1-math.cos(time/p.period*2*math.pi))/2 end
                if settings.blink and time>=settings.blink.delay then
                    local b=settings.blink; local phase=(time-b.delay)%(b.visible+b.hidden)
                    fade*=phase<b.visible and (b.fade==0 and 1 or math.min(1,phase/b.fade)) or (b.fade==0 and 0 or math.max(0,1-(phase-b.visible)/b.fade))
                end
                if settings.enter then
                    local e=settings.enter
                    local p=e.duration==0 and (time>=e.delay and 1 or 0) or math.clamp((time-e.delay)/e.duration,0,1)
                    local eased=1-(1-p)^3
                    fade*=eased
                    if e.kind=="pop" then zoom*=0.75+0.25*eased
                    elseif e.kind=="slide" then local dx,dy=direction(e.direction); x+=dx*e.distance*(1-eased); y+=dy*e.distance*(1-eased) end
                end
            end
            if calm then record.mx=0; record.my=0; record.scale=1; record.rotation=0; record.lift=0; x=0; y=0; rotation=0; zoom=1 end
            record.opacity=fade
            local mx,my=0,0
            local screenSpace=root:IsA('ScreenGui') or (root:IsA('GuiObject') and root:FindFirstAncestorWhichIsA('ScreenGui')~=nil)
            if screenSpace and settings.magnet and slot and not calm and showing and record.owner and record.owner.Active and record.owner.Interactable then
                local ok, preferred=pcall(function() return InputService.PreferredInput end)
                if ok and preferred==Enum.PreferredInput.KeyboardAndMouse then
                    local pointer=InputService:GetMouseLocation()
                    -- AbsolutePosition uses CoreUISafeInsets even when this ScreenGui ignores it.
                    pointer-=GuiService:GetGuiInset()
                    local delta=(pointer-(slot.AbsolutePosition+slot.AbsoluteSize/2))/logicalScale(slot)
                    local distance=delta.Magnitude
                    if distance<settings.magnet.radius and distance>0 then
                        local strength=math.min(distance,settings.magnet.pull)*(1-distance/settings.magnet.radius)
                        mx=delta.X/distance*strength; my=delta.Y/distance*strength
                    end
                end
            end
            record.mx=approach(record.mx,mx,dt,settings.magnet and settings.magnet.duration or 0.15)
            record.my=approach(record.my,my,dt,settings.magnet and settings.magnet.duration or 0.15)
            if slot then
                if not record.keyframeSizerOnly then
                    node.Position=record.position+UDim2.fromOffset(x+record.mx,y+record.my)
                    node.Rotation=record.rotationBase+rotation
                    record.scaleObject.Scale=record.scaleBase*zoom
                end
                local automatic=node.AutomaticSize
                if automatic~=Enum.AutomaticSize.None and showing then
                    local size=node.AbsoluteSize/logicalScale(node)
                    measureText(record,size.X)
                    local current=slot.Size
                    local autoX=automatic==Enum.AutomaticSize.X or automatic==Enum.AutomaticSize.XY
                    local autoY=automatic==Enum.AutomaticSize.Y or automatic==Enum.AutomaticSize.XY
                    local nextSize=UDim2.new(autoX and 0 or current.X.Scale, autoX and size.X or current.X.Offset, autoY and 0 or current.Y.Scale, autoY and size.Y or current.Y.Offset)
                    if math.abs(nextSize.X.Offset-current.X.Offset)>0.05 or math.abs(nextSize.Y.Offset-current.Y.Offset)>0.05 then
                        if record.keyframeSizerOnly then sizingWrite(slot,"Size",nextSize) else slot.Size=nextSize end
                    end
                end
            end
            if record.colorProperty then node[record.colorProperty]=record.colorBase:Lerp(record.colorTarget,record.tint) end
            if record.shine then
                local s=settings.shine
                local elapsed=s.trigger=="hover" and time-record.shineStart or time%s.period
                record.shine.Visible=showing and not calm and elapsed>=0 and elapsed<=s.period
                record.shineGradient.Offset=Vector2.new(elapsed/s.period*4-2,0)
                local target=alpha[node] and alpha[node].BackgroundTransparency
                record.shine.BackgroundTransparency=1-s.opacity*(target and opacity(target) or fade)
            end
            if record.texture then
                local size=node.AbsoluteSize/logicalScale(node)
                local tile=node.TileSize
                local tw=math.max(0.1,tile.X.Scale*size.X+tile.X.Offset)
                local th=math.max(0.1,tile.Y.Scale*size.Y+tile.Y.Offset)
                local dx,dy=direction(settings.drift.direction)
                local offset=calm and 0 or settings.drift.speed*time
                record.texture.Size=UDim2.new(1,tw,1,th)
                record.texture.TileSize=UDim2.fromOffset(tw,th)
                record.texture.Position=UDim2.fromOffset((dx*offset)%tw-tw,(dy*offset)%th-th)
                record.texture.Image=node.Image; record.texture.ImageColor3=node.ImageColor3
                record.texture.ImageTransparency=1-(1-record.textureAlpha.value)*opacity(record.textureAlpha)
            end
        end
        for instance, properties in pairs(alpha) do
            for property,target in pairs(properties) do instance[property]=target.drift and 1 or 1-(1-target.value)*opacity(target) end
        end
    end
    function controller.destroy()
        if destroyed then return end
        destroyed=true
        for _, connection in ipairs(connections) do connection:Disconnect() end
        table.clear(connections)
        for instance, properties in pairs(values) do
            for property,value in pairs(properties) do pcall(function() instance[property]=value end) end
        end
        for _,record in ipairs(records) do
            if record.slot then pcall(function() record.slot.Visible=record.node.Visible end) end
        end
        for index=#helpers,1,-1 do pcall(function() helpers[index]:Destroy() end) end
        table.clear(helpers); table.clear(records); table.clear(alpha); table.clear(values);table.clear(sizingWrites)
    end
    function controller.connectionCount() return #connections end
    controller.step(0)
    if #records>0 and not options.manualMotion then connect(RunService.Heartbeat,controller.step) end
    return controller
end
return mountMotion`;
