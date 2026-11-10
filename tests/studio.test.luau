-- Runs against real Roblox datatypes and detached Instances only.
-- It never parents anything to the user's DataModel or changes Selection.
local HttpService = game:GetService("HttpService")
local passed, failures = {}, {}
local function test(name,body)
    local ok,err=pcall(body)
    if ok then table.insert(passed,name) else table.insert(failures,name .. ": " .. tostring(err)) end
end
local function expectError(body,substring)
    local ok,err=pcall(body)
    assert(not ok,"Expected an error")
    if substring then assert(string.find(tostring(err),substring,1,true),tostring(err)) end
end
local function package() return Importer.decode(fixture) end
local function all(root) return {root,table.unpack(root:GetDescendants())} end
local function find(root,name) for _,n in ipairs(all(root)) do if n.Name==name then return n end end end
local detached={}
local function destination() local f=Instance.new("Folder");table.insert(detached,f);return f end
local stages={}
local function stage(pkg,bindings,placeholders) local s=Importer.stage(pkg,bindings or {},placeholders or false);table.insert(stages,s);return s end

test("decode counts and stages all demo instances",function()
    local p=package();local s=stage(p)
    assert(p.instanceCount==#s.entries)
    assert(#s.roots==1 and s.roots[1].Parent==nil)
    assert(find(s.roots[1],"Purchase"):IsA("TextButton"))
    assert(find(s.roots[1],"Title").Text=="A new adventure awaits.")
    assert(find(s.roots[1],"Title").TextSize==25)
end)
test("native gradients, strokes, and rich fonts apply successfully",function()
    local s=stage(Importer.decode(features));local r=s.roots[1]
    assert(find(r,"UIGradient").Color.Keypoints[1].Value==Color3.new(1,0,0))
    assert(find(r,"UIStroke").BorderStrokePosition==Enum.BorderStrokePosition.Inner)
    assert(find(r,"Text").RichText)
    assert(string.find(find(r,"Text").Text,'weight="Bold"',1,true))
end)
test("new import and repeated updates preserve identity and custom scripts",function()
    local p=package();local dest=destination();local roots=Importer.apply(stage(p),p,dest,false)
    local original=find(roots[1],"Title")
    local custom=Instance.new("LocalScript");custom.Name="GameBehavior";custom.Parent=original
    local newPackage=package();newPackage.roots[1].name="Renamed screen"
    local roots2,stats=Importer.apply(stage(newPackage),newPackage,dest,true)
    assert(roots2[1]==roots[1]);assert(find(roots2[1],"Title")==original)
    assert(custom.Parent==original);assert(roots2[1].Name=="Renamed screen")
    assert(stats.created==0 and stats.updated==p.instanceCount)
end)
test("updating one selection leaves other screens from same source alone",function()
    local p=package();local dest=destination();Importer.apply(stage(p),p,dest,false)
    local extra=Instance.new("ScreenGui");extra.Name="Other screen";extra:SetAttribute("FramebridgeSource",p.sourceId);extra:SetAttribute("FramebridgeId","unselected-screen");extra.Parent=dest
    Importer.apply(stage(p),p,dest,true);assert(extra.Parent==dest)
end)
test("unsafe removals fail before changing the user's UI",function()
    local p=package();local dest=destination();local roots=Importer.apply(stage(p),p,dest,false)
    local title=find(roots[1],"Title");local custom=Instance.new("Folder");custom.Name="UserData";custom.Parent=title
    local changed=package();local children=changed.roots[1].children[1].children
    for i,n in ipairs(children) do if n.name=="Title" then table.remove(children,i);break end end
    expectError(function() Importer.apply(stage(changed),changed,dest,true) end,"custom content")
    assert(title.Parent and custom.Parent==title)
end)
test("managed removals are detached, leaving unrelated user content",function()
    local p=package();local dest=destination();local roots=Importer.apply(stage(p),p,dest,false)
    local title=find(roots[1],"Title");local custom=Instance.new("Folder");custom.Name="UserData";custom.Parent=roots[1]
    local changed=package();local children=changed.roots[1].children[1].children
    for i,n in ipairs(children) do if n.name=="Title" then table.remove(children,i);break end end
    local _,stats=Importer.apply(stage(changed),changed,dest,true)
    assert(title.Parent==nil and stats.removed==1);assert(custom.Parent==roots[1]);title:Destroy()
end)
test("partial update failure rolls back changed names and properties",function()
    local p=package();local dest=destination();local roots=Importer.apply(stage(p),p,dest,false)
    local title=find(roots[1],"Title");title:SetAttribute("FramebridgeProperties","invalid JSON")
    local changed=package();changed.roots[1].name="Should roll back"
    expectError(function() Importer.apply(stage(changed),changed,dest,true) end)
    assert(roots[1].Name==p.roots[1].name);assert(title.Parent~=nil)
end)
test("duplicate imported identities do not silently pick a copy",function()
    local p=package();local dest=destination();Importer.apply(stage(p),p,dest,false);Importer.apply(stage(p),p,dest,false)
    expectError(function() Importer.apply(stage(p),p,dest,true) end,"Multiple imports")
end)
test("class changes cannot silently replace live references",function()
    local p=package();local dest=destination();Importer.apply(stage(p),p,dest,false)
    local changed=package();changed.roots[1].children[1].className="CanvasGroup"
    expectError(function() Importer.apply(stage(changed),changed,dest,true) end,"class changed")
end)
test("rejects executable and unknown classes",function()
    local p=package();p.roots[1].children[1].className="Script"
    expectError(function() Importer.decode(HttpService:JSONEncode(p)) end,"Unsupported instance class")
end)
test("rejects injected properties and duplicate IDs",function()
    local p=package();p.roots[1].properties.Source="print('no')"
    expectError(function() Importer.decode(HttpService:JSONEncode(p)) end,"Unsupported property")
    p=package();p.roots[1].children[1].id=p.roots[1].id
    expectError(function() Importer.decode(HttpService:JSONEncode(p)) end,"duplicate layer")
end)
test("rejects malicious asset URLs and non-finite data",function()
    local p=package();p.roots[1].children[1].properties.Size={type="UDim2",value={0,math.huge,0,10}}
    expectError(function() stage(p) end,"Non-finite")
    assert(Importer.assetId("https://example.com")==nil)
    assert(Importer.assetId("12345678901234567")=="rbxassetid://12345678901234567")
end)
test("rejects missing image assets unless placeholders are explicit",function()
    local p=package();p.assets={{id="image:test",name="Test"}}
    local n=p.roots[1].children[1];n.className="ImageLabel";n.properties={};n.children={};n.assetRef="image:test"
    expectError(function() stage(p) end,"still need Roblox IDs")
    local s=stage(p,{},true);assert(#s.missing==1)
    local linked=stage(p,{["image:test"]="42"});assert(linked.roots[1]:GetChildren()[1].Image=="rbxassetid://42")
end)
for _,s in ipairs(stages) do pcall(Importer.destroy,s) end
for _,d in ipairs(detached) do d:Destroy() end
return { passed=#passed, tests=passed, failed=#failures, failures=failures, scope="Detached instances only; no place content changed" }
