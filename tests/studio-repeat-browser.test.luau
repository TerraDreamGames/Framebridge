assert(game.PlaceId == 0, "Only the approved blank QA place")
local pkg = Importer.decode(browserFixture)
local stage = Importer.stage(pkg, {}, false)
local ok, why = pcall(function()
    assert(#stage.entries == 35 and #stage.roots == 5, "Browser export dropped a repeat instance")
    for _,case in ipairs(game:GetService("HttpService"):JSONDecode(fixtures)) do
        local group = stage.byId[case.groupId].instance
        local actual = {}
        assert(#group:GetChildren() == #case.expected)
        for _,item in ipairs(group:GetChildren()) do actual[tostring(item.Position.X.Offset) .. ":" .. tostring(item.Position.Y.Offset)] = true end
        for _,point in ipairs(case.expected) do assert(actual[tostring(point[1]) .. ":" .. tostring(point[2])], "Browser export changed a Figma repeat coordinate") end
    end
    for _,id in ipairs({"116:11", "116:11/repeat:116:12:1", "116:11/repeat:116:12:2"}) do
        assert(stage.byId[id].instance.BackgroundTransparency == 0.25, "Edit original did not reach every imported copy")
    end
end)
Importer.destroy(stage)
assert(ok, why)
return {passed = 6, failed = 0, instances = 35, scope = "Exact browser-downloaded package: five Figma repeat patterns and a shared source edit"}
