assert(game.PlaceId==0 and not game:GetService('RunService'):IsRunning(),'Blank Edit QA only')
assert(not workspace:FindFirstChild('FramebridgeWorldSceneQA'),'World Play fixture is already installed')
local folder=Instance.new('Folder');folder.Name='FramebridgeWorldSceneQA';folder:SetAttribute('FramebridgeWorldQA',true);folder.Parent=workspace
local spawn=Instance.new('SpawnLocation');spawn.Name='Spawn';spawn.Size=Vector3.new(6,1,6);spawn.Position=Vector3.new(0,2,0);spawn.Anchored=true;spawn.Neutral=true;spawn.Transparency=1;spawn.Parent=folder
local roots={}
for index,kind in ipairs({'surface','billboard','prompt'}) do
    local part=Instance.new('Part');part.Name=kind..'Target';part.Size=Vector3.new(6,3,0.5);part.Anchored=true;part.CanCollide=false
    part.CFrame=CFrame.lookAt(Vector3.new((index-2)*7,6,-7),Vector3.new((index-2)*7,6,20));part.Parent=folder
    local pkg=game:GetService('HttpService'):JSONDecode(game:GetService('HttpService'):JSONEncode(fixtures[kind]))
    pkg.roots[1].name='FramebridgeWorld_'..kind
    local prepared=Editor.prepare(pkg,{mode='scale',layers={}})
    local stage=Importer.stage(prepared,{},false,runtimeSource)
    local root=Importer.apply(stage,prepared,game:GetService('StarterGui'),false,part)[1]
    root:SetAttribute('FramebridgeWorldQA',true);table.insert(roots,root.Name)
    if kind=='prompt' then
        local prompt=root:FindFirstChild('FramebridgeWorldTarget').Value
        prompt.RequiresLineOfSight=false
        local counter=Instance.new('Script');counter.Name='QATriggerObserver';counter.Source=[[
local prompt=script.Parent
prompt:SetAttribute('QATriggers',0)
prompt.Triggered:Connect(function() prompt:SetAttribute('QATriggers',prompt:GetAttribute('QATriggers')+1) end)
]];counter.Parent=prompt
    else
        local button=Instance.new('TextButton');button.Name='QAButton';button.Text=kind..' action';button.TextSize=30;button.Size=UDim2.fromScale(1,1)
        button.BackgroundColor3=Color3.fromRGB(36,78,125);button.BackgroundTransparency=0.2;button.TextColor3=Color3.new(1,1,1);button.ZIndex=1000
        button.Parent=root:FindFirstChild('WorldCanvas')
        local observer=Instance.new('LocalScript');observer.Name='QAInputObserver';observer.Source=[[
local root=script.Parent
root:SetAttribute('QAHits',0)
root.WorldCanvas.QAButton.Activated:Connect(function() root:SetAttribute('QAHits',root:GetAttribute('QAHits')+1) end)
]];observer.Parent=root
    end
end
return {roots=roots,scene=folder.Name}
