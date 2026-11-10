assert(game.PlaceId==0,"Particle Play QA requires the approved blank Place1")
local StarterGui=game:GetService("StarterGui")
assert(not StarterGui:FindFirstChild("FramebridgeParticleQA"),"Owned QA root already exists")
local pkg=Importer.decode(fixture)
local stage=Importer.stage(pkg,{},false,runtimeSource)
local roots=Importer.apply(stage,pkg,StarterGui,false)
local root=roots[1];root.Name="FramebridgeParticleQA";root:SetAttribute("FramebridgeParticleQA",true)
local canvas=stage.byId["particle-screen"].instance;canvas.Name="Canvas";canvas.Position=UDim2.new(.5,-240,.5,-160)
local button=stage.byId.celebrate.instance;button.Name="CelebrateButton"
stage.byId.ambient.instance.Name="Ambient";stage.byId.external.instance.Name="External"
for _,pair in ipairs({{button,"Click: confetti"},{stage.byId.ambient.instance,"Built-in 2D emitter"},{stage.byId.external.instance,"External template missing"}})do
    local label=Instance.new("TextLabel");label.Name="QA label";label.Size=UDim2.fromScale(1,1);label.BackgroundTransparency=1;label.Text=pair[2];label.TextColor3=Color3.new(1,1,1);label.TextSize=16;label.Active=false;label.Parent=pair[1]
end
local user=Instance.new("LocalScript");user.Name="ParticleInputQA";user:SetAttribute("FramebridgeParticleQA",true)
user.Source=[[
local root=script.Parent
root.Canvas.CelebrateButton.Activated:Connect(function()
    root:SetAttribute("FramebridgeParticleQAClicks",(root:GetAttribute("FramebridgeParticleQAClicks") or 0)+1)
end)
]]
user.Parent=root
return {created=root.Name,instances=#root:GetDescendants()+1}
