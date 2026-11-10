-- Detached native instances in approved blank Place1. No installed plugin changes.
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body) local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end end
local function find(pkg,id) local found;local function visit(n)if n.id==id then found=n end;for _,child in ipairs(n.children)do visit(child)end end;for _,root in ipairs(pkg.roots)do visit(root)end;return found end
local function decoded()return Importer.decode(fixture)end
local function withRuntime(body)
    local stage=Importer.stage(decoded(),{},false,runtimeSource);local player=Instance.new("Folder");local controller
    local ok,why=pcall(function()controller=Runtime.mount(stage.roots[1],{player=player,manualMotion=true});body(stage,controller,player)end)
    if controller then controller.destroy();assert(controller.connectionCount()==0,"Subscriptions leaked")end
    player:Destroy();Importer.destroy(stage);assert(ok,why)
end
local function stat(player,amount)
    local folder=Instance.new("Folder");folder.Name="leaderstats";folder.Parent=player
    local value=Instance.new("IntValue");value.Name="Coins";value.Value=amount;value.Parent=folder
    return value,folder
end
test("native importer rejects executable, cyclic, invalid type and cross-screen conditional data",function()
    for _,change in ipairs({function(r)r.source="print(1)"end,function(r)r.branches[1].when.predicates[1].source="node"end,function(r)r.branches[1].when.predicates[1].key="Parent.Source"end,function(r)r.branches[1].when.predicates[1].value="100"end,function(r)r.branches[1]["then"][1].value="true"end,function(r)r.branches[1]["then"][1].target="screen:rules-screen"end,function(r)r.branches[1]["then"][1].property="Source"end})do
        local pkg=Http:JSONDecode(fixture);change(find(pkg,"rules-screen").behavior.rules[1]);assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
    end
    local pkg=Http:JSONDecode(fixture);local rules=find(pkg,"rules-screen").behavior.rules;local duplicate=Http:JSONDecode(Http:JSONEncode(rules[1]));duplicate.id="duplicate";table.insert(rules,duplicate);assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
end)
test("real leaderstats and attributes choose IF, ELSE IF and ELSE with typed native action values",function()
    withRuntime(function(s,c,player)
        local status,buy=s.byId.status.instance,s.byId.buy.instance
        assert(status.Text=="Awaiting player data" and not buy.Interactable)
        local coins,folder=stat(player,150);task.wait();assert(status.Text=="Earn more coins" and not buy.Interactable)
        player:SetAttribute("Ready",true);task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;" and buy.Interactable and status.TextColor3==Color3.new(0.2,1,0.4))
        assert(s.byId["rules-screen"].instance:GetAttribute("FramebridgeRule_purchase")=="IF 1")
        player:SetAttribute("Ready","true");task.wait();assert(status.Text=="Earn more coins" and not buy.Interactable)
        coins.Name="Other";task.wait();assert(status.Text=="Awaiting player data")
        coins:Destroy();folder:Destroy();local replacement=stat(player,300);player:SetAttribute("Ready",true);task.wait();assert(buy.Interactable)
        replacement:Destroy();task.wait();assert(status.Text=="Awaiting player data")
    end)
end)
test("native visibility actions keep motion slots aligned and any-condition fallback restores design alpha",function()
    withRuntime(function(s,c,player)
        local panel,slot,status=s.byId.premium.instance,s.byId["premium/motion-slot"].instance,s.byId.status.instance
        assert(not panel.Visible and not slot.Visible and math.abs(status.BackgroundTransparency-0.6)<0.00001)
        player:SetAttribute("VIP",true);player:SetAttribute("Ready",true);task.wait();assert(panel.Visible and slot.Visible and status.BackgroundTransparency==0.25)
        player:SetAttribute("VIP",false);player:SetAttribute("Ready",false);task.wait();assert(not panel.Visible and not slot.Visible and math.abs(status.BackgroundTransparency-0.6)<0.00001)
        assert(s.byId["rules-screen"].instance:GetAttribute("FramebridgeRule_reward")=="DESIGN")
    end)
end)
test("leaderstats observes renamed-away values and existing children renamed into a requested key",function()
    withRuntime(function(s,c,player)
        local status=s.byId.status.instance
        local coins,folder=stat(player,150);player:SetAttribute("Ready",true);task.wait()
        assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        local connected=c.connectionCount()
        coins.Name="Other";task.wait();assert(status.Text=="Awaiting player data")
        coins.Name="Coins";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        assert(c.connectionCount()==connected,"Renaming accumulated subscriptions")
        coins.Name="Other";task.wait()
        local spare=Instance.new("NumberValue");spare.Name="Spare";spare.Value=175;spare.Parent=folder;task.wait()
        spare.Name="Coins";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        spare.Name="Spare";task.wait();assert(status.Text=="Awaiting player data")
        coins.Name="Coins";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        spare:Destroy();task.wait();assert(c.connectionCount()==connected,"Removed spare left subscriptions")
        folder.Name="OtherStats";task.wait();assert(status.Text=="Awaiting player data")
        folder.Name="leaderstats";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        folder.Name="OtherStats";task.wait()
        local otherFolder=Instance.new("Folder");otherFolder.Name="SpareStats";otherFolder.Parent=player
        local otherCoins=Instance.new("IntValue");otherCoins.Name="Coins";otherCoins.Value=180;otherCoins.Parent=otherFolder;task.wait()
        otherFolder.Name="leaderstats";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        otherFolder.Name="SpareStats";task.wait();assert(status.Text=="Awaiting player data")
        folder.Name="leaderstats";task.wait();assert(status.Text=="Buy &lt;b&gt;now&lt;/b&gt;")
        otherFolder:Destroy();task.wait();assert(c.connectionCount()==connected,"Removed spare folder left subscriptions")
    end)
end)
test("camera viewport conditions use the actual camera size",function()
    withRuntime(function(s,c)
        local camera=workspace.CurrentCamera;local width=camera and camera.ViewportSize.X
        assert(s.byId.compact.instance.Visible==(width~=nil and width<600))
    end)
end)
test("hot configuration updates rebuild once and rule removal restores controlled values",function()
    withRuntime(function(s,c,player)
        local owner=s.byId["rules-screen"].instance;local config=Http:JSONDecode(owner:GetAttribute("FramebridgeBehavior"))
        local coins=stat(player,150);player:SetAttribute("Ready",true);task.wait();assert(s.byId.buy.instance.Interactable)
        local count=c.connectionCount();config.rules[1].branches[1].when.predicates[1].value=200;owner:SetAttribute("FramebridgeBehavior",Http:JSONEncode(config));task.wait();task.wait();assert(not s.byId.buy.instance.Interactable and c.connectionCount()==count)
        config.rules=nil;owner:SetAttribute("FramebridgeBehavior",Http:JSONEncode(config));task.wait();task.wait();assert(s.byId.status.instance.Text=="Design status" and s.byId.premium.instance.Visible)
        coins.Value=500;task.wait();assert(s.byId.status.instance.Text=="Design status")
    end)
end)
test("teardown cancels queued work, restores baselines and preserves a later application edit",function()
    withRuntime(function(s,c,player)
        local status=s.byId.status.instance;player:SetAttribute("Ready",true);task.wait();status.TextColor3=Color3.new(0.1,0.2,0.3)
        player:SetAttribute("VIP",true);c.destroy();assert(c.connectionCount()==0);task.wait();assert(status.Text=="Design status" and status.TextColor3==Color3.new(0.1,0.2,0.3));assert(s.byId.premium.instance.Visible)
        assert(s.byId["rules-screen"].instance:GetAttribute("FramebridgeRule_purchase")==nil)
    end)
end)
test("reimport preserves identities, scripts, custom attributes and new defaults even when they equal the rule output",function()
    local host=Instance.new("Folder");local player=Instance.new("Folder");local stage,controller
    local ok,why=pcall(function()
        local pkg=decoded();stage=Importer.stage(pkg,{},false,runtimeSource);local roots=Importer.apply(stage,pkg,host,false)
        local status=stage.byId.status.instance;local button=stage.byId.buy.instance;local runtime=stage.byId["screen:rules-screen/behavior-runtime"].instance
        local script=Instance.new("LocalScript");script.Name="GameLogic";script.Source="-- preserved application logic";script.Parent=button;button:SetAttribute("CustomFlag",true);local activated=button.Activated:Connect(function()end)
        controller=Runtime.mount(roots[1],{player=player,manualMotion=true});player:SetAttribute("Ready",true);task.wait();assert(status.BackgroundTransparency==0.25)
        local next=Importer.decode(changedFixture);stage=Importer.stage(next,{},false,runtimeSource);local updated,stats=Importer.apply(stage,next,host,true);task.wait();task.wait()
        assert(updated[1]==roots[1] and stats.created==0 and stats.removed==0);assert(script.Parent==button and activated.Connected and button:GetAttribute("CustomFlag"));assert(runtime.Parent==roots[1]);assert(status.BackgroundTransparency==0.25,"Rebuild restored an obsolete design default")
        controller.destroy();controller=nil;assert(status.BackgroundTransparency==0.25);activated:Disconnect()
    end)
    if controller then controller.destroy()end;if stage then Importer.destroy(stage)end;player:Destroy();host:Destroy();assert(ok,why)
end)
test("invalid hot rule metadata stops and cleans up the mounted runtime",function()
    withRuntime(function(s,c)
        local owner=s.byId["rules-screen"].instance;local config=Http:JSONDecode(owner:GetAttribute("FramebridgeBehavior"));config.rules[1].branches[1]["then"][1].property="Source";owner:SetAttribute("FramebridgeBehavior",Http:JSONEncode(config));task.wait();task.wait();assert(c.connectionCount()==0)
    end)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached blank Place1 native rules, data, update and cleanup"}
