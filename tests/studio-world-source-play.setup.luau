-- Disposable server targets. Run once in the approved blank QA place, in Edit.
assert(game.PlaceId==0 and not game:GetService("RunService"):IsRunning(),"Blank Edit QA only")
assert(not workspace:FindFirstChild("FramebridgeWorldSourcePlayScene"),"Inspect the existing source Play fixture before reinstalling")
local scene=Instance.new("Folder")
scene.Name="FramebridgeWorldSourcePlayScene"
scene:SetAttribute("FramebridgeWorldSourcePlayQA",true)
scene.Parent=workspace
local ground=Instance.new("Part")
ground.Name="Ground"
ground.Anchored=true
ground.Size=Vector3.new(80,1,80)
ground.Position=Vector3.new(0,0,0)
ground.Parent=scene
local spawn=Instance.new("SpawnLocation")
spawn.Name="Spawn"
spawn.Anchored=true
spawn.Neutral=true
spawn.Transparency=1
spawn.Size=Vector3.new(6,1,6)
spawn.Position=Vector3.new(7,1,0)
spawn.Parent=scene
for index,kind in ipairs({"surface","billboard","prompt"}) do
    local part=Instance.new("Part")
    part.Name=kind
    part.Size=Vector3.new(6,3,0.5)
    part.Anchored=true
    part.CanCollide=false
    part.CFrame=CFrame.lookAt(Vector3.new((index-2)*7,6,-7),Vector3.new((index-2)*7,6,20))
    part.Parent=scene
    if kind=="prompt" then
        local prompt=Instance.new("ProximityPrompt")
        prompt.Name="Prompt"
        prompt.Style=Enum.ProximityPromptStyle.Custom
        prompt.Enabled=true -- Client disables it while mounting each external UI.
        prompt.ActionText="Open chest"
        prompt.ObjectText="Supply chest"
        prompt.KeyboardKeyCode=Enum.KeyCode.E
        prompt.HoldDuration=0.5
        prompt.RequiresLineOfSight=false
        prompt.MaxActivationDistance=15
        prompt.Parent=part
        local observer=Instance.new("Script")
        observer.Name="QATriggerObserver"
        observer.Source=[[
local prompt=script.Parent
prompt:SetAttribute("QATriggers",0)
prompt.Triggered:Connect(function()
    prompt:SetAttribute("QATriggers",prompt:GetAttribute("QATriggers")+1)
end)
]]
        observer.Parent=prompt
    end
end
return {scene=scene.Name,placeId=game.PlaceId}
