assert(game.PlaceId == 0 and _G.FramebridgeRepeatQA, "Run the owned client repeat setup first")
local state = _G.FramebridgeRepeatQA
local passed, failures = 0, {}
for _,case in ipairs(state.cases) do
    local ok, why = pcall(function()
        local group = case.group
        assert(group.AbsoluteSize.X > 0 and group.AbsoluteSize.Y > 0, "Native layout did not run")
        local actual = {}
        for _,item in ipairs(group:GetChildren()) do
            local relative = item.AbsolutePosition - group.AbsolutePosition
            actual[tostring(math.round(relative.X)) .. ":" .. tostring(math.round(relative.Y))] = true
        end
        for _,point in ipairs(case.expected) do
            assert(actual[tostring(point[1]) .. ":" .. tostring(point[2])], "Native rendered position differs from the Figma SVG")
        end
    end)
    if ok then passed += 1 else table.insert(failures, case.name .. ": " .. tostring(why)) end
end
local allHidden = true
for _,id in ipairs({"details", "details/repeat:repeat:1", "details/repeat:repeat:2"}) do
    allHidden = allHidden and not state.interactive[id].instance.Visible
end
assert(allHidden, "Copied panels must start hidden before pointer activation")
return {passed = passed, failed = #failures, failures = failures, panelsInitiallyHidden = allHidden, scope = "Actual native Play positions for five real Figma repeat renders"}
