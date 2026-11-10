assert(game.PlaceId==0,"Blank QA only")
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function package() return Importer.decode(fixture) end
local function walk(node,fn) fn(node);for _,child in ipairs(node.children) do walk(child,fn) end end
local function find(pkg,id)
    local found
    for _,root in ipairs(pkg.roots) do walk(root,function(node) if node.id==id then found=node end end) end
    return found
end
test("staging only emits the known runtime; metadata never supplies code",function()
    local pkg=package()
    local stage=Importer.stage(pkg,{},false,runtimeSource)
    local ok,why=pcall(function()
        local client=stage.byId["screen:screen/behavior-runtime"].instance
        assert(client:IsA("LocalScript") and client.Source=="-- Framebridge generated runtime bootstrap.\nrequire(script.FramebridgeRuntime)\n")
        local module=client.FramebridgeRuntime
        assert(module:IsA("ModuleScript") and module.Source=="local runtimeModule=script\nlocal script=runtimeModule.Parent\n"..runtimeSource.source.."\nconnect(runtimeModule.Destroying,cleanup)\nreturn true\n")
        assert(module:GetAttribute("FramebridgeGeneratedSource")==module.Source)
        assert(client:GetAttribute("FramebridgeGeneratedSource")==client.Source)
        assert(Http:JSONDecode(stage.byId.open.instance:GetAttribute("FramebridgeBehavior")).action.target=="shop")
        assert(not pcall(Importer.stage,pkg,{},false),"Missing runtime must not silently drop interactions")
    end)
    Importer.destroy(stage);assert(ok,why)
end)
test("invalid targets, owners, bindings and executable fields are rejected",function()
    local invalid={
        {action={kind="open",target="other-root"}},
        {action={kind="open",target="screen"}},
        {action={kind="execute",target="shop"}},
        {source="print('untrusted')"},
        {binding={source="attribute",key="Source.Code",template="{value}"}},
        {state={kind="hover",owner="open"}},
        false,
    }
    for _,behavior in ipairs(invalid) do
        local pkg=package();find(pkg,"open").behavior=behavior
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Accepted malformed interaction")
    end
    local pkg=package();find(pkg,"visual-hover").behavior.state.owner="close"
    assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
end)
test("reimport reuses generated and custom scripts and resets removed metadata",function()
    local host=Instance.new("Folder")
    local stage
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local open=stage.byId.open.instance
        local client=stage.byId["screen:screen/behavior-runtime"].instance
        local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- user application logic";user.Parent=open
        local listener=open.Activated:Connect(function()end)
        local next=package();find(next,"open").behavior.action.kind="toggle";find(next,"coins").behavior=nil
        stage=Importer.stage(next,{},false,runtimeSource);local _,stats=Importer.apply(stage,next,host,true)
        assert(stats.created==0 and stats.removed==0 and client.Parent==host:GetChildren()[1])
        assert(open.Parent and user.Parent==open and listener.Connected)
        assert(Http:JSONDecode(open:GetAttribute("FramebridgeBehavior")).action.kind=="toggle")
        assert(stage.byId.coins.instance:GetAttribute("FramebridgeBehavior")==nil)
        local coin
        for _,instance in ipairs(host:GetDescendants()) do if instance:GetAttribute("FramebridgeId")=="coins" then coin=instance end end
        assert(coin:GetAttribute("FramebridgeBehavior")==nil)
        listener:Disconnect()
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
test("edited runtime blocks updates before changing any instance",function()
    local host=Instance.new("Folder");local stage
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local open=stage.byId.open.instance
        local client=stage.byId["screen:screen/behavior-runtime"].instance
        client.Source..="\n-- custom edit"
        local next=package();find(next,"open").name="Changed name"
        stage=Importer.stage(next,{},false,runtimeSource)
        local applied,message=pcall(Importer.apply,stage,next,host,true)
        assert(not applied and tostring(message):find("was edited",1,true))
        assert(open.Name=="Open shop" and client.Source:find("custom edit",1,true))
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
test("partial updates roll back interaction attributes and preserve generated and custom scripts",function()
    local host=Instance.new("Folder");local stage
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local open=stage.byId.open.instance
        local client=stage.byId["screen:screen/behavior-runtime"].instance
        local originalSource=client.Source
        local originalBehavior=open:GetAttribute("FramebridgeBehavior")
        local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- user code";user.Parent=open
        -- Corrupt a later node's property journal so earlier assignments happen before failure.
        stage.byId.coins.instance:SetAttribute("FramebridgeProperties","invalid JSON")
        local next=package();find(next,"open").behavior.action.kind="toggle";find(next,"open").name="Must roll back"
        stage=Importer.stage(next,{},false,runtimeSource)
        assert(not pcall(Importer.apply,stage,next,host,true))
        assert(open.Name=="Open shop" and open:GetAttribute("FramebridgeBehavior")==originalBehavior)
        assert(client.Parent==host:GetChildren()[1] and client.Source==originalSource and user.Parent==open)
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
test("removing interactions detaches only the untouched generated runtime",function()
    local host=Instance.new("Folder");local stage;local client
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        client=stage.byId["screen:screen/behavior-runtime"].instance
        local next=package();for _,root in ipairs(next.roots) do walk(root,function(node) node.behavior=nil end) end
        stage=Importer.stage(next,{},false,runtimeSource);local _,stats=Importer.apply(stage,next,host,true)
        assert(client.Parent==nil and stats.removed==1)
    end)
    if client then client:Destroy() end
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
test("runtime actions, tabs, disabled guards and fallback states",function()
    local stage=Importer.stage(package(),{},false,runtimeSource)
    local controller
    local ok,why=pcall(function()
        controller=Runtime.mount(stage.roots[1])
        local open=stage.byId.open.instance;local shop=stage.byId.shop.instance
        assert(not shop.Visible and controller.activate("open") and shop.Visible)
        assert(controller.activate("close") and not shop.Visible)
        assert(controller.activate("toggle") and shop.Visible)
        assert(controller.activate("toggle") and not shop.Visible)
        assert(stage.byId.inventory.instance.Visible and not stage.byId.settings.instance.Visible)
        assert(controller.activate("settings-tab") and not stage.byId.inventory.instance.Visible and stage.byId.settings.instance.Visible)
        assert(stage.byId["settings-tab"].instance:GetAttribute("FramebridgeSelected")==true)
        assert(stage.byId["settings-selected"].instance.Visible and not stage.byId["inventory-selected"].instance.Visible)
        open.Interactable=false;task.wait()
        assert(not controller.activate("open") and not shop.Visible)
        assert(stage.byId["visual-disabled"].instance.Visible and not stage.byId["visual-default"].instance.Visible)
        open.Interactable=true;open.Active=false;task.wait()
        assert(not controller.activate("open"))
        open.Active=true;open:SetAttribute("FramebridgeSelected",true);task.wait()
        assert(open:GetAttribute("FramebridgeState")=="selected" and stage.byId["visual-default"].instance.Visible)
        stage.roots[1].Enabled=false;assert(not controller.activate("open"))
    end)
    if controller then controller.destroy();assert(controller.connectionCount()==0) end
    Importer.destroy(stage);assert(ok,why)
end)
test("live labels handle late stats, changes, removal and cleanup",function()
    local stage=Importer.stage(package(),{},false,runtimeSource)
    local player=Instance.new("Folder");local controller
    local ok,why=pcall(function()
        controller=Runtime.mount(stage.roots[1],{player=player})
        local coins=stage.byId.coins.instance
        assert(coins.Text=="Coins: —")
        local stats=Instance.new("Folder");stats.Name="leaderstats";stats.Parent=player
        local value=Instance.new("IntValue");value.Name="Coins";value.Value=1250;value.Parent=stats;task.wait()
        assert(coins.Text=="Coins: 1250" and coins:GetAttribute("FramebridgeBindingStatus")=="Ready")
        value.Value=2000;task.wait();assert(coins.Text=="Coins: 2000")
        value:Destroy();task.wait();assert(coins.Text=="Coins: —")
        value=Instance.new("StringValue");value.Name="Coins";value.Value="50% <bonus>";value.Parent=stats;task.wait()
        assert(coins.Text=="Coins: 50% <bonus>")
        coins.RichText=true;value.Value="<b>999</b>";task.wait();assert(coins.Text=="Coins: &lt;b&gt;999&lt;/b&gt;")
        stats:Destroy();task.wait();assert(coins.Text=="Coins: —")
        coins:SetAttribute("FramebridgeBehavior",Http:JSONEncode({binding={source="attribute",key="Gems",template="Gems: {value}"}}));player:SetAttribute("Gems",15);task.wait()
        assert(coins.Text=="Gems: 15")
        player:SetAttribute("Gems",30);task.wait();assert(coins.Text=="Gems: 30")
        controller.destroy();assert(controller.connectionCount()==0)
        local text=coins.Text;player:SetAttribute("Gems",60);task.wait();assert(coins.Text==text)
    end)
    if controller then controller.destroy() end
    player:Destroy();Importer.destroy(stage);assert(ok,why)
end)
test("live labels recover renamed values and existing children renamed into their key",function()
    local stage=Importer.stage(package(),{},false,runtimeSource)
    local player=Instance.new("Folder");local controller
    local ok,why=pcall(function()
        controller=Runtime.mount(stage.roots[1],{player=player})
        local label=stage.byId.coins.instance
        local stats=Instance.new("Folder");stats.Name="leaderstats";stats.Parent=player
        local value=Instance.new("IntValue");value.Name="Coins";value.Value=1250;value.Parent=stats;task.wait()
        assert(label.Text=="Coins: 1250")
        local connected=controller.connectionCount()
        value.Name="Other";task.wait();assert(label.Text=="Coins: —" and label:GetAttribute("FramebridgeBindingStatus")=="Missing data")
        value.Value=1400;task.wait();assert(label.Text=="Coins: —")
        value.Name="Coins";task.wait();assert(label.Text=="Coins: 1400" and label:GetAttribute("FramebridgeBindingStatus")=="Ready")
        assert(controller.connectionCount()==connected,"Rename accumulated live-label subscriptions")
        value.Name="Other";task.wait()
        local spare=Instance.new("StringValue");spare.Name="Spare";spare.Value="50% <bonus>";spare.Parent=stats;task.wait()
        spare.Name="Coins";task.wait();assert(label.Text=="Coins: 50% <bonus>")
        label.RichText=true;spare.Value="<b>999</b>";task.wait();assert(label.Text=="Coins: &lt;b&gt;999&lt;/b&gt;")
        spare.Name="Spare";task.wait();assert(label.Text=="Coins: —")
        value.Name="Coins";task.wait();assert(label.Text=="Coins: 1400")
        spare:Destroy();task.wait();assert(controller.connectionCount()==connected,"Removed spare left live-label subscriptions")
        stats.Name="OtherStats";task.wait();assert(label.Text=="Coins: —")
        stats.Name="leaderstats";task.wait();assert(label.Text=="Coins: 1400")
        stats.Name="OtherStats";task.wait()
        local otherStats=Instance.new("Folder");otherStats.Name="SpareStats";otherStats.Parent=player
        local otherValue=Instance.new("IntValue");otherValue.Name="Coins";otherValue.Value=1750;otherValue.Parent=otherStats;task.wait()
        otherStats.Name="leaderstats";task.wait();assert(label.Text=="Coins: 1750")
        otherStats.Name="SpareStats";task.wait();assert(label.Text=="Coins: —")
        stats.Name="leaderstats";task.wait();assert(label.Text=="Coins: 1400")
        otherStats:Destroy();task.wait();assert(controller.connectionCount()==connected,"Removed spare folder left live-label subscriptions")
        controller.destroy();assert(controller.connectionCount()==0)
        local restored=label.Text
        value.Name="Other";value.Value=9999;value.Name="Coins";task.wait()
        assert(label.Text==restored and label:GetAttribute("FramebridgeBindingStatus")==nil,"Disposed live label changed")
    end)
    if controller then controller.destroy() end
    player:Destroy();Importer.destroy(stage);assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached instances in blank QA; no place settings changed"}
