-- Detached native acceptance only; no place content or Selection is changed.
local Http = game:GetService("HttpService")
local data = Http:JSONDecode(fixtures)
local passed, failures = 0, {}
local function test(name, body)
    local ok, why = pcall(body)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function package(name) return Importer.decode(Http:JSONEncode(data[name])) end
local function position(node, mode)
    local value = node.properties.Position.value
    if mode == "scale" then return UDim2.new(value[1]+value[2]/800,0,value[3]+value[4]/600,0) end
    if mode == "offset" then return UDim2.fromOffset(value[1]*800+value[2],value[3]*600+value[4]) end
    return UDim2.new(table.unpack(value))
end
for _, mode in {"source","scale","offset"} do
    test("mixed coordinate edit retains independent values in " .. mode, function()
        local p = Editor.prepare(package("position"), {mode=mode,layers={}})
        local stage = Importer.stage(p,{},false)
        local ok, why = pcall(function()
            for _, id in {"panel-0","panel-1"} do
                local instance = stage.byId[id].instance
                assert(instance.Position == position(Editor.find(package("position"),id),mode), "Sizing mode preserves the resolved geometry")
                local source=Editor.find(package("position"),id).properties.Position.value
                assert(math.abs(instance.Position.X.Scale*800+instance.Position.X.Offset-(source[1]*800+source[2]))<0.0001)
            end
            assert(stage.byId["panel-0"].instance.Position.Y ~= stage.byId["panel-1"].instance.Position.Y)
        end)
        Importer.destroy(stage); assert(ok,why)
    end)
end
test("bulk font weight retains distinct native families and styles",function()
    local p = package("fonts"); local stage=Importer.stage(p,{},false)
    local ok,why=pcall(function()
        for _,id in {"title-0","title-1"} do
            local expected=Editor.find(p,id).properties.FontFace
            local font=stage.byId[id].instance.FontFace
            assert(font.Family==expected.family and font.Weight==Enum.FontWeight.Bold and font.Style==Enum.FontStyle[expected.style])
        end
    end)
    Importer.destroy(stage);assert(ok,why)
end)
test("bulk scrolling assignment retains corners and native canvas behavior",function()
    local stage=Importer.stage(package("scrolling"),{},false)
    local ok,why=pcall(function()
        for _,id in {"panel-0","panel-1"} do
            local instance=stage.byId[id].instance
            assert(instance:IsA("ScrollingFrame") and instance.AutomaticCanvasSize==Enum.AutomaticSize.Y)
            assert(stage.byId[id.."/corner"].instance.Parent==instance)
        end
    end)
    Importer.destroy(stage);assert(ok,why)
end)
test("bulk image-button assignment retains separate asset bindings",function()
    local stage=Importer.stage(package("imageButtons"),{},false)
    local ok,why=pcall(function()
        for i,id in {"icon-0","icon-1"} do
            local instance=stage.byId[id].instance
            assert(instance:IsA("ImageButton") and instance.Image=="rbxassetid://"..tostring(123456788+i))
            assert(instance:GetAttribute("FramebridgeAsset")==stage.byId[id].node.assetRef)
        end
    end)
    Importer.destroy(stage);assert(ok,why)
end)
for _, change in {"position","fonts"} do
    test("batch "..change.." update and undo retain native instances and user logic",function()
        local host=Instance.new("Folder"); local stage
        local connections={}
        local ok,why=pcall(function()
            local base=package("base");stage=Importer.stage(base,{},false);Importer.apply(stage,base,host,false)
            local ids=change=="position" and {"panel-0","panel-1"} or {"title-0","title-1"}
            local key=change=="position" and "Position" or "FontFace"
            local retained={}
            for _,id in ids do
                local instance=stage.byId[id].instance
                local logic=Instance.new("LocalScript");logic.Name="UserLogic";logic.Parent=instance
                local connection=instance:GetPropertyChangedSignal(key):Connect(function() end)
                table.insert(connections,connection)
                retained[id]={instance=instance,logic=logic,connection=connection,value=instance[key]}
            end
            for _,name in {change,"base"} do
                local p=package(name);stage=Importer.stage(p,{},false);local _,stats=Importer.apply(stage,p,host,true)
                assert(stats.created==0 and stats.removed==0)
                for _,id in ids do
                    local old=retained[id]
                    assert(old.logic.Parent==old.instance and old.connection.Connected)
                    if name=="base" then assert(old.instance[key]==old.value,"Undo restores each source value") end
                end
            end
        end)
        for _,connection in connections do connection:Disconnect() end
        if stage then Importer.destroy(stage) end
        host:Destroy();assert(ok,why)
    end)
end
test("changing classes requires New copy without partially changing existing UI",function()
    local host=Instance.new("Folder"); local stage
    local ok,why=pcall(function()
        local base=package("base");stage=Importer.stage(base,{},false);Importer.apply(stage,base,host,false)
        local panel=stage.byId["panel-0"].instance; local old=panel.Position
        local logic=Instance.new("LocalScript");logic.Parent=panel
        local next=package("scrolling");stage=Importer.stage(next,{},false)
        assert(not pcall(Importer.apply,stage,next,host,true))
        assert(panel:IsA("Frame") and panel.Position==old and logic.Parent==panel)
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached instances only; synthetic image bindings"}
