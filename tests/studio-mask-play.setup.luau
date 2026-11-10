assert(game.PlaceId==0,"Only the approved blank QA place")
local player=game:GetService("Players").LocalPlayer
assert(player and not _G.FramebridgeMaskQA,"Start a fresh client QA session")
local Http=game:GetService("HttpService")
local cases=Http:JSONDecode(fixtures)
local state={roots={},cases={}}
local pending
local ok,why=pcall(function()
    for index,name in ipairs({"maskRounded","maskCircle","maskScroll"})do
        local pkg=Importer.decode(Http:JSONEncode(cases[name]))
        pending=Importer.stage(pkg,{},false,runtimeSource)
        local roots=Importer.apply(pending,pkg,player.PlayerGui,false)
        roots[1].Name="FramebridgeMaskQA"..index;roots[1].DisplayOrder=3000+index
        table.insert(state.roots,roots[1])
        roots[1]:FindFirstChildWhichIsA("GuiObject").Position=UDim2.fromOffset(20+(index-1)*270,70)
        state.cases[name]=pending.byId;pending=nil
    end
end)
if not ok then
    if pending then Importer.destroy(pending)end
    for _,root in ipairs(state.roots)do root:Destroy()end
    error(why)
end
_G.FramebridgeMaskQA=state
game:GetService("RunService").RenderStepped:Wait()
game:GetService("RunService").RenderStepped:Wait()
local viewport=state.cases.maskScroll["scroll:viewport"].instance
local center=viewport.AbsolutePosition+viewport.AbsoluteSize/2
return {roots=#state.roots,scrollCenter={center.X,center.Y},scrollPath="LocalPlayer.PlayerGui."..viewport:GetFullName():match("PlayerGui%.(.+)$")}
