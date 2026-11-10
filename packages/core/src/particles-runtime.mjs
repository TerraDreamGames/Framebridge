// Trusted product engine and data-only adapter. Never fetches or requires package/module code.
export const PARTICLES_RUNTIME = String.raw`local Run=game:GetService("RunService")
local Gui=game:GetService("GuiService")
local Replicated=game:GetService("ReplicatedStorage")
return function(root,nodes,configs,options)
    local controller,records,connections,invalidNodes={},{},{},{}
    local destroyed,total=false,0
    local function valid(c)
        if type(c)~="table" or c.version~=1 then return false end
        local function number(v,lo,hi)return type(v)=="number" and v==v and v>=lo and v<=hi end
        local function pair(v,lo,hi,ordered)return type(v)=="table" and #v==2 and number(v[1],lo,hi) and number(v[2],lo,hi) and (not ordered or v[1]<=v[2]) end
        if not (c.kind=="confetti" or c.kind=="emitter2d") or not (c.engine=="framebridge-v1" or c.engine=="dogwarrior24-template-v1") or not (c.trigger=="manual" or c.trigger=="mount" or c.trigger=="activate") or type(c.enabled)~="boolean" or type(c.clip)~="boolean" or type(c.respectReducedMotion)~="boolean" or not number(c.capacity,1,128) or c.capacity%1~=0 or not number(c.count,1,c.capacity) or c.count%1~=0 or not number(c.rate,0,32) or not pair(c.lifetime,.05,5,true) or not pair(c.speed,0,1000,true) or not pair(c.size,1,64,true) or not pair(c.rotationSpeed,-720,720,true) or not pair(c.acceleration,-1000,1000,false) or not number(c.direction,-360,360) or not number(c.spread,0,360) or not number(c.drag,0,20) or not number(c.seed,0,2147483647) or c.seed%1~=0 or type(c.colors)~="table" or #c.colors<1 or #c.colors>8 or type(c.texture)~="string" or (c.texture~="" and not c.texture:match("^rbxassetid://[1-9]%d*$")) or not (c.shape=="point" or c.shape=="rectangle") then return false end
        for _,color in ipairs(c.colors) do if type(color)~="table" or #color~=3 then return false end;for _,v in ipairs(color) do if not number(v,0,1) then return false end end end
        if c.engine=="dogwarrior24-template-v1" then
            local d=c.dependency
            local function label(v)return type(v)=="string" and #v>0 and #v<=64 and v:match("^[A-Za-z0-9_.%-]+$") end
            return c.kind=="emitter2d" and c.texture~="" and c.acceleration[1]==0 and c.acceleration[2]==0 and c.drag==0 and type(d)=="table" and label(d.template) and d.template:match("^[A-Za-z][A-Za-z0-9_%-]*$") and label(d.configVersion) and label(d.clientRevision)
        end
        return c.dependency==nil
    end
    local function connect(signal,fn) table.insert(connections,signal:Connect(function(...) if not destroyed then fn(...) end end)) end
    local function helper(class,parent)
        local n=Instance.new(class);n.Name="Framebridge particles";n:SetAttribute("FramebridgeParticleHelper",true)
        n:SetAttribute("FramebridgeParticleHelperSource",parent:GetAttribute("FramebridgeSource") or parent:GetAttribute("FramebridgeParticleHelperSource"))
        n:SetAttribute("FramebridgeParticleOwner",parent:GetAttribute("FramebridgeId") or parent:GetAttribute("FramebridgeParticleOwner"))
        n.Parent=parent;return n
    end
    local function ready(record,status) record.node:SetAttribute("FramebridgeParticlesStatus",status) end
    local function visible(record)
        if record.node:GetAttribute("FramebridgeParticlesEnabled")==false or not record.config.enabled then return false end
        local n=record.node
        while n do
            if n:IsA("GuiObject") and not n.Visible then return false end
            if n:IsA("LayerCollector") then return n.Enabled end
            n=n.Parent
        end
        return false
    end
    local function reduced(record)
        if not record.config.respectReducedMotion then return false end
        if options.reducedMotion~=nil then return options.reducedMotion end
        local ok,value=pcall(function()return Gui.ReducedMotionEnabled end);return ok and value
    end
    local function clear(record)
        local hadParticles=#record.particles>0
        for _,p in ipairs(record.particles) do if p.gui then p.gui:Destroy() end end
        total-=#record.particles;table.clear(record.particles);record.accumulator=0
        if hadParticles and record.external then local event=record.external:FindFirstChild("Clear");if event and event:IsA("BindableEvent") then event:Fire() end end
        record.node:SetAttribute("FramebridgeParticleCount",0)
    end
    local function destroyExternal(record)
        clear(record);if record.external then record.external:Destroy();record.external=nil end
    end
    local function dependency(record)
        local c=record.config
        if c.engine=="framebridge-v1" then ready(record,"Ready");return true end
        if not root:IsA("ScreenGui") and not root:FindFirstAncestorWhichIsA("ScreenGui") then ready(record,"Emitter2D needs ScreenGui");return false end
        if record.external then
            local emit,clearEvent=record.external:FindFirstChild("Emit"),record.external:FindFirstChild("Clear")
            if emit and emit:IsA("BindableEvent") and clearEvent and clearEvent:IsA("BindableEvent") then ready(record,"Ready");return true end
            ready(record,record.waitAge>3 and "Emitter2D client unavailable; retry" or "Waiting for Emitter2D client");return false
        end
        local folder=Replicated:FindFirstChild("FramebridgeParticleTemplates")
        local wrapper=folder and folder:FindFirstChild(c.dependency.template)
        local template=wrapper and wrapper:FindFirstChild("Emitter")
        if not wrapper or wrapper:GetAttribute("FramebridgeEmitter2DContract")~=1 or wrapper:GetAttribute("FramebridgeEmitter2DClientRevision")~=c.dependency.clientRevision or not template or not template:IsA("GuiObject") or template:GetAttribute("ClassName")~="Emitter2D" or tostring(template:GetAttribute("Version"))~=c.dependency.configVersion then ready(record,"Missing or mismatched Emitter2D template");return false end
        local descendants=template:GetDescendants()
        if #descendants>128 then ready(record,"Invalid Emitter2D template");return false end
        for _,child in ipairs(descendants) do if child:IsA("LuaSourceContainer") then ready(record,"Template must not contain scripts");return false end end
        local object=template:Clone();if not object then ready(record,"Invalid Emitter2D template");return false end;record.external=object;record.waitAge=0
        -- Clone does not copy event listeners. Require the installed client to create a fresh handshake.
        for _,child in ipairs(object:GetChildren())do
            if child:IsA("BindableEvent") and (child.Name=="Emit" or child.Name=="Clear" or child.Name=="TimeStep" or child.Name=="SetSeeds")then child:Destroy()end
        end
        object.Name="Framebridge Emitter2D";object.Visible=true;object.Active=false;if object:IsA("GuiButton") then object.Interactable=false end;object.BackgroundTransparency=1;object.Size=UDim2.fromScale(1,1);object.Position=UDim2.fromScale(0,0);object.AnchorPoint=Vector2.zero
        -- Do not add Framebridge attributes to the strict third-party emitter itself.
        local values={Enabled=false,Paused=false,TimeScale=1,EmissionRate=NumberRange.new(0),LifeTime=NumberRange.new(table.unpack(c.lifetime)),Size=NumberRange.new(table.unpack(c.size)),Speed=NumberRange.new(table.unpack(c.speed)),Rotation=NumberRange.new(0,360),RotationSpeed=NumberRange.new(table.unpack(c.rotationSpeed)),EmissionDirection=c.direction,SpreadAngle=c.spread,Texture=c.texture,EmissionShape=c.shape=="point" and "Point" or "Rectangle",EmissionShapeStyle="Volume",SizeConstraint="Offset",UseScreenSize=false,LockedToGui=true,MasterScale=1,IgnoreGraphicsLevel=false,IgnoreClipsDescendants=false,Scale=NumberSequence.new(1,0),Transparency=NumberSequence.new(0,1)}
        local stops={};for i,color in ipairs(c.colors) do table.insert(stops,ColorSequenceKeypoint.new((i-1)/math.max(1,#c.colors-1),Color3.new(table.unpack(color)))) end
        if #stops==1 then table.insert(stops,ColorSequenceKeypoint.new(1,stops[1].Value)) end;values.Color=ColorSequence.new(stops)
        for key,value in pairs(values) do object:SetAttribute(key,value) end
        object.Parent=record.container
        ready(record,"Waiting for Emitter2D client");return false
    end
    local function emit(record,count)
        if destroyed or not visible(record) or reduced(record) then return 0 end
        if not dependency(record) then return 0 end
        count=math.min(math.floor(count),record.config.capacity-#record.particles,512-total)
        if count<=0 then return 0 end
        local c,rng=record.config,record.random
        local function range(pair)return rng:NextNumber(pair[1],pair[2])end
        for _=1,count do
            local p={age=0,life=record.external and c.lifetime[2] or range(c.lifetime)}
            if not record.external then
                local angle=math.rad(c.direction+rng:NextNumber(-c.spread/2,c.spread/2));local speed=range(c.speed)
                p.x=c.shape=="rectangle" and rng:NextNumber(0,record.node.AbsoluteSize.X) or record.node.AbsoluteSize.X/2
                p.y=c.shape=="rectangle" and rng:NextNumber(0,record.node.AbsoluteSize.Y) or record.node.AbsoluteSize.Y/2
                p.vx=math.sin(angle)*speed;p.vy=-math.cos(angle)*speed;p.rotation=rng:NextNumber(0,360);p.spin=range(c.rotationSpeed);p.size=range(c.size)
                p.gui=helper(c.texture=="" and "Frame" or "ImageLabel",record.container)
                p.gui.AnchorPoint=Vector2.new(.5,.5);p.gui.BorderSizePixel=0;p.gui.Active=false;p.gui.ZIndex=math.min(record.node.ZIndex+1,100)
                local color=Color3.new(table.unpack(c.colors[rng:NextInteger(1,#c.colors)]))
                if p.gui:IsA("ImageLabel") then p.gui.BackgroundTransparency=1;p.gui.Image=c.texture;p.gui.ImageColor3=color else p.gui.BackgroundColor3=color end
                p.gui.Size=UDim2.fromOffset(p.size,c.kind=="confetti" and p.size*.5 or p.size)
                p.gui.Position=UDim2.fromOffset(p.x,p.y);p.gui.Rotation=p.rotation
            end
            table.insert(record.particles,p)
        end
        total+=count
        if record.external then record.external.Emit:Fire(count) end
        record.node:SetAttribute("FramebridgeParticleCount",#record.particles);return count
    end
    function controller.emit(id,count)
        local r=records[id];if not r or destroyed then return 0 end
        if count~=nil and (type(count)~="number" or count~=count or count<1 or count>128 or count%1~=0) then return 0 end
        return emit(r,count or r.config.count)
    end
    function controller.clear(id) local r=records[id];if not r or destroyed then return false end;clear(r);return true end
    function controller.retry(id) local r=records[id];if not r or destroyed then return false end;destroyExternal(r);return dependency(r) end
    function controller.activate(owner)
        local result=false
        for _,r in pairs(records) do if r.config.trigger=="activate" and r.config.owner==owner then result=emit(r,r.config.count)>0 or result end end
        return result
    end
    function controller.step(dt)
        if destroyed or type(dt)~="number" or dt~=dt then return end
        dt=math.clamp(dt,0,.1)
        for _,r in pairs(records) do
            r.waitAge+=dt
            if r.external then dependency(r) end
            if not r.node.Parent or not visible(r) or reduced(r) then clear(r)
            else
                for i=#r.particles,1,-1 do
                    local p=r.particles[i];p.age+=dt
                    if p.age>=p.life then if p.gui then p.gui:Destroy() end;table.remove(r.particles,i);total-=1
                    elseif p.gui then
                        p.vx=(p.vx+r.config.acceleration[1]*dt)*math.exp(-r.config.drag*dt);p.vy=(p.vy+r.config.acceleration[2]*dt)*math.exp(-r.config.drag*dt)
                        p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt
                        p.gui.Position=UDim2.fromOffset(p.x,p.y);p.gui.Rotation=p.rotation
                        local progress=p.age/p.life
                        if p.gui:IsA("ImageLabel") then p.gui.ImageTransparency=progress else p.gui.BackgroundTransparency=progress end
                    end
                end
                r.node:SetAttribute("FramebridgeParticleCount",#r.particles)
                r.accumulator=math.min(r.accumulator+dt*r.config.rate,128)
                local count=math.floor(r.accumulator)
                if count>0 then r.accumulator-=count;emit(r,count) end
                if r.config.trigger=="mount" and not r.mounted and dependency(r) then r.mounted=true;emit(r,r.config.count) end
            end
        end
    end
    function controller.destroy()
        if destroyed then return end
        destroyed=true
        for _,c in ipairs(connections) do c:Disconnect() end;table.clear(connections)
        for _,r in pairs(records) do destroyExternal(r);r.container:Destroy();r.node:SetAttribute("FramebridgeParticlesStatus",nil);r.node:SetAttribute("FramebridgeParticleCount",nil) end
        table.clear(records)
        for _,node in ipairs(invalidNodes) do node:SetAttribute("FramebridgeParticlesStatus",nil) end;table.clear(invalidNodes)
    end
    function controller.connectionCount()return #connections end
    function controller.count()return total end
    local ok,why=pcall(function()
        for id,config in pairs(configs) do
            local c=config.particles;local node=nodes[id]
            if c and node then
                local count=0;for _ in pairs(records) do count+=1 end
                if not valid(c) or count>=16 or not node:IsA("GuiObject") then table.insert(invalidNodes,node);node:SetAttribute("FramebridgeParticlesStatus","Invalid particle settings");continue end
                local container=helper("Frame",node);container:SetAttribute("FramebridgeParticleEngine",c.engine);container.BackgroundTransparency=1;container.BorderSizePixel=0;container.Size=UDim2.fromScale(1,1);container.Position=UDim2.fromScale(0,0);container.ClipsDescendants=c.clip;container.Active=false
                local r={node=node,config=c,container=container,particles={},random=Random.new(c.seed),accumulator=0,mounted=false,waitAge=0};records[id]=r
                dependency(r)
                connect(node:GetAttributeChangedSignal("FramebridgeParticleBurst"),function()emit(r,c.count)end)
                connect(node:GetAttributeChangedSignal("FramebridgeParticlesClear"),function()clear(r)end)
                connect(node:GetAttributeChangedSignal("FramebridgeParticlesRetry"),function()controller.retry(id)end)
                connect(node:GetAttributeChangedSignal("FramebridgeParticlesEnabled"),function()if not visible(r) then clear(r) end end)
            end
        end
        if next(records) and options.autoParticles~=false then connect(Run.RenderStepped,controller.step) end
        controller.step(0)
    end)
    if not ok then controller.destroy();error(why,0) end
    return controller
end`;

export function withParticles(runtime) {
  for (const hook of [
    "local mounted =",
    "local motionController",
    "if handled==false then return false end",
    "controlController = mountControls",
    "function controller.stepMotion",
    "local function changed(instance)",
  ])
    if (!runtime.includes(hook))
      throw new Error(`Particle runtime integration hook missing: ${hook}`);
  return runtime
    .replace(
      "local mounted =",
      `local mountParticles = (function()\n${PARTICLES_RUNTIME}\nend)()\nlocal mounted =`,
    )
    .replace(
      /local motionController([^\n]*)/,
      "local particleController\n    local motionController$1",
    )
    .replace(
      "if not enabled(button) or not config then return false end",
      "if not enabled(button) then return false end\n        config=config or {}",
    )
    .replace(
      "if handled==false then return false end",
      "if handled==false then return false end\n        local particleHandled=particleController and particleController.activate(id)\n        handled=particleHandled or handled",
    )
    .replaceAll(
      "if controlController then controlController.destroy(); controlController=nil end",
      "if particleController then particleController.destroy();particleController=nil end\n        if controlController then controlController.destroy(); controlController=nil end",
    )
    .replace(
      "(controlController and controlController.connectionCount() or 0)",
      "(particleController and particleController.connectionCount() or 0) + (controlController and controlController.connectionCount() or 0)",
    )
    .replace(
      "function controller.stepMotion",
      "function controller.emitParticles(id,count) return particleController and particleController.emit(id,count) or 0 end\n    function controller.clearParticles(id) return particleController and particleController.clear(id) or false end\n    function controller.retryParticles(id) return particleController and particleController.retry(id) or false end\n    function controller.stepParticles(dt) if particleController then particleController.step(dt) end end\n    function controller.particleCount() return particleController and particleController.count() or 0 end\n    function controller.stepMotion",
    )
    .replace(
      "controlController = mountControls",
      "particleController = mountParticles(root,nodes,configs,options)\n        controlController = mountControls",
    )
    .replace(
      'if current:GetAttribute("FramebridgeMotionHelper") then',
      'if current:GetAttribute("FramebridgeMotionHelper") or current:GetAttribute("FramebridgeParticleHelper") then',
    );
}
