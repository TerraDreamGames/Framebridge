assert(game.PlaceId==0,"Blank QA only")
local gui=game:GetService("Players").LocalPlayer.PlayerGui
local function root(source)
    for _,n in ipairs(gui:GetChildren())do if n:GetAttribute("FramebridgeSource")==source then return n end end
    error("Missing motion QA source: "..source)
end
local function id(root,id)
    for _,n in ipairs(root:GetDescendants())do if n:GetAttribute("FramebridgeId")==id then return n end end
    error("Missing motion QA layer: "..id)
end
local function near(a,b)return math.abs(a-b)<0.1 end
local hug=root("motion-layout-hug")
local panel,slot=id(hug,"panel"),id(hug,"panel/motion-slot")
local resting=slot.AbsoluteSize
panel:SetAttribute("FramebridgeState","hover");task.wait(0.5)
assert(panel:FindFirstChildOfClass("UIScale").Scale>1.19)
assert((slot.AbsoluteSize-resting).Magnitude<0.1,"Hover changed Hug reservation")
panel:SetAttribute("FramebridgeState","default");task.wait(0.5)
assert((slot.AbsoluteSize-resting).Magnitude<0.1)
local flex=root("motion-layout-flex")
local grow1,s1,s2=id(flex,"grow1"),id(flex,"grow1/motion-slot"),id(flex,"grow2/motion-slot")
local pos,size=s2.AbsolutePosition,s1.AbsoluteSize
grow1:SetAttribute("FramebridgeState","hover");task.wait(0.4)
assert((s2.AbsolutePosition-pos).Magnitude<0.1 and (s1.AbsoluteSize-size).Magnitude<0.1,"Hover pushed flex siblings")
id(flex,"panel").Size=UDim2.fromOffset(400,60);task.wait(0.4)
assert(near(s2.AbsoluteSize.X,s1.AbsoluteSize.X*2) and near(s1.AbsoluteSize.X,106.6667))
local wrap=root("motion-layout-wrap")
local cell,cellSlot=id(wrap,"cell0"),id(wrap,"cell0/motion-slot")
local first=id(wrap,"cell1").AbsolutePosition
cell:SetAttribute("FramebridgeState","hover");task.wait(0.4)
assert((id(wrap,"cell1").AbsolutePosition-first).Magnitude<0.1,"Hover shifted grid")
id(wrap,"panel").Size=UDim2.fromOffset(160,150);task.wait(0.3)
assert(id(wrap,"cell2").AbsolutePosition.Y>cellSlot.AbsolutePosition.Y,"Grid did not reflow")
local text=root("motion-layout-textHug")
local label,labelSlot=id(text,"label"),id(text,"label/motion-slot")
id(text,"panel").Size=UDim2.fromOffset(160,0);task.wait(0.5)
local old=labelSlot.AbsoluteSize.Y
assert(old>16 and near(label.AbsoluteSize.Y,labelSlot.AbsoluteSize.Y),"Text Hug slot did not follow wrapping")
label:SetAttribute("FramebridgeState","hover");task.wait(0.5)
assert(near(old,labelSlot.AbsoluteSize.Y),"Hover changed wrapped text reservation")
label.Text="Short";task.wait(0.5)
assert(labelSlot.AbsoluteSize.Y<old,"Hug slot did not shrink after text changed")
local bounds=Instance.new("UISizeConstraint");bounds.MinSize=Vector2.new(0,20);bounds.MaxSize=Vector2.new(10000,48);bounds.Parent=labelSlot
label.Text="A long paragraph that wraps over several lines when the available width gets narrower. Its native size limits must stay effective during animation."
task.wait(0.6)
assert(near(labelSlot.AbsoluteSize.Y,48) and near(label.AbsoluteSize.Y/label:FindFirstChildOfClass("UIScale").Scale,48),"Hug content escaped the maximum size")
bounds.MaxSize=Vector2.new(10000,80);task.wait(0.6)
assert(near(labelSlot.AbsoluteSize.Y,80),"Edited maximum size did not propagate")
label.Text="Short";task.wait(0.5)
assert(near(labelSlot.AbsoluteSize.Y,20),"Hug content escaped the minimum size")
return {passed=5,hug={slot.AbsoluteSize.X,slot.AbsoluteSize.Y},flex={s1.AbsoluteSize.X,s2.AbsoluteSize.X},wrappedText={before=old,after=16},boundedText={maximum=48,editedMaximum=80,minimum=labelSlot.AbsoluteSize.Y}}
