assert(game.PlaceId==0,"Blank QA only")
local player=game:GetService("Players").LocalPlayer;assert(player,"Client QA only")
local pg=player:WaitForChild("PlayerGui")
local function screen(name)
    local root=pg:WaitForChild("__FramebridgeRuntimeQA_"..name,10);assert(root and root:GetAttribute("FramebridgeRuntimeQA")==true)
    local script=root:FindFirstChild("FramebridgeInteractions");assert(script and script:FindFirstChild("FramebridgeRuntime"))
    for _=1,60 do if script:GetAttribute("FramebridgeRuntimeStatus")=="Ready" then break end;task.wait(.05) end
    assert(script:GetAttribute("FramebridgeRuntimeStatus")=="Ready","Initializer failed "..name)
    local ids={};for _,child in ipairs(root:GetDescendants())do local id=child:GetAttribute("FramebridgeId");if id then ids[id]=child end end
    return root,script,ids
end
local results={}
local function test(name,fn)local ok,err=pcall(fn);table.insert(results,{name=name,passed=ok,error=not ok and tostring(err) or nil})end
test("deleted conditional bootstrap restores design and disconnects updates",function()
    local root,script,ids=screen("rules")
    assert(not player:FindFirstChild("leaderstats"),"Owned blank stats required")
    local stats=Instance.new("Folder");stats.Name="leaderstats";stats:SetAttribute("FramebridgeRuntimeQA",true);stats.Parent=player
    local coins=Instance.new("IntValue");coins.Name="Coins";coins.Value=150;coins.Parent=stats
    player:SetAttribute("Ready",true);player:SetAttribute("VIP",true)
    for _=1,60 do if ids.status.Text=="Buy &lt;b&gt;now&lt;/b&gt;" then break end;task.wait(.05) end
    assert(ids.status.Text=="Buy &lt;b&gt;now&lt;/b&gt;" and math.abs(ids.status.BackgroundTransparency-.25)<.0001,"Rule did not reach IF")
    script:Destroy();task.wait(.3)
    assert(ids.status.Text=="Design status" and math.abs(ids.status.BackgroundTransparency-.6)<.0001,"Deleted script retained rule-owned properties")
    player:SetAttribute("Ready",false);coins.Value=20;task.wait(.2)
    assert(ids.status.Text=="Design status","Removed runtime still responds")
    stats:Destroy();player:SetAttribute("Ready",nil);player:SetAttribute("VIP",nil)
end)
test("deleted theme initializer restores defaults and disconnects theme switching",function()
    local root,script,ids=screen("themes");local buy=ids.buy
    local color=buy.BackgroundColor3
    root:SetAttribute("FramebridgeTheme","Dark");task.wait(.2)
    assert(buy.BackgroundColor3~=color,"Dark theme did not apply")
    script.FramebridgeRuntime:Destroy();task.wait(.3)
    assert(buy.BackgroundColor3==color,"Initializer deletion did not restore theme")
    root:SetAttribute("FramebridgeTheme","Dark");task.wait(.2);assert(buy.BackgroundColor3==color,"Deleted theme initializer still writes")
end)
test("deleted advanced bootstrap restores slider geometry and preserves custom children",function()
    local root,script,ids=screen("controls");local fill=ids["slider-fill"]
    local initial=fill.Size
    local app=Instance.new("Folder");app.Name="ApplicationState";app.Parent=ids.slider
    ids.slider:SetAttribute("FramebridgeValue",90);task.wait(.2)
    assert(fill.Size~=initial,"Slider value did not apply")
    script:Destroy();task.wait(.3)
    -- Imported fill geometry is the design baseline, independent of the initial25 control value.
    local baseline=game:GetService("StarterGui"):FindFirstChild(root.Name):FindFirstChild("slider-fill",true)
    assert(baseline and fill.Size==baseline.Size,"Slider geometry not restored")
    ids.slider:SetAttribute("FramebridgeValue",10);task.wait(.2)
    assert(fill.Size==baseline.Size and app.Parent==ids.slider,"Removed advanced runtime still writes or removes custom content")
end)
test("deleted keyframe bootstrap restores authored transforms and stops attribute chains",function()
    local root,script,ids=screen("keyframes");local node=ids.activate
    local baseline=node.Position;local scale=node:FindFirstChildOfClass("UIScale")
    node:SetAttribute("FramebridgeAnimate",true);task.wait(.35)
    assert(node.Position~=baseline,"Keyframe did not animate")
    script:Destroy();task.wait(.3)
    assert(node.Position==baseline and (not scale.Parent or scale.Scale==1),"Keyframe teardown retained transform")
    node:SetAttribute("FramebridgeAnimate",false);node:SetAttribute("FramebridgeAnimate",true);task.wait(.35)
    assert(node.Position==baseline,"Destroyed keyframe runtime still writes")
end)
test("deleted particle initializer clears its visuals and stops future bursts",function()
    local root,script,ids=screen("particles");local node=ids.celebrate
    local custom=Instance.new("Folder");custom.Name="ApplicationState";custom.Parent=node
    task.wait(.1) -- Flush the deliberate application topology rebuild before the burst.
    node:SetAttribute("FramebridgeParticleBurst",1);task.wait(.1)
    assert(node:GetAttribute("FramebridgeParticleCount")==12 and node:FindFirstChild("Framebridge particles"),"Particle burst failed")
    script.FramebridgeRuntime:Destroy();task.wait(.3)
    assert(not node:FindFirstChild("Framebridge particles") and custom.Parent==node,"Particle teardown leaked helpers or removed app content")
    node:SetAttribute("FramebridgeParticleBurst",2);task.wait(.1)
    assert(not node:FindFirstChild("Framebridge particles"),"Destroyed particle initializer still responds")
end)
local passed=0;for _,result in ipairs(results)do if result.passed then passed+=1 end end
return game:GetService("HttpService"):JSONEncode({passed=passed,total=#results,results=results})
