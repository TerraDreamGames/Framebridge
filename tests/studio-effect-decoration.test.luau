assert(game.PlaceId==0,"Approved blank QA only")
local Http=game:GetService("HttpService")
local passed,failures,stages,controllers=0,{},{},{}
local function test(name,fn)local ok,why=pcall(fn);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end end
local function settle()task.wait(.05);task.wait(.05)end
local function near(a,b)assert((a-b).Magnitude<.6,tostring(a).." differs from "..tostring(b))end
local function stage(raw)
 local pkg=Importer.decode(raw or fixture);local s=Importer.stage(pkg,{},false,runtimeSource);table.insert(stages,s)
 s.roots[1].Name="FramebridgeEffectDecorationQA";s.roots[1].Parent=game:GetService("CoreGui")
 s.byId["effect:root"].instance.Size=UDim2.fromOffset(640,420)
 local c=MaskLayout.mount(s.roots[1]);table.insert(controllers,c);settle();return s,c
end
local ok,why=pcall(function()
 local s,c=stage();local text=s.byId["effect:text"].instance;local effect=s.byId["effect:text/effect"].instance
 local container=s.byId["effect:container"].instance;local bg=s.byId["effect:container/decoration"].instance
 local glow=s.byId["effect:container/effect"].instance;local button=s.byId["effect:blend"].instance
 local blend=s.byId["effect:blend/decoration"].instance
 test("editable text, container children and native button input owners survive",function()
  assert(text:IsA("TextLabel") and text.Text=="Editable glow")
  assert(s.byId["effect:child"].instance:IsDescendantOf(container))
  assert(button:IsA("GuiButton") and button.Active and button.Selectable)
  for _,image in ipairs({effect,bg,glow,blend})do assert(image:IsA("ImageLabel") and not image.Active and not image.Selectable and image.BackgroundTransparency==1)end
 end)
 test("group opacity is applied once and extracted effects replace native source shadows",function()
  assert(container:IsA("CanvasGroup") and math.abs(container.GroupTransparency-.5)<.001)
  assert(glow.AbsoluteSize.X>container.AbsoluteSize.X,"Fixture needs an extended helper; CanvasGroup texture clipping remains a pixel comparison gate")
  assert(glow.ImageTransparency==0 and bg.ImageTransparency==0 and math.abs(effect.ImageTransparency-.4)<.001)
  assert(not text:FindFirstChildOfClass("UIShadow") and not container:FindFirstChildOfClass("UIShadow"))
  assert(s.byId["effect:box"].instance:FindFirstChildOfClass("UIShadow"))
  assert(effect.ZIndex<0 and blend.ZIndex==0)
 end)
 test("effect artwork follows local resize/UIScale without moving editable content",function()
  local initial=effect.AbsoluteSize;local child=s.byId["effect:child"].instance;local pos=child.Position
  text.Size=UDim2.fromOffset(360,80);settle();near(effect.AbsoluteSize,initial*2)
  local scale=Instance.new("UIScale");scale.Scale=.7;scale.Parent=text;settle();near(effect.AbsoluteSize,initial*1.4)
  assert(child.Position==pos);scale:Destroy()
  text.Rotation=23;settle();assert(effect.Rotation==0 and math.abs(effect.AbsoluteRotation-text.AbsoluteRotation)<.01)
 end)
 test("known-flat blend stays on owner viewport and follows owner geometry",function()
  near(blend.AbsolutePosition,button.AbsolutePosition);near(blend.AbsoluteSize,button.AbsoluteSize)
  button.Size=UDim2.fromOffset(180,66);settle();near(blend.AbsoluteSize,button.AbsoluteSize)
  local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(0,8);padding.PaddingTop=UDim.new(0,7);padding.Parent=button
  settle();near(blend.AbsolutePosition,button.AbsolutePosition);near(blend.AbsoluteSize,button.AbsoluteSize);padding:Destroy()
 end)
 for _,mode in ipairs({"source","scale","offset"})do test("effect and blend metadata survive "..mode.." import mode",function()
  local pkg=Editor.prepare(Importer.decode(fixture),{mode=mode});local result=stage(Http:JSONEncode(pkg));settle()
  assert(result.byId["effect:text/effect"].instance.Parent==result.byId["effect:text"].instance)
  local b=result.byId["effect:blend"].instance;local image=result.byId["effect:blend/decoration"].instance
  near(image.AbsolutePosition,b.AbsolutePosition);near(image.AbsoluteSize,b.AbsoluteSize)
 end)end
 test("tampered effect/backdrop/helper metadata is rejected at decode and stage",function()
  for _,kind in ipairs({"owner","mode","input","backdrop","prepare"})do
   local pkg=Importer.decode(fixture);local image=Editor.find(pkg,"effect:text/effect")
   if kind=="owner" then image.id="other/effect" elseif kind=="input" then image.properties.Active=true
   elseif kind=="mode" then for _,a in ipairs(pkg.assets)do if a.id==image.assetRef then a.renderMode="fills"end end
   elseif kind=="backdrop" then for _,a in ipairs(pkg.assets)do if a.renderMode=="blend" then a.backdrop[1]=2 end end
   else for _,a in ipairs(pkg.assets)do if a.id==image.assetRef then a.processing={whiteMask=true}end end end
   assert(not pcall(Importer.decode,Http:JSONEncode(pkg)),"decode accepted "..kind)
   assert(not pcall(Importer.stage,pkg,{},false,runtimeSource),"stage accepted "..kind)
  end
 end)
 for kind,raw in pairs(opacityFixtures)do test("partial "..kind.." retains native foreground and declines independently faded effect",function()
  local partial=stage(raw);local owner=partial.byId["effect:container"].instance
  local expected=kind=="Frame" and "Frame" or kind=="button" and "ImageButton" or "ScrollingFrame"
  assert(owner.ClassName==expected and not partial.byId["effect:container/effect"])
  assert(partial.byId["effect:container/decoration"].instance.Parent==owner and partial.byId["effect:child"].instance:IsDescendantOf(owner))
  local notice=false;for _,issue in ipairs(Importer.decode(raw).issues)do if issue.nodeId=="effect:container" and issue.code=="effect-opacity-fallback" then notice=true end end
  assert(notice,"Missing explicit group-opacity limitation")
 end)end
 test("reimport preserves helper/owner/user scripts and runtime identities after live native edits",function()
  local pkg=Importer.decode(fixture);pkg.sourceId="effect-update-native"
  local first=Importer.stage(pkg,{},false,runtimeSource);table.insert(stages,first);Importer.apply(first,pkg,game:GetService("CoreGui"),false)
  first.roots[1].Name="FramebridgeEffectUpdateQA"
  local owner=first.byId["effect:text"].instance;local image=first.byId["effect:text/effect"].instance
  local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Parent=owner
  owner.Text="Live title";assert(image.Parent==owner)
  local runtime=first.byId[first.roots[1]:GetAttribute("FramebridgeId").."/behavior-runtime"].instance
  local next=Importer.stage(pkg,{},false,runtimeSource);table.insert(stages,next);local roots=Importer.apply(next,pkg,game:GetService("CoreGui"),true)
  local found={};for _,child in ipairs(roots[1]:GetDescendants())do found[child:GetAttribute("FramebridgeId") or ""]=child end
  assert(found["effect:text"]==owner and found["effect:text/effect"]==image and custom.Parent==owner)
  assert(found[first.roots[1]:GetAttribute("FramebridgeId").."/behavior-runtime"]==runtime)
 end)
 test("geometry teardown removes all live observers",function()assert(c.connectionCount()>0);c.destroy();assert(c.connectionCount()==0)end)
end)
for _,c in ipairs(controllers)do c.destroy()end
for _,s in ipairs(stages)do Importer.destroy(s)end
assert(ok,why)
return {passed=passed,failed=#failures,failures=failures,scope="Native effect/blend geometry, opacity, input ownership, update and teardown; no uploaded pixel fidelity or physical-input claim"}
