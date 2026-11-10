assert(game.PlaceId == 0, "Use only the approved blank QA place")
local Http = game:GetService("HttpService")
local passed, failures, timings = 0, {}, {}
local function test(name, body)
    local started = os.clock()
    local ok, why = pcall(body)
    timings[name] = math.floor((os.clock() - started) * 1000)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function package() return Importer.decode(fixture) end
test("3,000 native image references share 1,000 unique IDs", function()
    local pkg = package()
    local stage = Importer.stage(pkg, {}, false)
    local ok, why = pcall(function()
        local unique = {}
        for _, asset in ipairs(pkg.assets) do
            local instance = stage.byId[asset.nodeId].instance
            assert(instance:IsA("ImageLabel") and instance.Image == Importer.assetId(asset.robloxId))
            assert(instance:GetAttribute("FramebridgeAsset") == asset.id)
            unique[instance.Image] = true
        end
        local count = 0
        for _ in pairs(unique) do count += 1 end
        assert(#pkg.assets == 3000 and count == 1000)
        assert(#stage.entries == 3002, "Native screens/frames/images must stay editable")
    end)
    Importer.destroy(stage)
    assert(ok, why)
end)
test("batch reimport retains native identities, unmanaged edits and user scripts", function()
    local host, stage = Instance.new("Folder"), nil
    local ok, why = pcall(function()
        local pkg = package()
        stage = Importer.stage(pkg, {}, false)
        local _, initial = Importer.apply(stage, pkg, host, false)
        assert(initial.created == 3002)
        local actual = stage.byId[pkg.assets[1].nodeId].instance
        local logic = Instance.new("LocalScript")
        logic.Name = "UserLogic"; logic.Parent = actual
        local crop = Vector2.new(3, 4)
        actual.ImageRectOffset = crop
        actual:SetAttribute("CustomValue", "preserve")
        local next = package()
        next.assets[1].robloxId = next.assets[2].robloxId
        stage = Importer.stage(next, {}, false)
        local _, stats = Importer.apply(stage, next, host, true)
        assert(stats.created == 0 and stats.removed == 0 and stats.updated == 3002)
        local same
        for _, child in ipairs(host:GetDescendants()) do
            if child:GetAttribute("FramebridgeId") == pkg.assets[1].nodeId then same = child end
        end
        assert(same == actual and actual.ImageRectOffset == crop)
        assert(actual.Image == Importer.assetId(next.assets[1].robloxId))
        assert(logic.Parent == actual and actual:GetAttribute("CustomValue") == "preserve")
    end)
    if stage then Importer.destroy(stage) end
    host:Destroy()
    assert(ok, why)
end)
test("canonical prefixes do not consume extra unique slots", function()
    local pkg = package()
    for index, asset in ipairs(pkg.assets) do
        if index % 2 == 0 then asset.robloxId = "rbxassetid://" .. asset.robloxId end
    end
    assert(#Importer.decode(Http:JSONEncode(pkg)).assets == 3000)
end)
test("the 1,001st linked ID is rejected before staging", function()
    local pkg = package()
    pkg.assets[3000].robloxId = "200000000000000"
    local ok, why = pcall(Importer.decode, Http:JSONEncode(pkg))
    assert(not ok and tostring(why):find("1,000", 1, true))
end)
test("the 10,001st reference is rejected even when IDs are shared", function()
    local pkg = package()
    for index = #pkg.assets + 1, 10001 do
        table.insert(pkg.assets, { id = "extra-" .. index, name = "Extra", robloxId = pkg.assets[1].robloxId })
    end
    local ok, why = pcall(Importer.decode, Http:JSONEncode(pkg))
    assert(not ok and tostring(why):find("10,000", 1, true))
end)
test("manual bindings obey the unique-image limit", function()
    local pkg, bindings = package(), {}
    for index, asset in ipairs(pkg.assets) do
        asset.robloxId = nil
        bindings[asset.id] = tostring(100000000000000 + index % 1001)
    end
    local ok, result = pcall(Importer.stage, pkg, bindings, false)
    if ok then Importer.destroy(result) end
    assert(not ok and tostring(result):find("1,000", 1, true))
end)
return { passed = passed, failed = #failures, failures = failures, timingsMs = timings,
    scope = "Detached native batch decode/import/update; IDs test bindings, not uploaded or moderated pixels" }
