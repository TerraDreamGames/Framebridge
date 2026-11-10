-- Run after inserting Acceptance.rbxmx into the authorized blank QA place.
-- Only the uniquely named test folder is read, then cleaned up.
local Importer = require(script.Importer)
assert(game.PlaceId==0,"Use the blank QA place")
local HttpService = game:GetService("HttpService")
local host = game:GetService("ReplicatedStorage"):FindFirstChild("Framebridge Model Export Acceptance")
assert(host and host:IsA("Folder"), "Insert Acceptance.rbxmx into ReplicatedStorage in the blank QA place first.")
local stage, passed, failures = nil, 0, {}
local function same(a,b)
    if typeof(a) ~= typeof(b) then return false end
    if typeof(a) == "number" then return math.abs(a-b) < 0.000001 end
    if typeof(a) == "Font" then return a.Family == b.Family and a.Weight == b.Weight and a.Style == b.Style end
    if typeof(a) == "ColorSequence" or typeof(a) == "NumberSequence" then
        if #a.Keypoints ~= #b.Keypoints then return false end
        for index, point in a.Keypoints do
            local other = b.Keypoints[index]
            if point.Time ~= other.Time or point.Value ~= other.Value then return false end
            if typeof(a) == "NumberSequence" and point.Envelope ~= other.Envelope then return false end
        end
        return true
    end
    return a == b
end
local ok, why = pcall(function()
    modelPackage = Importer.decode(HttpService:JSONEncode(modelPackage))
    stage = Importer.stage(modelPackage, {}, false, BehaviorSource)
    local actual = {}
    for _, instance in host:GetDescendants() do
        local id = instance:GetAttribute("FramebridgeId")
        assert(id and not actual[id], "Missing or duplicate model identity: " .. instance.Name)
        actual[id] = instance
    end
    assert(#host:GetChildren() == #stage.roots, "Root hierarchy count")
    assert(#host:GetDescendants() == #stage.entries, "Total hierarchy count")
    for _, entry in stage.entries do
        local target = actual[entry.node.id]
        assert(target, "Missing instance: " .. entry.node.id)
        assert(target.Name == entry.instance.Name and target.ClassName == entry.instance.ClassName, "Name/class: " .. entry.node.id)
        assert(target:GetAttribute("FramebridgeSource") == modelPackage.sourceId, "Source identity")
        assert(target:GetAttribute("FramebridgeAsset") == entry.instance:GetAttribute("FramebridgeAsset"), "Asset identity")
        assert(target:GetAttribute("FramebridgeProperties") == entry.instance:GetAttribute("FramebridgeProperties"), "Property ownership")
        local parentId = target.Parent == host and nil or target.Parent:GetAttribute("FramebridgeId")
        local expectedParentId = entry.parent and entry.parent:GetAttribute("FramebridgeId")
        assert(parentId == expectedParentId, "Parent identity: " .. entry.node.id)
        for _, key in entry.keys do
            assert(same(target[key], entry.instance[key]), entry.node.id .. "." .. key .. " expected " .. tostring(entry.instance[key]) .. " got " .. tostring(target[key]))
        end
        if entry.node.assetRef then assert(target.Image == entry.instance.Image, "Linked image value") end
        passed += 1
    end
end)
if stage then Importer.destroy(stage) end
host:Destroy()
if not ok then table.insert(failures, tostring(why)) end
return {passed=passed, failed=#failures, failures=failures}
