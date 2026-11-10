assert(game.PlaceId==0,"Only the approved blank QA place")
local Http=game:GetService("HttpService")
local cases=Http:JSONDecode(fixtures)
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
for name,value in pairs(cases) do
    test("native mask import: "..name,function()
        local pkg=Importer.decode(Http:JSONEncode(value))
        local stage=Importer.stage(pkg,{},false,runtimeSource)
        local ok,why=pcall(function()
            local prefix=string.lower(string.sub(name,5))
            local clip=stage.byId[prefix..":mask"].instance
            assert(clip:IsA("CanvasGroup") and clip.ClipsDescendants)
            assert(clip.BackgroundTransparency==1)
            assert(clip.Position==UDim2.fromOffset(prefix=="scroll" and 0 or 20,prefix=="scroll" and 0 or 20))
            local corner=stage.byId[prefix..":mask/corner"].instance
            assert(corner.Parent==clip)
            assert(corner.CornerRadius==(prefix=="circle" and UDim.new(0.5,0) or UDim.new(0,24)))
            local content=stage.byId[prefix..":content"].instance
            assert(content.Parent==(stage.byId[prefix..":mask/mask-content"] and stage.byId[prefix..":mask/mask-content"].instance or clip) and content:IsA("Frame"))
            assert(stage.byId[prefix..":outside"].instance.Parent==clip.Parent)
            assert(clip.GroupTransparency==(prefix=="alpha" and 0.75 or 0))
            if prefix=="scroll" then
                local viewport=stage.byId["scroll:viewport"].instance
                assert(viewport:IsA("ScrollingFrame") and viewport.Parent==content)
                assert(viewport.AutomaticCanvasSize==Enum.AutomaticSize.Y)
                assert(stage.byId["scroll:items/layout"].instance:IsA("UIListLayout"))
                assert(stage.byId["scroll:label-11"].instance:IsA("TextLabel"))
            else assert(stage.byId[prefix..":label"].instance:IsA("TextLabel")) end
            if prefix=="multiple" then
                local second=stage.byId["multiple:second-mask"].instance
                assert(second.Parent==clip.Parent and stage.byId["multiple:second-content"].instance.Parent==second)
            elseif prefix=="image" then
                assert(stage.byId["image:icon"].instance.Image=="rbxassetid://123")
                assert(stage.byId["image:icon"].instance.Parent==content)
            end
        end)
        Importer.destroy(stage);assert(ok,why)
    end)
end
test("mask edits reuse the clip and child identities, listeners and custom scripts",function()
    local host=Instance.new("Folder");local stage
    local ok,why=pcall(function()
        local pkg=Importer.decode(Http:JSONEncode(cases.maskRounded))
        stage=Importer.stage(pkg,{},false);Importer.apply(stage,pkg,host,false)
        local clip=stage.byId["rounded:mask"].instance
        local content=stage.byId["rounded:content"].instance
        local label=stage.byId["rounded:label"].instance
        local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Parent=content
        local listener=content:GetPropertyChangedSignal("Position"):Connect(function()end)
        local updated=Importer.decode(updatedFixture)
        stage=Importer.stage(updated,{},false);local _,stats=Importer.apply(stage,updated,host,true)
        assert(stats.created==0 and stats.removed==0)
        local found={};for _,obj in ipairs(host:GetDescendants())do found[obj:GetAttribute("FramebridgeId") or ""]=obj end
        assert(found["rounded:mask"]==clip and found["rounded:content"]==content and found["rounded:label"]==label)
        assert(custom.Parent==content and listener.Connected)
        assert(clip.Position==UDim2.fromOffset(50,60) and content.Position==UDim2.fromOffset(-50,-60))
        assert(clip.Size==UDim2.fromOffset(110,100) and clip:FindFirstChildOfClass("UICorner").CornerRadius==UDim.new(0,12))
        listener:Disconnect()
    end)
    if stage then Importer.destroy(stage)end;host:Destroy();assert(ok,why)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Synthetic mask geometry, native import and identity-preserving updates; no Figma pixel-fidelity claim"}
