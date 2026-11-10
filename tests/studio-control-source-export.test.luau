-- Actual React Lua/Fusion/compiled roblox-ts/vanilla graphs and their mounted
-- controllers, compared with the normal importer on the same exact package.
-- The loader observes mount and supplies deterministic data/time/random; this
-- is not physical pointer/touch/gamepad or pixel-fidelity acceptance.
assert(game.PlaceId == 0, "Approved blank QA place only")
local React = require(script.ReactLua.React)
local ReactRoblox = require(script.ReactLua.ReactRoblox)
local Fusion = require(script.Fusion)
local TsReact = require(script.RbxTsRuntime["@rbxts"].react)
local TsReactRoblox = require(script.RbxTsRuntime["@rbxts"]["react-roblox"])
local Importer = require(script.Importer)
local BehaviorSource = require(script.BehaviorSource)
local BehaviorRuntime = require(script.BehaviorRuntime)
observeControlRuntime(BehaviorRuntime)
local Http = game:GetService("HttpService")
local passed, failures, checks = 0, {}, {}
local keys = {"FramebridgeValue", "FramebridgeSelected", "FramebridgeUnlocked", "FramebridgeControlStatus", "FramebridgeSkillStatus", "FramebridgeCooldownRemaining", "FramebridgeCooldownReady", "FramebridgeTooltipVisible", "FramebridgeRouletteStatus", "FramebridgeRouletteIndex", "FramebridgeRoulettePreview", "FramebridgeRouletteValue", "FramebridgeBindingStatus"}
local function index(root)
    local result = {[root:GetAttribute("FramebridgeId")] = root}
    for _, node in ipairs(root:GetDescendants()) do
        local id = node:GetAttribute("FramebridgeId")
        if id then result[id] = node end
    end
    return result
end
local function test(name, body)
    local ok, why = xpcall(body, debug.traceback)
    if ok then passed += 1; table.insert(checks, name)
    else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function run(sourceCase, format)
    local stage, roots, renderer, scope, player, host, referenceHost, actual, expected, a, e
    local ids, configs = {}, {}
    local stats, health, coins, externalWindow
    local function parity()
        local ok, why = equivalent(roots[1], stage.roots[1])
        assert(ok, tostring(why))
        for id, reference in pairs(e) do
            if not reference:GetAttribute("FramebridgeRuntime") then
                assert(a[id], "Missing source identity: " .. id)
                for _, key in ipairs(keys) do
                    assert(same(a[id]:GetAttribute(key), reference:GetAttribute(key)), id .. "/" .. key .. " differs")
                end
            end
        end
    end
    local function both(method, ...)
        local left = actual[method](...)
        local right = expected[method](...)
        assert(left == right, method .. " return differs")
        task.wait()
        return left
    end
    local function advance(seconds)
        for _ = 1, math.floor(seconds / .05 + .001) do
            both("stepControls", .05)
        end
    end
    local function check(name, body)
        test(format .. "/" .. name, function() body(); parity() end)
    end
    local ok, why = xpcall(function()
        player = Instance.new("Folder"); host = Instance.new("Folder")
        host.Name = "FramebridgeControlRenderersQA"; host:SetAttribute("FramebridgeControlRenderersQA", true)
        host.Parent = game:GetService("CoreGui")
        activeControlPlayer = player
        stage = Importer.stage(sourceCase.package, {}, false, BehaviorSource)
        referenceHost = Instance.new("Folder"); referenceHost.Name = "FramebridgeControlReferenceQA"
        referenceHost:SetAttribute("FramebridgeControlRenderersQA", true); referenceHost.Parent = game:GetService("CoreGui")
        stage.roots[1].Parent = referenceHost
        expected = BehaviorRuntime.mount(stage.roots[1])
        if format == "luau" then roots = sourceCase.luau()(host, {})
        elseif format == "fusion" then
            scope = Fusion.scoped(Fusion); roots = sourceCase.fusion()(scope, {})
            for _, root in ipairs(roots) do root.Parent = host end
        else
            local ui = format == "tsx" and TsReact or React
            local engine = format == "tsx" and TsReactRoblox or ReactRoblox
            local component = format == "tsx" and sourceCase.tsx().default or sourceCase.react()
            renderer = engine.createRoot(host)
            renderer:render(ui.createElement(component, {Assets = {}})); task.wait(.15)
            roots = host:GetChildren()
            sourceCase.activeComponent = component
        end
        assert(#roots == 1, "Expected one native control scene")
        actual = observedControlControllers[roots[1]]
        assert(actual, "Source renderer did not mount its interaction runtime")
        a, e = index(roots[1]), index(stage.roots[1])
        local count = 0
        for id, node in pairs(e) do
            local raw = node:GetAttribute("FramebridgeBehavior")
            if raw then
                local b = Http:JSONDecode(raw)
                if b.control then
                    count += 1
                    local kind = b.control.kind
                    local key = kind == "skill" and (#b.control.requires == 0 and "baseSkill" or "dependentSkill") or kind
                    ids[key], configs[key] = id, b.control
                end
                if b.binding then ids.coins = id end
                if b.action and b.action.kind == "tab" then
                    local shown = stage.byId[b.action.target].instance.Visible
                    ids[shown and "firstTab" or "secondTab"] = id
                    ids[shown and "firstPanel" or "secondPanel"] = b.action.target
                end
            end
        end
        check("native properties, nine controls and trusted references", function()
            assert(count == 9 and observedControlMounts[roots[1]] == 1)
            for _, key in ipairs({"progress", "toggle", "slider", "cooldown", "tooltip", "window", "baseSkill", "dependentSkill", "roulette", "coins", "firstTab", "secondTab"}) do assert(ids[key], "Missing " .. key) end
            assert(actual.connectionCount() == expected.connectionCount(), "Initial subscription count differs")
        end)
        check("late read-only player data, clamp and removal", function()
            assert(a[ids.progress]:GetAttribute("FramebridgeControlStatus") == "Missing data")
            stats = Instance.new("Folder"); stats.Name = "leaderstats"; stats.Parent = player
            health = Instance.new("NumberValue"); health.Name = "Health"; health.Value = 20; health.Parent = stats
            player:SetAttribute("Health", 20); task.wait()
            assert(a[ids.progress]:GetAttribute("FramebridgeValue") == 20)
            assert(not both("setControlValue", ids.progress, 70) and health.Value == 20)
            health.Value = 120; player:SetAttribute("Health", 120); task.wait()
            assert(a[ids.progress]:GetAttribute("FramebridgeValue") == 100)
            health:Destroy(); player:SetAttribute("Health", nil); task.wait()
            assert(a[ids.progress]:GetAttribute("FramebridgeControlStatus") == "Missing data")
            assert(a[ids.progress]:GetAttribute("FramebridgeValue") == 100)
        end)
        check("slider quantization, fill, thumb and disabled input", function()
            assert(both("setSliderRatio", ids.slider, .37))
            local value = math.floor(37 / configs.slider.step + .5) * configs.slider.step
            assert(a[ids.slider]:GetAttribute("FramebridgeValue") == value)
            assert(math.abs(a[configs.slider.thumb].Position.X.Scale - value / 100) < .00001)
            a[ids.slider].Interactable = false; e[ids.slider].Interactable = false
            assert(not both("setSliderRatio", ids.slider, .7))
            a[ids.slider].Interactable = true; e[ids.slider].Interactable = true
        end)
        check("toggle activation and selected state", function()
            assert(both("activate", ids.toggle) and a[ids.toggle]:GetAttribute("FramebridgeValue") == true)
            assert(both("activate", ids.toggle) and a[ids.toggle]:GetAttribute("FramebridgeSelected") == false)
        end)
        check("cooldown timing, panel action and repeat lockout", function()
            assert(a[ids.window].Visible and both("activate", ids.cooldown))
            assert(not a[ids.window].Visible and not both("activate", ids.cooldown))
            advance(configs.cooldown.duration)
            assert(a[ids.cooldown]:GetAttribute("FramebridgeCooldownReady") == true)
            assert(both("activate", ids.cooldown) and a[ids.window].Visible)
        end)
        check("tooltip delay, cancellation and hidden owner", function()
            assert(both("focusTooltip", ids.tooltip, true)); advance(configs.tooltip.delay)
            assert(a[configs.tooltip.target].Visible)
            both("focusTooltip", ids.tooltip, false); assert(not a[configs.tooltip.target].Visible)
            assert(both("activate", ids.tooltip)); advance(configs.tooltip.delay)
            a[ids.tooltip].Visible = false; e[ids.tooltip].Visible = false; advance(.05)
            assert(not a[configs.tooltip.target].Visible)
            a[ids.tooltip].Visible = true; e[ids.tooltip].Visible = true
        end)
        check("window movement and external position edits", function()
            assert(both("moveWindow", ids.window, 30, 20))
            externalWindow = UDim2.fromOffset(200, 100)
            a[ids.window].Position = externalWindow; e[ids.window].Position = externalWindow; task.wait()
        end)
        check("tabs and stable action targets", function()
            assert(both("activate", ids.secondTab))
            assert(a[ids.secondPanel].Visible and not a[ids.firstPanel].Visible)
            assert(a[ids.secondTab]:GetAttribute("FramebridgeSelected") == true)
        end)
        check("skill prerequisites, unlock and reset", function()
            assert(not both("activate", ids.dependentSkill)); assert(both("activate", ids.baseSkill)); task.wait()
            assert(both("activate", ids.dependentSkill))
            a[ids.baseSkill]:SetAttribute("FramebridgeUnlocked", false); e[ids.baseSkill]:SetAttribute("FramebridgeUnlocked", false)
            a[ids.dependentSkill]:SetAttribute("FramebridgeUnlocked", false); e[ids.dependentSkill]:SetAttribute("FramebridgeUnlocked", false); task.wait()
            assert(a[ids.dependentSkill]:GetAttribute("FramebridgeSkillStatus") == "Locked")
        end)
        check("roulette timing, concurrent rejection and final result", function()
            assert(both("activate", ids.roulette) and not both("activate", ids.roulette))
            advance(configs.roulette.duration)
            assert(a[ids.roulette]:GetAttribute("FramebridgeRouletteValue") == configs.roulette.items[math.min(4, #configs.roulette.items)])
        end)
        check("live text player-data changes", function()
            coins = Instance.new("IntValue"); coins.Name = "Coins"; coins.Value = 40; coins.Parent = stats; task.wait()
            assert(a[ids.coins].Text == "Coins: 40")
            coins.Value = 150; task.wait(); assert(a[ids.coins].Text == "Coins: 150")
        end)
        check("repeated player-data replacement keeps subscriptions bounded", function()
            health = Instance.new("NumberValue"); health.Name = "Health"; health.Value = 50; health.Parent = stats
            player:SetAttribute("Health", 50); task.wait()
            local before = actual.connectionCount()
            for _ = 1, 5 do
                stats:Destroy(); task.wait(); stats = Instance.new("Folder"); stats.Name = "leaderstats"; stats.Parent = player
                health = Instance.new("NumberValue"); health.Name = "Health"; health.Value = 50; health.Parent = stats
                coins = Instance.new("IntValue"); coins.Name = "Coins"; coins.Value = 150; coins.Parent = stats; task.wait()
                assert(actual.connectionCount() == before and actual.connectionCount() == expected.connectionCount())
            end
        end)
        if renderer then
            check("props rerender retains instances and one runtime mount", function()
                local ui = format == "tsx" and TsReact or React
                renderer:render(ui.createElement(sourceCase.activeComponent, {Assets = {}})); task.wait(.15)
                assert(host:GetChildren()[1] == roots[1] and observedControlMounts[roots[1]] == 1)
                assert(actual.connectionCount() == expected.connectionCount())
            end)
        end
    end, debug.traceback)
    if not ok then table.insert(failures, format .. "/setup: " .. tostring(why)) end
    test(format .. "/renderer-owned teardown disconnects and restores external edits", function()
        assert(actual and expected, "No mounted controller")
        if renderer then renderer:unmount(); task.wait(.1)
        elseif scope then Fusion.doCleanup(scope)
        elseif roots then for _, root in ipairs(roots) do root:Destroy() end end
        task.wait(.1)
        assert(actual.connectionCount() == 0, "Source renderer left runtime subscriptions")
        if externalWindow then assert(a[ids.window].Position == externalWindow, "Teardown discarded application Position") end
        expected.destroy(); assert(expected.connectionCount() == 0)
    end)
    if renderer then pcall(function() renderer:unmount() end) end
    if scope then pcall(Fusion.doCleanup, scope) end
    if actual then actual.destroy() end
    if expected then expected.destroy() end
    if roots then for _, root in ipairs(roots) do root:Destroy() end end
    if stage then Importer.destroy(stage) end
    if host then host:Destroy() end
    if referenceHost then referenceHost:Destroy() end
    if player then player:Destroy() end
    activeControlPlayer = nil
end
for _, format in ipairs({"luau", "react", "fusion", "tsx"}) do
    for _, sourceCase in pairs(sourceCases) do run(sourceCase, format) end
end
return {passed = passed, failed = #failures, failures = failures, checks = checks, scope = "Four real source renderers; mount observer with deterministic player/time/random; controller-driven behavior and renderer-owned cleanup"}
