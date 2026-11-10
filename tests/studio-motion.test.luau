local Http=game:GetService("HttpService")
local passed, failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function find(pkg,id)
    local found
    local function visit(n) if n.id==id then found=n end;for _,child in ipairs(n.children) do visit(child) end end
    for _,root in ipairs(pkg.roots) do visit(root) end
    return found
end
local function stage() return Importer.stage(Importer.decode(fixture),{},false,runtimeSource) end
local function withRuntime(body, reduced)
    local stage=stage();local controller
    local ok,why=pcall(function()
        controller=Runtime.mount(stage.roots[1],{manualMotion=true,reducedMotion=reduced or false})
        body(stage,controller)
    end)
    if controller then controller.destroy();assert(controller.connectionCount()==0) end
    Importer.destroy(stage);assert(ok,why)
end
local function near(a,b) return math.abs(a-b)<0.001 end
test("bounded motion metadata rejects arbitrary owners, slots, code, rates and audio URLs",function()
    for _,invalid in ipairs({{spin={speed=math.huge}},{source="print(1)"},{sounds={volume=1,hover="https://example.com"}},{blink={visible=0.1,hidden=0.1,fade=0,delay=0}}}) do
        local pkg=Http:JSONDecode(fixture);find(pkg,"open").behavior.motion=invalid
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
    end
    for key,value in pairs({owner="close",slot="inventory/motion-slot"}) do
        local pkg=Http:JSONDecode(fixture);find(pkg,"open").behavior.motion[key]=value
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
    end
end)
test("animated panels and tabs synchronize their slots while preserving action targets",function()
    withRuntime(function(s,c)
        local shop,slot=s.byId.shop.instance,s.byId["shop/motion-slot"].instance
        assert(not shop.Visible and not slot.Visible)
        assert(c.activate("open") and shop.Visible and slot.Visible)
        c.stepMotion(0)
        assert(near(shop.BackgroundTransparency,1))
        c.stepMotion(0.3)
        assert(near(shop.BackgroundTransparency,0) and near(s.byId.coins.instance.TextTransparency,0.2))
        assert(c.activate("close") and not slot.Visible)
        assert(c.activate("open") and slot.Visible)
        c.stepMotion(0)
        assert(near(shop.BackgroundTransparency,1),"Entrance must restart after reopening")
        assert(c.activate("settings-tab"))
        assert(not s.byId["inventory/motion-slot"].instance.Visible and s.byId["settings/motion-slot"].instance.Visible)
        assert(c.activate("inventory-tab"))
        assert(s.byId["inventory/motion-slot"].instance.Visible and not s.byId["settings/motion-slot"].instance.Visible)
    end)
end)
test("smooth hover and interrupted press preserve the cell and settle back to authored geometry",function()
    withRuntime(function(s,c)
        local n,slot=s.byId.open.instance,s.byId["open/motion-slot"].instance
        local position,size=slot.Position,slot.Size
        n:SetAttribute("FramebridgeState","hover");c.stepMotion(0.3)
        assert(n.Position.Y.Offset<-7 and n.Rotation<-4 and n:FindFirstChildOfClass("UIScale").Scale>1.04)
        n:SetAttribute("FramebridgeState","pressed");c.stepMotion(0.1)
        assert(n:FindFirstChildOfClass("UIScale").Scale<0.95)
        assert(slot.Position==position and slot.Size==size,"Animation moved a layout cell")
        n:SetAttribute("FramebridgeState","default");c.stepMotion(1)
        assert(near(n.Position.Y.Offset,0) and near(n.Rotation,0) and near(n:FindFirstChildOfClass("UIScale").Scale,1))
    end)
end)
test("nested fades multiply authored text transparency without flattening the hierarchy",function()
    withRuntime(function(s,c)
        assert(c.activate("open"));c.stepMotion(0.15)
        local expected=1-0.8*0.875*0.875
        assert(near(s.byId.coins.instance.TextTransparency,expected),tostring(s.byId.coins.instance.TextTransparency))
        c.stepMotion(0.15)
        assert(near(s.byId.coins.instance.TextTransparency,0.2))
    end)
end)
test("idle movement and texture drift update native properties and helper creation never causes a rebuild loop",function()
    withRuntime(function(s,c)
        local n=s.byId.idle.instance
        c.stepMotion(0.75)
        assert(near(n.Rotation,67.5) and near(n.Position.Y.Offset,-6))
        local pattern=s.byId.pattern.instance
        local holder=pattern:FindFirstChild("Framebridge Texture viewport")
        local texture=holder:FindFirstChild("Framebridge Moving texture")
        assert(pattern.ImageTransparency==1 and texture.Image==pattern.Image and near(texture.ImageTransparency,0.25))
        assert(texture.TileSize.X.Offset==24 and texture.Position.X.Offset<0)
        local count=c.connectionCount();task.wait();task.wait()
        assert(c.connectionCount()==count and near(n.Rotation,67.5),"Owned helpers restarted the animation")
    end)
end)
test("reduced motion keeps the interface visible, actions functional and cells stationary",function()
    withRuntime(function(s,c)
        c.stepMotion(1)
        local n=s.byId.idle.instance
        assert(n.Rotation==0 and n.Position.Y.Offset==0 and n:FindFirstChildOfClass("UIScale").Scale==1)
        assert(c.activate("open"));c.stepMotion(0)
        assert(s.byId.shop.instance.BackgroundTransparency==0 and near(s.byId.coins.instance.TextTransparency,0.2))
        assert(not s.byId.open.instance:FindFirstChild("Framebridge Shine").Visible)
    end,true)
end)
test("cleanup restores authored transforms, alpha and existing scales and removes only owned helpers",function()
    local s=stage();local n=s.byId.open.instance
    local custom=Instance.new("UIScale");custom.Name="ApplicationScale";custom.Scale=1.2;custom.Parent=n
    local controller=Runtime.mount(s.roots[1],{manualMotion=true,reducedMotion=false})
    local ok,why=pcall(function()
        n:SetAttribute("FramebridgeState","hover");controller.stepMotion(1)
        assert(custom.Scale>1.25)
        controller.destroy();assert(custom.Parent==n and near(custom.Scale,1.2))
        assert(n.Position==UDim2.fromScale(0.5,0.5) and near(n.Rotation,0))
        assert(s.byId.pattern.instance.ImageTransparency==0.25)
        for _,child in ipairs(s.roots[1]:GetDescendants()) do assert(not child:GetAttribute("FramebridgeMotionHelper")) end
    end)
    controller.destroy();Importer.destroy(s);assert(ok,why)
end)
test("updates adding, changing and removing motion keep actual buttons, listeners and custom scripts",function()
    local host=Instance.new("Folder");local pkg=Importer.decode(baselineFixture)
    local current=Importer.stage(pkg,{},false,runtimeSource)
    Importer.apply(current,pkg,host,false)
    local n=current.byId.open.instance
    local parent=n.Parent
    local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- user code";user.Parent=n
    local listener=n.Activated:Connect(function()end)
    local removedSlot
    local ok,why=pcall(function()
        local animated=Importer.decode(fixture)
        local adding=Importer.stage(animated,{},false,runtimeSource);Importer.apply(adding,animated,host,true)
        removedSlot=n.Parent
        assert(removedSlot:GetAttribute("FramebridgeId")=="open/motion-slot" and removedSlot.Parent==parent)
        assert(user.Parent==n and listener.Connected)
        local next=Importer.decode(fixture);find(next,"open").behavior.motion.hover.lift=16
        local update=Importer.stage(next,{},false,runtimeSource);Importer.apply(update,next,host,true)
        assert(user.Parent==n and listener.Connected and n.Parent==removedSlot)
        local original=Importer.decode(baselineFixture)
        local removing=Importer.stage(original,{},false,runtimeSource);Importer.apply(removing,original,host,true)
        assert(n.Parent==parent and user.Parent==n and listener.Connected)
        assert(removedSlot.Parent==nil,"Removed wrapper is still in the interface")
        assert(Http:JSONDecode(n:GetAttribute("FramebridgeBehavior")).motion==nil)
        Importer.destroy(adding);Importer.destroy(update);Importer.destroy(removing)
    end)
    listener:Disconnect();Importer.destroy(current);if removedSlot then removedSlot:Destroy() end;host:Destroy();assert(ok,why)
end)
test("removing a layout slot protects custom content attached directly to it",function()
    local host=Instance.new("Folder");local current=stage();local pkg=Importer.decode(fixture)
    Importer.apply(current,pkg,host,false)
    local wrapper=current.byId["open/motion-slot"].instance
    local user=Instance.new("Folder");user.Name="ApplicationContent";user.Parent=wrapper
    local original=Importer.decode(baselineFixture);local update=Importer.stage(original,{},false,runtimeSource)
    local ok=pcall(Importer.apply,update,original,host,true)
    assert(not ok and user.Parent==wrapper and wrapper.Parent~=nil)
    Importer.destroy(update);Importer.destroy(current);host:Destroy()
end)
test("CanvasGroup fades compose once and cleanup restores authored group alpha",function()
    local pkg=Importer.decode(fixture)
    find(pkg,"shop").className="CanvasGroup";find(pkg,"shop").properties.GroupTransparency=0.25
    local s=Importer.stage(pkg,{},false,runtimeSource);local c=Runtime.mount(s.roots[1],{manualMotion=true,reducedMotion=false})
    local ok,why=pcall(function()
        assert(c.activate("open"));c.stepMotion(0.15)
        assert(near(s.byId.shop.instance.GroupTransparency,1-0.75*0.875))
        assert(near(s.byId.coins.instance.TextTransparency,1-0.8*0.875),"Group fade was also applied to its child")
        c.destroy();assert(near(s.byId.shop.instance.GroupTransparency,0.25))
    end)
    c.destroy();Importer.destroy(s);assert(ok,why)
end)
test("muted sound cues normalize IDs, play on state entry and do not loop or repeat while held",function()
    local pkg=Importer.decode(fixture);find(pkg,"open").behavior.motion.sounds={hover="1",press="rbxassetid://2",volume=0}
    local s=Importer.stage(pkg,{},false,runtimeSource);local c=Runtime.mount(s.roots[1],{manualMotion=true,reducedMotion=false})
    local button=s.byId.open.instance
    local hover,press=button:FindFirstChild("Framebridge hover sound"),button:FindFirstChild("Framebridge press sound")
    local h,p=0,0;local hc=hover.Played:Connect(function()h+=1 end);local pc=press.Played:Connect(function()p+=1 end)
    local ok,why=pcall(function()
        assert(hover.SoundId=="rbxassetid://1" and press.SoundId=="rbxassetid://2" and hover.Volume==0 and not press.Looped)
        button:SetAttribute("FramebridgeState","hover");c.stepMotion(0.2);task.wait()
        assert(h==1,"Hover cue was not issued")
        button:SetAttribute("FramebridgeState","pressed");c.stepMotion(0.2);task.wait()
        assert(p==1,"Press cue was not issued")
        c.stepMotion(1);task.wait();assert(h==1 and p==1,"Held state repeated a cue")
        button.Interactable=false;button:SetAttribute("FramebridgeState","default");c.stepMotion(0.2)
        button:SetAttribute("FramebridgeState","hover");c.stepMotion(0.2);task.wait();assert(h==1,"Disabled button issued a sound")
    end)
    hc:Disconnect();pc:Disconnect();c.destroy();Importer.destroy(s);assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures}
