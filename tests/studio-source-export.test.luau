-- Real renderer/property checks. Rendered UI cases mount temporarily in approved blank QA.
local React = require(script.ReactLua.React)
local ReactRoblox = require(script.ReactLua.ReactRoblox)
local Fusion = require(script.Fusion)
local TsReact = script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"].react)
local TsReactRoblox = script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"]["react-roblox"])
local Importer = require(script.Importer)
local BehaviorSource = require(script.BehaviorSource)
local BehaviorRuntime = require(script.BehaviorRuntime)
local passed, failures = 0, {}
local function same(a, b)
    if typeof(a) ~= typeof(b) then return false end
    if typeof(a) == "Font" then return a.Family == b.Family and a.Weight == b.Weight and a.Style == b.Style end
    if typeof(a) == "ColorSequence" or typeof(a) == "NumberSequence" then
        if #a.Keypoints ~= #b.Keypoints then return false end
        for i, point in ipairs(a.Keypoints) do
            if point.Time ~= b.Keypoints[i].Time or point.Value ~= b.Keypoints[i].Value then return false end
        end
        return true
    end
    if typeof(a) == "number" then return math.abs(a-b) < 0.000001 end
    return a == b
end
local function equivalent(actual, expected)
    if actual.ClassName ~= expected.ClassName or actual.Name ~= expected.Name then return false end
    local actualId, expectedId = actual:GetAttribute("FramebridgeId"), expected:GetAttribute("FramebridgeId")
    if actualId and expectedId and actualId ~= expectedId then return false, "source identity" end
    if actual:GetAttribute("FramebridgeMaskBasis") ~= expected:GetAttribute("FramebridgeMaskBasis") then return false,"mask coordinate binding" end
    if actual:GetAttribute("FramebridgeLayoutCanvas") ~= expected:GetAttribute("FramebridgeLayoutCanvas") then return false,"proportional layout canvas" end
    if actual:GetAttribute("FramebridgeDecorationRect") ~= expected:GetAttribute("FramebridgeDecorationRect") then return false,"background coordinate binding" end
    local raw = expected:GetAttribute("FramebridgeProperties")
    local properties
    if raw then properties=game:GetService("HttpService"):JSONDecode(raw)
    else
        assert(expected:GetAttribute("FramebridgeMotionHelper"),"Unknown runtime helper in renderer comparison")
        if expected:IsA("UIScale") then properties={"Scale"}
        elseif expected:IsA("UISizeConstraint") then properties={"MinSize","MaxSize"}
        elseif expected:IsA("UIAspectRatioConstraint") then properties={"AspectRatio","AspectType","DominantAxis"}
        elseif expected:IsA("TextButton") and expected:GetAttribute("FramebridgeWorldHelper") then properties={"Size","Position","AnchorPoint","BackgroundTransparency","BorderSizePixel","Text","ZIndex","Active"}
        else error("Unhandled runtime helper: "..expected.ClassName) end
    end
    for _, property in ipairs(properties) do
        if not same(actual[property], expected[property]) then return false, property .. " expected " .. tostring(expected[property]) .. " got " .. tostring(actual[property]) end
    end
    local remaining = {}
    for _,child in ipairs(actual:GetChildren()) do if not child:GetAttribute("FramebridgeParticleHelper") then table.insert(remaining,child) end end
    local expectedChildren = {}
    for _,child in ipairs(expected:GetChildren()) do
        local worldReference=child:IsA("ObjectValue") and child:GetAttribute("FramebridgeId")==tostring(expected:GetAttribute("FramebridgeId")).."/world-target"
        if not child:GetAttribute("FramebridgeRuntime") and not child:GetAttribute("FramebridgeParticleHelper") and not worldReference then table.insert(expectedChildren,child) end
    end
    if #remaining ~= #expectedChildren then return false, "child count" end
    for _, expectedChild in ipairs(expectedChildren) do
        local index, detail
        for i, candidate in ipairs(remaining) do
            local matches, why = equivalent(candidate, expectedChild)
            if matches then index = i; break end
            if candidate.ClassName==expectedChild.ClassName and candidate.Name==expectedChild.Name then detail=why end
        end
        if not index then return false, expectedChild.Name .. ": " .. tostring(detail) end
        table.remove(remaining, index)
    end
    return true
end
local function check(name, sourceCase, format, bindings)
    bindings = bindings or {}
    local host = Instance.new("Folder")
    local renderer, rendererComponent, scope, stage, expectedHost, scene, roots
    local expectedRuntimes = {}
    local world=sourceCase.package.roots[1].worldUI
    local ok, why = xpcall(function()
        stage = Importer.stage(sourceCase.package, bindings, false, BehaviorSource)
        local worldTargets
        local function makeTarget(replacement)
            local part=Instance.new("Part");part.Anchored=true;part.Parent=scene
            if world.kind~="prompt" then return part end
            local config=world.prompt
            local prompt=Instance.new("ProximityPrompt");prompt.Style=Enum.ProximityPromptStyle.Custom
            prompt.ActionText=replacement and "Replacement action" or config.actionText;prompt.ObjectText=config.objectText
            prompt.KeyboardKeyCode=Enum.KeyCode[config.keyboardKey];prompt.GamepadKeyCode=Enum.KeyCode[config.gamepadKey]
            prompt.HoldDuration=config.holdDuration;prompt.Parent=part
            return prompt
        end
        local worldTarget
        if world then
            assert(game.PlaceId==0,"World renderer checks require the separate blank QA place")
            scene=Instance.new("Folder");scene.Name="FramebridgeWorldSourceQA";scene:SetAttribute("FramebridgeWorldQA",true);scene.Parent=workspace
            worldTarget=makeTarget(false);worldTargets={[sourceCase.package.roots[1].id]=worldTarget}
            expectedHost=Instance.new("Folder")
            Importer.apply(stage,sourceCase.package,expectedHost,false,worldTarget)
        end
        local function needsRuntime(node)
            if node.themes or node.behavior or node.worldUI or node.maskBasis or node.decorationRect or node.layoutCanvas then return true end
            for _,child in ipairs(node.children) do if needsRuntime(child) then return true end end
            return false
        end
        for index,node in ipairs(sourceCase.package.roots) do
            if needsRuntime(node) then table.insert(expectedRuntimes, BehaviorRuntime.mount(stage.roots[index], {worldTarget=worldTarget})) end
        end
        if format == "luau" then
            roots = sourceCase.luau()(host, bindings, worldTargets)
        elseif format == "fusion" then
            scope = Fusion.scoped(Fusion)
            roots = sourceCase.fusion()(scope, bindings, worldTargets)
            for _, root in ipairs(roots) do root.Parent = host end
        else
            renderer = (format == "tsx" and TsReactRoblox or ReactRoblox).createRoot(host)
            rendererComponent = format == "tsx" and sourceCase.tsx().default or sourceCase.react()
            renderer:render((format == "tsx" and TsReact or React).createElement(rendererComponent, { Assets = bindings, WorldTargets = worldTargets }))
            task.wait(0.15)
            roots = host:GetChildren()
        end
        if world then
            local root=roots[1]
            assert(root.Adornee==(world.kind=="prompt" and worldTarget.Parent or worldTarget),"Source target binding missing")
            local decoded=game:GetService("HttpService"):JSONDecode(root:GetAttribute("FramebridgeWorld"))
            local canvas=game:GetService("HttpService"):JSONDecode(root:GetAttribute("FramebridgeCanvas"))
            assert(decoded.kind==world.kind and canvas[1]==280 and canvas[2]==140,"World metadata missing from renderer")
        end
        assert(#roots == #stage.roots, "root count")
        if sourceCase.package.sourceId:match("^style:") then task.wait(0.15) end
        for _, expected in ipairs(stage.roots) do
            local found, detail = false, nil
            for _, actual in ipairs(roots) do
                local matches, errorMessage = equivalent(actual, expected)
                if matches then found = true; break end
                detail = errorMessage
            end
            assert(found, expected.Name .. ": " .. tostring(detail))
        end
        if world then
            local root=roots[1]
            if format=="react" or format=="tsx" then
                local replacement=makeTarget(true)
                renderer:render((format=="tsx" and TsReact or React).createElement(rendererComponent,{Assets=bindings,WorldTargets={[sourceCase.package.roots[1].id]=replacement}}))
                task.wait(0.15)
                assert(host:GetChildren()[1]==root and root.Adornee==(world.kind=="prompt" and replacement.Parent or replacement),"WorldTargets prop change did not rebind the existing root: "..game:GetService("HttpService"):JSONEncode({same=host:GetChildren()[1]==root,adornee=root.Adornee and root.Adornee:GetFullName(),replacement=(world.kind=="prompt" and replacement.Parent or replacement):GetFullName(),old=root.Adornee==(world.kind=="prompt" and worldTarget.Parent or worldTarget),enabled=root.Enabled,oldParent=root.Parent and root.Parent:GetFullName(),childCount=#host:GetChildren(),newClass=host:GetChildren()[1] and host:GetChildren()[1].ClassName,newName=host:GetChildren()[1] and host:GetChildren()[1].Name,newBound=host:GetChildren()[1] and host:GetChildren()[1].Adornee==(world.kind=="prompt" and replacement.Parent or replacement)}))
                local scaleCount,inputCount=0,0
                for _,instance in ipairs(root:GetDescendants()) do
                    if instance.Name=="FramebridgeWorldScale" then scaleCount+=1 end
                    if instance.Name=="FramebridgePromptInput" then inputCount+=1 end
                    if world.kind=="prompt" and instance:GetAttribute("FramebridgeId")==world.prompt.labels.action then assert(instance.Text=="Replacement action","Rebound prompt did not update its label") end
                end
                assert(scaleCount==(world.kind=="surface" and 0 or 1) and inputCount==(world.kind=="prompt" and 1 or 0),"World target rebind duplicated runtime helpers")
            end
        end
        if sourceCase.package.sourceId == "particle-qa" then
            local root=roots[1];local ids={}
            for _,instance in ipairs(root:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId");if id then ids[id]=instance end end
            assert(root:GetAttribute("FramebridgeParticles")=="1","Renderer omitted particle runtime metadata")
            assert(ids.celebrate:GetAttribute("FramebridgeParticlesStatus")=="Ready","Renderer failed to mount particle engine")
            assert(ids.external:GetAttribute("FramebridgeParticlesStatus")=="Missing or mismatched Emitter2D template","Renderer hid missing dependency")
            ids.celebrate:SetAttribute("FramebridgeParticleBurst",1);task.wait()
            assert(ids.celebrate:GetAttribute("FramebridgeParticleCount")==12,"Renderer did not emit native particles")
            ids.celebrate:SetAttribute("FramebridgeParticlesClear",1);task.wait()
            assert(ids.celebrate:GetAttribute("FramebridgeParticleCount")==0,"Renderer did not clear native particles")
            root:SetAttribute("FramebridgeTheme","Dark");task.wait()
            assert(ids.celebrate:GetAttribute("FramebridgeParticlesStatus")=="Ready","Theme switching damaged particles")
        end
        if sourceCase.package.sourceId == "theme-qa" then
            local root=roots[1]
            local ids={};for _,instance in ipairs(root:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId");if id then ids[id]=instance end end
            assert(root:GetAttribute("FramebridgeThemeStatus")=="Ready","Renderer failed to mount theme runtime")
            root:SetAttribute("FramebridgeTheme","Dark");task.wait()
            for _,id in ipairs({"buy","sell"}) do assert(ids[id].BackgroundColor3==Color3.new(0.1,0.12,0.2),"Renderer did not switch shared background") end
            assert(ids.heading.TextColor3==Color3.new(0.65,0.75,1),"Renderer did not switch text color")
            assert(ids["buy/theme-shadow"].BlurRadius.Offset==12,"Renderer did not switch native shadow")
            ids.buy.BackgroundColor3=Color3.new(1,0,0);task.wait()
            root:SetAttribute("FramebridgeTheme","Light");task.wait()
            assert(ids.buy.BackgroundColor3==Color3.new(1,0,0),"Renderer overwrote application color")
            assert(ids.sell.BackgroundColor3==Color3.new(0.94,0.96,1),"Renderer stopped switching unrelated components")
        end
        if sourceCase.package.sourceId == "framebridge-example:keyframes" then
            local ids={}
            for _,instance in ipairs(roots[1]:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId");if id then ids[id]=instance end end
            local i=ids.activate;local slot=ids["activate/motion-slot"]
            assert(i and slot,"Keyframe identities missing")
            local reservation=slot.Size
            i:SetAttribute("FramebridgeAnimate",true);task.wait(1.1)
            assert(i.Position.X.Offset==60 and i:GetAttribute("FramebridgeKeyframeStatus")=="Complete","Renderer did not play the native chain")
            assert(slot.Size==reservation and i:FindFirstChildOfClass("UIScale").Scale==1,"Playback changed its layout reservation")
            local metadata=game:GetService("HttpService"):JSONDecode(i:GetAttribute("FramebridgeBehavior"))
            assert(metadata.keyframes and metadata.keyframes.slot=="activate/motion-slot" and not metadata.keyframes.recording,"Compiled chain metadata missing")
        end
        if sourceCase.package.sourceId == "motion-export-fixture" then
            local ids={}
            for _,instance in ipairs(roots[1]:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId");if id then ids[id]=instance end end
            assert(ids.open and ids["open/motion-slot"],"Motion identities missing")
            local reservation=ids["open/motion-slot"].Size
            ids.open:SetAttribute("FramebridgeSelected",true);task.wait(0.4)
            assert(ids.open:FindFirstChildOfClass("UIScale").Scale>1.04,"Renderer did not mount native motion")
            assert(ids["open/motion-slot"].Size==reservation,"Motion changed its layout reservation")
            assert(game:GetService("HttpService"):JSONDecode(ids.open:GetAttribute("FramebridgeBehavior")).motion.owner=="open")
        end
        if sourceCase.package.sourceId == "style:autoY" or sourceCase.package.sourceId == "style:autoX" or sourceCase.package.sourceId == "style:autoGrid" then
            assert(game.PlaceId == 0, "Style source checks require blank QA")
            local ids = {}
            for _, instance in ipairs(roots[1]:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId"); if id then ids[id]=instance end end
            roots[1].Parent = game:GetService("CoreGui")
            ids.canvas.Size = UDim2.fromOffset(400, 300)
            task.wait(0.15)
            local panel = ids.panel
            local first = ids.first or ids.cell0
            for i = 1, 8 do local copy=first:Clone(); copy.LayoutOrder=10+i; copy.Parent=panel end
            task.wait(0.2)
            local padding=panel:FindFirstChildOfClass("UIPadding")
            local edge=Vector2.zero
            for _, child in ipairs(panel:GetChildren()) do
                if child:IsA("GuiObject") then
                    local last=child.AbsolutePosition-panel.AbsolutePosition+child.AbsoluteSize+panel.CanvasPosition
                    edge=Vector2.new(math.max(edge.X,last.X),math.max(edge.Y,last.Y))
                end
            end
            local axis=panel.AutomaticCanvasSize
            if axis==Enum.AutomaticSize.X or axis==Enum.AutomaticSize.XY then assert(panel.AbsoluteCanvasSize.X >= edge.X+padding.PaddingRight.Offset-1, "Renderer lost horizontal end padding") end
            if axis==Enum.AutomaticSize.Y or axis==Enum.AutomaticSize.XY then assert(panel.AbsoluteCanvasSize.Y >= edge.Y+padding.PaddingBottom.Offset-1, "Renderer lost vertical end padding") end
        end
        if sourceCase.package.sourceId == "effect-decoration-qa" then
            assert(game.PlaceId==0,"Effect/blend renderer checks require blank QA")
            roots[1].Parent=game:GetService("CoreGui")
            local ids={};for _,obj in ipairs(roots[1]:GetDescendants())do local id=obj:GetAttribute("FramebridgeId");if id then ids[id]=obj end end
            ids["effect:root"].Size=UDim2.fromOffset(640,420);task.wait(.08)
            local text,image=ids["effect:text"],ids["effect:text/effect"]
            local group,glow=ids["effect:container"],ids["effect:container/effect"]
            local button,blend=ids["effect:blend"],ids["effect:blend/decoration"]
            assert(text:IsA("TextLabel") and ids["effect:child"].Parent==group and button:IsA("GuiButton"),"Renderer flattened effect content")
            assert(group:IsA("CanvasGroup") and math.abs(group.GroupTransparency-.5)<.001 and glow.ImageTransparency==0,"Renderer applied group opacity twice or lost native group")
            assert(glow.AbsoluteSize.X>group.AbsoluteSize.X,"Fixture needs extended artwork; CanvasGroup texture clipping remains a pixel comparison gate")
            assert(not text:FindFirstChildOfClass("UIShadow") and not group:FindFirstChildOfClass("UIShadow") and ids["effect:box"]:FindFirstChildOfClass("UIShadow"),"Renderer duplicated extracted effects or omitted native box shadow")
            for _,obj in ipairs({image,glow,blend})do assert(not obj.Active and not obj.Selectable,"Renderer exposed helper input")end
            local original=image.AbsoluteSize
            text.Size=UDim2.fromOffset(360,80);task.wait(.08)
            assert((image.AbsoluteSize-original*2).Magnitude<.6,"Renderer lost extended effect bounds")
            text.Rotation=23;task.wait(.08)
            assert(image.Rotation==0 and math.abs(image.AbsoluteRotation-text.AbsoluteRotation)<.01,"Renderer applied owner rotation twice")
            text.Text="Edited native title";assert(text.Text=="Edited native title" and image.Parent==text,"Renderer lost editable text")
            button.Size=UDim2.fromOffset(180,66)
            local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(0,8);padding.PaddingTop=UDim.new(0,7);padding.Parent=button;task.wait(.08)
            assert((blend.AbsolutePosition-button.AbsolutePosition).Magnitude<.6 and (blend.AbsoluteSize-button.AbsoluteSize).Magnitude<.6,"Renderer lost frozen own-paint geometry")
            assert(button.Active and button.Selectable,"Renderer lost native button input owner")
            padding:Destroy()
        end
        if sourceCase.package.sourceId == "decoration-qa" then
            assert(game.PlaceId==0,"Background renderer checks require blank QA")
            roots[1].Parent=game:GetService("CoreGui")
            local ids={};for _,obj in ipairs(roots[1]:GetDescendants())do local id=obj:GetAttribute("FramebridgeId");if id then ids[id]=obj end end
            local scroll,image=ids["decor:scroll"],ids["decor:scroll/decoration"]
            assert(scroll and image and ids["decor:card:3"] and ids["decor:icon"],"Renderer flattened editable content")
            ids["decor:root"].Size=UDim2.fromOffset(480,360)
            for _,size in ipairs({Vector2.new(180,140),Vector2.new(220,120),Vector2.new(160,180)})do
                scroll.Size=UDim2.fromOffset(size.X,size.Y);scroll.CanvasPosition=Vector2.new(0,40);task.wait(.08)
                assert((scroll.AbsoluteSize-size).Magnitude<.6,"Renderer has no measured viewport")
                assert(scroll.AbsoluteCanvasSize.Y>scroll.AbsoluteSize.Y and scroll.CanvasPosition.Y>0,"Renderer did not scroll native content")
                assert((scroll.AbsolutePosition-image.AbsolutePosition).Magnitude<.6,"Renderer scrolled background with content")
                assert((scroll.AbsoluteSize-image.AbsoluteSize).Magnitude<.6,"Renderer resized background against canvas")
            end
        end
        if sourceCase.package.sourceId:match("^mask%-resize%-") then
            assert(game.PlaceId==0,"Mask renderer checks require blank QA")
            roots[1].Parent=game:GetService("CoreGui")
            local ids={};for _,obj in ipairs(roots[1]:GetDescendants())do local id=obj:GetAttribute("FramebridgeId");if id then ids[id]=obj end end
            local data
            local function find(node)if node.id=="rounded:content" then data=node end;for _,child in ipairs(node.children)do find(child)end end
            find(sourceCase.package.roots[1])
            local pos,size=data.properties.Position.value,data.properties.Size.value
            for _,canvas in ipairs({Vector2.new(320,240),Vector2.new(640,360),Vector2.new(240,480)})do
                ids["rounded:root"].Size=UDim2.fromOffset(canvas.X,canvas.Y);task.wait(.08)
                local parent,content=ids["rounded:group"],ids["rounded:content"]
                local expectedSize=Vector2.new(size[1]*parent.AbsoluteSize.X+size[2],size[3]*parent.AbsoluteSize.Y+size[4])
                local expectedPosition=parent.AbsolutePosition+Vector2.new(pos[1]*parent.AbsoluteSize.X+pos[2],pos[3]*parent.AbsoluteSize.Y+pos[4])
                assert((content.AbsoluteSize-expectedSize).Magnitude<.6,"Renderer lost original-parent mask sizing")
                assert((content.AbsolutePosition-expectedPosition).Magnitude<.6,"Renderer lost independent mask coordinates")
            end
            ids["rounded:mask"].Position=UDim2.fromOffset(10,15);ids["rounded:mask"].Size=UDim2.fromOffset(110,85);task.wait(.08)
            local parent,content=ids["rounded:group"],ids["rounded:content"]
            local expectedPosition=parent.AbsolutePosition+Vector2.new(pos[1]*parent.AbsoluteSize.X+pos[2],pos[3]*parent.AbsoluteSize.Y+pos[4])
            assert((content.AbsolutePosition-expectedPosition).Magnitude<.6,"Renderer moved content with the edited crop")
        end
        if sourceCase.package.sourceId:match("^mask%-automatic%-") then
            assert(game.PlaceId==0,"Automatic mask renderer checks require blank QA")
            roots[1].Parent=game:GetService("CoreGui")
            local ids={};for _,obj in ipairs(roots[1]:GetDescendants())do local id=obj:GetAttribute("FramebridgeId");if id then ids[id]=obj end end
            local owner,content,crop=ids["rounded:group"],ids["rounded:content"],ids["rounded:mask"]
            local reference=Instance.new("Frame");reference.BackgroundTransparency=1;reference.Parent=owner
            owner.CanvasSize=UDim2.fromOffset(600,400)
            content.Position=UDim2.new(.35,12,.25,8);content.Size=UDim2.new(.4,16,.3,14)
            reference.Position=content.Position;reference.Size=content.Size
            local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(.02,4);padding.PaddingRight=UDim.new(.03,8);padding.PaddingTop=UDim.new(.04,6);padding.PaddingBottom=UDim.new(.02,10);padding.Parent=owner
            for _,size in ipairs({Vector2.new(320,240),Vector2.new(640,360)})do
                ids["rounded:root"].Size=UDim2.fromOffset(size.X,size.Y);owner.CanvasPosition=Vector2.new(20,15);crop.Position=UDim2.fromOffset(10,12);task.wait(.08)
                assert(content.AbsoluteSize.X>0 and content.AbsoluteSize.Y>0,"Missing rendered automatic mask measurements")
                assert((content.AbsoluteSize-reference.AbsoluteSize).Magnitude<.6,"Renderer lost automatic source sizing")
                assert((content.AbsolutePosition-reference.AbsolutePosition).Magnitude<.6,"Renderer lost automatic source placement")
                assert(content.Position==reference.Position and content.Size==reference.Size,"Renderer overwrote editable mask content")
            end
        end
        if sourceCase.package.sourceId == "behavior-fixture" then
            local ids={}
            for _,instance in ipairs(roots[1]:GetDescendants()) do local id=instance:GetAttribute("FramebridgeId");if id then ids[id]=instance end end
            assert(ids.open and ids.coins and ids.settings,"Behavior identities missing")
            assert(ids.coins:GetAttribute("FramebridgeBindingStatus")=="Missing data")
            ids.open:SetAttribute("FramebridgeSelected",true);task.wait()
            assert(ids.open:GetAttribute("FramebridgeState")=="selected","Renderer did not mount interaction listeners")
            ids.inventory.Visible=false;ids.settings.Visible=true;task.wait()
            assert(ids["settings-tab"]:GetAttribute("FramebridgeSelected")==true,"Tab listeners did not update")
        end
    end,debug.traceback)
    if renderer then renderer:unmount(); task.wait(0.05) end
    if scope then Fusion.doCleanup(scope) end
    if roots then for _,root in ipairs(roots) do root:Destroy() end end
    for _,runtime in ipairs(expectedRuntimes) do runtime.destroy() end
    if stage then for _, root in ipairs(stage.roots) do root:Destroy() end end
    if expectedHost then expectedHost:Destroy() end
    host:Destroy()
    if scene then scene:Destroy() end
    if ok then passed += 1 else table.insert(failures, name .. "/" .. format .. ": " .. tostring(why)) end
end
for name, sourceCase in pairs(sourceCases) do
    for _, format in ipairs({ "luau", "react", "fusion" }) do check(name, sourceCase, format) end
end
-- Keep the pinned renderer versions in separate batches. Interleaving their
-- hook rerenders fails in this test loader; run roblox-ts after Lua React.
for name,sourceCase in pairs(sourceCases) do if sourceCase.tsx then check(name,sourceCase,"tsx") end end
for _, format in ipairs({ "luau", "react", "fusion", "tsx" }) do
    if sourceCases.values and (format ~= "tsx" or sourceCases.values.tsx) then
        check("manual asset override", sourceCases.values, format, { ["image:artwork"] = "rbxassetid://234567891" })
    end
    if sourceCases.scrollbars and (format ~= "tsx" or sourceCases.scrollbars.tsx) then
        local bindings={}
        for index,asset in ipairs(sourceCases.scrollbars.package.assets) do bindings[asset.id]="rbxassetid://"..tostring(234567891+index) end
        check("manual scrollbar piece overrides",sourceCases.scrollbars,format,bindings)
    end
end
return { passed = passed, failed = #failures, failures = failures }
