assert(game.PlaceId==0,"Only the approved blank QA place")
local Http=game:GetService("HttpService")
local cases=Http:JSONDecode(fixtures)
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
for _,case in ipairs(cases) do
    test("real Figma SVG coordinates: "..case.name,function()
        local pkg=Importer.decode(Http:JSONEncode(case.package))
        local stage=Importer.stage(pkg,{},false)
        local ok,why=pcall(function()
            local group=stage.byId[case.groupId].instance
            assert(group:IsA("Frame"))
            assert(group.Size.X.Offset==case.width and group.Size.Y.Offset==case.height)
            assert(group.Position.X.Offset==30 and group.Position.Y.Offset==20)
            assert(#group:GetChildren()==#case.expected)
            local found={}
            for _,child in ipairs(group:GetChildren()) do
                assert(child:IsA("Frame"),"Editable repeat item expected")
                local key=tostring(child.Position.X.Offset)..":"..tostring(child.Position.Y.Offset)
                assert(not found[key],"Repeat coordinates were duplicated")
                found[key]=true
            end
            for _,point in ipairs(case.expected) do assert(found[tostring(point[1])..":"..tostring(point[2])],"Missing repeated coordinate") end
        end)
        Importer.destroy(stage);assert(ok,why)
    end)
end
test("changed spacing/count retains existing instances, listeners and custom scripts",function()
    local host=Instance.new("Folder")
    local stage
    local ok,why=pcall(function()
        local pkg=Importer.decode(Http:JSONEncode(cases[1].package))
        stage=Importer.stage(pkg,{},false);Importer.apply(stage,pkg,host,false)
        local id=cases[1].itemId.."/repeat:"..cases[1].groupId..":1"
        local old=stage.byId[id].instance
        local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Parent=old
        local listener=old:GetPropertyChangedSignal("Position"):Connect(function() end)
        local next=Importer.decode(updatedFixture)
        stage=Importer.stage(next,{},false);local _,stats=Importer.apply(stage,next,host,true)
        local imported
        for _,item in ipairs(host:GetDescendants()) do if item:GetAttribute("FramebridgeId")==id then imported=item end end
        assert(imported==old and custom.Parent==old and listener.Connected)
        assert(old.Position.X.Offset==40 and stats.created==1 and stats.removed==0)
        listener:Disconnect()
    end)
    if stage then Importer.destroy(stage) end;host:Destroy();assert(ok,why)
end)
test("copied actions, state owners and animation slots pass the native importer",function()
    local pkg=Importer.decode(interactiveFixture)
    local stage=Importer.stage(pkg,{},false,runtimeSource)
    local ok,why=pcall(function()
        for i=1,2 do
            local suffix="/repeat:repeat:"..i
            local button=stage.byId["show"..suffix].instance
            local b=Http:JSONDecode(button:GetAttribute("FramebridgeBehavior"))
            assert(b.action.target=="details"..suffix and b.motion.owner=="show"..suffix)
            assert(b.motion.slot=="show"..suffix.."/motion-slot")
            assert(button.Parent==stage.byId[b.motion.slot].instance)
            local state=Http:JSONDecode(stage.byId["hover"..suffix].instance:GetAttribute("FramebridgeBehavior"))
            assert(state.state.owner=="show"..suffix)
            assert(not stage.byId["details"..suffix].instance.Visible)
        end
    end)
    Importer.destroy(stage);assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached native imports of five real Figma repeat snapshots, safe reimport and independent copied interaction metadata"}
