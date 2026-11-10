assert(game.PlaceId==0,"Themes QA requires the approved blank Place1")
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function test(name,body) local ok,why=xpcall(body,debug.traceback);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end end
local function package() return Importer.decode(fixture) end
local function find(pkg,id)
    local function visit(node) if node.id==id then return node end;for _,child in ipairs(node.children) do local n=visit(child);if n then return n end end end
    for _,root in ipairs(pkg.roots) do local n=visit(root);if n then return n end end
end
local function close(actual,values) return actual==Color3.new(table.unpack(values)) end
test("trusted theme runtime only emitted for themed roots",function()
    local pkg=package();local stage=Importer.stage(pkg,{},false,runtimeSource)
    local ok,why=pcall(function()
        local client=stage.byId[pkg.roots[1].id.."/behavior-runtime"].instance
        assert(client.Source==runtimeSource.themeSource and client.Source~=runtimeSource.source)
        assert(stage.roots[1]:GetAttribute("FramebridgeThemes"))
        assert(stage.byId.buy.instance:GetAttribute("FramebridgeThemeBinding"))
        local old={version=runtimeSource.version,source=runtimeSource.source}
        assert(not pcall(Importer.stage,pkg,{},false,old),"Old runtime must not silently drop themes")
    end)
    Importer.destroy(stage);assert(ok,why)
end)
test("invalid resolved modes, values and hover owners are rejected before staging",function()
    for _,kind in ipairs({"owner","range","field","orphan","nested","empty","type","blink","tint","drift"}) do
        local pkg=package()
        if kind=="owner" then find(pkg,"buy").theme.owner="heading" end
        if kind=="range" then pkg.roots[1].themes.modes.Dark.surface.Color.value[1]=9 end
        if kind=="field" then pkg.roots[1].themes.modes.Dark.surface.Source="print('bad')" end
        if kind=="orphan" then pkg.roots[1].themes=nil end
        if kind=="nested" then find(pkg,"buy").themes=pkg.roots[1].themes end
        if kind=="empty" then find(pkg,"buy").theme={base={}} end
        if kind=="type" then pkg.roots[1].themes.modes.Dark.surface.Color="bad" end
        if kind=="blink" then find(pkg,"buy").behavior={motion={blink={visible=1,hidden=1,fade=0.2,delay=0}}} end
        if kind=="tint" then find(pkg,"heading").behavior={motion={hover={scale=1,rotation=0,lift=0,duration=0.2,tint={1,0,0}}}} end
        if kind=="drift" then local buy=find(pkg,"buy");buy.properties.ImageTransparency=0;buy.properties.ScaleType={type="Enum",value={"ScaleType","Tile"}};buy.behavior={motion={drift={speed=24,direction=270}}};buy.theme.base.ImageTransparency={"surface","Transparency"} end
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Malformed theme accepted: "..kind)
    end
end)
test("explicit runtime switching updates five kinds across components and rejects unknown modes",function()
    local pkg=package();local stage=Importer.stage(pkg,{},false,runtimeSource);local controller
    local ok,why=pcall(function()
        local root=stage.roots[1];controller=Runtime.mount(root)
        assert(root:GetAttribute("FramebridgeTheme")=="Light" and root:GetAttribute("FramebridgeThemeStatus")=="Ready")
        assert(controller.setTheme("Dark"));task.wait()
        for _,id in ipairs({"buy","sell"}) do assert(close(stage.byId[id].instance.BackgroundColor3,pkg.roots[1].themes.modes.Dark.surface.Color.value)) end
        assert(close(stage.byId.heading.instance.TextColor3,pkg.roots[1].themes.modes.Dark.accent.Color.value))
        assert(stage.byId.heading.instance.FontFace.Family==pkg.roots[1].themes.modes.Dark.body.FontFace.family)
        assert(stage.byId["buy/theme-shadow"].instance.BlurRadius.Offset==12)
        assert(not controller.setTheme("Unknown") and root:GetAttribute("FramebridgeTheme")=="Dark")
        root:SetAttribute("FramebridgeTheme","Light");task.wait()
        assert(stage.byId["buy/theme-shadow"].instance.BlurRadius.Offset==10)
        assert(close(stage.byId.buy.instance.BackgroundColor3,pkg.roots[1].themes.modes.Light.surface.Color.value))
    end)
    if controller then controller.destroy();assert(controller.connectionCount()==0) end
    Importer.destroy(stage);assert(ok,why)
end)
test("application edits survive switching, helper additions, and cleanup",function()
    local stage=Importer.stage(package(),{},false,runtimeSource);local controller
    local ok,why=pcall(function()
        local root,buy=stage.roots[1],stage.byId.buy.instance
        controller=Runtime.mount(root)
        buy.BackgroundColor3=Color3.new(1,0,0);task.wait()
        assert(controller.setTheme("Dark"));task.wait();assert(buy.BackgroundColor3==Color3.new(1,0,0))
        local script=Instance.new("LocalScript");script.Name="UserLogic";script.Parent=buy;task.wait()
        assert(controller.setTheme("Light"));task.wait();assert(buy.BackgroundColor3==Color3.new(1,0,0))
        controller.destroy();assert(buy.BackgroundColor3==Color3.new(1,0,0) and script.Parent==buy)
        assert(controller.connectionCount()==0 and not controller.setTheme("Dark"))
    end)
    if controller then controller.destroy() end
    Importer.destroy(stage);assert(ok,why)
end)
test("cleanup restores resting native values and remount owns only one listener set",function()
    local stage=Importer.stage(package(),{},false,runtimeSource);local first,second
    local ok,why=pcall(function()
        local root,buy=stage.roots[1],stage.byId.buy.instance;local before=buy.BackgroundColor3
        first=Runtime.mount(root);local count=first.connectionCount();assert(count>0)
        first.setTheme("Dark");task.wait()
        second=Runtime.mount(root);assert(first.connectionCount()==0)
        assert(second.connectionCount()==count)
        second.destroy();assert(second.connectionCount()==0 and buy.BackgroundColor3==before)
    end)
    if first then first.destroy() end;if second then second.destroy() end
    Importer.destroy(stage);assert(ok,why)
end)
test("updates preserve attached scripts, theme choice, and edited runtime protection",function()
    local host=Instance.new("Folder");local stage
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local root,buy,client=stage.roots[1],stage.byId.buy.instance,stage.byId[pkg.roots[1].id.."/behavior-runtime"].instance
        root:SetAttribute("FramebridgeTheme","Dark")
        local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- user's logic";user.Parent=buy
        local next=package();next.roots[1].themes.modes.Dark.surface.Color.value={0.3,0.4,0.5}
        stage=Importer.stage(next,{},false,runtimeSource);local _,stats=Importer.apply(stage,next,host,true)
        assert(stats.created==0 and user.Parent==buy and client.Parent==root and root:GetAttribute("FramebridgeTheme")=="Dark")
        assert(Http:JSONDecode(root:GetAttribute("FramebridgeThemes")).modes.Dark.surface.Color.value[1]==0.3)
        client.Source..="\n-- user edit";local original=buy.Name
        next=package();find(next,"buy").name="Must not update";stage=Importer.stage(next,{},false,runtimeSource)
        assert(not pcall(Importer.apply,stage,next,host,true));assert(buy.Name==original and user.Parent==buy)
    end)
    if stage then Importer.destroy(stage) end;host:Destroy();assert(ok,why)
end)
test("removing themes removes only owned runtime and attributes",function()
    local host=Instance.new("Folder");local stage
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,false)
        local root,buy=stage.roots[1],stage.byId.buy.instance
        local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- preserved";user.Parent=buy
        local function clear(node) node.theme=nil;node.themes=nil;for _,child in ipairs(node.children) do clear(child) end end
        clear(pkg.roots[1]);stage=Importer.stage(pkg,{},false,runtimeSource);Importer.apply(stage,pkg,host,true)
        assert(user.Parent==buy and root:GetAttribute("FramebridgeThemes")==nil and buy:GetAttribute("FramebridgeThemeBinding")==nil)
        assert(not root:FindFirstChild("FramebridgeInteractions"))
    end)
    if stage then Importer.destroy(stage) end;host:Destroy();assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached native theme switching in approved blank Place1"}
