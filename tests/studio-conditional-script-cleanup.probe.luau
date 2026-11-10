-- Diagnostic for deferred script destruction; not a passing acceptance test.
-- Generator prepends qaPhase. Stage play.setup.luau before edit-setup; use only
-- the coordinated unpublished Place1. Stop Play before edit-cleanup.
assert(game.PlaceId==0,"Blank Place1 only")
local rootName="__FramebridgeConditionalQA"
local ownerName="__FramebridgeConditionalCleanupOwner"
local probeName="__FramebridgeConditionalCleanupProbe"
if qaPhase=="edit-setup" then
    local starter=game:GetService("StarterGui")
    local root=starter:FindFirstChild(rootName)
    assert(root and root:GetAttribute("FramebridgeSource")=="conditional-rules-example")
    local sp=game:GetService("StarterPlayer").StarterPlayerScripts
    assert(not sp:FindFirstChild(ownerName),"Cleanup probe already present")
    local owner=Instance.new("LocalScript")
    owner.Name=ownerName;owner:SetAttribute("FramebridgeConditionalQA",true)
    local module=Instance.new("ModuleScript");module.Name="Cleanup";module.Parent=owner
    module.Source=[[local pg=game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local probe=Instance.new("Folder");probe.Name="__FramebridgeConditionalCleanupProbe";probe.Parent=pg
script.Parent.Destroying:Connect(function()probe:SetAttribute("TopLevelModuleCleaned",true)end)
probe:SetAttribute("Ready",true)
return true]]
    owner.Source=[[require(script.Cleanup)]];owner.Parent=sp
    return {setup=true}
elseif qaPhase=="client-probe" then
    local player=game:GetService("Players").LocalPlayer
    assert(player,"Run in Client")
    local pg=player:WaitForChild("PlayerGui")
    local root=pg:WaitForChild(rootName,10)
    local probe=pg:WaitForChild(probeName,10)
    assert(root and probe)
    local runtime=root:FindFirstChildWhichIsA("LocalScript",true);assert(runtime)
    local ids={}
    for _,n in ipairs(root:GetDescendants())do
        local id=n:GetAttribute("FramebridgeId");if id then ids[id]=n end
    end
    assert(not player:FindFirstChild("leaderstats"),"Temporary QA requires no existing player stats")
    player:SetAttribute("Ready",true);player:SetAttribute("VIP",true)
    local stats=Instance.new("Folder");stats.Name="leaderstats"
    stats:SetAttribute("FramebridgeConditionalQA",true);stats.Parent=player
    local coins=Instance.new("IntValue");coins.Name="Coins";coins.Value=150;coins.Parent=stats
    for _=1,30 do
        if ids.status.Text=="Buy &lt;b&gt;now&lt;/b&gt;" then break end;task.wait(.05)
    end
    assert(ids.status.Text=="Buy &lt;b&gt;now&lt;/b&gt;","Runtime must reach IF before deletion")
    local function values()
        return {text=ids.status.Text,alpha=ids.status.BackgroundTransparency,
            buy=ids.buy.Interactable,premium=ids.premium.Visible,
            slot=ids["premium/motion-slot"].Visible}
    end
    local before=values();before.status=runtime:GetAttribute("FramebridgeRuntimeStatus")
    runtime:Destroy()
    local owner=player:WaitForChild("PlayerScripts"):FindFirstChild(ownerName)
    assert(owner and owner:GetAttribute("FramebridgeConditionalQA")==true);owner:Destroy()
    task.wait(.3)
    local after=values();after.topLevelModuleCleaned=probe:GetAttribute("TopLevelModuleCleaned")
    stats:Destroy();player:SetAttribute("Ready",nil);player:SetAttribute("VIP",nil)
    return {before=before,after=after,
        restoredText=after.text=="Design status",
        restoredAlpha=math.abs(after.alpha-.6)<.0001}
elseif qaPhase=="edit-cleanup" then
    local root=game:GetService("StarterGui"):FindFirstChild(rootName)
    assert(root and root:GetAttribute("FramebridgeSource")=="conditional-rules-example");root:Destroy()
    local owner=game:GetService("StarterPlayer").StarterPlayerScripts:FindFirstChild(ownerName)
    assert(owner and owner:GetAttribute("FramebridgeConditionalQA")==true);owner:Destroy()
    return {clean=true,http=game:GetService("HttpService").HttpEnabled}
end
error("Unknown cleanup probe phase")
