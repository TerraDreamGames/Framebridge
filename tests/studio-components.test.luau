assert(game.PlaceId==0,"Blank QA only")
local Importer=require(script.Importer)
local BehaviorSource=require(script.BehaviorSource)
local Runtime=require(script.BehaviorRuntime)
local React=require(script.ReactLua.React)
local ReactRoblox=require(script.ReactLua.ReactRoblox)
local Fusion=require(script.Fusion)
local TsReact=script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"].react)
local TsReactRoblox=script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"]["react-roblox"])
local passed,failures=0,{}
local function test(name,body)
    local ok,why=xpcall(body,debug.traceback)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function state(button,kind)
    local count=0
    for _,child in ipairs(button:GetChildren()) do
        if child:GetAttribute("FramebridgeBehavior") then
            local config=game:GetService("HttpService"):JSONDecode(child:GetAttribute("FramebridgeBehavior"))
            if config.state then assert(child.Visible==(config.state.kind==kind),"Wrong visible state "..config.state.kind);count+=1 end
        end
    end
    assert(count==5,"Lost editable state visuals")
end
local function equivalent(actual,expected,root)
    assert(actual.ClassName==expected.ClassName,"Changed class")
    if actual:IsA("GuiObject") then assert(actual.Active==expected.Active and actual.Interactable==expected.Interactable,"Changed native input defaults") end
    if not root then assert(actual.Name==expected.Name,"Changed child name") end
    local props=game:GetService("HttpService"):JSONDecode(expected:GetAttribute("FramebridgeProperties"))
    for _,property in ipairs(props) do
        if not root or not ({Name=true,Position=true,LayoutOrder=true,ZIndex=true})[property] then
            local a,b=actual[property],expected[property]
            if typeof(a)=="Font" then assert(a.Family==b.Family and a.Weight==b.Weight and a.Style==b.Style)
            else assert(a==b,"Changed property "..property.." on "..actual.Name) end
        end
    end
    local remaining=actual:GetChildren()
    assert(#remaining==#expected:GetChildren(),"Changed native children")
    for _,child in ipairs(expected:GetChildren()) do
        local found
        for i,candidate in ipairs(remaining) do if candidate.Name==child.Name and candidate.ClassName==child.ClassName then found=candidate;table.remove(remaining,i);break end end
        assert(found,"Missing native child "..child.Name);equivalent(found,child,false)
    end
end
for name,case in pairs(componentCases) do
    local stateful=name=="states" or name=="browser"
    test(name.." native import/update",function()
        local host=Instance.new("Folder")
        local stage,controller
        local ok,why=xpcall(function()
            stage=Importer.stage(case.package,{},false,BehaviorSource);Importer.apply(stage,case.package,host,false)
            local root=stage.roots[1];local widget=root:GetChildren()[1]
            if stateful then
                controller=Runtime.mount(root);state(widget,"default");widget.Active=false;state(widget,"disabled")
                widget.Active=true;widget:SetAttribute("FramebridgeSelected",true);state(widget,"selected")
                controller.destroy();assert(controller.connectionCount()==0);controller=nil
            end
            local user=Instance.new("LocalScript");user.Name="UserLogic";user.Source="-- keep my widget logic";user.Parent=widget
            local nextStage=Importer.stage(case.package,{},false,BehaviorSource);local actual=Importer.apply(nextStage,case.package,host,true)
            assert(actual[1]==root and user.Parent==widget and user.Source=="-- keep my widget logic","Reimport lost custom script or identity")
            Importer.destroy(nextStage)
        end,debug.traceback)
        if controller then controller.destroy() end
        if stage then Importer.destroy(stage) end
        host:Destroy();assert(ok,why)
    end)
    for _,format in ipairs({"luau","fusion","react","tsx"}) do
        if not case[format] then continue end
        test(name.." "..format.." independent reusable copies",function()
            local host=Instance.new("ScreenGui")
            local stage=Importer.stage(case.package,{},false,BehaviorSource)
            local renderer,scope,expectedRuntime
            local ok,why=xpcall(function()
                local expected=stage.roots[1]:GetChildren()[1]
                if stateful then expectedRuntime=Runtime.mount(stage.roots[1]) end
                local aProps={Name="Copy A",Position=UDim2.fromOffset(11,20),LayoutOrder=0,ZIndex=1}
                local bProps={Name="Copy B",Position=UDim2.fromOffset(221,20),LayoutOrder=1,ZIndex=2}
                local a,b
                if format=="luau" then
                    local factory=case.luau();a=factory(host,{},aProps);b=factory(host,{},bProps)
                elseif format=="fusion" then
                    scope=Fusion.scoped(Fusion);local factory=case.fusion();a=factory(scope,{},aProps);b=factory(scope,{},bProps);a.Parent=host;b.Parent=host
                else
                    local R=format=="tsx" and TsReact or React
                    renderer=(format=="tsx" and TsReactRoblox or ReactRoblox).createRoot(host)
                    local component=format=="tsx" and case.tsx().default or case.react()
                    renderer:render(R.createElement(R.Fragment,nil,{A=R.createElement(component,{RootProps=aProps}),B=R.createElement(component,{RootProps=bProps})}))
                    task.wait(0.15);a=host:FindFirstChild("Copy A");b=host:FindFirstChild("Copy B")
                end
                assert(a and b and a:IsA("GuiObject") and b:IsA("GuiObject") and #host:GetChildren()==2,"Factory must return two widgets without collectors")
                equivalent(a,expected,true);equivalent(b,expected,true)
                assert(a.Position==aProps.Position and b.Position==bProps.Position and b.LayoutOrder==1,"Root properties ignored")
                if stateful then
                    state(a,"default");state(b,"default")
                    a.Active=false;state(a,"disabled");state(b,"default")
                    b:SetAttribute("FramebridgeSelected",true);state(b,"selected");state(a,"disabled")
                    a.Active=true;a.Interactable=false;state(a,"disabled")
                end
                if format=="luau" then
                    local hidden=case.luau()(host,{}, {Visible=false,Active=false,Size=UDim2.fromOffset(240,72)})
                    assert(not hidden.Visible and not hidden.Active and hidden.Size==UDim2.fromOffset(240,72),"False/size overrides ignored");hidden:Destroy()
                end
            end,debug.traceback)
            if expectedRuntime then expectedRuntime.destroy() end
            if renderer then renderer:unmount();task.wait() end
            if scope then Fusion.doCleanup(scope) end
            Importer.destroy(stage);host:Destroy();assert(ok,why)
        end)
    end
end
test("GuiObject-root actions stay within each copy and respect ancestors",function()
    local Http=game:GetService("HttpService")
    local pkg=Http:JSONDecode(Http:JSONEncode(componentCases.card.package))
    local data=pkg.roots[1].children[1]
    data.className="TextButton";data.properties.Text=""
    data.behavior={action={kind="toggle",target=data.children[1].id}}
    data.children[1].behavior={role="panel"};data.children[1].properties.Visible=false
    pkg=Importer.decode(Http:JSONEncode(pkg))
    local stage=Importer.stage(pkg,{},false,BehaviorSource)
    local host=Instance.new("ScreenGui");local container=Instance.new("Frame");container.Parent=host
    local first,second
    local ok,why=xpcall(function()
        local a=stage.roots[1]:GetChildren()[1];a.Parent=container
        local b=a:Clone();b.Parent=container
        first=Runtime.mount(a);second=Runtime.mount(b)
        local id=a:GetAttribute("FramebridgeId")
        assert(first.activate(id) and a:GetChildren()[1].Visible and not b:GetChildren()[1].Visible,"Action escaped its component copy")
        host.Enabled=false;assert(not first.activate(id) and a:GetChildren()[1].Visible)
        host.Enabled=true;container.Visible=false;assert(not first.activate(id))
        container.Visible=true;assert(second.activate(id) and b:GetChildren()[1].Visible)
        first.destroy();second.destroy();assert(first.connectionCount()==0 and second.connectionCount()==0)
    end,debug.traceback)
    if first then first.destroy() end;if second then second.destroy() end
    host:Destroy();Importer.destroy(stage);assert(ok,why)
end)
print("Reusable component native checks passed: "..passed)
for _,failure in ipairs(failures) do warn(failure) end
assert(#failures==0,"Reusable component failures: "..#failures)
return {passed=passed,failures=failures}
