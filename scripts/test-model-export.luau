-- Independent rbx-dom/rbx_xml model reader. No serializer helpers are imported.
local fs = require("@lune/fs")
local serde = require("@lune/serde")
local roblox = require("@lune/roblox")
local db = roblox.getReflectionDatabase()
local output = ".artifacts/model-export/"
local count, properties, unreadable = 0, 0, {}
local function close(a,b)
    if typeof(a) ~= typeof(b) then return false end
    if typeof(a) == "number" then return math.abs(a-b) < 0.000001 end
    if typeof(a) == "Font" then return a.Family == b.Family and a.Weight == b.Weight and a.Style == b.Style end
    if typeof(a) == "ColorSequence" or typeof(a) == "NumberSequence" then
        if #a.Keypoints ~= #b.Keypoints then return false end
        for index, point in a.Keypoints do
            local other = b.Keypoints[index]
            if math.abs(point.Time-other.Time) > 0.000001 or not close(point.Value, other.Value) then return false end
        end
        return true
    end
    return a == b
end
local function decode(value)
    if type(value) ~= "table" then return value end
    if value.type == "Enum" then return roblox.Enum[value.value[1]][value.value[2]] end
    if value.type == "Font" then return roblox.Font.new(value.family, roblox.Enum.FontWeight[value.weight], roblox.Enum.FontStyle[value.style]) end
    if value.type == "ColorSequence" or value.type == "NumberSequence" then
        local points={}
        for _, point in value.value do
            table.insert(points, value.type == "ColorSequence" and roblox.ColorSequenceKeypoint.new(point[1],roblox.Color3.new(point[2],point[3],point[4])) or roblox.NumberSequenceKeypoint.new(point[1],point[2]))
        end
        return roblox[value.type].new(points)
    end
    return roblox[value.type].new(table.unpack(value.value))
end
local function reflected(className, property)
    local class = db:GetClass(className)
    while class do
        if class.Properties[property] then return true end
        class = class.Superclass and db:GetClass(class.Superclass)
    end
    return false
end
for _, name in serde.decode("json", fs.readFile(output .. "manifest.json")) do
    local pkg = serde.decode("json", fs.readFile(output .. name .. ".json"))
    local roots = roblox.deserializeModel(fs.readFile(output .. name .. ".rbxmx"))
    local assets = {}
    for _, asset in pkg.assets do assets[asset.id] = asset.robloxId end
    local function check(actual, expected)
        assert(actual.Name == expected.name and actual.ClassName == expected.className, "Name/class: " .. expected.id)
        if not db:GetClass(expected.className) then
            unreadable[expected.className .. " (including attributes; class absent from Lune reflection)"] = true
            count += 1
            return
        end
        assert(actual:GetAttribute("FramebridgeId") == expected.id, name .. "/" .. expected.id .. " layer identity got " .. tostring(actual:GetAttribute("FramebridgeId")))
        assert(actual:GetAttribute("FramebridgeSource") == pkg.sourceId, "Source identity")
        assert(actual:GetAttribute("FramebridgeAsset") == expected.assetRef, "Asset identity")
        local keys = serde.decode("json",actual:GetAttribute("FramebridgeProperties"))
        local owned = {}; for _, key in keys do owned[key] = true end
        for key, value in expected.properties do
            assert(owned[key], "Property ownership: " .. key)
            if key == "IgnoreGuiInset" then
                assert(actual.ScreenInsets == roblox.Enum.ScreenInsets[value and "DeviceSafeInsets" or "CoreUISafeInsets"], "Screen inset alias")
                properties += 1
            elseif key == "TopImage" or key == "MidImage" or key == "BottomImage" then
                local ref=expected.assetBindings and expected.assetBindings[key]
                assert((actual[key.."Content"].Uri or "") == (ref and assets[ref] or value), "Scrollbar content alias: "..key)
                if ref then assert(actual:GetAttribute("FramebridgeAsset_"..key)==ref,"Scrollbar asset identity") end
                properties += 1
            elseif key == "Image" then
                assert((actual.ImageContent.Uri or "") == (expected.assetRef and assets[expected.assetRef] or value), "Image content alias")
                properties += 1
            elseif expected.className == "UICorner" and key == "CornerRadius" then
                unreadable["UICorner.CornerRadius (modern per-corner XML)"] = true
            elseif reflected(expected.className, key) then
                local want = decode(value)
                if key == "Image" and expected.assetRef then want = assets[expected.assetRef] end
                if key == "LayoutOrder" then want = math.floor(want) end
                assert(close(actual[key], want), name .. "/" .. expected.id .. "." .. key .. " expected " .. tostring(want) .. " got " .. tostring(actual[key]))
                properties += 1
            else unreadable[expected.className .. "." .. key] = true end
        end
        if expected.assetRef then assert(actual.ImageContent.Uri == assets[expected.assetRef], "Linked image") end
        if expected.behavior then assert(serde.decode("json",actual:GetAttribute("FramebridgeBehavior")).role == expected.behavior.role, "Behavior metadata") end
        assert(actual:GetAttribute("FramebridgeMaskBasis")==expected.maskBasis,"Mask coordinate metadata")
        assert(actual:GetAttribute("FramebridgeLayoutCanvas")==(expected.layoutCanvas and "true" or nil),"Layout canvas metadata")
        local children={}
        for _,child in ipairs(actual:GetChildren()) do
            if child:IsA("LocalScript") and child:GetAttribute("FramebridgeRuntime") then
                assert(child.Source == fs.readFile(output .. "generated-runtime.luau"),"Generated runtime source")
                assert(child:GetAttribute("FramebridgeGeneratedSource") == child.Source,"Runtime provenance")
                assert(child:GetAttribute("FramebridgeId")==expected.id .. "/behavior-runtime","Runtime identity")
                assert(child:GetAttribute("FramebridgeSource")==pkg.sourceId,"Runtime owner")
                local module=child:FindFirstChild("FramebridgeRuntime")
                assert(module and module:IsA("ModuleScript") and #child:GetChildren()==1,"Runtime initializer child")
                assert(module.Source==fs.readFile(output.."generated-runtime-module.luau"),"Initializer source")
                assert(module:GetAttribute("FramebridgeGeneratedSource")==module.Source,"Initializer provenance")
                assert(module:GetAttribute("FramebridgeId")==expected.id.."/behavior-runtime/module","Initializer identity")
                assert(module:GetAttribute("FramebridgeSource")==pkg.sourceId,"Initializer owner")
            else table.insert(children,child) end
        end
        assert(#children == #expected.children, "Children: " .. expected.id)
        for index, child in expected.children do check(children[index], child) end
        count += 1
    end
    assert(#roots == #pkg.roots, "Root count: " .. name)
    for index, root in pkg.roots do check(roots[index], root) end
    -- Also parse our multi-screen native acceptance fixture through the external parser.
end
assert(#roblox.deserializeModel(fs.readFile(output .. "Acceptance.rbxmx")) == 1)
local skipped={}; for key in unreadable do table.insert(skipped,key) end; table.sort(skipped)
local report = {instances=count,properties=properties,unavailableInLuneReflection=skipped}
fs.writeFile(output .. "lune-report.json",serde.encode("json",report,true))
print(serde.encode("json",report))
