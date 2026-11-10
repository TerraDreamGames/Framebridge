assert(game.PlaceId==0,"Blank QA only")
local gui=game:GetService("Players").LocalPlayer.PlayerGui
local function root(source)for _,n in ipairs(gui:GetChildren())do if n:GetAttribute("FramebridgeSource")==source then return n end end;error("Missing keyframe QA source: "..source)end
local function id(root,id)for _,n in ipairs(root:GetDescendants())do if n:GetAttribute("FramebridgeId")==id then return n end end;error("Missing keyframe layer: "..id)end
local function near(a,b)return math.abs(a-b)<.1 end
local hug=root("keyframe-layout-hug");local panel,slot=id(hug,"panel"),id(hug,"panel/motion-slot");local resting=slot.AbsoluteSize
panel:SetAttribute("FramebridgeAnimate",true);task.wait(1.05)
assert(panel:FindFirstChildOfClass("UIScale").Scale>1.15 and (slot.AbsoluteSize-resting).Magnitude<.1,"Keyframes changed Hug reservation")
task.wait(1.1);assert((slot.AbsoluteSize-resting).Magnitude<.1 and panel:FindFirstChildOfClass("UIScale").Scale==1)
local flex=root("keyframe-layout-flex");local grow1,s1,s2=id(flex,"grow1"),id(flex,"grow1/motion-slot"),id(flex,"grow2/motion-slot");local pos,size=s2.AbsolutePosition,s1.AbsoluteSize
grow1:SetAttribute("FramebridgeAnimate",true);task.wait(1.05)
assert((s2.AbsolutePosition-pos).Magnitude<.1 and (s1.AbsoluteSize-size).Magnitude<.1,"Keyframes pushed flex siblings")
id(flex,"panel").Size=UDim2.fromOffset(400,60);task.wait(.4);assert(near(s2.AbsoluteSize.X,s1.AbsoluteSize.X*2) and near(s1.AbsoluteSize.X,106.6667))
local wrap=root("keyframe-layout-wrap");local cell,cellSlot=id(wrap,"cell0"),id(wrap,"cell0/motion-slot");local first=id(wrap,"cell1").AbsolutePosition
cell:SetAttribute("FramebridgeAnimate",true);task.wait(1.05);assert((id(wrap,"cell1").AbsolutePosition-first).Magnitude<.1,"Keyframes shifted grid")
id(wrap,"panel").Size=UDim2.fromOffset(160,150);task.wait(.3);assert(id(wrap,"cell2").AbsolutePosition.Y>cellSlot.AbsolutePosition.Y)
local text=root("keyframe-layout-textHug");local label,labelSlot=id(text,"label"),id(text,"label/motion-slot")
id(text,"panel").Size=UDim2.fromOffset(160,0);task.wait(.6);local old=labelSlot.AbsoluteSize.Y
assert(old>16 and near(label.AbsoluteSize.Y,labelSlot.AbsoluteSize.Y),"Keyframe text Hug failed")
label:SetAttribute("FramebridgeAnimate",true);task.wait(1.05);assert(near(old,labelSlot.AbsoluteSize.Y),"Scale changed wrapped text reservation")
label.Text="Short";task.wait(.6);assert(labelSlot.AbsoluteSize.Y<old,"Hug did not shrink after native text edit")
local bounds=Instance.new("UISizeConstraint");bounds.MinSize=Vector2.new(0,20);bounds.MaxSize=Vector2.new(10000,48);bounds.Parent=labelSlot
label.Text="A long paragraph that wraps over several lines when the available width gets narrower. Its native size limits must stay effective during animation."
task.wait(.7);assert(near(labelSlot.AbsoluteSize.Y,48) and near(label.AbsoluteSize.Y/label:FindFirstChildOfClass("UIScale").Scale,48))
bounds.MaxSize=Vector2.new(10000,80);task.wait(.6);assert(near(labelSlot.AbsoluteSize.Y,80))
label.Text="Short";task.wait(.6);assert(near(labelSlot.AbsoluteSize.Y,20))
local base=root("framebridge-example:keyframes");local attribute=id(base,"attribute");attribute:SetAttribute("FramebridgeAnimate",true);task.wait(1.1)
assert(attribute.Position.X.Offset==60 and attribute:GetAttribute("FramebridgeKeyframeStatus")=="Complete")
local selected=id(base,"selected");selected:SetAttribute("FramebridgeSelected",true);task.wait(.55)
assert(selected.Position.X.Offset>40 and selected:GetAttribute("FramebridgeState")=="selected")
selected:SetAttribute("FramebridgeSelected",false);task.wait(.1);assert(selected.Position.X.Offset==0)
return {passed=7,hug={slot.AbsoluteSize.X,slot.AbsoluteSize.Y},flex={s1.AbsoluteSize.X,s2.AbsoluteSize.X},wrappedText={before=old,after=labelSlot.AbsoluteSize.Y},nativeAttribute=true,nativeSelected=true}
