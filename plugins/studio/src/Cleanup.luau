-- Clean only known Framebridge data; unknown attributes and user scripts stay.
local Cleanup = {}
local Http = game:GetService("HttpService")
local KNOWN = {}
for name in string.gmatch([[FramebridgeId FramebridgeSource FramebridgeProperties
FramebridgeAsset FramebridgeAsset_TopImage FramebridgeAsset_MidImage FramebridgeAsset_BottomImage
FramebridgeCanvas FramebridgeWorld FramebridgeWorldCanvas FramebridgeScreenSettings
FramebridgeThemes FramebridgeThemeBinding FramebridgeTheme FramebridgeThemeStatus
FramebridgeBehavior FramebridgeState FramebridgeSelected FramebridgeBindingStatus
FramebridgeParticles FramebridgeParticlesStatus FramebridgeMotionStatus FramebridgeKeyframesStatus
FramebridgeMaskBasis FramebridgeLayoutCanvas FramebridgeDecorationRect FramebridgeTextDecoration
FramebridgeTextDecorationStatus FramebridgeRuntime FramebridgeRuntimeStatus FramebridgeGeneratedSource
FramebridgeClass FramebridgeGeneratedPrompt FramebridgeOwnedPromptReference FramebridgeRestorePromptEnabled
FramebridgeEmitter2DClientRevision FramebridgeEmitter2DContract FramebridgeKeyframeIteration FramebridgeKeyframeStatus FramebridgeKeyframeTime
FramebridgeParticleBurst FramebridgeParticleCount FramebridgeParticleEngine FramebridgeParticleHelper FramebridgeParticleHelperSource FramebridgeParticleOwner
FramebridgeParticlesClear FramebridgeParticlesEnabled FramebridgeParticlesRetry FramebridgeSkillStatus FramebridgeUnlocked FramebridgeValue
FramebridgeMotionHelper FramebridgeTextDecorationController FramebridgeTextDecorationHelper FramebridgeTextDecorationHost FramebridgeTextDecorationOwner FramebridgeWorldHelper]], "%S+") do KNOWN[name] = true end
for name in string.gmatch([[FramebridgeControlStatus FramebridgeTooltipVisible FramebridgeCooldownRemaining FramebridgeCooldownReady
FramebridgeRouletteStatus FramebridgeRouletteIndex FramebridgeRoulettePreview FramebridgeRouletteValue]], "%S+") do KNOWN[name] = true end
local OPTIONAL = {"FramebridgeBehavior", "FramebridgeThemes", "FramebridgeThemeBinding", "FramebridgeParticles"}
local STATUS = {FramebridgeState=true, FramebridgeSelected=true, FramebridgeBindingStatus=true,
    FramebridgeTheme=true, FramebridgeThemeStatus=true, FramebridgeParticlesStatus=true,
    FramebridgeMotionStatus=true, FramebridgeKeyframesStatus=true, FramebridgeRuntimeStatus=true}
local function known(name)
    -- Conditional rules have a documented family of generated status fields.
    return KNOWN[name] or name:match("^FramebridgeRule_[%w_%-]+$") ~= nil
end
local function config(instance)
    local raw = instance:GetAttribute("FramebridgeBehavior")
    if type(raw) ~= "string" then return nil end
    local ok,value = pcall(Http.JSONDecode, Http, raw)
    return ok and type(value) == "table" and value or nil
end
local function executable(behavior)
    if type(behavior) ~= "table" then return false end
    for key,value in pairs(behavior) do
        if key ~= "role" and type(value) == "table" and next(value) ~= nil then return true end
    end
    return false
end
local function guiRoot(instance)
    return instance:IsA("ScreenGui") or instance:IsA("SurfaceGui") or instance:IsA("BillboardGui")
end
local function collect(selection)
    local roots = {}
    local function add(root)
        if not root then return end
        for _,existing in ipairs(roots) do if existing==root then return end end
        table.insert(roots,root)
    end
    for _,selected in ipairs(selection) do
        local root,current = nil,selected
        while current do
            if guiRoot(current) then root=current;break end
            current=current.Parent
        end
        if root then add(root)
        else
            if selected:IsA("GuiObject") then add(selected) end
            for _,child in ipairs(selected:GetDescendants()) do if guiRoot(child) then add(child) end end
        end
    end
    local unique = {}
    for _,root in ipairs(roots) do
        local nested=false
        for _,other in ipairs(roots) do if root~=other and root:IsDescendantOf(other) then nested=true;break end end
        if not nested then table.insert(unique,root) end
    end
    return unique
end
local function generated(instance)
    return instance ~= nil and (instance:IsA("LocalScript") or instance:IsA("ModuleScript")) and instance:GetAttribute("FramebridgeRuntime") ~= nil
end
local function untouched(instance)
    return generated(instance) and type(instance:GetAttribute("FramebridgeGeneratedSource")) == "string"
        and instance:GetAttribute("FramebridgeGeneratedSource") == instance.Source
end
function Cleanup.plan(selection,mode)
    assert(mode == "unused" or mode == "detach", "Unknown cleanup mode")
    local plan = {changes={},scripts={},roots=0,attributes=0,bytes=0,skipped={},mode=mode}
    local visited=0
    for _,root in ipairs(collect(selection)) do
        local all=root:GetDescendants()
        table.insert(all,1,root)
        visited += #all
        assert(visited <= 15000, "Select fewer than 15,000 instances for one cleanup")
        local scripts,needsRuntime,edited,owned = {},false,false,false
        local stateOwners,behaviors={},{}
        for _,instance in ipairs(all) do
            for name in pairs(instance:GetAttributes()) do if known(name) then owned=true;break end end
            if generated(instance) then
                scripts[instance]=true
                if not untouched(instance) then edited=true end
                for _,child in ipairs(instance:GetDescendants()) do
                    if not untouched(child) then edited=true end
                end
            end
            local behavior=config(instance)
            behaviors[instance]=behavior
            if behavior and type(behavior.state)=="table" and type(behavior.state.owner)=="string" then stateOwners[behavior.state.owner]=true end
            if executable(behavior) or instance:GetAttribute("FramebridgeThemes") or instance:GetAttribute("FramebridgeWorld")
                or instance:GetAttribute("FramebridgeMaskBasis") or instance:GetAttribute("FramebridgeLayoutCanvas")
                or instance:GetAttribute("FramebridgeDecorationRect") or instance:GetAttribute("FramebridgeTextDecoration") then needsRuntime=true end
        end
        if not owned then continue end
        -- Edited generated code could depend on any attribute. Skip its whole screen.
        if edited then table.insert(plan.skipped,root.Name .. ": generated script was edited or contains custom children");continue end
        plan.roots += 1
        local keepRuntime=next(scripts) ~= nil and needsRuntime and mode ~= "detach"
        local removing={}
        if not keepRuntime then
            for instance in pairs(scripts) do
                if not generated(instance.Parent) then table.insert(plan.scripts,instance);removing[instance]=true end
            end
        end
        for _,instance in ipairs(all) do
            local removed=false
            for script in pairs(removing) do if instance==script or instance:IsDescendantOf(script) then removed=true;break end end
            local behavior=behaviors[instance]
            for name,value in pairs(instance:GetAttributes()) do
                local erase=mode=="detach" and known(name) or false
                if mode=="unused" and not generated(instance) then
                    if not keepRuntime then erase=STATUS[name] or table.find(OPTIONAL,name) ~= nil end
                    if name:match("^FramebridgeRule_[%w_%-]+$") and not keepRuntime then erase=true end
                    if name=="FramebridgeState" and not stateOwners[instance:GetAttribute("FramebridgeId")] then erase=true end
                    if name=="FramebridgeSelected" and not stateOwners[instance:GetAttribute("FramebridgeId")]
                        and not (behavior and ((behavior.action and behavior.action.kind=="tab")
                            or (behavior.control and (behavior.control.kind=="toggle" or behavior.control.kind=="skill")))) then erase=true end
                    if name=="FramebridgeBindingStatus" and not (behavior and behavior.binding) then erase=true end
                    if name=="FramebridgeBehavior" and behavior and next(behavior)==nil then erase=true end
                end
                if erase or removed then
                    plan.attributes += 1
                    plan.bytes += #name + (type(value)=="string" and #value or 8)
                    if erase and not removed then table.insert(plan.changes,{instance=instance,name=name,value=value}) end
                end
            end
        end
    end
    return plan
end
function Cleanup.review(selection,mode)
    local ok,result=pcall(Cleanup.plan,selection,mode)
    if not ok then return {roots=0,attributes=0,scripts=0,bytes=0,skipped={},error=tostring(result)} end
    return {roots=result.roots,attributes=result.attributes,scripts=#result.scripts,bytes=result.bytes,skipped=result.skipped}
end
function Cleanup.run(selection,mode,history)
    assert(not game:GetService("RunService"):IsRunning(),"Stop the play test before cleaning UI")
    local plan=Cleanup.plan(selection,mode)
    if #plan.changes==0 and #plan.scripts==0 then return plan end
    local recording=history:TryBeginRecording("FramebridgeCleanup",mode=="detach" and "Detach Framebridge UI" or "Clean unused Framebridge data")
    assert(recording,"Another Studio operation is recording. Try again")
    local changed,removed={},{}
    local ok,why=pcall(function()
        for _,item in ipairs(plan.changes) do table.insert(changed,item);item.instance:SetAttribute(item.name,nil) end
        for _,instance in ipairs(plan.scripts) do table.insert(removed,{instance=instance,parent=instance.Parent});instance.Parent=nil end
        history:FinishRecording(recording,Enum.FinishRecordingOperation.Commit)
    end)
    if not ok then
        for index=#removed,1,-1 do local item=removed[index];pcall(function() item.instance.Parent=item.parent end) end
        for index=#changed,1,-1 do local item=changed[index];pcall(function() item.instance:SetAttribute(item.name,item.value) end) end
        pcall(function() history:FinishRecording(recording,Enum.FinishRecordingOperation.Cancel) end)
        error(why,0)
    end
    -- Unparented scripts remain available to Studio's Undo/Redo history.
    return plan
end
return Cleanup
