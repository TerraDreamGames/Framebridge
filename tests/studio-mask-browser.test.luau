assert(game.PlaceId==0,"Only the approved blank QA place")
local pkg=Importer.decode(browserFixture)
local stage=Importer.stage(pkg,{},false,runtimeSource)
local ok,why=pcall(function()
    local clip=stage.byId["rounded:mask"].instance
    assert(clip:IsA("CanvasGroup") and clip:FindFirstChildOfClass("UICorner"))
    assert(stage.byId["rounded:label"].instance.Text=="Mask text edited")
    assert(stage.byId["rounded:content"].instance:IsDescendantOf(clip))
    local viewport=stage.byId["scroll:viewport"].instance
    assert(viewport:IsA("ScrollingFrame") and viewport.AutomaticCanvasSize==Enum.AutomaticSize.Y)
    assert(stage.byId["circle:mask"].instance:IsA("CanvasGroup"))
    assert(stage.byId["responsive:mask/mask-content"].instance:GetAttribute("FramebridgeMaskBasis")=="responsive:group")
end)
Importer.destroy(stage);assert(ok,why)
return {passed=6,failed=0,scope="Exact browser download imported natively; mask hierarchy, property edit, scroll/list, circle and responsive coordinate binding"}
