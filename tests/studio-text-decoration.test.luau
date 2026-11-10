-- Real native importer/runtime probes in a temporary CoreGui fixture.
-- Mock texture IDs establish state and topology, not captured pixel fidelity.
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function settle()task.wait(.05);task.wait(.05)end
local function test(name,fn)local ok,why=pcall(fn);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end end
local function host(owner)
 if owner.Parent then for _,folder in ipairs(owner.Parent:GetChildren())do
  local ref=folder:IsA("Folder") and folder:GetAttribute("FramebridgeTextDecorationHost") and folder:FindFirstChild("Owner")
  if ref and ref:IsA("ObjectValue") and ref.Value==owner then return folder end
 end end
end
local function copies(owner)local out={};local h=host(owner);if h then for _,child in ipairs(h:FindFirstChildOfClass("Frame"):GetChildren())do if child:IsA("TextLabel")then table.insert(out,child)end end end;return out end
local function withStage(raw,body,runtime)
 local stage=Importer.stage(Importer.decode(raw),{},false,runtimeSource);local root=stage.roots[1];root.Name="FramebridgeTextDecorationTest";root.Parent=game:GetService("CoreGui");stage.byId["effect:root"].instance.Size=UDim2.fromOffset(640,420)
 local player=Instance.new("Folder");local controller=(runtime or Runtime).mount(root,{player=player,manualMotion=true,manualKeyframes=true,reducedMotion=false});settle()
 local ok,why=pcall(body,stage,controller,player)
 controller.destroy();assert(controller.connectionCount()==0,"Controller leaked listeners");player:Destroy();Importer.destroy(stage);assert(ok,why)
end
test("native editable glyphs replace capture and preserve owner identity/input",function()
 withStage(fixture,function(s,c)
  local owner=s.byId["effect:text"].instance;local image=s.byId["effect:text/effect"].instance
  assert(owner:GetAttribute("FramebridgeTextDecorationStatus")=="Captured" and #copies(owner)==0)
  local text=owner.Text;owner.Text="Updated actual glyphs";owner.TextSize=32;settle()
  assert(image.ImageTransparency==1 and #copies(owner)==4 and owner:GetAttribute("FramebridgeTextDecorationStatus")=="Live glyphs")
  for _,copy in ipairs(copies(owner))do assert(copy.Text==owner.Text and copy.TextSize==32 and copy.FontFace==owner.FontFace and not copy.Active and not copy.Interactable and not copy.Selectable and copy.Parent.Parent==host(owner) and host(owner):FindFirstChild("Owner").Value==owner)end
  owner.Text=text;owner.TextSize=28;settle();assert(#copies(owner)==0 and math.abs(image.ImageTransparency-.4)<.0001)
 end)
end)
test("native background changes switch capture to documented underlay and restore transparently",function()
 withStage(fixture,function(s,c)
  local o=s.byId["effect:text"].instance;local image=s.byId["effect:text/effect"].instance;assert(o.BackgroundTransparency==1 and #copies(o)==0)
  for _,alpha in ipairs({.5,0})do o.BackgroundTransparency=alpha;settle();assert(o.BackgroundTransparency==alpha and image.ImageTransparency==1 and #copies(o)==4 and o:GetAttribute("FramebridgeTextDecorationStatus")=="Live glyphs (background can cover shadow)")end
  o.BackgroundTransparency=1;settle();assert(math.abs(image.ImageTransparency-.4)<.0001 and #copies(o)==0)
 end)
end)
test("native rich shaping/font/alpha and constraints refresh current helpers",function()
 withStage(fixture,function(s,c)
  local o=s.byId["effect:text"].instance;o.RichText=true;o.Text='<b>Now</b><font color="#ff0000" transparency=".3" size="36"> rich</font>';o.FontFace=Font.new("rbxasset://fonts/families/GothamSSm.json",Enum.FontWeight.Bold,Enum.FontStyle.Italic);o.TextTransparency=.75
  local constraint=Instance.new("UITextSizeConstraint");constraint.MinTextSize=18;constraint.MaxTextSize=45;constraint.Parent=o;settle()
  for _,copy in ipairs(copies(o))do assert(copy.RichText and copy.FontFace==o.FontFace and not copy.Text:find('#ff0000',1,true) and copy.Text:find('transparency=".3"',1,true));assert(copy:FindFirstChildOfClass("UITextSizeConstraint").MaxTextSize==45)end
  o.Size=UDim2.fromOffset(360,80);local scale=Instance.new("UIScale");scale.Scale=.7;scale.Parent=o;settle();assert(#copies(o)==4)
  o.Visible=false;assert(not o.Visible);o.Visible=true
 end)
end)
test("actual attribute binding updates current glyphs and escapes markup",function()
 withStage(bindingFixture,function(s,c,player)
  local o=s.byId["effect:text"].instance;player:SetAttribute("LiveName","Ada <b>" );settle();assert(o.Text=="Player: Ada <b>" and copies(o)[1].Text==o.Text)
  o.RichText=true;player:SetAttribute("LiveName","Bea <b>");settle();assert(o.Text=="Player: Bea &lt;b&gt;" and copies(o)[1].Text==o.Text)
 end)
end)
test("kept-root runtime disposal restores authored binding text and matching capture",function()
 withStage(bindingFixture,function(s,c,player)
  local o=s.byId["effect:text"].instance;local image=s.byId["effect:text/effect"].instance
  local authored=Http:JSONDecode(fixture).roots[1].children[1].children[1].properties.Text
  player:SetAttribute("LiveName","Changed before stopping");settle();assert(image.ImageTransparency==1 and #copies(o)==4)
  c.destroy();assert(c.connectionCount()==0 and o.Text==authored and #copies(o)==0 and math.abs(image.ImageTransparency-.4)<.0001,"Kept root lost restored capture")
 end)
end)
test("actual theme font/shadow mode changes refresh glyphs and never draw a rectangle",function()
 withStage(themeFixture,function(s,c)
  local o=s.byId["effect:text"].instance;local shadow=o:FindFirstChildOfClass("UIShadow");assert(shadow and not shadow.Enabled and #copies(o)==4)
  s.roots[1]:SetAttribute("FramebridgeTheme","Dark");settle();for _,copy in ipairs(copies(o))do assert(copy.FontFace==o.FontFace and copy.TextSize==o.TextSize and copy.TextColor3==shadow.Color)end
  o.RichText=true;o.Text='<b>Visible</b><font color="#ff0000" transparency="1">HIDDEN</font>';settle()
  shadow.Color=Color3.new(0,1,0);settle();for _,copy in ipairs(copies(o))do if copy:FindFirstChildOfClass("UIStroke").Thickness>0 then assert(copy.Text:find('<stroke color="#00FF00"',1,true) and copy.Text:find('transparency="1.00000000"',1,true))end end
  shadow.Color=Color3.new(1,0,1);settle();for _,copy in ipairs(copies(o))do assert(copy.TextColor3==shadow.Color and not copy.Text:find('#00FF00',1,true));if copy:FindFirstChildOfClass("UIStroke").Thickness>0 then assert(copy.Text:find('<stroke color="#FF00FF"',1,true))end end
 end,ThemedRuntime)
end)
test("native controller replacement and changed-content disposal never restore stale pixels",function()
 withStage(fixture,function(s,c)
  local o=s.byId["effect:text"].instance;local image=s.byId["effect:text/effect"].instance;o.Text="Changed before disposal";settle()
  local next=Decoration.mount(s.roots[1]);settle();assert(#copies(o)==4);next.destroy();assert(next.connectionCount()==0 and #copies(o)==0 and image.ImageTransparency==1)
 end)
end)
test("native ancestor motion/keyframe fades leave glyph alpha under its controller",function()
 for _,kind in ipairs({"motion","keyframes"})do
  local p=Http:JSONDecode(fixture);local o=p.roots[1].children[1].children[1];o.textDecoration.baseline=nil
  local panel=p.roots[1].children[1]
  if kind=="motion"then panel.behavior={motion={blink={visible=1,hidden=1,fade=.5,delay=0}}}
  else panel.behavior={keyframes={trigger="mount",interruption="restart",finish="hold",repeats=0,yoyo=false,frames={{time=0,x=0,y=0,scale=1,rotation=0,opacity=1,easing="linear",direction="out"},{time=1,x=0,y=0,scale=1,rotation=0,opacity=0,easing="linear",direction="out"}}}}end
  withStage(Http:JSONEncode(p),function(s,c)
   local owner=s.byId["effect:text"].instance
   if kind=="motion"then c.stepMotion(.25)else c.stepKeyframes(.25);c.stepKeyframes(.25)end
   settle();assert(math.abs(owner.TextTransparency-.7)<.0001,"Native owner fade differs")
   local expected=(1-.8*(1-owner.TextTransparency))^.25
   for index,copy in ipairs(copies(owner))do local fill=index==1 and 1-.8*(1-owner.TextTransparency) or 1;assert(math.abs(copy.TextTransparency-fill)<.0001 and math.abs(copy:FindFirstChildOfClass("UIStroke").Transparency-expected)<.0001,"Generated glyph alpha was overwritten by ancestor animation")end
  end)
 end
end)
test("native helper rebuild/disposal preserves custom content and capture restoration",function()
 withStage(fixture,function(s,c)
  local owner=s.byId["effect:text"].instance;local image=s.byId["effect:text/effect"].instance;local authored=owner.Text
  owner.Text="Changed paint with application content";settle()
  local custom=Instance.new("LocalScript");custom.Name="Custom helper script";custom.Disabled=true;custom.Source="-- QA custom script";custom.Parent=host(owner):FindFirstChildOfClass("Frame")
  local frame=Instance.new("Frame");frame.Name="Custom helper subtree";local child=Instance.new("TextLabel");child.Parent=frame;frame.Parent=copies(owner)[2]
  owner.Text=authored;settle();assert(#copies(owner)==0 and custom.Parent==owner and frame.Parent==owner and child.Parent==frame and math.abs(image.ImageTransparency-.4)<.0001)
  owner.Text="Changed again";settle();local saved=custom;custom.Parent=host(owner):FindFirstChildOfClass("Frame")
  local next=Decoration.mount(s.roots[1]);settle();assert(saved.Parent==owner and saved.Source=="-- QA custom script" and frame.Parent==owner)
  custom.Parent=host(owner):FindFirstChildOfClass("Frame");next.destroy();assert(next.connectionCount()==0 and custom.Parent==owner and frame.Parent==owner and image.ImageTransparency==1)
  custom:Destroy();frame:Destroy()
 end)
end)
test("native synchronous text-size constraint removal retains application content",function()
 withStage(fixture,function(s,c)
  local o=s.byId["effect:text"].instance;o.Text="Live text with limits";local constraint=Instance.new("UITextSizeConstraint");constraint.MinTextSize=12;constraint.MaxTextSize=46;constraint.Parent=o;settle()
  local dc=Decoration.mount(s.roots[1]);settle();local copy=copies(o)[1]:FindFirstChildOfClass("UITextSizeConstraint");assert(copy)
  local script=Instance.new("LocalScript");script.Disabled=true;script.Source="-- preserve custom constraint script";script.Parent=copy
  constraint.Parent=nil;dc.refresh();assert(script.Parent==o and script.Source=="-- preserve custom constraint script" and not copy.Parent,"Constraint refresh destroyed custom content")
  settle();dc.destroy();assert(dc.connectionCount()==0 and script.Parent==o);script:Destroy();constraint:Destroy()
 end)
end)
test("actual reimport removes live decorated ancestors and protects custom helper content",function()
 withStage(fixture,function(s,c)
  local owner=s.byId["effect:text"].instance;owner.Text="Live before removal";settle();assert(host(owner))
  local custom=Instance.new("LocalScript");custom.Name="Application content";custom.Disabled=true;custom.Source="-- QA custom script";custom.Parent=host(owner):FindFirstChildOfClass("Frame")
  local p=Http:JSONDecode(fixture);p.roots[1].children={};p.assets={}
  local nextStage=Importer.stage(Importer.decode(Http:JSONEncode(p)),{},false,runtimeSource)
  assert(not pcall(Importer.apply,nextStage,p,game:GetService("CoreGui"),true),"Update deleted custom helper script")
  assert(custom.Parent and owner.Parent,"Rejected update must preserve original hierarchy")
  Importer.destroy(nextStage);custom:Destroy()
  nextStage=Importer.stage(Importer.decode(Http:JSONEncode(p)),{},false,runtimeSource)
  local oldHost=host(owner);local roots,stats=Importer.apply(nextStage,p,game:GetService("CoreGui"),true);settle()
  assert(stats.removed>0 and owner.Parent==nil and not oldHost.Parent,"Owned helpers blocked removal or leaked")
  assert(roots[1]==s.roots[1],"Reimport replaced the existing root")
  -- Importer leaves removed instances unparented for native Undo; own QA disposes them.
  owner:Destroy();s.byId["effect:root"].instance:Destroy()
 end)
end)
test("native decode rejects executable metadata and foreign helper ownership",function()
 for _,kind in ipairs({"script","foreign","oversize"})do
  local p=Http:JSONDecode(fixture);local o=p.roots[1].children[1].children[1]
  if kind=="script"then o.textDecoration.source="print('untrusted')" elseif kind=="foreign"then o.textDecoration.captured="other/effect"else o.textDecoration.shadows[1].radius=1001 end
  assert(not pcall(Importer.decode,Http:JSONEncode(p)),"Accepted "..kind)
 end
end)
return {passed=passed,failed=#failures,failures=failures,scope="Native glyph refresh, font/rich/alpha/binding/theme, bounded helpers and teardown; visual ordering and exact blur require separate screenshots"}
