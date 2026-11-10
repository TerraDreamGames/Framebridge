assert(game.PlaceId == 0, "Use only the blank QA place")
local Http = game:GetService("HttpService")
local original = Http:JSONDecode(fixtures)
local passed, failures = 0, {}
local function test(name, body)
    local ok, why = pcall(body)
    if ok then passed += 1 else table.insert(failures,name .. ": " .. tostring(why)) end
end
local function package()
    return Importer.decode(Http:JSONEncode(original))
end
for _, className in ipairs({"ImageLabel","ImageButton"}) do
    for _, mode in ipairs({"source","scale","offset"}) do
        test(className .. " applies slicing and tiles in " .. mode, function()
            local pkg=package()
            Editor.find(pkg,"sliced").className=className
            Editor.find(pkg,"tiled").className=className
            if className == "ImageLabel" then Editor.find(pkg,"sliced").properties.AutoButtonColor=nil end
            pkg=Editor.prepare(pkg,{mode=mode,layers={}})
            local stage=Importer.stage(pkg,{},false)
            local ok,why=pcall(function()
                local slice=stage.byId.sliced.instance
                assert(slice.ScaleType == Enum.ScaleType.Slice and slice.SliceCenter == Rect.new(16,16,48,48) and slice.SliceScale == 1)
                local tile=stage.byId.tiled.instance
                assert(tile.ScaleType == Enum.ScaleType.Tile and tile.TileSize == UDim2.fromOffset(24,24))
                assert(slice.Image == "rbxassetid://284402752")
                assert(slice:GetAttribute("FramebridgeId") == "sliced")
                for _,size in ipairs({Vector2.new(100,100),Vector2.new(320,120),Vector2.new(120,320)}) do
                    slice.Size=UDim2.fromOffset(size.X,size.Y)
                    assert(slice.SliceCenter == Rect.new(16,16,48,48) and slice.SliceScale == 1)
                    tile.Size=slice.Size
                    assert(tile.TileSize == UDim2.fromOffset(24,24))
                end
            end)
            Importer.destroy(stage);assert(ok,why)
        end)
    end
end
test("reimport changes image modes without replacing user scripts or connections",function()
    local host, stage = Instance.new("Folder"), nil
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false);Importer.apply(stage,pkg,host,false)
        local slice=stage.byId.sliced.instance
        local user=Instance.new("LocalScript");user.Name="UserLogic";user.Parent=slice
        local listener=slice:GetPropertyChangedSignal("ScaleType"):Connect(function() end)
        local next=package();local node=Editor.find(next,"sliced")
        node.properties.ScaleType={type="Enum",value={"ScaleType","Tile"}}
        node.properties.TileSize={type="UDim2",value={0.25,8,0.5,12}}
        node.properties.SliceCenter={type="Rect",value={8,12,40,52}};node.properties.SliceScale=0.5
        stage=Importer.stage(next,{},false);local _,stats=Importer.apply(stage,next,host,true)
        assert(stats.created == 0 and stats.removed == 0 and user.Parent == slice and listener.Connected)
        assert(slice.ScaleType == Enum.ScaleType.Tile and slice.TileSize == UDim2.new(0.25,8,0.5,12))
        next=package();node=Editor.find(next,"sliced")
        node.properties.SliceCenter=nil;node.properties.SliceScale=nil;node.properties.TileSize=nil
        node.properties.ScaleType={type="Enum",value={"ScaleType","Stretch"}}
        stage=Importer.stage(next,{},false);Importer.apply(stage,next,host,true)
        assert(slice.SliceCenter == Rect.new(0,0,0,0) and slice.SliceScale == 1 and slice.TileSize == UDim2.new(1,0,1,0))
        assert(user.Parent == slice and listener.Connected);listener:Disconnect()
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy();assert(ok,why)
end)
test("malformed image geometry is rejected before insertion",function()
    for _,property in ipairs({
        {"SliceCenter",{type="Rect",value={20,0,10,20}}},
        {"SliceCenter",{type="Rect",value={0,0,80,80}}},
        {"SliceCenter",{type="UDim2",value={0,0,20,20}}},
        {"SliceScale",-1},
        {"TileSize",{type="UDim2",value={0,0.5,0,24}}},
        {"TileSize",{type="UDim2",value={0,24,0,0}}},
    }) do
        local pkg=package();Editor.find(pkg,"sliced").properties[property[1]]=property[2]
        local ok,stage=pcall(Importer.stage,pkg,{},false)
        if ok then Importer.destroy(stage) end
        assert(not ok,"Accepted " .. property[1])
    end
    for _, size in ipairs({false,0,"",{64},{64,0},{64,4097}}) do
        local pkg=package();pkg.assets[1].pixelSize=size
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Accepted malformed texture dimensions")
    end
end)
return {passed=passed,failed=#failures,failures=failures}
