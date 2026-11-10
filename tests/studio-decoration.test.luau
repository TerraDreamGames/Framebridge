assert(game.PlaceId==0,"Approved blank QA only")
local passed,failures,stages,controllers=0,{},{},{}
local function test(name,fn) local ok,why=pcall(fn);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end end
local function settle() task.wait(.05);task.wait(.05) end
local function close(a,b) assert((a-b).Magnitude<.6,tostring(a).." differs from "..tostring(b)) end
local Http=game:GetService("HttpService")
-- Dummy image IDs exercise package binding; this is geometry/input QA, not uploaded-art acceptance.
local fixtureBindings={};for _,asset in ipairs(Importer.decode(fixture).assets)do fixtureBindings[asset.id]="rbxassetid://123" end
local function stage(raw)
 local pkg=Importer.decode(raw or fixture);local value=Importer.stage(pkg,fixtureBindings,false,runtimeSource);table.insert(stages,value)
 value.roots[1].Name="FramebridgeDecorationQA";value.roots[1].Parent=game:GetService("CoreGui")
 value.byId["decor:root"].instance.Size=UDim2.fromOffset(480,360)
 local controller=MaskLayout.mount(value.roots[1]);table.insert(controllers,controller)
 return value,controller
end
local ok,why=pcall(function()
 local value,controller=stage();local by=value.byId
 local scroll=by["decor:scroll"].instance;local bg=by["decor:scroll/decoration"].instance
 test("native scroll/layout content and background remain distinct",function()
  settle();assert(scroll:IsA("ScrollingFrame"))
  if Importer.decode(fixture).options.layout=="responsive" then
   assert(by["decor:scroll/content"].instance:FindFirstChildOfClass("UIListLayout"))
  else
   assert(by["decor:card:0"].instance.Parent==scroll,"Exact geometry should retain the direct authored hierarchy")
  end
  assert(by["decor:card:3"].instance:IsDescendantOf(scroll));assert(scroll.AbsoluteCanvasSize.Y>scroll.AbsoluteSize.Y)
  close(bg.AbsolutePosition,scroll.AbsolutePosition);close(bg.AbsoluteSize,scroll.AbsoluteSize)
  assert(not bg.Active and not bg.Selectable and bg.Parent==scroll)
 end)
 test("scrolling moves content while background stays on the viewport",function()
  local card=by["decor:card:0"].instance;local start=card.AbsolutePosition
  for _,offset in ipairs({30,80,0})do scroll.CanvasPosition=Vector2.new(0,offset);settle();close(bg.AbsolutePosition,scroll.AbsolutePosition);close(bg.AbsoluteSize,scroll.AbsoluteSize) end
  scroll.CanvasPosition=Vector2.new(0,60);settle();assert(card.AbsolutePosition~=start)
  local canvas=scroll.AbsoluteCanvasSize.Y;scroll.CanvasPosition=Vector2.new(0,canvas);settle();local endCanvas=scroll.AbsoluteCanvasSize.Y
  settle();assert(math.abs(scroll.AbsoluteCanvasSize.Y-endCanvas)<.6,"Background grows the canvas every frame")
 end)
 test("background follows owner resize, scale and padding",function()
  local panel=by["decor:panel"].instance;local image=by["decor:panel/decoration"].instance
  local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(.1,8);padding.PaddingTop=UDim.new(0,6);padding.Parent=panel
  local scale=Instance.new("UIScale");scale.Parent=by["decor:root"].instance
  for _,factor in ipairs({.75,1,2})do
   scale.Scale=factor;panel.Size=UDim2.fromOffset(180,120);settle();close(image.AbsolutePosition,panel.AbsolutePosition);close(image.AbsoluteSize,panel.AbsoluteSize)
   scroll.CanvasPosition=Vector2.new(0,20);settle();close(bg.AbsolutePosition,scroll.AbsolutePosition);close(bg.AbsoluteSize,scroll.AbsoluteSize)
  end
  padding:Destroy();scale:Destroy()
 end)
 test("background does not consume button input or double group opacity",function()
  assert(by["decor:button"].instance:IsA("ImageButton") and by["decor:button"].instance.Active)
  assert(not by["decor:button/decoration"].instance.Active)
  assert(by["decor:panel"].instance.GroupTransparency==.5 and by["decor:panel/decoration"].instance.ImageTransparency==0)
 end)
 test("manual and automatic scroll canvases use the engine's distinct position and size bases",function()
  local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(.1,8);padding.PaddingRight=UDim.new(.05,4);padding.PaddingTop=UDim.new(.1,6);padding.PaddingBottom=UDim.new(.05,3);padding.Parent=scroll
  local originalCanvas,originalAxis=scroll.CanvasSize,scroll.AutomaticCanvasSize
  for _,axis in ipairs({Enum.AutomaticSize.None,Enum.AutomaticSize.X,Enum.AutomaticSize.Y,Enum.AutomaticSize.XY})do
   scroll.AutomaticCanvasSize=axis
   for _,canvas in ipairs({UDim2.new(),UDim2.fromOffset(360,400),UDim2.fromScale(.5,.5)})do
    scroll.CanvasSize=canvas;scroll.CanvasPosition=Vector2.new(10,20);settle();close(bg.AbsolutePosition,scroll.AbsolutePosition);close(bg.AbsoluteSize,scroll.AbsoluteSize)
   end
  end
  scroll.AutomaticCanvasSize=originalAxis;scroll.CanvasSize=originalCanvas;padding:Destroy()
 end)
 for _,mode in ipairs({"source","scale","offset"})do test("background geometry survives import mode "..mode,function()
  local pkg=Editor.prepare(Importer.decode(fixture),{mode=mode});local result=stage(Http:JSONEncode(pkg));settle()
  local parent=result.byId["decor:scroll"].instance;local image=result.byId["decor:scroll/decoration"].instance
  parent.CanvasPosition=Vector2.new(0,50);settle();close(image.AbsolutePosition,parent.AbsolutePosition);close(image.AbsoluteSize,parent.AbsoluteSize)
 end)end
 test("background helper metadata is rejected if untrusted",function()
  for _,kind in ipairs({"identity","bounds","input","mode"})do
   local pkg=Importer.decode(fixture);local image=Editor.find(pkg,"decor:scroll/decoration")
   if kind=="identity" then image.id="other/decoration" elseif kind=="bounds" then image.decorationRect[3]=-1 elseif kind=="input" then image.properties.Active=true else pkg.assets[1].renderMode="execute" end
   assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"Accepted invalid "..kind)
   assert(not pcall(Importer.stage,pkg,{},false,runtimeSource),"Staging accepted invalid "..kind)
  end
 end)
 test("reimport keeps native owners, content, user scripts and runtime identity",function()
  local pkg=Importer.decode(fixture);pkg.sourceId="decoration-update-native"
  local first=Importer.stage(pkg,fixtureBindings,false,runtimeSource);table.insert(stages,first);Importer.apply(first,pkg,game:GetService("CoreGui"),false)
  local parent=first.byId["decor:scroll"].instance;local image=first.byId["decor:scroll/decoration"].instance;local card=first.byId["decor:card:0"].instance
  local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Parent=card
  local runtime=first.byId[first.roots[1]:GetAttribute("FramebridgeId").."/behavior-runtime"].instance
  local next=Importer.stage(pkg,fixtureBindings,false,runtimeSource);table.insert(stages,next);local roots=Importer.apply(next,pkg,game:GetService("CoreGui"),true)
  local found={};for _,child in ipairs(roots[1]:GetDescendants())do found[child:GetAttribute("FramebridgeId") or ""]=child end
  assert(found["decor:scroll"]==parent and found["decor:scroll/decoration"]==image and found["decor:card:0"]==card and custom.Parent==card)
  assert(found[first.roots[1]:GetAttribute("FramebridgeId").."/behavior-runtime"]==runtime)
 end)
 test("destroying the geometry controller disconnects its observers",function()
  assert(controller.connectionCount()>0);controller.destroy();assert(controller.connectionCount()==0)
 end)
end)
for _,controller in ipairs(controllers)do controller.destroy()end
for _,value in ipairs(stages)do Importer.destroy(value)end
assert(ok,why)
return {passed=passed,failed=#failures,failures=failures,scope="Real native background/scroll/resize/scale/padding/import/update geometry; no image-pixel fidelity claim"}
