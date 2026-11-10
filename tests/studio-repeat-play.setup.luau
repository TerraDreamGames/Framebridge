assert(game.PlaceId == 0, "Only the approved blank QA place")
local player = game:GetService("Players").LocalPlayer
assert(player and not _G.FramebridgeRepeatQA, "Start a fresh client QA session")
local Http = game:GetService("HttpService")
local state = {roots = {}, cases = {}}
local pending
local ok, why = pcall(function()
    for index, case in ipairs(Http:JSONDecode(fixtures)) do
        local pkg = Importer.decode(Http:JSONEncode(case.package))
        pending = Importer.stage(pkg, {}, false)
        local roots = Importer.apply(pending, pkg, player.PlayerGui, false)
        roots[1].Name = "FramebridgeRepeatSource" .. index
        roots[1].DisplayOrder = 2000 + index
        table.insert(state.roots, roots[1])
        local group = pending.byId[case.groupId].instance
        group.Parent.Position = UDim2.fromOffset(40 + ((index - 1) % 3) * 260, 80 + math.floor((index - 1) / 3) * 160)
        table.insert(state.cases, {group = group, expected = case.expected, name = case.name})
        pending = nil
    end
    local pkg = Importer.decode(interactiveFixture)
    pending = Importer.stage(pkg, {}, false, runtimeSource)
    local roots = Importer.apply(pending, pkg, player.PlayerGui, false)
    roots[1].Name = "FramebridgeRepeatInteractive"
    roots[1].DisplayOrder = 2010
    table.insert(state.roots, roots[1])
    pending.byId["repeat-root"].instance.Position = UDim2.fromOffset(40, 430)
    state.interactive = pending.byId
    pending = nil
end)
if not ok then
    if pending then Importer.destroy(pending) end
    for _,root in ipairs(state.roots) do root:Destroy() end
    error(why)
end
_G.FramebridgeRepeatQA = state
game:GetService("RunService").RenderStepped:Wait()
game:GetService("RunService").RenderStepped:Wait()
local button = state.interactive["show/repeat:repeat:1"].instance
local center = button.AbsolutePosition + button.AbsoluteSize / 2
return {roots = #state.roots, buttonCenter = {center.X, center.Y}, buttonPath = "LocalPlayer.PlayerGui." .. button:GetFullName():match("PlayerGui%.(.+)$")}
