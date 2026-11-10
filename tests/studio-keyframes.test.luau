local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body) local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end end
local function package() return Importer.decode(fixture) end
local function find(pkg,id)
    local found;local function visit(n) if n.id==id then found=n end;for _,child in ipairs(n.children) do visit(child) end end
    for _,root in ipairs(pkg.roots) do visit(root) end;return found
end
local function near(a,b) return math.abs(a-b)<.0001 end
local function advance(c,seconds) for _=1,math.floor(seconds/.05+.001) do c.stepKeyframes(.05) end end
local function native(body,mutate,reduced)
    local p=package();if mutate then mutate(p) end
    local s=Importer.stage(p,{},false,runtimeSource);local c
    local ok,why=pcall(function() c=Runtime.mount(s.roots[1],{manualMotion=true,manualKeyframes=true,reducedMotion=reduced or false});body(s,c,p) end)
    if c then c.destroy();assert(c.connectionCount()==0,"Subscriptions leaked") end
    Importer.destroy(s);assert(ok,why)
end
test("importer rejects arbitrary source, malformed times and authored recording data",function()
    for _,change in ipairs({function(k)k.source="print(1)" end,function(k)k.repeats=21 end,function(k)k.frames[2].time=0 end,function(k)k.frames[2].scale=0 end,function(k)k.frames[2].x=2001 end,function(k)k.frames[2].easing="function" end,function(k)k.recording={} end,function(k)k.attribute="Bogus" end}) do
        local p=package();change(find(p,"activate").behavior.keyframes);assert(not pcall(Importer.decode,Http:JSONEncode(p)))
    end
end)
test("importer rejects foreign input owners, slots and multiple opacity writers",function()
    for _,change in ipairs({function(p)find(p,"activate").behavior.keyframes.owner="open" end,function(p)find(p,"activate").behavior.keyframes.slot="hover/motion-slot" end,function(p)find(p,"activate-label").behavior={keyframes={trigger="mount",interruption="restart",finish="hold",repeats=0,yoyo=false,frames={{time=0,x=0,y=0,scale=1,rotation=0,opacity=1,easing="linear",direction="out"},{time=1,x=0,y=0,scale=1,rotation=0,opacity=0,easing="linear",direction="out"}}}} end,function(p)find(p,"activate").behavior.control={kind="toggle",value=false} end}) do
        local p=package();change(p);assert(not pcall(Importer.decode,Http:JSONEncode(p)))
    end
end)
test("15 easing/direction chains match TypeScript oracle at seven native poses",function()
    for _,case in ipairs(oracle) do
        native(function(s,c)
            local i=s.byId.activate.instance;local scale=i:FindFirstChildOfClass("UIScale")
            for _,sample in ipairs(case.samples) do
                assert(c.playKeyframes("activate"));advance(c,sample.elapsed)
                assert(math.abs(i.Position.X.Offset-sample.pose.x)<=.5001 and math.abs(i.Position.Y.Offset-sample.pose.y)<=.5001,Http:JSONEncode({easing=case.chain.frames[2].easing,direction=case.chain.frames[2].direction,elapsed=sample.elapsed,x=i.Position.X.Offset,y=i.Position.Y.Offset,expected=sample.pose,time=i:GetAttribute("FramebridgeKeyframeTime")}))
                assert(near(i.Rotation,sample.pose.rotation) and near(scale.Scale,sample.pose.scale),"Native rotation/scale differs")
                assert(near(i.BackgroundTransparency,math.clamp(1-sample.pose.opacity,0,1)),"Native opacity differs")
            end
        end,function(p) local k=case.chain;k.owner="activate";k.slot="activate/motion-slot";find(p,"activate").behavior.keyframes=k end)
    end
end)
test("activation, restart, hold and layout reservation work without an action",function()
    native(function(s,c)
        local i,slot=s.byId.activate.instance,s.byId["activate/motion-slot"].instance;local position,size=slot.Position,slot.Size
        assert(c.activate("activate"));advance(c,.5);assert(i.Position.X.Offset==40 and near(i.BackgroundTransparency,.5))
        assert(c.activate("activate") and i.Position.X.Offset==0);advance(c,1.05)
        assert(i.Position.X.Offset==60 and i:GetAttribute("FramebridgeKeyframeStatus")=="Complete")
        assert(slot.Position==position and slot.Size==size)
        i.Interactable=false;assert(not c.activate("activate"))
    end)
end)
test("parent cooldowns gate decorative activation chains and panel actions together",function()
    native(function(s,c)
        local i=s.byId["open-label"].instance;assert(c.activate("open"));advance(c,.5)
        assert(near(i.TextTransparency,.5) and s.byId.panel.instance.Visible)
        assert(not c.activate("open") and near(i:GetAttribute("FramebridgeKeyframeTime"),.5))
        for _=1,4 do c.stepControls(.25) end;assert(c.activate("open") and i:GetAttribute("FramebridgeKeyframeTime")==0 and not s.byId.panel.instance.Visible)
    end,function(p)
        find(p,"open").behavior.control={kind="cooldown",duration=1}
        find(p,"open-label").behavior={keyframes={trigger="activate",input="parent",owner="open",interruption="restart",finish="hold",repeats=0,yoyo=false,frames={{time=0,x=0,y=0,scale=1,rotation=0,opacity=1,easing="linear",direction="out"},{time=1,x=0,y=0,scale=1,rotation=0,opacity=0,easing="linear",direction="out"}}}}
    end)
end)
test("ignore interruption and capped frame time are deterministic",function()
    native(function(s,c)
        local i=s.byId.activate.instance;assert(c.activate("activate"));c.stepKeyframes(99)
        assert(near(i:GetAttribute("FramebridgeKeyframeTime"),.25))
        assert(not c.activate("activate"));advance(c,.25);assert(i.Position.X.Offset==40)
        c.stepKeyframes(0);c.stepKeyframes(-1);c.stepKeyframes(0/0);assert(i.Position.X.Offset==40)
    end,function(p)find(p,"activate").behavior.keyframes.interruption="ignore" end)
end)
test("repeat/yoyo ends at the recorded first pose and restores authored properties",function()
    native(function(s,c)
        local i=s.byId.mount.instance;assert(i:GetAttribute("FramebridgeKeyframeStatus")=="Playing")
        advance(c,1);assert(i.Position.X.Offset==60)
        advance(c,1);assert(i.Position.X.Offset==0 and i:GetAttribute("FramebridgeKeyframeIteration")==2)
        advance(c,2.05);assert(i.Position.X.Offset==0 and i:GetAttribute("FramebridgeKeyframeStatus")=="Complete")
    end)
end)
test("visible entrance synchronizes panel reservation and restarts after hiding",function()
    native(function(s,c)
        local i,slot=s.byId.panel.instance,s.byId["panel/motion-slot"].instance
        assert(not i.Visible and not slot.Visible,"Initial panel visible");assert(c.activate("open"),"Open failed");assert(i.Visible and slot.Visible and i.Position.Y.Offset==30 and i.BackgroundTransparency==1,Http:JSONEncode({visible=i.Visible,slot=slot.Visible,y=i.Position.Y.Offset,alpha=i.BackgroundTransparency,status=i:GetAttribute("FramebridgeKeyframeStatus")}))
        advance(c,.55);assert(i.Position.Y.Offset==0 and i.BackgroundTransparency==0)
        assert(c.activate("open") and not slot.Visible and i:GetAttribute("FramebridgeKeyframeStatus")=="Hidden")
        assert(c.activate("open") and i.Position.Y.Offset==30 and i.BackgroundTransparency==1)
    end)
end)
test("hover, pressed and selected states enter once, leave cleanly and respect disabled owners",function()
    native(function(s,c)
        for _,entry in ipairs({{"hover","hover"},{"press","pressed"},{"selected","selected"}}) do
            local i=s.byId[entry[1]].instance;i:SetAttribute("FramebridgeState",entry[2]);advance(c,.5);assert(i.Position.X.Offset==40)
            i:SetAttribute("FramebridgeState","default");task.wait();assert(i.Position.X.Offset==0 and i:GetAttribute("FramebridgeKeyframeStatus")=="Stopped")
            i.Interactable=false;task.wait();i:SetAttribute("FramebridgeState",entry[2]);advance(c,.5);assert(i.Position.X.Offset==0)
            i.Interactable=true;task.wait();i:SetAttribute("FramebridgeState",entry[2]);task.wait();advance(c,.5);assert(i.Position.X.Offset==40,"Disabled state edge was consumed")
        end
    end)
end)
test("local attribute edges trigger and cancel; hidden collectors interrupt playback",function()
    native(function(s,c)
        local i=s.byId.attribute.instance;i:SetAttribute("FramebridgeAnimate",1);task.wait();advance(c,.5);assert(i.Position.X.Offset==40)
        i:SetAttribute("FramebridgeAnimate",2);task.wait();assert(i.Position.X.Offset==0);advance(c,.25)
        i:SetAttribute("FramebridgeAnimate",false);task.wait();assert(i.Position.X.Offset==0)
        i:SetAttribute("FramebridgeAnimate",true);task.wait();advance(c,.5);s.roots[1].Enabled=false;task.wait()
        assert(i:GetAttribute("FramebridgeKeyframeStatus")=="Hidden" and i.Position.X.Offset==0)
    end)
end)
test("CanvasGroup fades apply once; generated particles are excluded from authored alpha",function()
    native(function(s,c)
        local i=s.byId.activate.instance;local label=s.byId["activate-label"].instance
        local particle=Instance.new("Frame");particle:SetAttribute("FramebridgeParticleHelper",true);particle.BackgroundTransparency=.2;particle.Parent=i
        c.destroy();c=Runtime.mount(s.roots[1],{manualMotion=true,manualKeyframes=true,reducedMotion=false})
        assert(c.playKeyframes("activate"));advance(c,.5)
        assert(near(i.GroupTransparency,.625) and near(label.TextTransparency,.2) and near(particle.BackgroundTransparency,.2))
        c.destroy();assert(near(i.GroupTransparency,.25));particle:Destroy()
    end,function(p)find(p,"activate").className="CanvasGroup";for _,key in ipairs({"Image","ImageColor3","ImageTransparency","ScaleType","AutoButtonColor"}) do find(p,"activate").properties[key]=nil end;find(p,"activate").behavior.keyframes.trigger="mount";find(p,"activate").behavior.keyframes.owner=nil;find(p,"activate").properties.GroupTransparency=.25;find(p,"activate-label").properties.TextTransparency=.2 end)
end)
test("opacity-only chains do not require a sizing slot or modify authored geometry",function()
    native(function(s,c)
        local i=s.byId.attribute.instance;local p,r=i.Position,i.Rotation
        assert(c.playKeyframes("attribute"));advance(c,.5)
        assert(near(i.BackgroundTransparency,.5) and i.Position==p and i.Rotation==r and not i:FindFirstChildOfClass("UIScale"))
    end,function(p)
        local n=find(p,"attribute");local slot=find(p,"attribute/motion-slot")
        n.properties.Position=slot.properties.Position;n.properties.Size=slot.properties.Size;n.properties.AnchorPoint=slot.properties.AnchorPoint
        n.behavior.keyframes.slot=nil;for _,f in ipairs(n.behavior.keyframes.frames) do f.x=0;f.y=0;f.scale=1;f.rotation=0 end
        local root=p.roots[1].children[1];for index,child in ipairs(root.children) do if child==slot then root.children[index]=n end end
    end)
end)
test("reduced motion completes triggers and actions with authored transforms and opacity",function()
    native(function(s,c)
        assert(c.activate("activate") and c.activate("open"));advance(c,1.05)
        local i=s.byId.activate.instance;assert(i.Position.X.Offset==0 and i.BackgroundTransparency==0 and i:FindFirstChildOfClass("UIScale").Scale==1)
        assert(i:GetAttribute("FramebridgeKeyframeStatus")=="Reduced motion" and s.byId.panel.instance.Visible)
    end,nil,true)
end)
test("external property edits become authored values and cleanup removes only owned helpers",function()
    native(function(s,c)
        local i=s.byId.activate.instance;assert(c.activate("activate"));advance(c,.5)
        i.BackgroundTransparency=.4;i.Position=UDim2.fromOffset(12,18);i.Rotation=20;local scale=i:FindFirstChildOfClass("UIScale");scale.Scale=1.3;task.wait();advance(c,.1);c.destroy()
        assert(near(i.BackgroundTransparency,.4) and i.Position==UDim2.fromOffset(12,18) and i.Rotation==20 and i:GetAttribute("FramebridgeKeyframeStatus")==nil)
        for _,n in ipairs(s.roots[1]:GetDescendants()) do assert(not n:GetAttribute("FramebridgeMotionHelper")) end
    end)
end)
test("existing UIScale edits survive teardown and marked particles retain their own alpha",function()
    local s=Importer.stage(package(),{},false,runtimeSource);local i=s.byId.activate.instance
    local scale=Instance.new("UIScale");scale.Name="ApplicationScale";scale.Scale=1.2;scale.Parent=i
    local particle=Instance.new("Frame");particle:SetAttribute("FramebridgeParticleHelper",true);particle.BackgroundTransparency=.2;particle.Parent=i
    local c=Runtime.mount(s.roots[1],{manualMotion=true,manualKeyframes=true,reducedMotion=false})
    local ok,why=pcall(function()
        assert(c.activate("activate"));advance(c,.5);assert(near(scale.Scale,1.32) and near(particle.BackgroundTransparency,.2))
        scale.Scale=1.4;task.wait();advance(c,.1);c.destroy();assert(scale.Parent==i and near(scale.Scale,1.4))
    end)
    c.destroy();Importer.destroy(s);assert(ok,why)
end)
test("runtime remounts remain bounded and duplicate helpers never accumulate",function()
    local s=Importer.stage(package(),{},false,runtimeSource);local previous
    local ok,why=pcall(function()
        for _=1,5 do
            local c=Runtime.mount(s.roots[1],{manualMotion=true,manualKeyframes=true,reducedMotion=false})
            local count=c.connectionCount();assert(not previous or count==previous);previous=count
            assert(c.activate("activate"));advance(c,.5);c.destroy();assert(c.connectionCount()==0)
            for _,n in ipairs(s.roots[1]:GetDescendants()) do assert(not n:GetAttribute("FramebridgeMotionHelper")) end
        end
    end)
    Importer.destroy(s);assert(ok,why)
end)
test("adding changing removing chains preserves native buttons, listeners and custom scripts",function()
    local host=Instance.new("Folder");local p=Importer.decode(baselineFixture);local s=Importer.stage(p,{},false,runtimeSource);Importer.apply(s,p,host,false)
    local i=s.byId.activate.instance;local parent=i.Parent;local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- custom";user.Parent=i
    local listener=i.Activated:Connect(function()end);local stages={}
    local ok,why=pcall(function()
        local animated=package();local adding=Importer.stage(animated,{},false,runtimeSource);table.insert(stages,adding);Importer.apply(adding,animated,host,true)
        assert(i.Parent:GetAttribute("FramebridgeId")=="activate/motion-slot" and user.Parent==i and listener.Connected)
        local next=package();find(next,"activate").behavior.keyframes.frames[2].x=80
        local changing=Importer.stage(next,{},false,runtimeSource);table.insert(stages,changing);Importer.apply(changing,next,host,true)
        assert(Http:JSONDecode(i:GetAttribute("FramebridgeBehavior")).keyframes.frames[2].x==80)
        local original=Importer.decode(baselineFixture);local removing=Importer.stage(original,{},false,runtimeSource);table.insert(stages,removing);Importer.apply(removing,original,host,true)
        assert(i.Parent==parent and user.Parent==i and listener.Connected)
    end)
    listener:Disconnect();for _,stage in ipairs(stages) do Importer.destroy(stage) end;Importer.destroy(s);host:Destroy();assert(ok,why)
end)
test("edited generated runtime is protected during an update",function()
    local host=Instance.new("Folder");local p=package();local s=Importer.stage(p,{},false,runtimeSource);Importer.apply(s,p,host,false)
    local script=s.roots[1]:FindFirstChild("FramebridgeRuntime");if not script then for _,i in ipairs(s.roots[1]:GetChildren()) do if i:GetAttribute("FramebridgeRuntime") then script=i end end end
    assert(script);script.Source="-- application edited runtime"
    local next=Importer.stage(p,{},false,runtimeSource);local ok=pcall(Importer.apply,next,p,host,true)
    assert(not ok and script.Source=="-- application edited runtime")
    Importer.destroy(next);Importer.destroy(s);host:Destroy()
end)
return {passed=passed,failed=#failures,failures=failures}
