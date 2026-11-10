-- Bind imported world canvases and convert ScreenGui/SurfaceGui using native Undo.
-- Targets come only from Explorer selection; packages never supply instance paths.
local Tools = {}
local Http = game:GetService("HttpService")
local Run = game:GetService("RunService")
local function collector(instance)
    while instance do
        if instance:IsA("ScreenGui") or instance:IsA("SurfaceGui") or instance:IsA("BillboardGui") then return instance end
        instance=instance.Parent
    end
end
local function selected(selection)
    local root,target
    for _,instance in ipairs(selection) do
        local gui=collector(instance)
        if gui then assert(not root or root==gui,"Select one UI design at a time");root=gui
        elseif instance:IsA("BasePart") or instance:IsA("Attachment") or instance:IsA("ProximityPrompt") then
            assert(not target or target==instance,"Select one world target at a time");target=instance
        end
    end
    return root,target
end
local function bounded(v,low,high)
    return type(v)=="number" and v==v and v>=low and v<=high
end
local function canvas(root,override)
    local raw=root:GetAttribute("FramebridgeCanvas") or root:GetAttribute("FramebridgeWorldCanvas")
    local value=override or (raw and Http:JSONDecode(raw))
    if not value and root:IsA("SurfaceGui") and root.SizingMode==Enum.SurfaceGuiSizingMode.FixedSize then value={root.CanvasSize.X,root.CanvasSize.Y} end
    assert(type(value)=="table" and #value==2 and bounded(value[1],1,100000) and bounded(value[2],1,100000),"Enter the original canvas width and height in pixels")
    return value
end
local function world(root)
    local raw=root:GetAttribute("FramebridgeWorld")
    assert(type(raw)=="string","Choose an imported Framebridge world design")
    local config=Http:JSONDecode(raw)
    assert(type(config)=="table" and (config.kind=="surface" or config.kind=="billboard" or config.kind=="prompt"),"Invalid world configuration")
    assert((config.kind=="surface" and root:IsA("SurfaceGui")) or (config.kind~="surface" and root:IsA("BillboardGui")),"World configuration does not match the UI class")
    return config
end
local function ownsPrompt(root,prompt)
    local id=root:GetAttribute("FramebridgeId")
    return prompt and prompt:IsA("ProximityPrompt") and type(id)=="string"
        and prompt:GetAttribute("FramebridgeGeneratedPrompt")==true
        and prompt:GetAttribute("FramebridgeSource")==root:GetAttribute("FramebridgeSource")
        and prompt:GetAttribute("FramebridgeId")==id.."/world-prompt"
end
local function anchor(target,surface)
    if target and target:IsA("ProximityPrompt") then target=target.Parent end
    if target and target:IsA("Model") then target=target.PrimaryPart end
    assert(target and target:IsDescendantOf(workspace),"Select the UI and a Part or Attachment in Workspace")
    assert(target:IsA("BasePart") or not surface and target:IsA("Attachment"),"A SurfaceGui needs a Part; a billboard can also use an Attachment")
    assert(not surface or target.CanQuery,"Enable CanQuery on the Part so SurfaceGui buttons receive input")
    return target
end
function Tools.describe(selection)
    local ok,root,target=pcall(selected,selection)
    if not ok or not root then return { available=false } end
    local valid,size=pcall(canvas,root)
    return {
        available=true, rootName=root.Name, rootClass=root.ClassName,
        targetName=target and target.Name, canvas=valid and size or nil,
        canBind=(root:IsA("SurfaceGui") or root:IsA("BillboardGui")) and root:GetAttribute("FramebridgeWorld")~=nil,
        canSurface=root:IsA("ScreenGui"), canScreen=root:IsA("SurfaceGui"),
    }
end
function Tools.run(selection,operation,options,history,runtime)
    assert(not Run:IsRunning(),"Stop the play test before changing world UI")
    options=options or {}
    assert(operation=="bind" or operation=="surface" or operation=="screen","Unknown world utility")
    local root,target=selected(selection)
    assert(root and root.Parent,"Select a UI design in Explorer")
    local config,size,wrapper,reference,prompt,screenState,previousPrompt,ownedReference
    local face=options.face or "Front"
    assert(({Front=true,Back=true,Left=true,Right=true,Top=true,Bottom=true})[face],"Choose a valid Part face")
    if operation=="bind" then
        config=world(root);size=canvas(root)
        local selectedPrompt=target and target:IsA("ProximityPrompt") and target
        target=anchor(target,config.kind=="surface")
        if config.kind=="prompt" then
            reference=root:FindFirstChild("FramebridgeWorldTarget")
            previousPrompt=reference and reference:IsA("ObjectValue") and reference.Value
            ownedReference=root:FindFirstChild("FramebridgeOwnedPrompt")
            assert(not ownedReference or (ownedReference:IsA("ObjectValue") and ownedReference:GetAttribute("FramebridgeOwnedPromptReference")==true),"The reserved owned-prompt reference contains custom content")
            prompt=selectedPrompt or (ownsPrompt(root,previousPrompt) and previousPrompt)
                or (ownedReference and ownsPrompt(root,ownedReference.Value) and ownedReference.Value)
            if prompt then assert(prompt:IsA("ProximityPrompt"),"The linked target is not a prompt") end
            if selectedPrompt then assert(selectedPrompt.Style==Enum.ProximityPromptStyle.Custom,"Set the selected prompt's Style to Custom") end
            if not prompt then
                local p=config.prompt
                assert(type(p)=="table" and type(p.actionText)=="string" and #p.actionText<=800 and type(p.objectText)=="string" and #p.objectText<=800,"Invalid prompt text")
                assert(({E=true,F=true,Q=true,R=true,T=true})[p.keyboardKey] and ({ButtonX=true,ButtonY=true,ButtonA=true,ButtonB=true})[p.gamepadKey],"Invalid prompt input")
                assert(bounded(p.holdDuration,0,60) and bounded(p.activationDistance,0.1,1000) and type(p.requiresLineOfSight)=="boolean" and type(p.clickable)=="boolean","Invalid prompt parameters")
            end
        end
    elseif operation=="surface" then
        assert(root:IsA("ScreenGui"),"Select a ScreenGui to place on a Part")
        target=anchor(target,true);size=canvas(root,options.canvas)
        for _,instance in ipairs(root:GetDescendants()) do assert(not instance:IsA("CanvasGroup"),"SurfaceGui cannot render CanvasGroup; change it to a Frame first") end
        config={kind="surface",alwaysOnTop=true,lightInfluence=0,maxDistance=100,face=face}
        screenState={IgnoreGuiInset=root.IgnoreGuiInset,DisplayOrder=root.DisplayOrder,ScreenInsets=root.ScreenInsets.Name,ClipToDeviceSafeArea=root.ClipToDeviceSafeArea}
    else
        assert(root:IsA("SurfaceGui"),"Select a SurfaceGui to move to the player's screen")
        size=canvas(root,options.canvas)
        local id=root:GetAttribute("FramebridgeId")
        for _,child in ipairs(root:GetChildren()) do
            if id and child:IsA("Frame") and child:GetAttribute("FramebridgeId")==id.."/world-canvas" then wrapper=child end
        end
        reference=root:FindFirstChild("FramebridgeWorldTarget")
        assert(not reference or #reference:GetChildren()==0,"Move custom content out of the world reference before converting")
        local raw=root:GetAttribute("FramebridgeScreenSettings")
        if raw then screenState=Http:JSONDecode(raw) end
    end
    -- Never replace a user-edited generated script while upgrading its world support.
    local client
    for _,child in ipairs(root:GetChildren()) do
        if child:IsA("LocalScript") and child:GetAttribute("FramebridgeRuntime") then
            assert(not client,"The design has multiple generated runtimes")
            assert(child.Source==child:GetAttribute("FramebridgeGeneratedSource"),"The generated runtime was edited; move your application logic into another script first")
            client=child
        end
    end
    assert(type(runtime)=="table" and runtime.version=="8" and type(runtime.source)=="string","Update Framebridge to enable world UI")
    local id=root:GetAttribute("FramebridgeId") or "studio:"..Http:GenerateGUID(false)
    local source=root:GetAttribute("FramebridgeSource")
    local made,journal={},{}
    local recording=history:TryBeginRecording("FramebridgeWorld","Change world UI")
    assert(recording,"Another Studio operation is recording; try again")
    local function create(class,name)
        local instance=Instance.new(class);table.insert(made,instance);instance.Name=name;return instance
    end
    local function set(instance,key,value,attribute)
        local old
        if attribute then old=instance:GetAttribute(key) else old=instance[key] end
        table.insert(journal,{instance,key,old,attribute})
        if attribute then instance:SetAttribute(key,value) else instance[key]=value end
    end
    local function mark(instance,suffix,keys)
        set(instance,"FramebridgeId",id..suffix,true)
        set(instance,"FramebridgeSource",source,true)
        set(instance,"FramebridgeProperties",Http:JSONEncode(keys),true)
    end
    local output=root
    local ok,why=pcall(function()
        if operation~="bind" then
            output=create(operation=="surface" and "SurfaceGui" or "ScreenGui",root.Name)
            for key,value in pairs(root:GetAttributes()) do set(output,key,value,true) end
            output.Enabled=root.Enabled;output.ResetOnSpawn=root.ResetOnSpawn;output.ZIndexBehavior=root.ZIndexBehavior;output.Archivable=root.Archivable
            set(output,"FramebridgeId",id,true);set(output,"FramebridgeCanvas",Http:JSONEncode(size),true)
            -- Keep both ends of every child move in the DataModel. Moving into a
            -- detached new hierarchy is recorded as removal and loses identity on Undo.
            set(output,"Parent",root.Parent)
            if operation=="surface" then
                output.CanvasSize=Vector2.new(size[1],size[2]);output.SizingMode=Enum.SurfaceGuiSizingMode.FixedSize;output.Face=Enum.NormalId[face]
                output.AlwaysOnTop=true;output.LightInfluence=0;output.MaxDistance=100;output.Active=true;output.ClipsDescendants=true
                set(output,"FramebridgeWorld",Http:JSONEncode(config),true);set(output,"FramebridgeWorldCanvas",Http:JSONEncode(size),true)
                set(output,"FramebridgeScreenSettings",Http:JSONEncode(screenState),true)
                set(output,"FramebridgeProperties",Http:JSONEncode({"Enabled","ResetOnSpawn","ZIndexBehavior","CanvasSize","SizingMode","Face","AlwaysOnTop","LightInfluence","MaxDistance","Active","ClipsDescendants"}),true)
                wrapper=create("Frame","WorldCanvas");wrapper.Size=UDim2.fromOffset(size[1],size[2]);wrapper.BackgroundTransparency=1;wrapper.BorderSizePixel=0;wrapper.ClipsDescendants=true
                mark(wrapper,"/world-canvas",{"Size","Position","AnchorPoint","BackgroundTransparency","BorderSizePixel","ClipsDescendants"});set(wrapper,"Parent",output)
                for _,child in ipairs(root:GetChildren()) do set(child,"Parent",(child:IsA("GuiObject") or child:IsA("UIComponent")) and wrapper or output) end
            else
                if screenState then
                    output.IgnoreGuiInset=screenState.IgnoreGuiInset==true;output.DisplayOrder=screenState.DisplayOrder or 0
                    if screenState.ScreenInsets then output.ScreenInsets=Enum.ScreenInsets[screenState.ScreenInsets] end
                    if type(screenState.ClipToDeviceSafeArea)=="boolean" then output.ClipToDeviceSafeArea=screenState.ClipToDeviceSafeArea end
                end
                set(output,"FramebridgeWorld",nil,true);set(output,"FramebridgeWorldCanvas",nil,true);set(output,"FramebridgeScreenSettings",nil,true)
                set(output,"FramebridgeProperties",Http:JSONEncode({"Enabled","ResetOnSpawn","ZIndexBehavior","IgnoreGuiInset","DisplayOrder"}),true)
                for _,child in ipairs(root:GetChildren()) do if child~=wrapper and child~=reference then set(child,"Parent",output) end end
                if wrapper then for _,child in ipairs(wrapper:GetChildren()) do set(child,"Parent",output) end;set(wrapper,"Parent",nil) end
                if reference then set(reference,"Parent",nil) end
            end
            set(root,"Parent",nil)
        end
        if operation~="screen" then
            reference=output:FindFirstChild("FramebridgeWorldTarget")
            if reference then assert(reference:IsA("ObjectValue"),"World target reference must be an ObjectValue")
            else reference=create("ObjectValue","FramebridgeWorldTarget");mark(reference,"/world-target",{"Value"});set(reference,"Parent",output) end
            if config.kind=="prompt" then
                if not prompt then
                    local p=config.prompt;prompt=create("ProximityPrompt",output.Name.."Prompt")
                    prompt.Style=Enum.ProximityPromptStyle.Custom;prompt.ActionText=p.actionText;prompt.ObjectText=p.objectText
                    prompt.KeyboardKeyCode=Enum.KeyCode[p.keyboardKey];prompt.GamepadKeyCode=Enum.KeyCode[p.gamepadKey]
                    prompt.HoldDuration=p.holdDuration;prompt.MaxActivationDistance=p.activationDistance;prompt.RequiresLineOfSight=p.requiresLineOfSight;prompt.ClickablePrompt=p.clickable
                    mark(prompt,"/world-prompt",{"Style","ActionText","ObjectText","KeyboardKeyCode","GamepadKeyCode","HoldDuration","MaxActivationDistance","RequiresLineOfSight","ClickablePrompt"})
                    set(prompt,"FramebridgeGeneratedPrompt",true,true)
                end
                if ownsPrompt(root,previousPrompt) and previousPrompt~=prompt then
                    if not ownedReference then
                        ownedReference=create("ObjectValue","FramebridgeOwnedPrompt")
                        set(ownedReference,"FramebridgeOwnedPromptReference",true,true);set(ownedReference,"Parent",output)
                    end
                    set(ownedReference,"Value",previousPrompt)
                    set(ownedReference,"FramebridgeRestorePromptEnabled",previousPrompt.Enabled,true)
                    set(previousPrompt,"Enabled",false)
                end
                if ownsPrompt(output,prompt) then
                    if ownedReference and ownedReference.Value==prompt then
                        local enabled=ownedReference:GetAttribute("FramebridgeRestorePromptEnabled")
                        if type(enabled)=="boolean" then set(prompt,"Enabled",enabled);set(ownedReference,"FramebridgeRestorePromptEnabled",nil,true) end
                    end
                    set(prompt,"Parent",target)
                end
                set(reference,"Value",prompt)
            else set(reference,"Value",target) end
            set(output,"Adornee",target)
            if not client then client=create("LocalScript","FramebridgeInteractions");mark(client,"/behavior-runtime",{"Source"});set(client,"Parent",output) end
        end
        if client then
            local clientSource=runtime.source
            if output:GetAttribute("FramebridgeThemes") then assert(type(runtime.themeSource)=="string","Update Framebridge to preserve theme switching");clientSource=runtime.themeSource end
            if output:GetAttribute("FramebridgeParticles") then local key=output:GetAttribute("FramebridgeThemes") and "themeParticleSource" or "particleSource";assert(type(runtime[key])=="string","Update Framebridge to preserve particles");clientSource=runtime[key] end
            assert(type(clientSource)=="string","Update Framebridge to preserve theme switching")
            set(client,"Source",clientSource);set(client,"FramebridgeRuntime",runtime.version,true);set(client,"FramebridgeGeneratedSource",clientSource,true)
        end
        history:FinishRecording(recording,Enum.FinishRecordingOperation.Commit)
    end)
    if not ok then
        for i=#journal,1,-1 do local item=journal[i];pcall(function() if item[4] then item[1]:SetAttribute(item[2],item[3]) else item[1][item[2]]=item[3] end end) end
        for _,instance in ipairs(made) do instance:Destroy() end
        pcall(function() history:FinishRecording(recording,Enum.FinishRecordingOperation.Cancel) end)
        error(why,0)
    end
    return {root=output,replaced=output~=root,count=1,skipped={}}
end
return Tools
