assert(game.PlaceId==0,"Approved blank QA only")
local passed, failures=0,{}
local stages, controllers={},{ }
local function test(name,body)
 local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end
end
local function settle() task.wait(.04);task.wait(.04) end
local function dim(value) return UDim2.new(table.unpack(value.value)) end
local function close(a,b) return (a-b).Magnitude<.6 end
local function stage(raw)
 local pkg=Importer.decode(raw);local value=Importer.stage(pkg,{},false,runtimeSource)
 table.insert(stages,value);value.roots[1].Name="FramebridgeMaskResizeQA";value.roots[1].Parent=game:GetService("CoreGui")
 value.byId["rounded:root"].instance.Size=UDim2.fromOffset(320,240)
 return value
end
local ok,why=pcall(function()
 local masked, original=stage(fixture),stage(originalFixture)
 local root=masked.byId["rounded:root"].instance;local referenceRoot=original.byId["rounded:root"].instance
 local content=masked.byId["rounded:content"].instance;local reference=original.byId["rounded:content"].instance
 local group=masked.byId["rounded:group"].instance;local referenceGroup=original.byId["rounded:group"].instance
 local clip=masked.byId["rounded:mask"].instance;local basis=masked.byId["rounded:mask/mask-content"].instance
 local controller=MaskLayout.mount(masked.roots[1]);table.insert(controllers,controller)
 local function compare()
  assert(close(content.AbsolutePosition,reference.AbsolutePosition),"Position differs: "..tostring(content.AbsolutePosition).." vs "..tostring(reference.AbsolutePosition))
  assert(close(content.AbsoluteSize,reference.AbsoluteSize),"Size differs: "..tostring(content.AbsoluteSize).." vs "..tostring(reference.AbsoluteSize))
 end
 for _,case in ipairs(cases) do test("responsive constraints "..case.name,function()
  for property,value in pairs(case.mask) do clip[property]=dim(value)end
  for property,value in pairs(case.content) do content[property]=dim(value);reference[property]=dim(value)end
  for _,size in ipairs({Vector2.new(320,240),Vector2.new(640,360),Vector2.new(240,480),Vector2.new(400,300)})do
   root.Size=UDim2.fromOffset(size.X,size.Y);referenceRoot.Size=root.Size;settle();compare()
  end
 end) end
 test("mask move/resize and user child edits remain independent",function()
  content.Position=UDim2.new(.7,12,.2,8);content.Size=UDim2.new(.4,16,.3,14);reference.Position=content.Position;reference.Size=content.Size
  clip.Position=UDim2.new(.8,-24,.1,12);clip.Size=UDim2.fromOffset(90,60);settle();compare()
  root.Size=UDim2.fromOffset(600,500);referenceRoot.Size=root.Size;settle();compare()
  assert(content.Position==reference.Position and content.Size==reference.Size,"User properties were overwritten")
 end)
 test("parent and clip scale preserve source offset units",function()
  local a=Instance.new("UIScale");a.Parent=root;local b=Instance.new("UIScale");b.Parent=referenceRoot
  local crop=Instance.new("UIScale");crop.Parent=clip
  for _,scale in ipairs({.5,2,1})do a.Scale=scale;b.Scale=scale;crop.Scale=scale==1 and 2 or .75;settle();compare() end
  a:Destroy();b:Destroy();crop:Destroy();settle();compare()
 end)
 test("source padding changes resize the same coordinate region",function()
  local a=Instance.new("UIPadding");a.Parent=group;local b=Instance.new("UIPadding");b.Parent=referenceGroup
  for _,padding in ipairs({10,24,2})do
   for _,p in ipairs({a,b}) do p.PaddingLeft=UDim.new(.1,padding);p.PaddingRight=UDim.new(.05,12);p.PaddingTop=UDim.new(0,8);p.PaddingBottom=UDim.new(.1,4) end
   settle();compare()
  end
  a:Destroy();b:Destroy();settle();compare()
 end)
 test("helper lifecycle removes every live connection",function()
  assert(controller.connectionCount()>0);controller.destroy();assert(controller.connectionCount()==0)
  local replacement=MaskLayout.mount(masked.roots[1]);table.insert(controllers,replacement)
  local prior=content.AbsoluteSize;root.Size=UDim2.fromOffset(720,360);referenceRoot.Size=root.Size;settle();compare();assert(content.AbsoluteSize~=prior)
  basis:Destroy();settle();replacement.destroy();assert(replacement.connectionCount()==0)
 end)
 test("native editor watcher adopts, removes and tears down imported roots",function()
  local a,b=stage(fixture),stage(originalFixture)
  local aRoot,bRoot=a.byId["rounded:root"].instance,b.byId["rounded:root"].instance
  local crop=a.byId["rounded:mask/mask-content"].instance
  local live,oldMount={},MaskLayout.mount
  MaskLayout.mount=function(target)local mounted=oldMount(target);table.insert(live,{root=target,controller=mounted});return mounted end
  local watcher=MaskLayout.watch(game:GetService("CoreGui"),game:GetService("RunService"))
  local success,message=pcall(function()
   aRoot.Size=UDim2.fromOffset(600,320);bRoot.Size=aRoot.Size;settle()
   assert(close(a.byId["rounded:content"].instance.AbsolutePosition,b.byId["rounded:content"].instance.AbsolutePosition))
   a.roots[1].Parent=nil;settle()
   local removed=false;for _,entry in ipairs(live)do if entry.root==a.roots[1] then assert(entry.controller.connectionCount()==0);removed=true end end
   assert(removed,"Watcher did not adopt the imported root")
   a.roots[1].Parent=game:GetService("CoreGui");aRoot.Size=UDim2.fromOffset(400,500);bRoot.Size=aRoot.Size;settle()
   assert(close(a.byId["rounded:content"].instance.AbsoluteSize,b.byId["rounded:content"].instance.AbsoluteSize))
   watcher.destroy();for _,entry in ipairs(live)do assert(entry.controller.connectionCount()==0,"Editor watcher leaked a controller")end
   local savedSize=crop.Size;aRoot.Size=UDim2.fromOffset(800,700);settle();assert(crop.Size==savedSize,"Destroyed editor watcher still changes geometry")
  end)
  watcher.destroy();MaskLayout.mount=oldMount;assert(success,message)
 end)
 test("scrolling source canvas, padding and zoom retain independent content coordinates",function()
  local Http=game:GetService("HttpService")
  local function scroll(raw)
   local pkg=Importer.decode(raw);local group=Editor.find(pkg,"rounded:group")
   group.className="ScrollingFrame";group.properties.CanvasSize={type="UDim2",value={0,600,0,400}}
   group.properties.AutomaticCanvasSize={type="Enum",value={"AutomaticSize","None"}}
   return stage(Http:JSONEncode(pkg))
  end
  local a,b=scroll(fixture),scroll(originalFixture)
  local mounted=MaskLayout.mount(a.roots[1]);table.insert(controllers,mounted)
  local aGroup,bGroup=a.byId["rounded:group"].instance,b.byId["rounded:group"].instance
  local paddingA=Instance.new("UIPadding");paddingA.PaddingLeft=UDim.new(.02,4);paddingA.PaddingTop=UDim.new(0,6);paddingA.Parent=aGroup
  local paddingB=paddingA:Clone();paddingB.Parent=bGroup
  local zoomA=Instance.new("UIScale");zoomA.Scale=.75;zoomA.Parent=a.byId["rounded:root"].instance
  local zoomB=zoomA:Clone();zoomB.Parent=b.byId["rounded:root"].instance
  for _,canvas in ipairs({Vector2.new(600,400),Vector2.new(800,500),Vector2.new(450,350)})do
   aGroup.CanvasSize=UDim2.fromOffset(canvas.X,canvas.Y);bGroup.CanvasSize=aGroup.CanvasSize
   aGroup.CanvasPosition=Vector2.new(30,20);bGroup.CanvasPosition=aGroup.CanvasPosition;settle()
   assert(close(a.byId["rounded:content"].instance.AbsolutePosition,b.byId["rounded:content"].instance.AbsolutePosition),"Scrolling source position changed")
   assert(close(a.byId["rounded:content"].instance.AbsoluteSize,b.byId["rounded:content"].instance.AbsoluteSize),"Scrolling source sizing changed")
  end
 end)
 for _,axis in ipairs({Enum.AutomaticSize.X,Enum.AutomaticSize.Y,Enum.AutomaticSize.XY})do test("automatic scrolling source coordinates: "..axis.Name,function()
  local Http=game:GetService("HttpService")
  local function scrolling(raw)
   local pkg=Importer.decode(raw);local group=Editor.find(pkg,"rounded:group")
   group.className="ScrollingFrame";group.properties.CanvasSize={type="UDim2",value={0,600,0,400}}
   group.properties.AutomaticCanvasSize={type="Enum",value={"AutomaticSize",axis.Name}}
   return stage(Http:JSONEncode(pkg))
  end
  local a,b=scrolling(fixture),scrolling(originalFixture)
  local mounted=MaskLayout.mount(a.roots[1]);table.insert(controllers,mounted)
  local owner,referenceOwner=a.byId["rounded:group"].instance,b.byId["rounded:group"].instance
  local content,reference=a.byId["rounded:content"].instance,b.byId["rounded:content"].instance
  local crop=a.byId["rounded:mask"].instance
  local pad=Instance.new("UIPadding");pad.PaddingLeft=UDim.new(.02,4);pad.PaddingRight=UDim.new(.03,8);pad.PaddingTop=UDim.new(.04,6);pad.PaddingBottom=UDim.new(.02,10);pad.Parent=owner
  local padRef=pad:Clone();padRef.Parent=referenceOwner
  local scale=Instance.new("UIScale");scale.Parent=a.byId["rounded:root"].instance
  local scaleRef=scale:Clone();scaleRef.Parent=b.byId["rounded:root"].instance
  local authoredPosition,authoredSize=content.Position,content.Size
  for _,factor in ipairs({.75,1,2})do
   scale.Scale=factor;scaleRef.Scale=factor
   for _,size in ipairs({Vector2.new(320,240),Vector2.new(640,360)})do
    a.byId["rounded:root"].instance.Size=UDim2.fromOffset(size.X,size.Y);b.byId["rounded:root"].instance.Size=a.byId["rounded:root"].instance.Size
    owner.CanvasPosition=Vector2.new(30,20);referenceOwner.CanvasPosition=owner.CanvasPosition;crop.Position=UDim2.fromOffset(15,20);settle()
    assert(content.AbsoluteSize.X>0 and content.AbsoluteSize.Y>0,"Missing native measurement")
    assert(close(content.AbsolutePosition,reference.AbsolutePosition),"Automatic canvas position differs: "..tostring(content.AbsolutePosition).." vs "..tostring(reference.AbsolutePosition))
    assert(close(content.AbsoluteSize,reference.AbsoluteSize),"Automatic canvas size differs: "..tostring(content.AbsoluteSize).." vs "..tostring(reference.AbsoluteSize))
    assert(content.Position==authoredPosition and content.Size==authoredSize,"Coordinate repair overwrote editable properties")
   end
  end
 end)end
 for _,scrolling in ipairs({false,true})do test("legacy Frame coordinates: "..(scrolling and "manual canvas" or "ordinary parent"),function()
  local function legacy(raw)
   local pkg=Importer.decode(raw);local basis=Editor.find(pkg,"rounded:mask/mask-content")
   if basis then
    basis.className="Frame"
    for _,property in ipairs({"CanvasSize","AutomaticCanvasSize","ScrollingDirection","ScrollingEnabled","ScrollBarThickness"})do basis.properties[property]=nil end
   end
   if scrolling then
    local group=Editor.find(pkg,"rounded:group");group.className="ScrollingFrame"
    group.properties.CanvasSize={type="UDim2",value={0,600,0,400}}
    group.properties.AutomaticCanvasSize={type="Enum",value={"AutomaticSize","None"}}
   end
   return stage(game:GetService("HttpService"):JSONEncode(pkg))
  end
  local a,b=legacy(fixture),legacy(originalFixture)
  local mounted=MaskLayout.mount(a.roots[1]);table.insert(controllers,mounted)
  for _,size in ipairs({Vector2.new(320,240),Vector2.new(640,360)})do
   a.byId["rounded:root"].instance.Size=UDim2.fromOffset(size.X,size.Y);b.byId["rounded:root"].instance.Size=a.byId["rounded:root"].instance.Size
   if scrolling then a.byId["rounded:group"].instance.CanvasPosition=Vector2.new(30,20);b.byId["rounded:group"].instance.CanvasPosition=Vector2.new(30,20) end
   settle()
   local content,reference=a.byId["rounded:content"].instance,b.byId["rounded:content"].instance
   assert(content.AbsoluteSize.X>0 and content.AbsoluteSize.Y>0,"Missing legacy native measurements")
   assert(close(content.AbsolutePosition,reference.AbsolutePosition) and close(content.AbsoluteSize,reference.AbsoluteSize),"Legacy helper geometry changed")
  end
 end)end
 for property,value in pairs({ScrollingEnabled=true,ScrollBarThickness=6,Active=true,Selectable=true})do test("native validation rejects input on coordinate helper: "..property,function()
  local pkg=Importer.decode(fixture);Editor.find(pkg,"rounded:mask/mask-content").properties[property]=value
  local accepted,message=pcall(Importer.decode,game:GetService("HttpService"):JSONEncode(pkg))
  assert(not accepted and tostring(message):find("Mask coordinates cannot accept scrolling input",1,true),"Native importer accepted interactive coordinates")
 end)end
 for _,mode in ipairs({"source","scale","offset"})do test("Studio import units preserve mask coordinates: "..mode,function()
  local a=stage(game:GetService("HttpService"):JSONEncode(Editor.prepare(Importer.decode(fixture),{mode=mode})))
  local b=stage(game:GetService("HttpService"):JSONEncode(Editor.prepare(Importer.decode(originalFixture),{mode=mode})))
  local mounted=MaskLayout.mount(a.roots[1]);table.insert(controllers,mounted)
  for _,size in ipairs({Vector2.new(320,240),Vector2.new(640,360)})do
   a.byId["rounded:root"].instance.Size=UDim2.fromOffset(size.X,size.Y);b.byId["rounded:root"].instance.Size=a.byId["rounded:root"].instance.Size;settle()
   assert(close(a.byId["rounded:content"].instance.AbsolutePosition,b.byId["rounded:content"].instance.AbsolutePosition),"Import units changed source positions")
   assert(close(a.byId["rounded:content"].instance.AbsoluteSize,b.byId["rounded:content"].instance.AbsoluteSize),"Import units changed source sizing")
  end
 end)end
 test("responsive crop reimport preserves helper, children, listeners and runtime identities",function()
  local Http=game:GetService("HttpService")
  local pkg=Importer.decode(fixture);pkg.sourceId="mask-resize-update-native"
  local value=Importer.stage(pkg,{},false,runtimeSource);table.insert(stages,value)
  Importer.apply(value,pkg,game:GetService("CoreGui"),false)
  local root=value.byId["rounded:root"].instance;root.Size=UDim2.fromOffset(640,360)
  local content=value.byId["rounded:content"].instance;local helper=value.byId["rounded:mask/mask-content"].instance
  local runtimeId=value.roots[1]:GetAttribute("FramebridgeId").."/behavior-runtime"
  local runtime=value.byId[runtimeId].instance;assert(runtime:GetAttribute("FramebridgeRuntime")==runtimeSource.version)
  local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Parent=content
  local listener=content:GetPropertyChangedSignal("Position"):Connect(function()end)
  local mounted=MaskLayout.mount(value.roots[1]);table.insert(controllers,mounted);settle();local prior=content.AbsolutePosition
  local updated=Importer.decode(updatedFixture);updated.sourceId=pkg.sourceId
  local replacement=Importer.stage(updated,{},false,runtimeSource);table.insert(stages,replacement)
  local roots,stats=Importer.apply(replacement,updated,game:GetService("CoreGui"),true);root.Size=UDim2.fromOffset(640,360);settle()
  local found={};for _,obj in ipairs(roots[1]:GetDescendants())do found[obj:GetAttribute("FramebridgeId") or ""]=obj end
  assert(stats.created==0 and stats.removed==0 and found["rounded:content"]==content and found["rounded:mask/mask-content"]==helper)
  assert(close(content.AbsolutePosition,prior) and custom.Parent==content and listener.Connected)
  assert(helper:GetAttribute("FramebridgeMaskBasis")=="rounded:group")
  assert(found[runtimeId]==runtime)
  listener:Disconnect()
 end)
end)
for _,controller in ipairs(controllers)do controller.destroy()end
for _,value in ipairs(stages)do Importer.destroy(value)end
assert(ok,why)
return {passed=passed,failed=#failures,failures=failures,scope="Actual native geometry at four sizes, independent mask/content constraints, padding, scale and preserved user edits; no pixel-fidelity claim"}
