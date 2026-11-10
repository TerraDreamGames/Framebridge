assert(game.PlaceId==0,"Particle QA requires the approved blank Place1")
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body)local ok,why=xpcall(body,debug.traceback);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end end
local function pkg()return Importer.decode(fixture)end
local function find(package,id)local function visit(n)if n.id==id then return n end;for _,c in ipairs(n.children)do local r=visit(c);if r then return r end end end;for _,r in ipairs(package.roots)do local n=visit(r);if n then return n end end end
local function setup(package)
    package=package or pkg();local stage=Importer.stage(package,{},false,runtimeSource)
    local controller=Runtime.mount(stage.roots[1],{autoParticles=false,reducedMotion=false})
    return stage,controller
end
local function check(name,body)
    test(name,function()local stage,c=setup();local ok,why=xpcall(function()body(stage,c)end,debug.traceback);c.destroy();Importer.destroy(stage);assert(ok,why)end)
end
test("trusted particles emitted only with compatible Studio runtime",function()
    local package=pkg();local stage=Importer.stage(package,{},false,runtimeSource)
    assert(stage.roots[1]:GetAttribute("FramebridgeParticles")=="1")
    local client=stage.roots[1].FramebridgeInteractions
    assert(client.Source=="-- Framebridge generated runtime bootstrap.\nrequire(script.FramebridgeRuntime)\n")
    assert(client.FramebridgeRuntime.Source=="local runtimeModule=script\nlocal script=runtimeModule.Parent\n"..runtimeSource.themeParticleSource.."\nconnect(runtimeModule.Destroying,cleanup)\nreturn true\n")
    Importer.destroy(stage)
    assert(not pcall(Importer.stage,package,{},false,{version=runtimeSource.version,source=runtimeSource.source,themeSource=runtimeSource.themeSource}))
end)
test("invalid capacity, dependency, owner and raw schema are rejected",function()
    for _,kind in ipairs({"capacity","rate","owner","code","version","texture","world"})do
        local package=pkg();local p=find(package,"celebrate").behavior.particles
        if kind=="capacity"then p.capacity=129 elseif kind=="rate"then p.rate=1000 elseif kind=="owner"then p.owner="ambient" elseif kind=="code"then p.Source="print('bad')" elseif kind=="version"then p.version=2 elseif kind=="texture"then find(package,"external").behavior.particles.texture="https://example.com/module" elseif kind=="world"then package.roots[1].className="SurfaceGui" end
        assert(not pcall(Importer.decode,Http:JSONEncode(package)),"Malformed particles accepted: "..kind)
    end
end)
check("native bursts cap, move, fade and expire without topology rebuilds",function(stage,c)
    local node=stage.byId.celebrate.instance
    local count=c.connectionCount();assert(c.emitParticles("celebrate",128)==24)
    assert(c.emitParticles("celebrate")==0);local frame=node:FindFirstChild("Framebridge particles"):FindFirstChildWhichIsA("Frame")
    assert(frame and frame:GetAttribute("FramebridgeParticleHelper"));local position=frame.Position
    c.stepParticles(.1);assert(frame.Position~=position and frame.BackgroundTransparency>0)
    task.wait();assert(c.connectionCount()==count and c.particleCount()>=24,"Own particle helpers caused runtime rebuild")
    c.clearParticles("ambient");for _=1,6 do c.stepParticles(.1)end
    assert(node:GetAttribute("FramebridgeParticleCount")==0)
    assert(c.emitParticles("celebrate",129)==0 and c.emitParticles("celebrate",0/0)==0)
end)
check("activation guards, explicit burst/clear and ancestor hiding work",function(stage,c)
    local node=stage.byId.celebrate.instance
    assert(c.activate("celebrate"));assert(node:GetAttribute("FramebridgeParticleCount")==12)
    node.Interactable=false;assert(not c.activate("celebrate"));node.Interactable=true
    node:SetAttribute("FramebridgeParticlesClear",1);task.wait();assert(node:GetAttribute("FramebridgeParticleCount")==0)
    node:SetAttribute("FramebridgeParticleBurst",1);task.wait();assert(node:GetAttribute("FramebridgeParticleCount")==12)
    stage.roots[1].Enabled=false;c.stepParticles(.1);assert(c.particleCount()==0 and c.emitParticles("celebrate")==0)
    stage.roots[1].Enabled=true;node:SetAttribute("FramebridgeParticlesEnabled",false);assert(c.emitParticles("celebrate")==0)
end)
test("root budget, reduced motion and malformed runtime attributes remain bounded",function()
    local package=pkg();local canvas=package.roots[1].children[1];canvas.children={}
    for i=1,6 do local p=find(pkg(),"ambient");p.id="budget"..i;p.behavior.particles.trigger="manual";p.behavior.particles.count=128;p.behavior.particles.capacity=128;p.behavior.particles.rate=0;table.insert(canvas.children,p) end
    package.roots[1].themes=nil
    local stage,c=setup(package);for i=1,6 do c.emitParticles("budget"..i)end;assert(c.particleCount()==512)
    c.destroy();c=Runtime.mount(stage.roots[1],{autoParticles=false,reducedMotion=true});assert(c.emitParticles("budget1")==0 and c.particleCount()==0)
    local node=stage.byId.budget1.instance;local raw=Http:JSONDecode(node:GetAttribute("FramebridgeBehavior"));raw.particles.capacity=100000;node:SetAttribute("FramebridgeBehavior",Http:JSONEncode(raw));task.wait();assert(node:GetAttribute("FramebridgeParticlesStatus")=="Invalid particle settings")
    c.destroy();assert(c.connectionCount()==0);Importer.destroy(stage)
end)
test("cooldown controls block repeated particle dispatch before emission",function()
    local package=pkg();find(package,"celebrate").behavior.control={kind="cooldown",duration=1}
    local stage,c=setup(package);local node=stage.byId.celebrate.instance
    local ok,why=xpcall(function()
        assert(c.activate("celebrate") and node:GetAttribute("FramebridgeParticleCount")==12)
        c.clearParticles("celebrate");assert(not c.activate("celebrate") and node:GetAttribute("FramebridgeParticleCount")==0,"Blocked cooldown leaked a burst")
    end,debug.traceback)
    c.destroy();Importer.destroy(stage);assert(ok,why)
end)
test("Emitter2D contract missing/version/script failure recovers through explicit retry",function()
    local stage,c=setup();local r=stage.byId.external.instance
    assert(r:GetAttribute("FramebridgeParticlesStatus")=="Missing or mismatched Emitter2D template")
    local Replicated=game:GetService("ReplicatedStorage");local folder=Replicated:FindFirstChild("FramebridgeParticleTemplates");local created=not folder
    if not folder then folder=Instance.new("Folder");folder.Name="FramebridgeParticleTemplates";folder.Parent=Replicated end
    assert(not folder:FindFirstChild("FramebridgeParticleQA"),"Owned QA dependency already exists")
    local wrapper=Instance.new("Folder");wrapper.Name="FramebridgeParticleQA";wrapper:SetAttribute("FramebridgeEmitter2DContract",1);wrapper:SetAttribute("FramebridgeEmitter2DClientRevision","reviewed-qa-v1");wrapper.Parent=folder
    local template=Instance.new("Frame");template.Name="Emitter";template:SetAttribute("ClassName","Emitter2D");template:SetAttribute("Version",2);template.Parent=wrapper
    local subscriptions={}
    local ok,why=xpcall(function()
        assert(not c.retryParticles("external"));template:SetAttribute("Version",1)
        local forbidden=Instance.new("LocalScript");forbidden.Parent=template;assert(not c.retryParticles("external") and r:GetAttribute("FramebridgeParticlesStatus")=="Template must not contain scripts");forbidden:Destroy()
        for _,name in ipairs({"Emit","Clear"})do local stale=Instance.new("BindableEvent");stale.Name=name;stale.Parent=template end
        assert(not c.retryParticles("external"))
    end,debug.traceback)
    -- Access by exact generated display name; no actual third-party code executes in this test.
    if ok then
        ok,why=xpcall(function()
            local external=r:FindFirstChild("Framebridge particles"):FindFirstChild("Framebridge Emitter2D")
            assert(not external:FindFirstChild("Emit") and not external:FindFirstChild("Clear"),"Cloned events falsely reported an installed client")
            local emitted,cleared=0,0
            for _,name in ipairs({"Emit","Clear"})do local event=Instance.new("BindableEvent");event.Name=name;event.Parent=external;table.insert(subscriptions,event.Event:Connect(function(n)if name=="Emit"then emitted+=n else cleared+=1 end end))end
            assert(c.emitParticles("external")==3);task.wait();assert(emitted==3 and external:GetAttribute("EmissionRate").Max==0 and external:GetAttribute("LifeTime").Max==2)
            assert(c.emitParticles("external",128)==3 and c.emitParticles("external")==0);task.wait();assert(emitted==6)
            for _=1,19 do c.stepParticles(.1)end;assert(r:GetAttribute("FramebridgeParticleCount")==6,"Reservations expired before the external maximum lifetime")
            c.clearParticles("external");task.wait();assert(cleared>0 and r:GetAttribute("FramebridgeParticleCount")==0)
        end,debug.traceback)
    end
    c.destroy();Importer.destroy(stage);for _,connection in ipairs(subscriptions)do connection:Disconnect()end;wrapper:Destroy();if created then folder:Destroy()end;assert(ok,why)
end)
test("reimport preserves scripts and edited runtime protection; removal cleans owned effects",function()
    local package=pkg();local host=Instance.new("Folder");local stage=Importer.stage(package,{},false,runtimeSource);local roots=Importer.apply(stage,package,host,false);local root=roots[1];local node=stage.byId.celebrate.instance
    local user=Instance.new("LocalScript");user.Name="User particle handler";user.Source="-- QA application";user.Parent=node
    local c=Runtime.mount(root,{autoParticles=false,reducedMotion=false});c.emitParticles("celebrate");local count=c.connectionCount()
    local next=pkg();find(next,"celebrate").behavior.particles.count=8
    local replacement=Importer.stage(next,{},false,runtimeSource);Importer.apply(replacement,next,host,true);task.wait();assert(user.Parent==node and c.connectionCount()==count);c.clearParticles("celebrate");assert(c.activate("celebrate") and node:GetAttribute("FramebridgeParticleCount")==8)
    local client=root.FramebridgeInteractions;client.Source="-- manually edited"
    replacement=Importer.stage(next,{},false,runtimeSource);assert(not pcall(Importer.apply,replacement,next,host,true));Importer.destroy(replacement);assert(user.Parent==node)
    c.destroy();assert(c.connectionCount()==0 and not node:FindFirstChild("Framebridge particles"));client.Source=client:GetAttribute("FramebridgeGeneratedSource")
    for _,n in ipairs(next.roots[1].children[1].children)do n.behavior=nil;n.theme=nil end;next.roots[1].themes=nil
    replacement=Importer.stage(next,{},false,runtimeSource);Importer.apply(replacement,next,host,true);assert(not root:FindFirstChild("FramebridgeInteractions") and root:GetAttribute("FramebridgeParticles")==nil and user.Parent==node)
    host:Destroy()
end)
test("whole emitter removal cleans live helpers but preserves foreign content protection",function()
    local package=pkg();local host=Instance.new("Folder");local stage=Importer.stage(package,{},false,runtimeSource)
    local roots=Importer.apply(stage,package,host,false);local c=Runtime.mount(roots[1],{autoParticles=false,reducedMotion=false});local node=stage.byId.celebrate.instance;c.emitParticles("celebrate")
    local next=pkg();table.remove(next.roots[1].children[1].children,1);next.roots[1].themes=nil
    local ok,why=xpcall(function()
    local replacement=Importer.stage(next,{},false,runtimeSource)
    local foreign=Instance.new("Frame");foreign.Parent=node["Framebridge particles"]
    assert(not pcall(Importer.apply,replacement,next,host,true),"Foreign helper child silently discarded");assert(foreign.Parent);foreign:Destroy()
    local attached=Instance.new("LocalScript");attached.Parent=node["Framebridge particles"]
    assert(not pcall(Importer.apply,replacement,next,host,true),"Attached helper script silently discarded");assert(attached.Parent);attached:Destroy()
    Importer.apply(replacement,next,host,true);task.wait();assert(node.Parent==nil,"Emitter node was retained")
    assert(roots[1]:FindFirstChild("Particles QA") and roots[1]["Particles QA"]:FindFirstChild("Ambient emitter"),"Unrelated layer removed")
    end,debug.traceback)
    c.destroy();host:Destroy();assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Native Framebridge particles; installed Emitter2D contract stub only"}
