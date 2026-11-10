-- Native property/binding checks only; synthetic IDs do not verify moderated pixels.
-- Hosts stay detached and are destroyed, without changing the place or selection.
local Http = game:GetService("HttpService")
local rawFixtures = Http:JSONDecode(fixtures)
local passed, failures = 0, {}
local function test(name, body)
    local ok, why = pcall(body)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function package(index, class)
    local p = Importer.decode(Http:JSONEncode(rawFixtures[index]))
    Editor.find(p, "icon").className = class or "ImageLabel"
    return p
end
local function near(a, b) assert(math.abs(a - b) < 0.000001, tostring(a) .. " ~= " .. tostring(b)) end
for _, class in ipairs({"ImageLabel", "ImageButton"}) do
    for _, mode in ipairs({"scale", "offset", "source"}) do
        test(class .. " applies prepared binding and tint in " .. mode, function()
            local p = Editor.prepare(package(2, class), { mode = mode, layers = {} })
            local stage = Importer.stage(p, {}, false)
            local ok, why = pcall(function()
                local icon = stage.byId.icon.instance
                assert(icon.ClassName == class and icon.Image == "rbxassetid://123456790")
                assert(icon:GetAttribute("FramebridgeAsset") == p.assets[1].id)
                near(icon.ImageColor3.R, 0.2); near(icon.ImageColor3.G, 0.7); near(icon.ImageColor3.B, 1)
                if mode == "scale" then near(icon.Size.X.Scale, 140/360); near(icon.Size.Y.Scale, 100/240)
                else assert(icon.Size.X.Offset == 140 and icon.Size.Y.Offset == 100) end
            end)
            Importer.destroy(stage); assert(ok, why)
        end)
    end
    test(class .. " changes prepared artwork and tint in place while retaining user logic", function()
        local host = Instance.new("Folder")
        local stage
        local ok, why = pcall(function()
            local p = package(1, class); stage = Importer.stage(p, {}, false)
            Importer.apply(stage, p, host, false)
            local icon = stage.byId.icon.instance
            local script = Instance.new("LocalScript"); script.Name = "UserLogic"; script.Parent = icon
            local connection = icon:GetPropertyChangedSignal("ImageColor3"):Connect(function() end)
            for index = 2, 4 do
                local nextPackage = package(index, class)
                local node = Editor.find(nextPackage, "icon")
                node.properties.ImageColor3 = { type = "Color3", value = {index/10, 0.5, 0.8} }
                stage = Importer.stage(nextPackage, {}, false)
                local _, stats = Importer.apply(stage, nextPackage, host, true)
                assert(stats.created == 0 and stats.removed == 0 and stats.updated > 0)
                assert(icon.Image == "rbxassetid://" .. nextPackage.assets[1].robloxId)
                assert(icon:GetAttribute("FramebridgeAsset") == nextPackage.assets[1].id)
                near(icon.ImageColor3.R, index/10); near(icon.ImageColor3.G, 0.5)
                assert(script.Parent == icon and connection.Connected)
            end
            local reset = package(4, class); Editor.find(reset, "icon").properties.ImageColor3 = nil
            stage = Importer.stage(reset, {}, false); Importer.apply(stage, reset, host, true)
            assert(icon.ImageColor3 == Color3.new(1,1,1) and script.Parent == icon)
            connection:Disconnect()
        end)
        if stage then Importer.destroy(stage) end
        host:Destroy(); assert(ok, why)
    end)
end
test("a raw asset binding cannot satisfy an unlinked prepared variant", function()
    local p = package(2); p.assets[1].robloxId = nil
    Editor.find(p, "icon").properties.Image = ""
    assert(not pcall(Importer.stage, p, { [rawFixtures[1].assets[1].id] = "123456789" }, false))
    local stage = Importer.stage(p, { [p.assets[1].id] = "123456790" }, false)
    assert(stage.byId.icon.instance.Image == "rbxassetid://123456790")
    Importer.destroy(stage)
end)
return { passed = passed, failed = #failures, failures = failures }
