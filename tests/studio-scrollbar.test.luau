assert(game.PlaceId==0,"Use only the approved blank QA place")
local Http=game:GetService("HttpService")
local fixture=Http:JSONDecode(fixtures)
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function package() return Importer.decode(Http:JSONEncode(fixture)) end
local function find(pkg,id)
    local function visit(n) if n.id==id then return n end;for _,child in ipairs(n.children) do local result=visit(child);if result then return result end end end
    for _,root in ipairs(pkg.roots) do local result=visit(root);if result then return result end end
end
for _,mode in ipairs({"source","scale","offset"}) do
    test("native scrollbar bindings and editable content in "..mode,function()
        local pkg=Editor.prepare(package(),{mode=mode,layers={}})
        local stage=Importer.stage(pkg,{},false)
        local ok,why=pcall(function()
            for _,id in ipairs({"vertical","horizontal"}) do
                local node=find(pkg,id);local actual=stage.byId[id].instance
                assert(actual:IsA("ScrollingFrame") and actual.ClipsDescendants and actual.ScrollingEnabled and actual.ScrollBarThickness==8)
                for key,ref in pairs(node.assetBindings) do
                    local asset;for _,a in ipairs(pkg.assets) do if a.id==ref then asset=a end end
                    assert(actual[key]==Importer.assetId(asset.robloxId),key.." binding")
                    assert(actual:GetAttribute("FramebridgeAsset_"..key)==ref,"Native image source identity")
                end
                assert(actual:FindFirstChild(id=="vertical" and "Item 1" or "Reward 1"):IsA("Frame"))
            end
            assert(stage.byId["vertical-art"]==nil and stage.byId["horizontal-art"]==nil,"Consumed artwork duplicated")
        end)
        Importer.destroy(stage);assert(ok,why)
    end)
end
test("reimport replaces bindings, retains scripts, and removing artwork resets native defaults",function()
    local host,stage=Instance.new("Folder"),nil
    local ok,why=pcall(function()
        local pkg=package();stage=Importer.stage(pkg,{},false);Importer.apply(stage,pkg,host,false)
        local viewport=stage.byId.vertical.instance;local user=Instance.new("LocalScript");user.Name="UserLogic";user.Parent=viewport
        local listener=viewport:GetPropertyChangedSignal("TopImage"):Connect(function() end)
        local next=package();for _,asset in ipairs(next.assets) do asset.robloxId="987654321" end
        stage=Importer.stage(next,{},false);local _,stats=Importer.apply(stage,next,host,true)
        assert(stats.created==0 and stats.removed==0 and viewport.TopImage=="rbxassetid://987654321")
        assert(user.Parent==viewport and listener.Connected)
        next=package();local node=find(next,"vertical");node.assetBindings=nil
        node.properties.TopImage=nil;node.properties.MidImage=nil;node.properties.BottomImage=nil
        next.assets={};find(next,"horizontal").assetBindings=nil
        local other=find(next,"horizontal");other.properties.TopImage=nil;other.properties.MidImage=nil;other.properties.BottomImage=nil
        stage=Importer.stage(next,{},false);Importer.apply(stage,next,host,true)
        local defaults=Instance.new("ScrollingFrame")
        assert(viewport.TopImage==defaults.TopImage and viewport.MidImage==defaults.MidImage and viewport.BottomImage==defaults.BottomImage)
        defaults:Destroy();assert(viewport:GetAttribute("FramebridgeAsset_TopImage")==nil and user.Parent==viewport);listener:Disconnect()
    end)
    if stage then Importer.destroy(stage) end;host:Destroy();assert(ok,why)
end)
test("history readback and gallery scan preserve three independent piece identities",function()
    local pkg,stage=package(),nil
    local snapshot=History.snapshot(pkg,{})
    Importer.decode(Http:JSONEncode(snapshot))
    assert(#snapshot.assets==6 and snapshot.assets[1].scrollbarSlice and snapshot.assets[1].pixelSize)
    assert(find(snapshot,"vertical").assetBindings.TopImage==find(pkg,"vertical").assetBindings.TopImage)
    stage=Importer.stage(snapshot,{},false)
    local ok,why=pcall(function()
        local images=Gallery.scan(stage.roots,Importer.assetId)
        assert(#images==6,"Scan must include all six native scrollbar pieces")
        local pending=package();for _,asset in ipairs(pending.assets) do asset.robloxId=nil end
        local matches,ambiguous=Gallery.matches(pending,images,{},Importer.assetId)
        assert(#matches==6 and ambiguous==0,"Exact identities should match each image independently")
        local one={[pkg.assets[1].id]=true}
        local uses=Gallery.uses(pkg,one,stage.roots);assert(#uses==1 and uses[1]:IsA("ScrollingFrame"))
    end)
    Importer.destroy(stage);assert(ok,why)
end)
test("invalid references and content URLs fail before insertion",function()
    for _,change in ipairs({{"TopImage","missing"},{"Source",fixture.assets[1].id}}) do
        local pkg=package();find(pkg,"vertical").assetBindings[change[1]]=change[2]
        assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
        local ok,stage=pcall(Importer.stage,pkg,{},false)
        if ok then Importer.destroy(stage) end;assert(not ok)
    end
    local pkg=package();find(pkg,"vertical").properties.TopImage="https://example.invalid/track.png"
    assert(not pcall(Importer.stage,pkg,{},false))
    pkg=package();pkg.assets[1].scrollbarSlice["end"]=2
    assert(not pcall(Importer.decode,Http:JSONEncode(pkg)))
end)
return {passed=passed,failed=#failures,failures=failures,scope="Detached native scrollbar import/update/history/gallery; asset IDs test bindings, not uploaded pixels"}
