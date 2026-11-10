-- Actual production Decoration renderer in an owned blank-place scene.
assert(not _G.FramebridgeLiveTextGeometryQA,"Clean existing geometry QA first")
local s=Importer.stage(Importer.decode(fixture),{},false,runtimeSource)
local root=s.roots[1];root.Name="FramebridgeLiveTextGeometryQA";root.Parent=game:GetService("CoreGui")
local panel=s.byId["effect:root"].instance;panel.Size=UDim2.fromOffset(700,650);panel.Position=UDim2.fromOffset(80,100);panel.Rotation=12;panel.BackgroundColor3=Color3.fromRGB(30,45,60);panel.BackgroundTransparency=0
local panelScale=Instance.new("UIScale");panelScale.Scale=.85;panelScale.Parent=panel
local template=s.byId["effect:text"].instance
local data=game:GetService("HttpService"):JSONDecode(template:GetAttribute("FramebridgeTextDecoration"));data.baseline=nil;data.captured=nil;data.capturedAlpha=nil;data.shadows={{color={1,0,1,1},offset={0,0},radius=0,spread=0}}
local function make(parent,name,position)
 local o=template:Clone();for _,child in ipairs(o:GetChildren())do child:Destroy()end
 o.Name=name;o:SetAttribute("FramebridgeId",name);o:SetAttribute("FramebridgeTextDecoration",game:GetService("HttpService"):JSONEncode(data));o.Size=UDim2.fromOffset(340,60);o.Position=position or UDim2.fromOffset(0,0);o.AnchorPoint=Vector2.zero;o.BackgroundTransparency=1;o.Text=name;o.TextSize=32;o.TextTransparency=0;o.TextColor3=Color3.new(1,1,1);o.TextXAlignment=Enum.TextXAlignment.Left;o.TextYAlignment=Enum.TextYAlignment.Center;o.TextWrapped=false;o.Rotation=0;o.ZIndex=2;o.Parent=parent;return o
end
local free=make(panel,"Live white: padding and clip",UDim2.fromOffset(35,30));free.Rotation=10;free.ClipsDescendants=true
local scale=Instance.new("UIScale");scale.Scale=.85;scale.Parent=free
local pad=Instance.new("UIPadding");pad.PaddingLeft=UDim.new(0,17);pad.PaddingRight=UDim.new(0,5);pad.PaddingTop=UDim.new(0,3);pad.PaddingBottom=UDim.new(0,9);pad.Parent=free
local listHost=Instance.new("Frame");listHost.BackgroundTransparency=1;listHost.Size=UDim2.fromOffset(600,170);listHost.Position=UDim2.fromOffset(35,180);listHost.Parent=panel
local listPad=Instance.new("UIPadding");listPad.PaddingLeft=UDim.new(0,14);listPad.PaddingTop=UDim.new(0,10);listPad.Parent=listHost
local layout=Instance.new("UIListLayout");layout.Padding=UDim.new(0,8);layout.SortOrder=Enum.SortOrder.LayoutOrder;layout.Parent=listHost
local first=make(listHost,"List white one");first.LayoutOrder=1;local second=make(listHost,"List white two");second.LayoutOrder=2
local gridHost=Instance.new("Frame");gridHost.BackgroundTransparency=1;gridHost.Size=UDim2.fromOffset(600,100);gridHost.Position=UDim2.fromOffset(35,380);gridHost.Parent=panel
local grid=Instance.new("UIGridLayout");grid.CellSize=UDim2.fromOffset(270,65);grid.CellPadding=UDim2.fromOffset(8,4);grid.SortOrder=Enum.SortOrder.LayoutOrder;grid.Parent=gridHost
local gridFirst=make(gridHost,"Grid white one");gridFirst.LayoutOrder=1;local gridSecond=make(gridHost,"Grid white two");gridSecond.LayoutOrder=2
local scroll=Instance.new("ScrollingFrame");scroll.BackgroundTransparency=1;scroll.ScrollBarThickness=0;scroll.Size=UDim2.fromOffset(580,100);scroll.Position=UDim2.fromOffset(35,510);scroll.CanvasSize=UDim2.fromOffset(650,500);scroll.CanvasPosition=Vector2.new(50,100);scroll.Parent=panel
local sp=Instance.new("UIPadding");sp.PaddingLeft=UDim.new(0,14);sp.PaddingTop=UDim.new(0,10);sp.Parent=scroll
local scrollOwner=make(scroll,"Rotated scrolling white",UDim2.fromOffset(60,180));scrollOwner.Rotation=8
local plain=scroll:Clone();for _,child in ipairs(plain:GetChildren())do if child:IsA("TextLabel")then child:Destroy()end end;plain.Name="Plain scroll";plain.Size=UDim2.fromOffset(500,150);plain.Position=UDim2.fromOffset(780,150);plain.CanvasPosition=Vector2.new(70,160);plain.Parent=root
local plainOwner=make(plain,"Plain scrolling white",UDim2.fromOffset(150,230));plainOwner.AnchorPoint=Vector2.new(.5,.5);plainOwner.Rotation=-15
local own=Instance.new("UIScale");own.Scale=.75;own.Parent=plainOwner
local offset=make(panel,"Rotated offset white",UDim2.fromOffset(390,40));offset.Rotation=90
local offsetData=game:GetService("HttpService"):JSONDecode(offset:GetAttribute("FramebridgeTextDecoration"));offsetData.shadows[1].offset={0,12};offset:SetAttribute("FramebridgeTextDecoration",game:GetService("HttpService"):JSONEncode(offsetData))
local auto={}
local autoHost=Instance.new("Frame");autoHost.BackgroundTransparency=1;autoHost.Size=UDim2.fromOffset(1300,750);autoHost.Parent=root
local autoScale=Instance.new("UIScale");autoScale.Scale=1;autoScale.Parent=autoHost
for i,axis in ipairs({Enum.AutomaticSize.X,Enum.AutomaticSize.Y,Enum.AutomaticSize.XY})do
 local sf=Instance.new("ScrollingFrame");sf.BackgroundTransparency=1;sf.Size=UDim2.fromOffset(260,70);sf.Position=UDim2.fromOffset(780,320+(i-1)*90);sf.ScrollBarThickness=0;sf.CanvasSize=UDim2.fromOffset(650,300);sf.AutomaticCanvasSize=axis;sf.Parent=autoHost
 local padding=Instance.new("UIPadding");padding.PaddingLeft=UDim.new(0,11);padding.PaddingTop=UDim.new(0,7);padding.Parent=sf
 local o=make(sf,"Auto "..axis.Name.." white",UDim2.fromOffset(60,120));local md=game:GetService("HttpService"):JSONDecode(o:GetAttribute("FramebridgeTextDecoration"));md.shadows[1].offset={800,800};md.shadows[1].radius=16;o:SetAttribute("FramebridgeTextDecoration",game:GetService("HttpService"):JSONEncode(md));local own=Instance.new("UIScale");own.Scale=.93;own.Parent=o;o.Size=UDim2.fromOffset(301,67);o.AnchorPoint=Vector2.new(.2,.3);o.Rotation=22
 local reference=sf:Clone();reference.Name="Independent auto reference";reference.Position=UDim2.fromOffset(1400,0);reference.Parent=autoHost
 local referenceOwner=reference:FindFirstChildOfClass("TextLabel");referenceOwner:SetAttribute("FramebridgeTextDecoration",nil);referenceOwner:SetAttribute("FramebridgeId",nil)
 table.insert(auto,{frame=sf,owner=o,own=own,reference=reference,referenceOwner=referenceOwner,referenceScale=referenceOwner:FindFirstChildOfClass("UIScale")})
end
local tiny={}
for index,axis in ipairs({Enum.AutomaticSize.None,Enum.AutomaticSize.X,Enum.AutomaticSize.Y,Enum.AutomaticSize.XY})do
 local sf=Instance.new("ScrollingFrame");sf.Size=UDim2.fromOffset(360,110);sf.Position=UDim2.fromOffset(780,650+index*130);sf.CanvasSize=UDim2.fromOffset(650,300);sf.AutomaticCanvasSize=axis;sf.ScrollBarThickness=0;sf.BackgroundTransparency=1;sf.Rotation=12;sf.Parent=autoHost
 local ps=Instance.new("UIScale");ps.Scale=1.12;ps.Parent=sf
 local pad=Instance.new("UIPadding");pad.PaddingLeft=UDim.new(0,11);pad.PaddingTop=UDim.new(0,7);pad.Parent=sf
 local o=make(sf,"Tiny "..axis.Name,UDim2.new(.13,40,.19,95));o.AnchorPoint=Vector2.new(.3,.2);o.Rotation=10
 local os=Instance.new("UIScale");os.Scale=.73;os.Parent=o
 local constraint=Instance.new("UISizeConstraint");constraint.MinSize=Vector2.new(.3,.4);constraint.MaxSize=constraint.MinSize;constraint.Parent=o
 local reference=sf:Clone();reference.Position=UDim2.fromOffset(1400,1000);reference.Parent=autoHost;local refOwner=reference:FindFirstChildOfClass("TextLabel");refOwner:SetAttribute("FramebridgeTextDecoration",nil);refOwner:SetAttribute("FramebridgeId",nil)
 table.insert(tiny,{frame=sf,owner=o,reference=reference})
end
local listReference=listHost:Clone();listReference.Position=UDim2.fromOffset(1400,0);listReference.Parent=panel
local gridReference=gridHost:Clone();gridReference.Position=UDim2.fromOffset(1400,200);gridReference.Parent=panel
for _,ref in ipairs({listReference,gridReference})do for _,o in ipairs(ref:GetChildren())do if o:IsA("TextLabel")then o:SetAttribute("FramebridgeTextDecoration",nil);o:SetAttribute("FramebridgeId",nil)end end end
template:Destroy();task.wait(.1)
local before={first.AbsolutePosition,second.AbsolutePosition,layout.AbsoluteContentSize,gridFirst.AbsolutePosition,gridSecond.AbsolutePosition,gridFirst.AbsoluteSize,gridSecond.AbsoluteSize,grid.AbsoluteContentSize}
for _,a in ipairs(auto)do a.before=a.frame.AbsoluteCanvasSize end
local c=Decoration.mount(root);task.wait(.1)
local function glyph(owner)
 for _,folder in ipairs(owner.Parent:GetChildren())do local ref=folder:IsA("Folder") and folder:GetAttribute("FramebridgeTextDecorationHost") and folder:FindFirstChild("Owner");if ref and ref.Value==owner then return folder:FindFirstChildOfClass("Frame"):FindFirstChildOfClass("TextLabel"),folder end end
end
local function v(p)return {p.X,p.Y}end
local function read(o)
 local g,h=glyph(o);assert(g,"Missing live glyph")
 local frame=h:FindFirstChildOfClass("Frame");local constraint=frame:FindFirstChildOfClass("UISizeConstraint")
 return {text=o.Text,ownerPosition=v(o.AbsolutePosition),glyphPosition=v(g.AbsolutePosition),ownerSize=v(o.AbsoluteSize),glyphSize=v(g.AbsoluteSize),ownerRotation=o.AbsoluteRotation,glyphRotation=g.AbsoluteRotation,positionError=(g.AbsolutePosition-o.AbsolutePosition).Magnitude,sizeError=(g.AbsoluteSize-o.AbsoluteSize).Magnitude,ownerBounds=v(o.TextBounds),glyphBounds=v(g.TextBounds),ownerClips=o.ClipsDescendants,glyphClips=g.ClipsDescendants,hostClips=h:FindFirstChildOfClass("Frame").ClipsDescendants,hostOwnerExact=h:FindFirstChild("Owner").Value==o,hostSizeScale=v(Vector2.new(frame.Size.X.Scale,frame.Size.Y.Scale)),constraintMin=v(constraint.MinSize),constraintMax=v(constraint.MaxSize)}
end
local results={free=read(free),listSecond=read(second),gridFirst=read(gridFirst),gridSecond=read(gridSecond),rotatedScroll=read(scrollOwner),plainScroll=read(plainOwner),offset=read(offset),auto={}}
for _,a in ipairs(auto)do local r=read(a.owner);r.canvasBefore=v(a.before);r.canvasAfter=v(a.frame.AbsoluteCanvasSize);r.canvasError=(a.frame.AbsoluteCanvasSize-a.before).Magnitude;r.axis=a.frame.AutomaticCanvasSize.Name;table.insert(results.auto,r)end
local angle=math.rad(offset.AbsoluteRotation);local z=1;local p=offset;while p do if p:IsA("GuiObject")then local ui=p:FindFirstChildOfClass("UIScale");if ui then z*=ui.Scale end end;p=p.Parent end
local expected=Vector2.new(-12*math.sin(angle),12*math.cos(angle))*z
local og=glyph(offset);local gp=og:FindFirstChildOfClass("UIPadding");local size=offset.AbsoluteSize/z
local dx=gp.PaddingLeft.Scale*size.X+gp.PaddingLeft.Offset;local dy=gp.PaddingTop.Scale*size.Y+gp.PaddingTop.Offset
results.offset.offsetError=(Vector2.new(dx,dy)-Vector2.new(0,12)).Magnitude;results.offset.localPaddingDelta={dx,dy};results.offset.paddingSum={gp.PaddingLeft.Scale+gp.PaddingRight.Scale,gp.PaddingTop.Scale+gp.PaddingBottom.Scale};results.offset.expectedPaintDelta=v(expected);results.offset.guiPositionError=(og.AbsolutePosition-offset.AbsolutePosition).Magnitude
results.listUnchanged=(first.AbsolutePosition-before[1]).Magnitude<.1 and (second.AbsolutePosition-before[2]).Magnitude<.1 and (layout.AbsoluteContentSize-before[3]).Magnitude<.1
results.gridUnchanged=(gridFirst.AbsolutePosition-before[4]).Magnitude<.1 and (gridSecond.AbsolutePosition-before[5]).Magnitude<.1 and (gridFirst.AbsoluteSize-before[6]).Magnitude<.1 and (gridSecond.AbsoluteSize-before[7]).Magnitude<.1 and (grid.AbsoluteContentSize-before[8]).Magnitude<.1
_G.FramebridgeLiveTextGeometryQA={stage=s,root=root,controller=c,free=free,offset=offset}
local dynamic={};local failures={}
local function check(name,value)if not value then table.insert(failures,name)end end
local function sample(name)
 local phase={name=name,owners={},auto={},tiny={}}
 for _,o in ipairs({free,second,gridSecond,scrollOwner,plainOwner})do local r=read(o);table.insert(phase.owners,r);check(name..": "..o.Text.." pose",r.positionError<.01 and r.sizeError<.01 and math.abs(r.ownerRotation-r.glyphRotation)<.001);check(name..": "..o.Text.." text",r.ownerBounds[1]==r.glyphBounds[1] and r.ownerBounds[2]==r.glyphBounds[2])end
 for _,a in ipairs(auto)do local r=read(a.owner);r.axis=a.frame.AutomaticCanvasSize.Name;r.canvasActual=v(a.frame.AbsoluteCanvasSize);r.canvasReference=v(a.reference.AbsoluteCanvasSize);r.canvasError=(a.frame.AbsoluteCanvasSize-a.reference.AbsoluteCanvasSize).Magnitude;table.insert(phase.auto,r);check(name..": auto "..r.axis.." canvas",r.canvasError<.01);check(name..": auto "..r.axis.." pose",r.positionError<.01 and r.sizeError<.01);check(name..": auto "..r.axis.." text",r.ownerBounds[1]==r.glyphBounds[1] and r.ownerBounds[2]==r.glyphBounds[2])end
 for _,a in ipairs(tiny)do local r=read(a.owner);r.axis=a.frame.AutomaticCanvasSize.Name;r.canvasError=(a.frame.AbsoluteCanvasSize-a.reference.AbsoluteCanvasSize).Magnitude;table.insert(phase.tiny,r);check(name..": tiny "..r.axis.." pose",r.positionError<.01 and r.sizeError<.01);check(name..": tiny "..r.axis.." canvas",r.canvasError<.01)end
 phase.listError=(layout.AbsoluteContentSize-listReference:FindFirstChildOfClass("UIListLayout").AbsoluteContentSize).Magnitude
 phase.gridError=(grid.AbsoluteContentSize-gridReference:FindFirstChildOfClass("UIGridLayout").AbsoluteContentSize).Magnitude
 check(name..": list membership",phase.listError<.01);check(name..": grid membership",phase.gridError<.01);table.insert(dynamic,phase)
end
sample("initial")
-- Native rendered updates, rather than a duplicate implementation of host math.
for index,a in ipairs(auto)do for _,sf in ipairs({a.frame,a.reference})do sf.CanvasPosition=Vector2.new(25,60);sf.Size=UDim2.fromOffset(310,95);sf.CanvasSize=UDim2.fromOffset(0,0)end;a.owner.Size=UDim2.fromOffset(199,53);a.referenceOwner.Size=a.owner.Size;a.own.Scale=.73;a.referenceScale.Scale=.73 end
autoScale.Scale=.81;panelScale.Scale=.7;scale.Scale=.64;panel.Size=UDim2.fromOffset(740,680);scroll.CanvasPosition=Vector2.new(25,145);plain.CanvasPosition=Vector2.new(35,185);listHost.Size=UDim2.fromOffset(620,180);listReference.Size=listHost.Size;grid.CellSize=UDim2.fromOffset(243,71);gridReference:FindFirstChildOfClass("UIGridLayout").CellSize=grid.CellSize
task.wait(.1);task.wait(.1);sample("zero canvas / smaller own+ancestor scale / changed viewport / scrolled")
for _,a in ipairs(auto)do for _,sf in ipairs({a.frame,a.reference})do sf.CanvasPosition=Vector2.new(5,15);sf.Size=UDim2.fromOffset(230,80);sf.CanvasSize=UDim2.fromOffset(1,1)end;a.owner.Size=UDim2.fromOffset(373,88);a.referenceOwner.Size=a.owner.Size;a.own.Scale=1.17;a.referenceScale.Scale=1.17 end
autoScale.Scale=1.12;panelScale.Scale=1.08;scale.Scale=1.13;panel.Size=UDim2.fromOffset(690,640);scroll.CanvasPosition=Vector2.new(75,90);plain.CanvasPosition=Vector2.new(20,130);listHost.Size=UDim2.fromOffset(570,190);listReference.Size=listHost.Size;grid.CellSize=UDim2.fromOffset(257,59);gridReference:FindFirstChildOfClass("UIGridLayout").CellSize=grid.CellSize
task.wait(.1);task.wait(.1);sample("tiny canvas / larger own+ancestor scale / changed viewport / scrolled")
-- Native fractional scrolling may snap to device pixels while retaining the raw getter.
local fractions={}
for _,fraction in ipairs({10.1,10.49,10.51,10.8,11.1})do
 scroll.CanvasPosition=Vector2.new(fraction,fraction);plain.CanvasPosition=Vector2.new(fraction,fraction);for _,a in ipairs(tiny)do a.frame.CanvasPosition=Vector2.new(fraction,fraction);a.reference.CanvasPosition=a.frame.CanvasPosition end;task.wait(.1)
 for _,o in ipairs({scrollOwner,plainOwner})do local r=read(o);r.fraction=fraction;table.insert(fractions,r);check("fraction "..fraction..": "..o.Text.." pose",r.positionError<.01 and r.sizeError<.01)end
end
local tinyFractions={};for _,a in ipairs(tiny)do local r=read(a.owner);r.axis=a.frame.AutomaticCanvasSize.Name;r.canvasError=(a.frame.AbsoluteCanvasSize-a.reference.AbsoluteCanvasSize).Magnitude;table.insert(tinyFractions,r);check("tiny fractional "..r.axis.." pose",r.positionError<.01 and r.sizeError<.01);check("tiny fractional "..r.axis.." canvas",r.canvasError<.01)end
results.tinyFractional=tinyFractions;results.fractionalScroll=fractions;results.dynamic=dynamic;results.failed=#failures;results.failures=failures
return {results=results,listeners=c.connectionCount(),scope="Actual production renderer; native geometry/list/grid/manual+automatic scrolling/offset/padding/clipping; screenshot required for foreground ordering"}
