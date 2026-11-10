assert(game.PlaceId==0,"Blank QA only")
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function package() return Importer.decode(fixture) end
local function find(pkg,id)
    local result
    local function walk(n) if n.id==id then result=n end;for _,c in ipairs(n.children) do walk(c) end end
    for _,root in ipairs(pkg.roots) do walk(root) end
    return result
end
local function native(body,mutate)
    local pkg=package();if mutate then mutate(pkg) end
    local stage=Importer.stage(pkg,{},false,runtimeSource)
    local player=Instance.new("Folder");local runtime
    local ok,why=pcall(function()
        runtime=Runtime.mount(stage.roots[1],{player=player,manualControls=true,controlRandom=function() return 2 end})
        body(stage,runtime,player,pkg)
    end)
    if runtime then runtime.destroy();assert(runtime.connectionCount()==0,"Runtime leaked subscriptions") end
    player:Destroy();Importer.destroy(stage);assert(ok,why)
end
local function step(runtime,seconds) for _=1,math.ceil(seconds/.1) do runtime.stepControls(.1) end end
test("importer validates bounded settings, same-screen targets, graph cycles and owned geometry",function()
    for _,control in ipairs({
        {kind="slider",min=0,max=1,value=2,step=1,axis="X"},
        {kind="roulette",items={"one"},duration=1},
        {kind="toggle",value=false,source="untrusted code"},
        {kind="tooltip",target="missing",delay=.2},
        {kind="skill",requires={"skill-two"},unlocked=false},
    }) do
        local pkg=package();find(pkg,control.kind=="skill" and "skill-one" or "toggle").behavior={control=control}
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Accepted malformed control")
    end
    local pkg=package();find(pkg,"slider-fill").behavior={role="panel"}
    assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Accepted conflicting artwork")
end)
test("progress clamps live attribute data, missing status, and restores authored fill",function()
    native(function(stage,r,player)
        local i=stage.byId.progress.instance;local fill=stage.byId["progress-fill"].instance
        assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        player:SetAttribute("Health",40);task.wait();assert(i:GetAttribute("FramebridgeValue")==40 and fill.Size.X.Offset==96)
        player:SetAttribute("Health",1000);task.wait();assert(fill.Size.X.Offset==240)
        player:SetAttribute("Health",nil);task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        assert(not r.setControlValue("progress",60),"Bound control cannot write player data")
        r.destroy();assert(fill.Size.X.Offset==240)
    end)
end)
test("toggle emits values and selected state, protects disabled and bound controls",function()
    native(function(stage,r)
        local i=stage.byId.toggle.instance
        assert(i:GetAttribute("FramebridgeValue")==false)
        assert(r.activate("toggle") and i:GetAttribute("FramebridgeValue")==true and i:GetAttribute("FramebridgeSelected")==true)
        i.Interactable=false;assert(not r.activate("toggle"));i.Interactable=true
        assert(r.activate("toggle") and i:GetAttribute("FramebridgeValue")==false)
    end)
end)
test("slider quantizes native fill/thumb, clamps ratios and responds to external local values",function()
    native(function(stage,r)
        local i=stage.byId.slider.instance;local fill=stage.byId["slider-fill"].instance;local thumb=stage.byId["slider-thumb"].instance
        assert(r.setSliderRatio("slider",.327) and i:GetAttribute("FramebridgeValue")==35)
        assert(fill.Size.X.Offset==84 and math.abs(thumb.Position.X.Scale-.35)<.000001)
        assert(r.setSliderRatio("slider",3) and i:GetAttribute("FramebridgeValue")==100)
        i:SetAttribute("FramebridgeValue",19);task.wait();assert(i:GetAttribute("FramebridgeValue")==20)
        i.Active=false;assert(not r.setSliderRatio("slider",.5))
    end)
end)
test("cooldown gates action, exposes remaining time, resets and honors visibility",function()
    native(function(stage,r)
        local i=stage.byId.cooldown.instance;local window=stage.byId.window.instance
        assert(window.Visible and r.activate("cooldown") and not window.Visible)
        assert(not r.activate("cooldown") and i:GetAttribute("FramebridgeCooldownRemaining")==1)
        step(r,.5);assert(math.abs(i:GetAttribute("FramebridgeCooldownRemaining")-.5)<.00001)
        step(r,.5);assert(i:GetAttribute("FramebridgeCooldownReady")==true and r.activate("cooldown") and window.Visible)
        step(r,1);stage.roots[1].Enabled=false;assert(not r.activate("cooldown"))
    end)
end)
test("tooltip delays hover/selection, cancels, closes on hidden parent and restores visibility",function()
    native(function(stage,r)
        local tip=stage.byId.tooltip.instance;local owner=stage.byId.tip.instance
        assert(not tip.Visible and r.focusTooltip("tip",true));step(r,.1);assert(not tip.Visible)
        step(r,.1);assert(tip.Visible)
        r.focusTooltip("tip",false);assert(not tip.Visible)
        assert(r.activate("tip"));step(r,.2);assert(tip.Visible)
        owner.Visible=false;step(r,.1);assert(not tip.Visible)
    end)
end)
test("tooltip opens at its configured deadline across fractional frame steps",function()
    native(function(stage,r)
        local tip=stage.byId.tooltip.instance
        assert(r.focusTooltip("tip",true))
        for _=1,7 do r.stepControls(.05);assert(not tip.Visible,"Tooltip opened before its delay") end
        r.stepControls(.05);assert(tip.Visible,"Tooltip waited an extra frame at its delay")
    end,function(pkg) find(pkg,"tip").behavior.control.delay=.4 end)
end)
test("draggable windows update native position, preserve external property changes and restore",function()
    native(function(stage,r)
        local i=stage.byId.window.instance;local original=i.Position
        assert(r.moveWindow("window",30,20) and i.Position.X.Offset==original.X.Offset+30)
        local external=UDim2.fromOffset(200,100);i.Position=external;task.wait()
        r.destroy();assert(i.Position==external,"Teardown overwrote external property edit")
    end,function(pkg) find(pkg,"window").behavior.control.constrain=false end)
end)
test("tabs retain single visible panel and selected attributes alongside controls",function()
    native(function(stage,r)
        assert(stage.byId["panel-one"].instance.Visible and not stage.byId["panel-two"].instance.Visible)
        assert(r.activate("tab-two") and not stage.byId["panel-one"].instance.Visible and stage.byId["panel-two"].instance.Visible)
        assert(stage.byId["tab-two"].instance:GetAttribute("FramebridgeSelected")==true)
    end)
end)
test("skill prerequisites unlock in order, propagate reset, and expose local status",function()
    native(function(stage,r)
        local one=stage.byId["skill-one"].instance;local two=stage.byId["skill-two"].instance
        assert(one:GetAttribute("FramebridgeSkillStatus")=="Available" and two:GetAttribute("FramebridgeSkillStatus")=="Locked")
        assert(not r.activate("skill-two") and r.activate("skill-one"));task.wait()
        assert(two:GetAttribute("FramebridgeSkillStatus")=="Available" and r.activate("skill-two"))
        assert(two:GetAttribute("FramebridgeUnlocked")==true and not r.activate("skill-two"))
        one:SetAttribute("FramebridgeUnlocked",false);two:SetAttribute("FramebridgeUnlocked",false);task.wait()
        assert(two:GetAttribute("FramebridgeSkillStatus")=="Locked")
    end)
end)
test("roulette locks concurrent spins, reaches bounded result and cancels on teardown",function()
    native(function(stage,r)
        local i=stage.byId.roulette.instance
        assert(r.activate("roulette") and not r.activate("roulette"))
        step(r,.4);assert(i:GetAttribute("FramebridgeRouletteStatus")=="Spinning" and i:GetAttribute("FramebridgeRouletteIndex")>=1 and i:GetAttribute("FramebridgeRouletteIndex")<=3)
        step(r,.6);assert(i:GetAttribute("FramebridgeRouletteStatus")=="Complete" and i:GetAttribute("FramebridgeRouletteValue")=="Gems")
        assert(r.activate("roulette"));r.destroy();r.stepControls(1);assert(i:GetAttribute("FramebridgeRouletteStatus")==nil)
    end)
end)
test("late leaderstats controls handle create/change/replace/removal with bounded subscriptions",function()
    native(function(stage,r,player)
        local i=stage.byId.progress.instance;local count=r.connectionCount()
        for n=1,10 do
            local folder=Instance.new("Folder");folder.Name="leaderstats";folder.Parent=player
            local stat=Instance.new("NumberValue");stat.Name="Health";stat.Value=25;stat.Parent=folder;task.wait()
            assert(i:GetAttribute("FramebridgeValue")==25)
            stat.Value=55;task.wait();assert(i:GetAttribute("FramebridgeValue")==55)
            stat:Destroy();task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
            folder:Destroy();task.wait();assert(r.connectionCount()==count,"Repeated stats leaked subscriptions")
        end
    end,function(pkg) find(pkg,"progress").behavior.control.data.source="leaderstats" end)
end)
test("leaderstats controls recover value and folder renames without retaining subscriptions",function()
    native(function(stage,r,player)
        local i=stage.byId.progress.instance;local fill=stage.byId["progress-fill"].instance
        local folder=Instance.new("Folder");folder.Name="leaderstats";folder.Parent=player
        local value=Instance.new("IntValue");value.Name="Health";value.Value=37;value.Parent=folder;task.wait()
        assert(i:GetAttribute("FramebridgeControlStatus")=="Bound" and i:GetAttribute("FramebridgeValue")==37 and fill.Size.X==UDim.new(0,240*.37))
        local count=r.connectionCount()
        value.Name="Other";task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        value.Value=62;task.wait();assert(i:GetAttribute("FramebridgeValue")==37)
        value.Name="Health";task.wait();assert(i:GetAttribute("FramebridgeValue")==62 and fill.Size.X==UDim.new(0,240*.62))
        assert(r.connectionCount()==count,"Control rename accumulated subscriptions")
        value.Name="Other";task.wait()
        local spare=Instance.new("NumberValue");spare.Name="Spare";spare.Value=48;spare.Parent=folder;task.wait()
        spare.Name="Health";task.wait();assert(i:GetAttribute("FramebridgeValue")==48)
        spare.Name="Spare";task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        value.Name="Health";spare:Destroy();task.wait();assert(i:GetAttribute("FramebridgeValue")==62 and r.connectionCount()==count)
        folder.Name="OtherStats";task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        folder.Name="leaderstats";task.wait();assert(i:GetAttribute("FramebridgeValue")==62)
        folder.Name="OtherStats";task.wait()
        local alternate=Instance.new("Folder");alternate.Name="SpareStats";alternate.Parent=player
        local alternateValue=Instance.new("NumberValue");alternateValue.Name="Health";alternateValue.Value=74;alternateValue.Parent=alternate;task.wait()
        alternate.Name="leaderstats";task.wait();assert(i:GetAttribute("FramebridgeValue")==74)
        alternate.Name="SpareStats";task.wait();assert(i:GetAttribute("FramebridgeControlStatus")=="Missing data")
        folder.Name="leaderstats";alternate:Destroy();task.wait();assert(i:GetAttribute("FramebridgeValue")==62 and r.connectionCount()==count)
        r.destroy();assert(r.connectionCount()==0 and fill.Size.X.Offset==240)
        value.Name="Other";value.Value=99;value.Name="Health";task.wait();assert(fill.Size.X.Offset==240,"Disposed progress changed")
    end,function(pkg) find(pkg,"progress").behavior.control.data.source="leaderstats" end)
end)
test("reimport preserves user scripts/listeners; edited generated runtime blocks updates",function()
    local host=Instance.new("Folder");local stage;local listener
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local slider=stage.byId.slider.instance;local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- custom";user.Parent=slider
        listener=slider.Activated:Connect(function() end)
        local client=stage.byId["screen:advanced-screen/behavior-runtime"].instance
        local next=package();find(next,"slider").behavior.control.step=10
        stage=Importer.stage(next,{},false,runtimeSource);Importer.apply(stage,next,host,true)
        assert(user.Parent==slider and listener.Connected and Http:JSONDecode(slider:GetAttribute("FramebridgeBehavior")).control.step==10)
        client.Source..="\n-- user edit";local next2=package();find(next2,"slider").name="Must not apply"
        stage=Importer.stage(next2,{},false,runtimeSource);assert(not pcall(Importer.apply,stage,next2,host,true));assert(slider.Name=="slider")
    end)
    if listener then listener:Disconnect() end;if stage then Importer.destroy(stage) end;host:Destroy();assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached native instances only; physical pointer/device coverage separate"}
