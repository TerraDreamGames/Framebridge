assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
assert(not _G.FramebridgeFinalClassQA,"Inspect/clean previous class QA first")
local starter,storage=game:GetService("StarterGui"),game:GetService("ServerStorage")
assert(#starter:GetChildren()==0 and #storage:GetChildren()==0,"Blank QA containers required")
local qa={selection=game:GetService("Selection"):Get(),http=game:GetService("HttpService").HttpEnabled,targets={},checkpoints={},nextCheckpoint="forward"}
local root=Instance.new("ScreenGui");root.Name="Framebridge Final Class UI QA";root:SetAttribute("FramebridgeFinalEditorQA",true);root.Parent=starter;qa.root=root
local image=Instance.new("ImageLabel");image.Name="QA image";image.Size=UDim2.fromOffset(80,80);image.Position=UDim2.fromOffset(20,30)
image.BackgroundTransparency=1;image.Image="rbxassetid://123456789";image.ImageColor3=Color3.fromRGB(70,130,220)
image.ScaleType=Enum.ScaleType.Slice;image.SliceCenter=Rect.new(16,16,48,48);image.SliceScale=.5
image:SetAttribute("ApplicationValue",42);image:AddTag("FramebridgeFinalClassQA");image.Parent=root
local corner=Instance.new("UICorner");corner.CornerRadius=UDim.new(.1,0);corner.Parent=image
local caption=Instance.new("TextLabel");caption.Name="QA retained child";caption.Text="Keep editable caption";caption.Parent=image
local app=Instance.new("LocalScript");app.Name="QA custom application";app.Source="-- Owned class UI QA custom script";app.Parent=image
local reference=Instance.new("ObjectValue");reference.Name="QA selected-subtree reference";reference.Value=image;reference.Parent=caption
local externalReference=Instance.new("ObjectValue");externalReference.Name="QA external reference";externalReference.Value=image;externalReference.Parent=root
qa.original,qa.corner,qa.caption,qa.script,qa.scriptSource,qa.reference=image,corner,caption,app,app.Source,reference
qa.externalReference=externalReference
qa.targets[image]=true;_G.FramebridgeFinalClassQA=qa
observeNativeHistory(qa,function()
 local target=qa.root:FindFirstChild("QA image");if not target then return {present=false}end
 return {present=true,target=target,class=target.ClassName,children=qa.corner.Parent==target and qa.caption.Parent==target,
  script=qa.script.Parent==target and qa.script.Source==qa.scriptSource,reference=qa.reference.Parent==qa.caption and qa.reference.Value==target,
  externalReference=qa.externalReference.Parent==qa.root and qa.externalReference.Value==qa.original,
  image=target.Image=="rbxassetid://123456789" and target.ImageColor3==Color3.fromRGB(70,130,220) and target.ScaleType==Enum.ScaleType.Slice and target.SliceCenter==Rect.new(16,16,48,48) and target.SliceScale==.5,
  geometry=target.Size==UDim2.fromOffset(80,80) and target.Position==UDim2.fromOffset(20,30),attributes=target:GetAttribute("ApplicationValue")==42 and target:HasTag("FramebridgeFinalClassQA")}
end)
table.insert(qa.historyConnections,root.ChildAdded:Connect(function(target)
 if target.Name~="QA image" or target==qa.original or qa.targets[target] then return end
 qa.targets[target]=true
 task.defer(function()
  if qa.historyDisposed then return end
  local key=qa.nextCheckpoint;local old=qa.checkpoints[key]
  if old and old~=target then qa.captureError="Unexpected replacement before next native history phase" else qa.checkpoints[key]=target end
 end)
end))
game:GetService("Selection"):Set({image})
return {ready=true,selected=image.ClassName,referenceScope="Retained caption is inside the selected image subtree; sibling reference is external and requires manual updating",scope="Owned fixture for actual installed-plugin pointer conversion; placeholder ID proves properties only"}
