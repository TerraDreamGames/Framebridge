-- Actual trusted refresh code with simulated instance signals and real datatypes.
-- Native drawing order, rendered blur and physical input are separate acceptance.
local fs=require("@lune/fs")
local serde=require("@lune/serde")
local roblox=require("@lune/roblox")
local queue={}
local function signal()
 local handlers={}
 return {Connect=function(_,fn)local c={Connected=true};function c:Disconnect()self.Connected=false end;table.insert(handlers,{fn,c});return c end,
 Fire=function(_,...)for _,h in ipairs(table.clone(handlers))do if h[2].Connected then h[1](...)end end end}
end
local function drain()
 for _=1,20 do if #queue==0 then return end;local work=queue;queue={};for _,fn in ipairs(work)do fn()end end
 error("Unbounded text decoration scheduling")
end
local internals={}
local function instance(class)
 local children,attributes,ps,as={},{},{},{}
 local d={ClassName=class,Name=class,Parent=nil,Visible=true,Enabled=true,Active=true,Interactable=true,Selectable=true,BackgroundTransparency=0,AbsolutePosition=roblox.Vector2.zero,AbsoluteSize=roblox.Vector2.new(180,40),AbsoluteRotation=0,Position=roblox.UDim2.fromOffset(0,0),Size=roblox.UDim2.fromOffset(180,40),AnchorPoint=roblox.Vector2.zero,Rotation=0,ClipsDescendants=false,CanvasPosition=roblox.Vector2.zero,AbsoluteCanvasSize=roblox.Vector2.new(180,40),AutomaticCanvasSize=roblox.Enum.AutomaticSize.None,ZIndex=2,Text="",TextSize=14,FontFace=roblox.Font.new("rbxasset://fonts/families/Roboto.json"),RichText=false,TextScaled=false,TextWrapped=true,LineHeight=1,TextXAlignment=roblox.Enum.TextXAlignment.Left,TextYAlignment=roblox.Enum.TextYAlignment.Center,TextTruncate=roblox.Enum.TextTruncate.None,MaxVisibleGraphemes=-1,TextTransparency=0,TextColor3=roblox.Color3.new(1,1,1),AutoLocalize=false,TextDirection=roblox.Enum.TextDirection.Auto,OpenTypeFeatures="",Image="",ImageTransparency=0,MinTextSize=1,MaxTextSize=100,Scale=1,PaddingLeft=roblox.UDim.new(0,0),PaddingRight=roblox.UDim.new(0,0),PaddingTop=roblox.UDim.new(0,0),PaddingBottom=roblox.UDim.new(0,0)}
 local m,object={}
 d.MinSize=roblox.Vector2.zero;d.MaxSize=roblox.Vector2.new(1e7,1e7)
 local gui=class=="Frame" or class=="CanvasGroup" or class=="ScrollingFrame" or class=="TextLabel" or class=="TextButton" or class=="TextBox" or class=="ImageLabel"
 function m:IsA(k)return class==k or k=="LayerCollector" and class=="ScreenGui" or k=="GuiObject" and gui or k=="GuiBase2d" and (gui or class=="ScreenGui") or k=="LuaSourceContainer" and (class=="Script" or class=="LocalScript" or class=="ModuleScript")end
 function m:GetAttribute(k)return attributes[k]end
 function m:SetAttribute(k,v)if attributes[k]~=v then attributes[k]=v;if as[k]then as[k]:Fire()end end end
 function m:GetAttributeChangedSignal(k)as[k]=as[k]or signal();return as[k]end
 function m:GetPropertyChangedSignal(k)ps[k]=ps[k]or signal();return ps[k]end
 function m:GetChildren()return table.clone(children)end
 function m:GetDescendants()local out={};local function visit(n)for _,c in ipairs(n:GetChildren())do table.insert(out,c);visit(c)end end;visit(object);return out end
 function m:FindFirstChild(name)for _,c in ipairs(children)do if c.Name==name then return c end end end
 function m:FindFirstChildOfClass(k)for _,c in ipairs(children)do if c.ClassName==k then return c end end end
 function m:IsDescendantOf(parent)local p=d.Parent;while p do if p==parent then return true end;p=p.Parent end;return false end
 function m:Destroy()if d.destroyed then return end;d.destroyed=true;d.Destroying:Fire();for _,c in ipairs(table.clone(children))do c:Destroy()end;object.Parent=nil end
 function m:Remove(c)local i=table.find(children,c);if i then table.remove(children,i)end end
 function m:Add(c)table.insert(children,c)end
 function m:Clone()
  local map={}
  local function copy(node)
   local data=internals[node];local cloned=instance(node.ClassName);map[node]=cloned
   for k,v in pairs(data.properties)do if k~="Parent" and k~="destroyed" and not data.signals[k]then cloned[k]=v end end
   for k,v in pairs(data.attributes)do cloned:SetAttribute(k,v)end
   for _,child in ipairs(node:GetChildren())do copy(child).Parent=cloned end
   return cloned
  end
  local cloned=copy(object)
  -- Native Clone remaps ObjectValues when the referenced owner is also cloned.
  for original,node in pairs(map)do if original:IsA("ObjectValue") and map[original.Value]then node.Value=map[original.Value]end end
  return cloned
 end
 local signals={DescendantAdded=true,DescendantRemoving=true,ChildAdded=true,ChildRemoved=true,Destroying=true,AncestryChanged=true}
 for k in pairs(signals)do d[k]=signal()end
 local function renderedFrame()
  if class~="Frame" or attributes.FramebridgeTextDecorationHelper~=true then return end
  local constraint=m.FindFirstChildOfClass(object,"UISizeConstraint");if not constraint then return end
  local parent=d.Parent;while parent and not parent:IsA("GuiBase2d")do parent=parent.Parent end;if not parent then return end
  local zoom=1;local current=parent;while current do if current:IsA("GuiObject")then local scale=current:FindFirstChildOfClass("UIScale");if scale then zoom*=scale.Scale end end;current=current.Parent end
  local own=m.FindFirstChildOfClass(object,"UIScale");local size=constraint.MinSize*zoom*(own and own.Scale or 1)
  local origin=roblox.Vector2.zero;local basis=parent.AbsoluteSize
  if parent:IsA("ScrollingFrame")then
   local canvas=parent.CanvasPosition;local step=internals[parent].properties.PixelStep or 0
   if step>0 then canvas=roblox.Vector2.new(math.floor(canvas.X/step+.5)*step,math.floor(canvas.Y/step+.5)*step)end
   origin=-canvas;basis=parent.AbsoluteCanvasSize
  end
  local padding=parent:FindFirstChildOfClass("UIPadding");if padding then origin+=roblox.Vector2.new(padding.PaddingLeft.Scale*basis.X+padding.PaddingLeft.Offset*zoom,padding.PaddingTop.Scale*basis.Y+padding.PaddingTop.Offset*zoom)end
  if padding then basis=roblox.Vector2.new(math.max(0,basis.X-padding.PaddingLeft.Scale*basis.X-padding.PaddingRight.Scale*basis.X-(padding.PaddingLeft.Offset+padding.PaddingRight.Offset)*zoom),math.max(0,basis.Y-padding.PaddingTop.Scale*basis.Y-padding.PaddingBottom.Scale*basis.Y-(padding.PaddingTop.Offset+padding.PaddingBottom.Offset)*zoom))end
  if parent:IsA("ScrollingFrame")then local axis=parent.AutomaticCanvasSize;basis=roblox.Vector2.new((axis==roblox.Enum.AutomaticSize.X or axis==roblox.Enum.AutomaticSize.XY) and parent.AbsoluteSize.X or basis.X,(axis==roblox.Enum.AutomaticSize.Y or axis==roblox.Enum.AutomaticSize.XY) and parent.AbsoluteSize.Y or basis.Y)end
  local top=origin+roblox.Vector2.new(d.Position.X.Scale*basis.X+d.Position.X.Offset*zoom,d.Position.Y.Scale*basis.Y+d.Position.Y.Offset*zoom)-d.AnchorPoint*size
  local center=parent.AbsolutePosition+parent.AbsoluteSize/2;local delta=top+size/2-parent.AbsoluteSize/2;local r=math.rad(parent.AbsoluteRotation)
  return center+roblox.Vector2.new(delta.X*math.cos(r)-delta.Y*math.sin(r),delta.X*math.sin(r)+delta.Y*math.cos(r))-size/2,size
 end
 object=setmetatable({}, {__index=function(_,k)
  if k=="AbsolutePosition" or k=="AbsoluteSize"then local position,size=renderedFrame();if position then return k=="AbsolutePosition" and position or size end end
  return m[k]or d[k]
 end,__newindex=function(_,k,v)
  if d[k]==v then return end
  if k=="Parent"then
   if v then assert(not v.destroyed,"Cannot parent into a destroyed instance")end
   local subtree={object};for _,descendant in ipairs(object:GetDescendants())do table.insert(subtree,descendant)end
   if d.Parent then local p=d.Parent;while p do for _,node in ipairs(subtree)do p.DescendantRemoving:Fire(node)end;p=p.Parent end;d.Parent:Remove(object);d.Parent.ChildRemoved:Fire(object)end
   d.Parent=v
   if v then v:Add(object);local p=v;while p do for _,node in ipairs(subtree)do p.DescendantAdded:Fire(node)end;p=p.Parent end;v.ChildAdded:Fire(object)end
   for _,node in ipairs(subtree)do node.AncestryChanged:Fire(node,node.Parent)end
  else
   if class=="UISizeConstraint" and k=="MinSize"then assert(v.X<=d.MaxSize.X and v.Y<=d.MaxSize.Y,"Minimum size must not exceed maximum")
   elseif class=="UISizeConstraint" and k=="MaxSize"then assert(v.X>=d.MinSize.X and v.Y>=d.MinSize.Y,"Maximum size must not fall below minimum")end
   d[k]=v
  end
  if ps[k]then ps[k]:Fire()end
  if class=="Frame" and attributes.FramebridgeTextDecorationHelper and (k=="Position" or k=="AnchorPoint") and ps.AbsolutePosition then ps.AbsolutePosition:Fire()end
 end})
 internals[object]={properties=d,attributes=attributes,signals=signals}
 return object
end
local formatCalls=0;local runtimeString=table.clone(string)
runtimeString.format=function(...)formatCalls+=1;return string.format(...)end
local environment={game={GetService=function(_,k)assert(k=="HttpService");return {JSONDecode=function(_,raw)return serde.decode("json",raw)end}end},Instance={new=instance},Vector2=roblox.Vector2,UDim=roblox.UDim,UDim2=roblox.UDim2,Color3=roblox.Color3,Enum=roblox.Enum,string=runtimeString,task={defer=function(fn)table.insert(queue,fn)end}}
setmetatable(environment,{__index=getfenv()})
local factory=assert(loadstring(fs.readFile(".artifacts/live-text-decoration/final/runtime.luau")));setfenv(factory,environment);local Decoration=factory()
local pkg=serde.decode("json",fs.readFile(".artifacts/live-text-decoration/final/design.framebridge.json"))
local function setup()
 local root=instance("ScreenGui");root:SetAttribute("FramebridgeSource",pkg.sourceId)
 local owner=instance("TextLabel");owner:SetAttribute("FramebridgeSource",pkg.sourceId);owner:SetAttribute("FramebridgeId","effect:text")
 local metadata
 local function find(n)if n.id=="effect:text"then metadata=n end;for _,c in ipairs(n.children)do find(c)end end
 for _,r in ipairs(pkg.roots)do find(r)end
 metadata=serde.decode("json",serde.encode("json",metadata))
 for k,v in pairs(metadata.properties)do
  if type(v)=="table" and v.type=="Font"then owner[k]=roblox.Font.new(v.family,roblox.Enum.FontWeight[v.weight],roblox.Enum.FontStyle[v.style])
  elseif type(v)=="table"and v.type=="Color3"then owner[k]=roblox.Color3.new(table.unpack(v.value))
  elseif type(v)=="table"and v.type=="Enum"then owner[k]=roblox.Enum[v.value[1]][v.value[2]]
  elseif type(v)=="table"and v.type=="UDim2"then owner[k]=roblox.UDim2.new(table.unpack(v.value))
  elseif type(v)=="table"and v.type=="Vector2"then owner[k]=roblox.Vector2.new(table.unpack(v.value))
  elseif type(v)~="table"then owner[k]=v end
 end
 owner:SetAttribute("FramebridgeTextDecoration",serde.encode("json",metadata.textDecoration));owner.Parent=root
 local capture=instance("ImageLabel");capture.Image="rbxassetid://123";capture.ImageTransparency=.4;capture:SetAttribute("FramebridgeSource",pkg.sourceId);capture:SetAttribute("FramebridgeId","effect:text/effect");capture:SetAttribute("FramebridgeDecorationRect","[-.1,-.2,1.2,1.5]");capture.Parent=owner
 return root,owner,capture,Decoration.mount(root),metadata.textDecoration
end
local function helperHosts(owner)
 local out={};if not owner.Parent then return out end
 for _,child in ipairs(owner.Parent:GetChildren())do
  local reference=child:FindFirstChild("Owner")
  if child:IsA("Folder") and child:GetAttribute("FramebridgeTextDecorationHelper")==true and reference and reference:IsA("ObjectValue") and reference.Value==owner then table.insert(out,child)end
 end
 return out
end
local function helperHost(owner)local hosts=helperHosts(owner);assert(#hosts<=1,"An owner must have at most one exact referenced helper host");return hosts[1]end
local function copies(owner)local out={};local host=helperHost(owner);if host then for _,child in ipairs(host:GetDescendants())do if child:IsA("TextLabel") and child:GetAttribute("FramebridgeTextDecorationHelper")==true and child:GetAttribute("FramebridgeSource")==owner:GetAttribute("FramebridgeSource") and child:GetAttribute("FramebridgeTextDecorationOwner")==owner:GetAttribute("FramebridgeId") then table.insert(out,child)end end end;return out end
local function close(actual,expected)assert(math.abs(actual-expected)<.00001,tostring(actual).." ~= "..tostring(expected))end
local function withoutControlledStrokes(text)
 return (text:gsub('<stroke color="#[%x]+" transparency="[%d%.]+" thickness="[%d%.]+" joins="round">',""):gsub("</stroke>",""))
end
local function controlledRuns(text)
 local out={}
 for attributes,value in text:gmatch("<stroke%s+([^>]+)>(.-)</stroke>")do
  local color,transparency,thickness=attributes:match('^color="(#[%x]+)" transparency="([%d%.]+)" thickness="([%d%.]+)" joins="round"$')
  assert(color and #color==7 and transparency and thickness,"Only trusted hex color/transparency/thickness/joins belong in generated stroke tags")
  table.insert(out,{text=value,color=color,transparency=tonumber(transparency),thickness=tonumber(thickness)})
 end
 return out
end
local function localSize(owner)
 local zoom=1;local current=owner
 while current do if current:IsA("GuiObject")then local scale=current:FindFirstChildOfClass("UIScale");if scale then zoom*=scale.Scale end end;current=current.Parent end
 return owner.AbsoluteSize/zoom
end
local function paddingDisplacement(owner,label)
 assert(label.Position==roblox.UDim2.fromScale(0,0) and label.Size==roblox.UDim2.fromScale(1,1),"Shadow paint must keep the native owner's GUI bounds")
 local copy=label:FindFirstChildOfClass("UIPadding");assert(copy,"Balanced text padding exists for every glyph")
 local authored=owner:FindFirstChildOfClass("UIPadding")
 local function base(key)return authored and authored[key]or roblox.UDim.new(0,0)end
 for _,key in ipairs({"PaddingLeft","PaddingRight","PaddingTop","PaddingBottom"})do close(copy[key].Offset,base(key).Offset)end
 close(copy.PaddingLeft.Scale+copy.PaddingRight.Scale,base("PaddingLeft").Scale+base("PaddingRight").Scale)
 close(copy.PaddingTop.Scale+copy.PaddingBottom.Scale,base("PaddingTop").Scale+base("PaddingBottom").Scale)
 return roblox.Vector2.new((copy.PaddingLeft.Scale-base("PaddingLeft").Scale)*localSize(owner).X,(copy.PaddingTop.Scale-base("PaddingTop").Scale)*localSize(owner).Y)
end
local passed=0
local function test(name,fn)drain();fn();drain();passed+=1;print(name)end
test("unchanged capture survives without native helpers",function()
 local r,o,image,c=setup();assert(o:GetAttribute("FramebridgeTextDecorationStatus")=="Captured" and #copies(o)==0 and image.ImageTransparency==.4);c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("content/font/alpha changes coalesce and actually redraw current glyphs",function()
 local r,o,image,c=setup();o.Text="New player";o.TextSize=32;o.FontFace=roblox.Font.new("rbxasset://fonts/families/GothamSSm.json",roblox.Enum.FontWeight.Bold,roblox.Enum.FontStyle.Italic);o.TextTransparency=.75
 assert(#queue==1,"Property work must coalesce");drain();local labels=copies(o);assert(#labels==4 and image.ImageTransparency==1)
 for index,l in ipairs(labels)do
  assert(l.Text=="New player" and l.TextSize==32 and l.FontFace==o.FontFace and not l.Active and not l.Interactable and not l.Selectable)
  close(l.TextTransparency,index==1 and .8 or 1)
  close(l:FindFirstChildOfClass("UIStroke").Transparency,.8^.25)
 end
 local host=helperHost(o);local frame=host:FindFirstChildOfClass("Frame");assert(host.Parent==o.Parent and not host:IsA("GuiObject") and frame and frame:FindFirstChildOfClass("UIScale") and frame:FindFirstChildOfClass("UISizeConstraint"))
 assert(image.Parent==o,"The authored capture remains inside the owner")
 for _,l in ipairs(labels)do assert(l.Parent==frame and l.ZIndex==o.ZIndex-1 and l.Rotation==o.Rotation)end
 local helpers={host};for _,node in ipairs(host:GetDescendants())do table.insert(helpers,node)end
 for _,node in ipairs(helpers)do assert(node:GetAttribute("FramebridgeTextDecorationHelper")==true and node:GetAttribute("FramebridgeSource")==pkg.sourceId and node:GetAttribute("FramebridgeId")==nil,"Live helper identity must not enter generated source traversal")end
 c.destroy();assert(c.connectionCount()==0 and #copies(o)==0 and image.ImageTransparency==1,"Disposal must not restore stale glyph pixels");r:Destroy()
end)
test("rich runs preserve shaping and alpha while shadow color stays independent",function()
 local r,o,image,c=setup();o.RichText=true;o.Text='<b>New</b><font color="#ff0000" transparency=".3" size="36" face="GothamSSm"> runs</font><stroke color="#00ff00">!</stroke>';drain()
 local labels=copies(o);assert(#labels==4)
 for _,l in ipairs(labels)do
  local shaping=withoutControlledStrokes(l.Text)
  assert(l.RichText and not shaping:find('color=') and shaping:find('transparency=".3"',1,true) and shaping:find('size="36"',1,true) and shaping:find('<b>New</b>',1,true) and l.TextColor3==roblox.Color3.new(.2,.5,1))
  local stroke=l:FindFirstChildOfClass("UIStroke");local runs=controlledRuns(l.Text)
  if stroke.Thickness>0 then assert(#runs==3);for _,run in ipairs(runs)do assert(run.color=="#3380FF");close(run.thickness,stroke.Thickness);close(run.transparency,(1-.8*(1-o.TextTransparency)*(run.text==" runs" and .7 or 1))^.25)end else assert(#runs==0)end
 end
 c.destroy();r:Destroy()
end)
test("nested font transparency overrides each run and hidden runs receive fully transparent contours",function()
 local r,o,image,c,d=setup();d.shadows[1].color[4]=1;d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.TextTransparency=.5
 o.Text='<font transparency=".2">outer<font transparency=".75">inner</font>restored</font><font transparency="1">hidden<font transparency=".4">visibleOverride</font>hiddenAgain</font>plain';drain()
 local expected={{"outer",.8},{"inner",.25},{"restored",.8},{"hidden",0},{"visibleOverride",.6},{"hiddenAgain",0},{"plain",1}}
 local labels=copies(o);assert(#labels==4)
 for index,label in ipairs(labels)do
  assert(withoutControlledStrokes(label.Text)==o.Text);close(label.TextTransparency,index==1 and .5 or 1)
  local contour=label:FindFirstChildOfClass("UIStroke");assert(contour.Enabled);close(contour.Transparency,.5^.25)
  local runs=controlledRuns(label.Text);assert(#runs==#expected)
  for i,run in ipairs(runs)do assert(run.text==expected[i][1]);close(run.transparency,(1-.5*expected[i][2])^.25);close(run.thickness,contour.Thickness)end
 end
 c.destroy();r:Destroy()
end)
test("font tr is preserved as metadata and does not alter trusted contour alpha",function()
 local r,o,image,c,d=setup();d.shadows[1].color[4]=1;d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.TextTransparency=.5
 o.Text='<font tr="1">rootAlpha<font transparency=".4" tr="0">officialAlpha<font tr=".9">inheritedAlpha</font></font></font>';drain()
 local expected={{"rootAlpha",1},{"officialAlpha",.6},{"inheritedAlpha",.6}};local labels=copies(o);assert(#labels==4)
 for _,label in ipairs(labels)do
  assert(withoutControlledStrokes(label.Text)==o.Text);local runs=controlledRuns(label.Text);assert(#runs==3)
  for i,run in ipairs(runs)do assert(run.text==expected[i][1]);close(run.transparency,(1-.5*expected[i][2])^.25)end
 end
 c.destroy();r:Destroy()
end)
test("rich foreground paint is stripped while escaped text, comments and shaping tags survive",function()
 local r,o,image,c,d=setup();d.shadows[1].color[4]=1;d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.TextTransparency=.5
 o.Text='<font c="#ff0000" transparency=".5" size="24"><b><StRoKe color="#00ff00">A&amp;&lt;B&gt;</StRoKe></b><MaRk color="#abcdef">mark</MaRk><highlight>high</highlight><!-- <font transparency="1">ignored</font> -->after</font>';drain()
 local shaping='<font  transparency=".5" size="24"><b>A&amp;&lt;B&gt;</b>markhigh<!-- <font transparency="1">ignored</font> -->after</font>'
 local labels=copies(o);assert(#labels==4)
 for _,label in ipairs(labels)do
  assert(withoutControlledStrokes(label.Text)==shaping and not label.Text:find("#ff0000",1,true) and not label.Text:find("#00ff00",1,true) and not label.Text:find("#abcdef",1,true))
  local runs=controlledRuns(label.Text);assert(#runs==3 and runs[1].text=="A&amp;&lt;B&gt;" and runs[2].text=="markhigh" and runs[3].text=="after")
  for _,run in ipairs(runs)do close(run.transparency,.75^.25)end
 end
 c.destroy();r:Destroy()
end)
for _,limit in ipairs({"bytes","tags","font depth"})do
 test("rich contour "..limit.." limit is inclusive and overflow preserves the single fill",function()
  local r,o,image,c,d=setup();d.shadows[1].color[4]=1;d.shadows[1].spread=2;d.shadows[1].radius=0;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.TextTransparency=.5
  local accepted,rejected
  if limit=="bytes"then
   o.Text="x";drain();local overhead=0;for _,label in ipairs(copies(o))do overhead=math.max(overhead,#label.Text-1)end
   accepted=string.rep("a",65536-overhead);rejected=accepted.."a"
  elseif limit=="tags"then accepted=string.rep("<b></b>",1023).."<b>x</b>";rejected=accepted.."<b>x</b>"
  else accepted=string.rep("<font>",128).."x"..string.rep("</font>",128);rejected="<font>"..accepted.."</font>"end
  o.Text=accepted;drain();local labels=copies(o);assert(#labels==4)
  for _,label in ipairs(labels)do assert(label:FindFirstChildOfClass("UIStroke").Enabled and #controlledRuns(label.Text)>0 and withoutControlledStrokes(label.Text)==accepted)end
  assert(not o:GetAttribute("FramebridgeTextDecorationStatus"):find("complexity limit",1,true))
  o.Text=rejected;drain();labels=copies(o);assert(#labels==4 and image.ImageTransparency==1)
  for index,label in ipairs(labels)do assert(label.RichText and label.Text==rejected and not label:FindFirstChildOfClass("UIStroke").Enabled);close(label.TextTransparency,index==1 and .5 or 1)end
  assert(o:GetAttribute("FramebridgeTextDecorationStatus"):find("complexity limit",1,true))
  o.Text="small again";drain();for _,label in ipairs(copies(o))do assert(label:FindFirstChildOfClass("UIStroke").Enabled)end
  c.destroy();r:Destroy()
 end)
end
test("rich contour emitted markup limit prevents tag amplification and retains current fill",function()
 local r,o,image,c,d=setup();d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.Text=string.rep("<b>x</b>",1000);drain()
 assert(#o.Text<65536 and o:GetAttribute("FramebridgeTextDecorationStatus"):find("complexity limit",1,true))
 for _,label in ipairs(copies(o))do assert(label.Text==o.Text and not label:FindFirstChildOfClass("UIStroke").Enabled)end
 c.destroy();r:Destroy()
end)
test("raw rich contour input limit cannot be bypassed by stripped foreground paint",function()
 local r,o,image,c,d=setup();d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.Text='<font color="'..string.rep("a",65536)..'">current</font>';drain()
 assert(o:GetAttribute("FramebridgeTextDecorationStatus"):find("complexity limit",1,true))
 for index,label in ipairs(copies(o))do assert(label.Text=="<font >current</font>" and not label:FindFirstChildOfClass("UIStroke").Enabled);close(label.TextTransparency,index==1 and 1-d.shadows[1].color[4]*(1-o.TextTransparency) or 1)end
 c.destroy();r:Destroy()
end)
test("hard-shadow single fill preserves rich-run opacity under full and partial overall alpha",function()
 local r,o,image,c,d=setup();d.shadows[1].color[4]=1;d.shadows[1].radius=0;d.shadows[1].spread=0
 o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.Text='<font transparency=".3">alpha</font>';o.TextTransparency=0;drain()
 -- Compose the emitted fill alphas mathematically; this is not a pixel sample.
 -- Four overlapping 0.7-alpha fills would incorrectly produce 0.9919.
 local function composedFillAlpha(labels,runAlpha)
  local transmission=1
  for _,label in ipairs(labels)do transmission*=1-runAlpha*(1-label.TextTransparency)end
  return 1-transmission
 end
 local labels=copies(o);assert(#labels==4 and image.ImageTransparency==1)
 for index,label in ipairs(labels)do
  assert(label.RichText and label.Text:find('transparency=".3"',1,true))
  close(label.TextTransparency,index==1 and 0 or 1)
  local contour=label:FindFirstChildOfClass("UIStroke");assert(not contour.Enabled and contour.Thickness==0);close(contour.Transparency,0)
 end
 close(composedFillAlpha(labels,.7),.7)
 o.TextTransparency=.5;drain();labels=copies(o);assert(#labels==4)
 for index,label in ipairs(labels)do
  close(label.TextTransparency,index==1 and .5 or 1)
  local contour=label:FindFirstChildOfClass("UIStroke");assert(not contour.Enabled);close(contour.Transparency,.5^.25)
 end
 close(composedFillAlpha(labels,.7),.35)
 c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("text direction and OpenType feature changes invalidate capture and follow current glyph settings",function()
 local r,o,image,c=setup();o.TextDirection=roblox.Enum.TextDirection.RightToLeft;o.OpenTypeFeatures="liga=0";drain();assert(image.ImageTransparency==1 and #copies(o)==4)
 for _,l in ipairs(copies(o))do assert(l.TextDirection==o.TextDirection and l.OpenTypeFeatures==o.OpenTypeFeatures)end
 c.destroy();r:Destroy()
end)
test("restoring the full authored state restores capture and removes helper instances",function()
 local r,o,image,c=setup();local before=o.Text;o.Text="changed";drain();assert(#copies(o)==4);o.Text=before;drain();assert(#copies(o)==0 and image.ImageTransparency==.4);c.destroy();r:Destroy()
end)
test("owner background edits invalidate above-owner capture without changing native paint",function()
 local r,o,image,c=setup();assert(o.BackgroundTransparency==1 and image.ImageTransparency==.4)
 for _,alpha in ipairs({.5,0})do o.BackgroundTransparency=alpha;drain();assert(o.BackgroundTransparency==alpha and image.ImageTransparency==1 and #copies(o)==4 and o:GetAttribute("FramebridgeTextDecorationStatus")=="Live glyphs (background can cover shadow)")end
 o.BackgroundTransparency=1;drain();assert(image.ImageTransparency==.4 and #copies(o)==0 and o:GetAttribute("FramebridgeTextDecorationStatus")=="Captured")
 c.destroy();r:Destroy()
end)
test("responsive local bounds, UIScale and text constraints follow current owner",function()
 local r,o,image,c,d=setup();d.scaled=true;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));drain()
 local scale=instance("UIScale");scale.Scale=.5;scale.Parent=o;o.AbsoluteSize=roblox.Vector2.new(180,40)
 local constraint=instance("UITextSizeConstraint");constraint.MinTextSize=18;constraint.MaxTextSize=40;constraint.Parent=o;drain()
 for _,l in ipairs(copies(o))do close(paddingDisplacement(o,l).Y,4);local copy=l:FindFirstChildOfClass("UITextSizeConstraint");assert(copy.MinTextSize==18 and copy.MaxTextSize==40)end
 constraint.MaxTextSize=50;drain();assert(copies(o)[1]:FindFirstChildOfClass("UITextSizeConstraint").MaxTextSize==50)
 c.destroy();r:Destroy()
end)
test("paint basis follows padded parent geometry, owner scale, rotation and visibility",function()
 local r,o,image,c=setup();local parent=instance("Frame");parent.Parent=r;parent.AbsolutePosition=roblox.Vector2.new(20,30);parent.AbsoluteSize=roblox.Vector2.new(300,200)
 local parentScale=instance("UIScale");parentScale.Scale=2;parentScale.Parent=parent
 local padding=instance("UIPadding");padding.PaddingLeft=roblox.UDim.new(0,10);padding.PaddingRight=roblox.UDim.new(0,30);padding.PaddingTop=roblox.UDim.new(0,20);padding.PaddingBottom=roblox.UDim.new(0,40);padding.Parent=parent
 local ownScale=instance("UIScale");ownScale.Scale=.5;ownScale.Parent=o
 o.Parent=parent;o.Text="geometry";o.AbsolutePosition=roblox.Vector2.new(50.25,70.5);drain()
 local frame=helperHost(o):FindFirstChildOfClass("Frame");local constraint=frame:FindFirstChildOfClass("UISizeConstraint")
 assert(frame.Position==roblox.UDim2.fromOffset(7,2) and frame.Size==roblox.UDim2.fromOffset(0,0));assert(constraint.MinSize==roblox.Vector2.new(180,40) and constraint.MaxSize==constraint.MinSize);close(frame:FindFirstChildOfClass("UIScale").Scale,.5)
 close(frame.AnchorPoint.X,3.75/180);close(frame.AnchorPoint.Y,3.5/40)
 close(frame.Position.X.Offset*2-frame.AnchorPoint.X*o.AbsoluteSize.X,10.25);close(frame.Position.Y.Offset*2-frame.AnchorPoint.Y*o.AbsoluteSize.Y,.5)
 padding.PaddingLeft=roblox.UDim.new(0,15);drain();frame=helperHost(o):FindFirstChildOfClass("Frame");close(frame.Position.X.Offset*2-frame.AnchorPoint.X*o.AbsoluteSize.X,.25)
 o.Rotation=15;o.Visible=false;drain();assert(not frame.Visible);for _,l in ipairs(copies(o))do assert(l.Rotation==15)end
 o.Visible=true;o.Rotation=0;o.ClipsDescendants=true;drain();assert(frame.Visible and not frame.ClipsDescendants)
 for _,l in ipairs(copies(o))do assert(l.ClipsDescendants,"Each glyph mirrors the native owner's clipping property")end
 c.destroy();r:Destroy()
end)
test("scrolling paint basis avoids canvas-size dependence and retains fractional constrained pose",function()
 local r,o,image,c=setup();local parent=instance("ScrollingFrame");parent.AbsolutePosition=roblox.Vector2.new(10,20);parent.AbsoluteSize=roblox.Vector2.new(600,100);parent.AbsoluteCanvasSize=roblox.Vector2.new(800,600);parent.CanvasPosition=roblox.Vector2.new(30.5,10.25);parent.AutomaticCanvasSize=roblox.Enum.AutomaticSize.XY;parent.Parent=r
 o.Parent=parent;o.Text="scroll geometry";o.AbsolutePosition=roblox.Vector2.new(20.25,35.5);o.AbsoluteSize=roblox.Vector2.new(180.6,40.2);drain()
 local frame=helperHost(o):FindFirstChildOfClass("Frame");local constraint=frame:FindFirstChildOfClass("UISizeConstraint");assert(frame.Position==roblox.UDim2.fromOffset(42,27) and frame.Size==roblox.UDim2.fromOffset(0,0))
 assert(constraint.MinSize==roblox.Vector2.new(180.6,40.2) and constraint.MaxSize==constraint.MinSize);close(frame.AnchorPoint.X,1.25/180.6);close(frame.AnchorPoint.Y,1.25/40.2)
 local position,anchor,size=frame.Position,frame.AnchorPoint,constraint.MinSize
 parent.AbsoluteCanvasSize=roblox.Vector2.new(5000,5000);parent.AbsoluteSize=roblox.Vector2.new(800,200);drain()
 assert(frame.Position==position and constraint.MinSize==size and constraint.MaxSize==size,"Canvas/viewport growth must not feed into authored owner paint dimensions");close(frame.AnchorPoint.X,anchor.X);close(frame.AnchorPoint.Y,anchor.Y)
 c.destroy();r:Destroy()
end)
test("rendered scroll correction follows pixel density without hardcoded rounding or base-reset oscillation",function()
 local r,o,image,c=setup();local parent=instance("ScrollingFrame");parent.AbsolutePosition=roblox.Vector2.new(10,20);parent.AbsoluteSize=roblox.Vector2.new(300,100);parent.AbsoluteCanvasSize=roblox.Vector2.new(800,600);parent.Parent=r;o.Parent=parent;o.Text="density independent";o.AbsoluteSize=roblox.Vector2.new(180.6,40.2)
 for _,step in ipairs({1,.5,.25})do parent.PixelStep=step
  for _,fraction in ipairs({10.1,10.49,10.51,10.8,11.1})do
   parent.CanvasPosition=roblox.Vector2.new(fraction,fraction);local rounded=math.floor(fraction/step+.5)*step
   o.AbsolutePosition=parent.AbsolutePosition+roblox.Vector2.new(40.25-rounded,120.75-rounded);drain();local frame=helperHost(o):FindFirstChildOfClass("Frame")
   assert((frame.AbsolutePosition-o.AbsolutePosition).Magnitude<.0001 and o:GetAttribute("FramebridgeTextDecorationStatus")=="Live glyphs")
   assert(frame.AnchorPoint.X>=0 and frame.AnchorPoint.Y>=0 and frame.AnchorPoint.X<=1 and frame.AnchorPoint.Y<=1)
   c.refresh();drain();assert((frame.AbsolutePosition-o.AbsolutePosition).Magnitude<.0001,"Base refresh must reconcile actual rendered scroll again")
  end
 end
 -- A rendered-host-only recalculation corrects pose without redoing rich paint/base geometry.
 local frame=helperHost(o):FindFirstChildOfClass("Frame");frame.AnchorPoint+=roblox.Vector2.new(.001,.001);drain();assert((frame.AbsolutePosition-o.AbsolutePosition).Magnitude<.0001)
 c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("raw automatic-canvas float noise cannot reset a corrected rendered host or enqueue forever",function()
 local r,o,image,c=setup();local parent=instance("ScrollingFrame");parent.AbsolutePosition=roblox.Vector2.new(10,20);parent.AbsoluteSize=roblox.Vector2.new(300,100);parent.AbsoluteCanvasSize=roblox.Vector2.new(800,600);parent.PixelStep=.5;parent.CanvasPosition=roblox.Vector2.new(10.8,10.8);parent.Parent=r;o.Parent=parent;o.Text="stable rendered geometry";o.AbsolutePosition=parent.AbsolutePosition+roblox.Vector2.new(29.25,109.75);drain()
 local frame=helperHost(o):FindFirstChildOfClass("Frame");local position,anchor=frame.Position,frame.AnchorPoint
 for i=1,50 do
  parent.CanvasPosition=roblox.Vector2.new(10.8+i*.00001,10.8-i*.00001);parent.AbsoluteCanvasSize=roblox.Vector2.new(800+i*.000001,600-i*.000001);drain()
  assert(frame.Position==position and frame.AnchorPoint==anchor and (frame.AbsolutePosition-o.AbsolutePosition).Magnitude<.0001,"Read-only canvas noise must preserve the already corrected native pose")
 end
 assert(#queue==0);c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("subpixel glyph bounds use nonpositive scale residual while preserving current glyph paint",function()
 local r,o,image,c=setup();o.Text="tiny current glyphs";o.AbsoluteSize=roblox.Vector2.new(.3,.4);o.AbsolutePosition=roblox.Vector2.new(.25,.25);drain();local frame=helperHost(o):FindFirstChildOfClass("Frame")
 assert(#copies(o)==4 and image.ImageTransparency==1 and o:GetAttribute("FramebridgeTextDecorationStatus")=="Live glyphs")
 assert(frame.AnchorPoint.X>=0 and frame.AnchorPoint.X<=1 and frame.AnchorPoint.Y>=0 and frame.AnchorPoint.Y<=1 and frame.Position.X.Scale<0 and frame.Position.Y.Scale<0 and (frame.AbsolutePosition-o.AbsolutePosition).Magnitude<.0001)
 c.destroy();r:Destroy()
end)
test("geometry refresh reuses cached rich paint while alpha changes recompute it",function()
 local formattedAtStart=formatCalls
 local r,o,image,c,d=setup();d.scaled=false;d.shadows[1].spread=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.Text='<font transparency=".3">cached</font> outside';drain()
 local host=helperHost(o);local labels=copies(o);assert(#labels==4);local text={};for i,label in ipairs(labels)do text[i]=label.Text end
 local before=formatCalls;assert(before>formattedAtStart,"Actual contour formatting must be observed before testing cache reuse")
 o.AbsolutePosition=roblox.Vector2.new(32.125,24.625);o.AbsoluteSize=roblox.Vector2.new(181.25,42.5);drain()
 assert(helperHost(o)==host and formatCalls==before,"Geometry-only refresh must reuse the trusted rich-paint result")
 local refreshed=copies(o);for i,label in ipairs(refreshed)do assert(label==labels[i] and label.Text==text[i])end
 local constraint=host:FindFirstChildOfClass("Frame"):FindFirstChildOfClass("UISizeConstraint");assert(constraint.MinSize==roblox.Vector2.new(181.25,42.5) and constraint.MaxSize==constraint.MinSize)
 o.TextTransparency=.5;drain();assert(formatCalls>before,"Alpha changes must invalidate cached contour paint")
 local runs=controlledRuns(copies(o)[1].Text);assert(#runs==2);close(runs[1].transparency,(1-d.shadows[1].color[4]*.5*.7)^.25)
 c.destroy();r:Destroy()
end)
test("color-only native shadow themes refresh cached rich contours without changing owner paint",function()
 local r,o,image,c,d=setup();d.themeShadow="effect:text/shadow";d.baseline=nil;local shadow=instance("UIShadow");shadow.Enabled=false;shadow:SetAttribute("FramebridgeSource",pkg.sourceId);shadow:SetAttribute("FramebridgeId",d.themeShadow);shadow.Color=roblox.Color3.new(0,1,0);shadow.Transparency=0;shadow.BlurRadius=roblox.UDim.new(0,12);shadow.Spread=roblox.UDim2.fromOffset(3,3);shadow.Offset=roblox.UDim2.fromOffset(0,8);shadow.Parent=o
 o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.RichText=true;o.Text='<b>Visible</b><font color="#ff0000" transparency="1">HIDDEN</font>';drain()
 local originalText,originalColor=o.Text,o.TextColor3;local labels=copies(o);assert(#labels==4)
 for _,label in ipairs(labels)do local runs=controlledRuns(label.Text);assert(#runs==2 and runs[1].color=="#00FF00" and runs[2].color=="#00FF00");close(runs[2].transparency,1)end
 shadow.Color=roblox.Color3.new(1,0,1);drain()
 for i,label in ipairs(copies(o))do assert(label==labels[i] and label.TextColor3==shadow.Color);local runs=controlledRuns(label.Text);assert(#runs==2 and runs[1].color=="#FF00FF" and runs[2].color=="#FF00FF");close(runs[2].transparency,1)end
 assert(o.Text==originalText and o.TextColor3==originalColor);c.destroy();r:Destroy()
end)
test("owner padding is copied and changes invalidate the authored capture",function()
 local r,o,image,c,d=setup();local padding=instance("UIPadding");padding.PaddingLeft=roblox.UDim.new(0,6);padding.PaddingTop=roblox.UDim.new(.1,2);padding.Parent=o;drain()
 local constraint=instance("UITextSizeConstraint");constraint.MinTextSize=18;constraint.MaxTextSize=40;constraint.Parent=o;drain()
 assert(image.ImageTransparency==1 and #copies(o)==4)
 for _,l in ipairs(copies(o))do local copy=l:FindFirstChildOfClass("UIPadding");assert(copy and copy:GetAttribute("FramebridgeSource")==pkg.sourceId);local offset=paddingDisplacement(o,l);close(offset.X,d.shadows[1].offset[1]);close(offset.Y,d.shadows[1].offset[2])end
 assert(#helperHost(o):GetDescendants()+1==21,"Four glyphs with stroke, constraint and padding plus five host instances must fit the conservative budget")
 padding.PaddingLeft=roblox.UDim.new(0,12);drain();close(paddingDisplacement(o,copies(o)[1]).X,d.shadows[1].offset[1]);close(copies(o)[1]:FindFirstChildOfClass("UIPadding").PaddingLeft.Offset,12)
 padding:Destroy();constraint:Destroy();drain();assert(#copies(o)==0 and not helperHost(o) and image.ImageTransparency==.4)
 c.destroy();r:Destroy()
end)
test("rotated fractional shadow offsets preserve the owner-local displacement",function()
 local r,o,image,c,d=setup();d.shadows[1].offset={6.25,4.5};o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.Text="rotated shadow";o.Rotation=90;drain()
 for _,l in ipairs(copies(o))do
  local offset=paddingDisplacement(o,l);close(offset.X,6.25);close(offset.Y,4.5);assert(l.Rotation==90)
  -- Native glyph Rotation transforms this local padding displacement; the
  -- algebra here checks the data without claiming a rendered pixel sample.
  local radians=math.rad(l.Rotation);close(offset.X*math.cos(radians)-offset.Y*math.sin(radians),-4.5);close(offset.X*math.sin(radians)+offset.Y*math.cos(radians),6.25)
 end
 c.destroy();r:Destroy()
end)
test("theme geometry/color edits redraw native glyphs without a rectangular engine shadow",function()
 local r,o,image,c,d=setup();local shadow=instance("UIShadow");shadow:SetAttribute("FramebridgeSource",pkg.sourceId);shadow:SetAttribute("FramebridgeId","effect:text/theme-shadow");shadow.Enabled=false;shadow.Color=roblox.Color3.new(1,0,0);shadow.Transparency=.2;shadow.Offset=roblox.UDim2.fromOffset(5,3);shadow.BlurRadius=roblox.UDim.new(0,6);shadow.Spread=roblox.UDim2.fromOffset(2,2);shadow.Parent=o
 d.themeShadow="effect:text/theme-shadow";d.baseline=nil;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));drain();assert(#copies(o)==4 and image.ImageTransparency==1)
 shadow.Color=roblox.Color3.new(0,1,0);shadow.Offset=roblox.UDim2.fromOffset(7,4);drain();assert(copies(o)[1].TextColor3==shadow.Color and not shadow.Enabled);close(paddingDisplacement(o,copies(o)[1]).Y,4);c.destroy();r:Destroy()
end)
test("effect groups emit later blue shadow first and first red source shadow last",function()
 local r,o,image,c,d=setup()
 d.shadows={{color={1,0,0,.8},offset={3,5},radius=0,spread=0},{color={0,0,1,.4},offset={-7,9},radius=6,spread=1}}
 o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));o.Text="two source effects";o.TextTransparency=.25;drain();local labels=copies(o);assert(#labels==8)
 for index,label in ipairs(labels)do
  local blue=index<=4;local alpha=blue and .3 or .6;local ring=(index-1)%4+1
  assert(label.TextColor3==(blue and roblox.Color3.new(0,0,1)or roblox.Color3.new(1,0,0)))
  close(label.TextTransparency,ring==1 and 1-alpha or 1);close(label:FindFirstChildOfClass("UIStroke").Transparency,(1-alpha)^.25)
  local offset=paddingDisplacement(o,label);close(offset.X,blue and -7 or 3);close(offset.Y,blue and 9 or 5)
 end
 c.destroy();r:Destroy()
end)
test("a second mount replaces the prior controller and saved helpers without duplicates",function()
 local r,o,image,c=setup();o.Text="changed";drain();local previous=copies(o);local next=Decoration.mount(r);drain();assert(c.connectionCount()==0 and #copies(o)==4 and previous[1].destroyed and image.ImageTransparency==1);next.destroy();assert(next.connectionCount()==0 and #copies(o)==0);r:Destroy()
end)
test("synchronous constraint removal salvages custom generated-constraint descendants",function()
 local r,o,image,c=setup();o.Text="Live constrained text";local constraint=instance("UITextSizeConstraint");constraint.Parent=o;drain()
 local copy=copies(o)[1]:FindFirstChildOfClass("UITextSizeConstraint");assert(copy)
 local custom=instance("Script");custom.Source="-- preserve me";custom.Parent=copy
 constraint.Parent=nil;c.refresh()
 assert(copy.destroyed and not custom.destroyed and custom.Parent==o and custom.Source=="-- preserve me")
 drain();c.destroy();assert(not custom.destroyed and custom.Parent==o);r:Destroy()
end)
test("saved sibling paint markers cannot claim foreign-source or unowned host references",function()
 local r,o,image,c=setup();local foreign={}
 for _,kind in ipairs({"foreign folder","foreign reference","unmarked folder","unmarked reference"})do
  local folder=instance("Folder");folder:SetAttribute("FramebridgeTextDecorationHost",true);folder:SetAttribute("FramebridgeTextDecorationHelper",kind~="unmarked folder");folder:SetAttribute("FramebridgeSource",kind=="foreign folder" and "foreign" or pkg.sourceId);folder:SetAttribute("FramebridgeTextDecorationOwner",o:GetAttribute("FramebridgeId"));folder.Parent=r
  local ref=instance("ObjectValue");ref.Name="Owner";ref.Value=o;ref:SetAttribute("FramebridgeTextDecorationHelper",kind~="unmarked reference");ref:SetAttribute("FramebridgeSource",kind=="foreign reference" and "foreign" or pkg.sourceId);ref:SetAttribute("FramebridgeTextDecorationOwner",o:GetAttribute("FramebridgeId"));ref.Parent=folder
  local script=instance("Script");script.Source="-- untouched";script.Parent=folder;table.insert(foreign,{folder,ref,script})
 end
 o.Text="Live current glyphs";drain();local replacement=Decoration.mount(r);drain();replacement.destroy()
 for _,objects in ipairs(foreign)do assert(not objects[1].destroyed and objects[1].Parent==r and not objects[2].destroyed and objects[2].Parent==objects[1] and not objects[3].destroyed and objects[3].Parent==objects[1])end
 r:Destroy()
end)
for _,transition in ipairs({"capture restoration","controller replacement","metadata removal","controller disposal"})do
 test("helper cleanup salvages custom descendants during "..transition,function()
  local r,o,image,c=setup();local authored=o.Text;o.Text="application customizations";drain();local previous=helperHost(o);local labels=copies(o);assert(previous and #labels==4)
  local userFrame=instance("Frame");userFrame.Name="Application frame";userFrame:SetAttribute("ApplicationTag","keep me");userFrame.Parent=previous:FindFirstChildOfClass("Frame")
  local userLabel=instance("TextLabel");userLabel.Text="Preserved subtree";userLabel.Parent=userFrame
  local userScript=instance("Script");userScript.Source="return 'application source'";userScript.Parent=labels[1]:FindFirstChildOfClass("UIStroke")
  local markedScripts={}
  for index,class in ipairs({"Script","LocalScript","ModuleScript"})do
   local script=instance(class);script.Name="Marked application "..class;script.Source="return 'marked "..class.."'"
   script:SetAttribute("FramebridgeTextDecorationHelper",true);script:SetAttribute("FramebridgeSource",pkg.sourceId);script:SetAttribute("FramebridgeTextDecorationOwner",o:GetAttribute("FramebridgeId"))
   script.Parent=index==1 and o or labels[index];table.insert(markedScripts,script)
  end
  local foreign=instance("Frame");foreign:SetAttribute("FramebridgeTextDecorationHelper",true);foreign:SetAttribute("FramebridgeSource","foreign source");foreign:SetAttribute("FramebridgeTextDecorationOwner",o:GetAttribute("FramebridgeId"));foreign.Parent=labels[1]
  local otherOwner=instance("Frame");otherOwner:SetAttribute("FramebridgeTextDecorationHelper",true);otherOwner:SetAttribute("FramebridgeSource",pkg.sourceId);otherOwner:SetAttribute("FramebridgeTextDecorationOwner","another owner");otherOwner.Parent=previous
  local replacement
  if transition=="capture restoration"then o.Text=authored;drain();assert(image.ImageTransparency==.4 and #copies(o)==0)
  elseif transition=="controller replacement"then replacement=Decoration.mount(r);drain();assert(c.connectionCount()==0 and #copies(o)==4 and helperHost(o)~=previous)
  elseif transition=="metadata removal"then o:SetAttribute("FramebridgeTextDecoration",nil);drain();assert(#copies(o)==0 and image.ImageTransparency==1)
  else c.destroy();drain();assert(c.connectionCount()==0 and #copies(o)==0)end
  local function preserved()
   assert(previous.destroyed and not userFrame.destroyed and userFrame.Parent==o and userFrame:GetAttribute("ApplicationTag")=="keep me")
   assert(not userLabel.destroyed and userLabel.Parent==userFrame and userLabel.Text=="Preserved subtree")
   assert(not userScript.destroyed and userScript.Parent==o and userScript.Source=="return 'application source'")
   for _,script in ipairs(markedScripts)do assert(not script.destroyed and script.Parent==o and script.Source=="return 'marked "..script.ClassName.."'","A helper marker cannot make LuaSourceContainer disposable")end
   assert(not foreign.destroyed and foreign.Parent==o and not otherOwner.destroyed and otherOwner.Parent==o,"Foreign source/owner markers do not establish runtime ownership")
  end
  preserved()
  -- A later remount must not reinterpret the salvaged application nodes as helpers.
  local remount=Decoration.mount(r);drain();preserved();remount.destroy();preserved();assert(remount.connectionCount()==0)
  if replacement then replacement.destroy()end;c.destroy();r:Destroy()
 end)
end
test("destroyed nested owner releases external helpers and salvages custom content to its live authored parent",function()
 local r,o,image,c=setup();local authoredParent=instance("Frame");authoredParent.Name="Live authored parent";authoredParent.Parent=r;o.Parent=authoredParent;o.Text="owner destruction";drain()
 local host=helperHost(o);assert(host and host.Parent==authoredParent);local labels=copies(o);assert(#labels==4)
 local script=instance("LocalScript");script.Source="return 'retain after owner destruction'";script.Parent=labels[1]:FindFirstChildOfClass("UIStroke")
 local customFrame=instance("Frame");customFrame.Name="Retained application frame";customFrame.Parent=host:FindFirstChildOfClass("Frame")
 local nested=instance("TextLabel");nested.Text="Retained descendants";nested.Parent=customFrame
 o:Destroy();drain();assert(o.destroyed and o.Parent==nil and host.destroyed and not authoredParent.destroyed)
 assert(not pcall(function()script.Parent=o end),"The fake harness must reject parenting into a destroyed target")
 assert(not script.destroyed and script.Parent==authoredParent and script.Source=="return 'retain after owner destruction'")
 assert(not customFrame.destroyed and customFrame.Parent==authoredParent and not nested.destroyed and nested.Parent==customFrame and nested.Text=="Retained descendants")
 for _,child in ipairs(authoredParent:GetChildren())do assert(child:GetAttribute("FramebridgeTextDecorationHost")~=true,"External helper hosts must leave with the destroyed owner")end
 c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("same-ID component copies keep independent exact-instance helper ownership",function()
 local r,o,image,c=setup();local twin=o:Clone();twin.Parent=r;o.Text="first copy";twin.Text="second copy";drain()
 local first,second=helperHost(o),helperHost(twin);assert(first and second and first~=second and #copies(o)==4 and #copies(twin)==4)
 assert(first:FindFirstChild("Owner").Value==o and second:FindFirstChild("Owner").Value==twin)
 for _,l in ipairs(copies(o))do assert(l.Text=="first copy")end;for _,l in ipairs(copies(twin))do assert(l.Text=="second copy")end
 o:Destroy();drain();assert(first.destroyed and #copies(twin)==4 and not helperHost(twin).destroyed,"Removing one same-ID copy must preserve its sibling")
 c.destroy();assert(c.connectionCount()==0 and second.destroyed);r:Destroy()
end)
test("a decorated root releases sibling hosts on detach and recreates them after reparent and reattach",function()
 local r,o,image,c=setup();c.destroy();o.Parent=nil;r:Destroy()
 local firstParent=instance("ScreenGui");local secondParent=instance("ScreenGui");o.Parent=firstParent
 local rootController=Decoration.mount(o);o.Text="root owner";drain();local first=helperHost(o);assert(first and first.Parent==firstParent and not first:IsDescendantOf(o))
 o.Parent=nil;drain();assert(first.destroyed and #copies(o)==0 and image.Parent==o and image.ImageTransparency==1)
 o.Parent=secondParent;drain();local second=helperHost(o);assert(second and second~=first and second.Parent==secondParent and #copies(o)==4)
 o.Parent=firstParent;drain();assert(second.destroyed and helperHost(o).Parent==firstParent and #copies(o)==4)
 local last=helperHost(o);rootController.destroy();assert(rootController.connectionCount()==0 and last.destroyed);firstParent:Destroy();secondParent:Destroy()
end)
test("clone remount cleans only saved helpers whose Owner references the cloned instance",function()
 local r,o,image,c=setup();o.Text="cloned live state";drain();local original=helperHost(o);local clonedRoot=r:Clone()
 local clonedOwner=clonedRoot:FindFirstChildOfClass("TextLabel");local saved=helperHost(clonedOwner)
 assert(saved and saved~=original and saved:FindFirstChild("Owner").Value==clonedOwner,"Clone must model internal ObjectValue reference remapping")
 local clonedController=Decoration.mount(clonedRoot);drain();assert(saved.destroyed and #copies(clonedOwner)==4 and helperHost(clonedOwner)~=saved)
 assert(helperHost(o)==original and not original.destroyed and #copies(o)==4,"Clone cleanup must not remove original helpers")
 clonedController.destroy();assert(clonedController.connectionCount()==0 and #copies(clonedOwner)==0);c.destroy();clonedRoot:Destroy();r:Destroy()
end)
test("invalidated metadata removes live hosts and later valid metadata can recover",function()
 local r,o,image,c,d=setup();o.Text="metadata refresh";drain();local previous=helperHost(o);d.version=2;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));drain()
 assert(previous.destroyed and not helperHost(o) and image.ImageTransparency==1 and o:GetAttribute("FramebridgeTextDecorationStatus")==nil)
 d.version=1;o:SetAttribute("FramebridgeTextDecoration",serde.encode("json",d));drain();assert(#copies(o)==4 and helperHost(o)~=previous)
 c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("metadata removal and owner deletion dispose all owned helpers and subscriptions",function()
 local r,o,image,c=setup();o.Text="changed";drain();o:SetAttribute("FramebridgeTextDecoration",nil);drain();assert(#copies(o)==0 and image.ImageTransparency==1);o:Destroy();drain();c.destroy();assert(c.connectionCount()==0);r:Destroy()
end)
test("Edit watcher yields ownership to runtime and restores only in Edit",function()
 local host=instance("Folder");local r,o,image,c=setup();c.destroy();r.Parent=host
 local edit=true;local run={IsEdit=function()return edit end,Heartbeat=signal()};local watcher=Decoration.watch(host,run);o.Text="changed";drain();assert(#copies(o)==4)
 edit=false;run.Heartbeat:Fire();drain();assert(#copies(o)==0 and image.ImageTransparency==1)
 local play=Decoration.mount(r);drain();assert(#copies(o)==4);watcher.destroy();assert(#copies(o)==4,"Edit teardown must not destroy Play controller helpers");play.destroy();assert(play.connectionCount()==0);host:Destroy()
end)
print(serde.encode("json",{passed=passed,failed=0,scope="Trusted glyph refresh/lifecycle with simulated signals and real Roblox datatypes; native rendered pixels remain separate"}))
