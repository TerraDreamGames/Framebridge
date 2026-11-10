-- Independent Lune rbx-dom/rbx-xml readback; no serializer helpers.
local fs=require("@lune/fs")
local roblox=require("@lune/roblox")
local serde=require("@lune/serde")
local dir=".artifacts/advanced-controls/"
local pkg=serde.decode("json",fs.readFile("examples/advanced-controls/controls.framebridge.json"))
local roots=roblox.deserializeModel(fs.readFile(dir.."Controls.rbxmx"))
local count,controls,scripts=0,0,0
local function equal(actual,expected)
    if type(actual)~=type(expected) then return false end
    if type(expected)~="table" then return actual==expected end
    for k,v in pairs(expected) do if not equal(actual[k],v) then return false end end
    for k in pairs(actual) do if expected[k]==nil then return false end end
    return true
end
local function check(instance,node)
    assert(instance.ClassName==node.className and instance.Name==node.name,"Native model name/class mismatch")
    assert(instance:GetAttribute("FramebridgeId")==node.id,"Stable identity missing")
    assert(instance:GetAttribute("FramebridgeSource")==pkg.sourceId,"Source identity missing")
    if node.behavior then
        assert(equal(serde.decode("json",instance:GetAttribute("FramebridgeBehavior")),node.behavior),"Model changed behavior data: "..node.id)
        if node.behavior.control then controls+=1 end
    end
    local children={}
    for _,child in ipairs(instance:GetChildren()) do
        if child:IsA("LocalScript") then
            scripts+=1
            assert(child.Source==fs.readFile(dir.."runtime-client.luau"),"Model runtime source changed")
            assert(child:GetAttribute("FramebridgeGeneratedSource")==child.Source,"Runtime ownership missing")
            assert(child:GetAttribute("FramebridgeId")==node.id.."/behavior-runtime","Runtime identity changed")
        else table.insert(children,child) end
    end
    assert(#children==#node.children,"Model hierarchy changed")
    for index,child in ipairs(children) do check(child,node.children[index]) end
    count+=1
end
assert(#roots==#pkg.roots)
for index,root in ipairs(roots) do check(root,pkg.roots[index]) end
assert(controls==9 and scripts==1)
print(serde.encode("json",{instances=count,controls=controls,scripts=scripts,independentModelReadback=true}))
