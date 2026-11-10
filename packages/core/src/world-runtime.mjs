// Trusted client code. World targets are actual Instances supplied by Studio or the game.
export const WORLD_RUNTIME = String.raw`local Http = game:GetService("HttpService")
local Input = game:GetService("UserInputService")
local Run = game:GetService("RunService")
local shownCache = setmetatable({}, {__mode="k"})
return function(root, options)
    local raw = root:GetAttribute("FramebridgeWorld")
    if type(raw) ~= "string" then return {destroy=function() end,connectionCount=function() return 0 end} end
    local settings = Http:JSONDecode(raw)
    local canvas = Http:JSONDecode(root:GetAttribute("FramebridgeWorldCanvas") or "[]")
    assert(type(settings)=="table" and type(canvas)=="table" and #canvas==2 and canvas[1]>0 and canvas[2]>0,"Invalid world canvas")
    local connections, helpers, originals = {}, {}, {}
    local dead, holdConnection, heldInput, currentPrompt = false, nil, nil, nil
    local restorePromptEnabled=false
    local originalEnabled = root.Enabled
    local function connect(signal, callback)
        local connection=signal:Connect(function(...) if not dead then callback(...) end end)
        table.insert(connections,connection)
        return connection
    end
    local function helper(instance)
        instance:SetAttribute("FramebridgeWorldHelper",true)
        instance:SetAttribute("FramebridgeMotionHelper",true)
        table.insert(helpers,instance)
        return instance
    end
    local supplied=options.worldTarget
    if settings.kind~='prompt' then
        supplied=supplied or root.Adornee
        assert(supplied,'Bind world UI to a Part or Attachment before mounting it')
    end
    local function promptAdornee(prompt)
        local parent=prompt.Parent
        if parent and parent:IsA('Model') then parent=parent.PrimaryPart end
        assert(parent and (parent:IsA('BasePart') or parent:IsA('Attachment')),'A custom prompt needs a Part, Attachment or Model with a PrimaryPart')
        return parent
    end
    if settings.kind=='prompt' then
        local reference=root:FindFirstChild('FramebridgeWorldTarget')
        currentPrompt=supplied or (reference and reference:IsA('ObjectValue') and reference.Value)
        assert(currentPrompt and currentPrompt:IsA('ProximityPrompt') and currentPrompt.Parent,'Bind this UI to a custom ProximityPrompt before mounting it')
        assert(currentPrompt.Style==Enum.ProximityPromptStyle.Custom,'The bound prompt must use Custom style')
        promptAdornee(currentPrompt)
    end
    if supplied then
        assert(typeof(supplied)=="Instance","World target must be an Instance")
        if settings.kind=="surface" then assert(supplied:IsA("BasePart") and supplied.CanQuery,"Surface UI needs a Part with CanQuery enabled"); root.Adornee=supplied
        elseif supplied:IsA("ProximityPrompt") then currentPrompt=supplied; root.Adornee=promptAdornee(supplied)
        else assert(supplied:IsA("BasePart") or supplied:IsA("Attachment"),"Billboard UI needs a Part or Attachment"); root.Adornee=supplied end
    end
    local scales={}
    if root:IsA("BillboardGui") then
        for _,child in ipairs(root:GetChildren()) do
            if child:IsA("GuiObject") then
                local scale=helper(Instance.new("UIScale")); scale.Name="FramebridgeWorldScale"; scale.Parent=child
                table.insert(scales,scale)
            end
        end
        local function resize()
            local width=root.AbsoluteSize.X
            if width>0 then for _,scale in ipairs(scales) do scale.Scale=width/canvas[1] end end
        end
        connect(root:GetPropertyChangedSignal("AbsoluteSize"),resize)
        resize()
    end
    local controller={}
    local progress, labels={},{}
    local function stopHold(releaseInput)
        if holdConnection then holdConnection:Disconnect(); holdConnection=nil end
        local input=heldInput; heldInput=nil
        if releaseInput~=false and input and currentPrompt then pcall(function() currentPrompt:InputHoldEnd() end) end
        for instance,size in pairs(progress) do if instance.Parent then instance.Size=UDim2.new(0,0,size.Y.Scale,size.Y.Offset) end end
    end
    local function destroy()
        if dead then return end
        dead=true; stopHold()
        if restorePromptEnabled and currentPrompt and currentPrompt.Parent then currentPrompt.Enabled=true;restorePromptEnabled=false end
        for _,connection in ipairs(connections) do connection:Disconnect() end
        for instance,props in pairs(originals) do pcall(function() for key,value in pairs(props) do instance[key]=value end end) end
        for _,instance in ipairs(helpers) do instance:Destroy() end
        pcall(function() root.Enabled=originalEnabled end)
        table.clear(connections); table.clear(helpers)
    end
    controller.destroy=destroy
    controller.connectionCount=function() return #connections+(holdConnection and 1 or 0) end
    if settings.kind=="prompt" then
        root.Enabled=false
        local reference=root:FindFirstChild("FramebridgeWorldTarget")
        currentPrompt=currentPrompt or (reference and reference:IsA("ObjectValue") and reference.Value)
        assert(currentPrompt and currentPrompt:IsA("ProximityPrompt"),"Bind this UI to a custom ProximityPrompt before mounting it")
        assert(currentPrompt.Style==Enum.ProximityPromptStyle.Custom,"The bound prompt must use Custom style")
        root.Adornee=promptAdornee(currentPrompt)
        local ids={}
        for _,instance in ipairs(root:GetDescendants()) do
            local id=instance:GetAttribute("FramebridgeId")
            if id then ids[id]=instance end
        end
        for role,id in pairs(settings.prompt.labels or {}) do
            local instance=ids[id]
            if instance then
                if role=="hold" then originals[instance]={Size=instance.Size}; progress[instance]=instance.Size
                else originals[instance]={Text=instance.Text,RichText=instance.RichText}; instance.RichText=false; labels[role]=instance end
            end
        end
        local inputType=Enum.ProximityPromptInputType.Keyboard
        local function updateLabels()
            if labels.action then labels.action.Text=currentPrompt.ActionText end
            if labels.object then labels.object.Text=currentPrompt.ObjectText end
            if labels.input then
                labels.input.Text=inputType==Enum.ProximityPromptInputType.Touch and (currentPrompt.HoldDuration>0 and "Hold" or "Tap")
                    or (inputType==Enum.ProximityPromptInputType.Gamepad and currentPrompt.GamepadKeyCode.Name or currentPrompt.KeyboardKeyCode.Name)
            end
        end
        connect(currentPrompt.PromptShown,function(kind) shownCache[currentPrompt]={visible=true,input=kind};inputType=kind; updateLabels(); root.Enabled=true end)
        connect(currentPrompt.PromptHidden,function() shownCache[currentPrompt]={visible=false,input=inputType};stopHold(); root.Enabled=false end)
        connect(currentPrompt.Destroying,function() stopHold(); root.Enabled=false end)
        connect(currentPrompt.PromptButtonHoldBegan,function()
            if holdConnection then holdConnection:Disconnect() end
            local start=os.clock()
            holdConnection=Run.Heartbeat:Connect(function()
                local fraction=currentPrompt.HoldDuration>0 and math.clamp((os.clock()-start)/currentPrompt.HoldDuration,0,1) or 1
                for instance,size in pairs(progress) do instance.Size=UDim2.new(size.X.Scale*fraction,size.X.Offset*fraction,size.Y.Scale,size.Y.Offset) end
            end)
        end)
        connect(currentPrompt.PromptButtonHoldEnded,function() stopHold(false) end)
        for _,key in ipairs({"ActionText","ObjectText","KeyboardKeyCode","GamepadKeyCode","HoldDuration"}) do connect(currentPrompt:GetPropertyChangedSignal(key),updateLabels) end
        local button=helper(Instance.new("TextButton")); button.Name="FramebridgePromptInput"; button.Text=""; button.BackgroundTransparency=1
        button.Size=UDim2.fromScale(1,1); button.ZIndex=100000; button.AutoButtonColor=false; button.Parent=root
        connect(button.InputBegan,function(input)
            local touch=input.UserInputType==Enum.UserInputType.Touch
            if root.Enabled and not heldInput and (touch or currentPrompt.ClickablePrompt and input.UserInputType==Enum.UserInputType.MouseButton1) then
                heldInput=input; currentPrompt:InputHoldBegin()
            end
        end)
        connect(Input.InputEnded,function(input) if input==heldInput then stopHold() end end)
        connect(Input.WindowFocusReleased,stopHold)
        local cached=shownCache[currentPrompt]
        if cached then inputType=cached.input;root.Enabled=cached.visible end
        updateLabels(); stopHold()
        -- A replicated owned prompt can be shown before StarterGui scripts load.
        -- Refresh its local visibility once, after subscribing, without changing
        -- the server's Enabled value or another player's prompt state. External
        -- game prompts are mounted before enabling, as documented for source users.
        if not cached and Run:IsClient() and currentPrompt.Enabled and currentPrompt:GetAttribute('FramebridgeGeneratedPrompt') then
            task.defer(function()
                if dead or not currentPrompt.Parent or not currentPrompt.Enabled then return end
                restorePromptEnabled=true;currentPrompt.Enabled=false
                Run.Heartbeat:Wait()
                if restorePromptEnabled then
                    restorePromptEnabled=false
                    if not dead and currentPrompt.Parent then currentPrompt.Enabled=true end
                end
            end)
        end
    end
    connect(root.Destroying,destroy)
    local target=currentPrompt or supplied or root.Adornee
    if target then connect(target.Destroying,function()
        destroy();root.Enabled=false
        if options.onWorldTargetLost then options.onWorldTargetLost() end
    end) end
    return controller
end`;
