// Trusted, bounded client animation. No remote calls or package source evaluation.
export const KEYFRAME_RUNTIME = String.raw`local RunService=game:GetService("RunService")
local GuiService=game:GetService("GuiService")
return function(root,nodes,configs,options)
    local controller={}
    local records,connections,originals,lastWrite,writing={},{},{},{},{}
    local dead=false
    local function connect(signal,fn) table.insert(connections,signal:Connect(function(...) if not dead then fn(...) end end)) end
    local function remember(i,key)
        originals[i]=originals[i] or {}
        if originals[i][key]==nil then
            originals[i][key]=i[key]
            connect(i:GetPropertyChangedSignal(key),function() if not (writing[i] and writing[i][key]) and (not lastWrite[i] or lastWrite[i][key]~=i[key]) then originals[i][key]=i[key] end end)
        elseif not (writing[i] and writing[i][key]) and lastWrite[i] and lastWrite[i][key]~=nil and lastWrite[i][key]~=i[key] then
            originals[i][key]=i[key]
        end
        return originals[i][key]
    end
    local function write(i,key,value)
        remember(i,key);lastWrite[i]=lastWrite[i] or {};writing[i]=writing[i] or {};writing[i][key]=true
        i[key]=value
        -- Native properties store float/int precision; stamp the converted value
        -- so deferred signals never promote our animated values to authored ones.
        lastWrite[i][key]=i[key];writing[i][key]=nil
    end
    local function visible(i)
        local within=false
        while i do
            if i==root then within=true end
            if i:IsA("GuiObject") and not i.Visible then return false end
            if i:IsA("LayerCollector") then return within and i.Enabled end
            i=i.Parent
        end
        return within
    end
    local function permitted(r) return visible(r.node) and (not r.owner or r.owner.Active and r.owner.Interactable and visible(r.owner)) end
    local function reduced()
        if options.reducedMotion~=nil then return options.reducedMotion end
        local ok,value=pcall(function() return GuiService.ReducedMotionEnabled end)
        return ok and value
    end
    local function ease(t,kind,direction)
        t=math.clamp(t,0,1)
        if t==0 or t==1 then return t end
        local function inward(x)
            if kind=="linear" then return x elseif kind=="quad" then return x*x elseif kind=="cubic" then return x*x*x elseif kind=="sine" then return 1-math.cos(x*math.pi/2) end
            return x*x*(2.70158*x-1.70158)
        end
        if direction=="in" then return inward(t) elseif direction=="out" then return 1-inward(1-t) elseif t<.5 then return inward(t*2)/2 end
        return 1-inward((1-t)*2)/2
    end
    local function sample(r,elapsed)
        local k=r.settings
        local duration=k.frames[#k.frames].time
        local legs=(k.repeats+1)*(k.yoyo and 2 or 1)
        elapsed=math.clamp(elapsed,0,duration*legs)
        local leg=math.min(math.floor(elapsed/duration),legs-1)
        local time=elapsed-leg*duration
        if k.yoyo and leg%2==1 then time=duration-time end
        local a,b=k.frames[1],k.frames[#k.frames]
        for index=2,#k.frames do if time<=k.frames[index].time then a=k.frames[index-1];b=k.frames[index];break end end
        local t=ease((time-a.time)/(b.time-a.time),b.easing,b.direction)
        local pose={}
        for _,key in ipairs({"x","y","scale","rotation","opacity"}) do pose[key]=a[key]+(b[key]-a[key])*t end
        return pose,time,math.floor(leg/(k.yoyo and 2 or 1))+1,elapsed>=duration*legs
    end
    local function alpha(r,i)
        if i:GetAttribute("FramebridgeMotionHelper") or i:GetAttribute("FramebridgeParticleHelper") or i:GetAttribute("FramebridgeTextDecorationHelper") then return end
        local properties={}
        if i:IsA("CanvasGroup") then properties={"GroupTransparency"}
        elseif i:IsA("GuiObject") then
            table.insert(properties,"BackgroundTransparency")
            if i:IsA("TextLabel") or i:IsA("TextButton") or i:IsA("TextBox") then table.insert(properties,"TextTransparency");table.insert(properties,"TextStrokeTransparency") end
            if i:IsA("ImageLabel") or i:IsA("ImageButton") then table.insert(properties,"ImageTransparency") end
        elseif i:IsA("UIStroke") or i:IsA("UIShadow") then properties={"Transparency"} end
        for _,key in ipairs(properties) do remember(i,key);table.insert(r.alpha,{instance=i,key=key}) end
        if not i:IsA("CanvasGroup") then for _,child in ipairs(i:GetChildren()) do alpha(r,child) end end
    end
    local function render(r,pose)
        if r.slot then
            local p=remember(r.node,"Position")
            write(r.node,"Position",p+UDim2.fromOffset(math.round(pose.x),math.round(pose.y)))
            write(r.node,"Rotation",remember(r.node,"Rotation")+pose.rotation)
            if r.scale then write(r.scale,"Scale",remember(r.scale,"Scale")*math.max(.01,pose.scale)) end
        end
        for _,entry in ipairs(r.alpha) do local i,key=entry.instance,entry.key;write(i,key,math.clamp(1-(1-remember(i,key))*pose.opacity,0,1)) end
    end
    local function restore(r)
        if r.slot then
            for _,key in ipairs({"Position","Rotation"}) do write(r.node,key,remember(r.node,key)) end
            if r.scale then write(r.scale,"Scale",remember(r.scale,"Scale")) end
        end
        for _,entry in ipairs(r.alpha) do write(entry.instance,entry.key,remember(entry.instance,entry.key)) end
    end
    local function stop(r,status)
        r.playing=false;r.elapsed=0
        restore(r)
        r.node:SetAttribute("FramebridgeKeyframeStatus",status or "Stopped")
        r.node:SetAttribute("FramebridgeKeyframeTime",0)
        r.node:SetAttribute("FramebridgeKeyframeIteration",nil)
    end
    local function start(r)
        if dead or not permitted(r) then return false end
        if r.playing and r.settings.interruption=="ignore" then return false end
        r.elapsed=0;r.playing=true
        r.node:SetAttribute("FramebridgeKeyframeStatus",reduced() and "Reduced motion" or "Playing")
        local pose,time,iteration=sample(r,0)
        if not reduced() then render(r,pose) else restore(r) end
        r.node:SetAttribute("FramebridgeKeyframeTime",time);r.node:SetAttribute("FramebridgeKeyframeIteration",iteration)
        return true
    end
    function controller.play(id) local r=records[id];return r and start(r) or false end
    function controller.stop(id) local r=records[id];if dead or not r then return false end;stop(r);return true end
    function controller.activate(owner)
        if dead then return false end
        local played=false
        for _,r in pairs(records) do if r.settings.trigger=="activate" and r.settings.owner==owner then played=start(r) or played end end
        return played
    end
    local function state(r)
        local wanted=r.settings.trigger
        if wanted~="hover" and wanted~="pressed" and wanted~="selected" then return end
        local current=r.owner and r.owner:GetAttribute("FramebridgeState")
        local matches=permitted(r) and (current==wanted or wanted=="hover" and current=="selected")
        if matches and not r.engaged then start(r) elseif not matches and r.engaged then stop(r) end
        r.engaged=matches
    end
    function controller.refreshVisibility()
        if dead then return end
        for _,r in pairs(records) do
            local showing=permitted(r)
            if not showing and (r.showing or r.playing) then stop(r,"Hidden") end
            if showing and not r.showing and r.settings.trigger=="visible" then start(r) end
            r.showing=showing
            if r.owner then state(r) end
        end
    end
    for id,config in pairs(configs) do
        local k=config.keyframes;local i=nodes[id]
        if k and i then
            local r={node=i,settings=k,slot=k.slot and nodes[k.slot],owner=k.owner and nodes[k.owner],alpha={},elapsed=0,playing=false,engaged=false,showing=false}
            records[id]=r
            if r.slot then
                remember(i,"Position");remember(i,"Rotation")
                r.scale=i:FindFirstChildOfClass("UIScale")
                assert(r.scale,"Keyframe layout sizing must mount before animation")
                remember(r.scale,"Scale")
            end
            alpha(r,i)
            i:SetAttribute("FramebridgeKeyframeStatus","Ready")
            if r.owner then
                connect(r.owner:GetAttributeChangedSignal("FramebridgeState"),function() state(r) end)
                for _,key in ipairs({"Active","Interactable"}) do connect(r.owner:GetPropertyChangedSignal(key),controller.refreshVisibility) end
            end
            if k.trigger=="attribute" then connect(i:GetAttributeChangedSignal(k.attribute),function()
                local value=i:GetAttribute(k.attribute)
                if value==true or type(value)=="number" and value==value and value>-math.huge and value<math.huge then start(r) else stop(r) end
            end) end
        end
    end
    local ancestors={}
    for _,r in pairs(records) do local i=r.node;while i do if i:IsA("GuiObject") or i:IsA("LayerCollector") then ancestors[i]=true end;if i==root and root:IsA("LayerCollector") then break end;i=i.Parent end end
    for i in pairs(ancestors) do connect(i:GetPropertyChangedSignal(i:IsA("GuiObject") and "Visible" or "Enabled"),controller.refreshVisibility) end
    controller.refreshVisibility()
    for _,r in pairs(records) do
        if r.settings.trigger=="mount" then start(r)
        elseif r.settings.trigger=="attribute" and r.node:GetAttribute(r.settings.attribute)==true then start(r) end
    end
    function controller.step(dt)
        if dead or type(dt)~="number" or dt~=dt or dt<=0 then return end
        dt=math.min(dt,.25)
        controller.refreshVisibility()
        local calm=reduced()
        for _,r in pairs(records) do
            if r.playing and permitted(r) then
                r.elapsed+=dt
                local pose,time,iteration,complete=sample(r,r.elapsed)
                if calm then restore(r) else render(r,pose) end
                r.node:SetAttribute("FramebridgeKeyframeTime",time);r.node:SetAttribute("FramebridgeKeyframeIteration",iteration)
                if complete then
                    r.playing=false
                    if r.settings.finish=="restore" or calm then restore(r) end
                    r.node:SetAttribute("FramebridgeKeyframeStatus",calm and "Reduced motion" or "Complete")
                end
            end
        end
    end
    if next(records) and not options.manualKeyframes then connect(RunService.Heartbeat,controller.step) end
    function controller.connectionCount() return #connections end
    function controller.destroy()
        if dead then return end;dead=true
        for _,c in ipairs(connections) do c:Disconnect() end;table.clear(connections)
        for _,r in pairs(records) do
            pcall(function() restore(r);for _,key in ipairs({"FramebridgeKeyframeStatus","FramebridgeKeyframeTime","FramebridgeKeyframeIteration"}) do r.node:SetAttribute(key,nil) end end)
        end
        table.clear(records);table.clear(originals);table.clear(lastWrite);table.clear(writing)
    end
    return controller
end`;
