// Trusted product code; metadata contains bounded visual values, never source.
export const TEXT_DECORATION_RUNTIME = String.raw`local TextDecoration = {}
local Http = game:GetService("HttpService")
local function finite(v,low,high) return type(v)=="number" and v==v and v>=low and v<=high end
local function fields(v,allowed)
    if type(v)~="table" then return false end
    for k in pairs(v) do if not allowed[k] then return false end end
    return true
end
local function keys(words) local out={};for k in words:gmatch("%S+") do out[k]=true end;return out end
local function tuple(v,n,low,high)
    if type(v)~="table" or #v~=n then return false end
    local count=0;for k,x in pairs(v) do count+=1;if type(k)~="number" or k%1~=0 or k<1 or k>n or not finite(x,low,high) then return false end end
    return count==n
end
function TextDecoration.valid(d)
    if not fields(d,keys("version reference scaled shadows baseline captured capturedAlpha themeShadow")) or d.version~=1 or type(d.scaled)~="boolean" or not tuple(d.reference,2,.000001,1e7) or type(d.shadows)~="table" or #d.shadows>8 or (#d.shadows==0 and not d.themeShadow) then return false end
    local count=0
    for k,s in pairs(d.shadows) do
        count+=1
        if type(k)~="number" or k%1~=0 or k<1 or k>#d.shadows or not fields(s,keys("color offset radius spread")) or not tuple(s.color,4,0,1) or not tuple(s.offset,2,-1000,1000) or not finite(s.radius,0,1000) or not finite(s.spread,-1000,1000) then return false end
    end
    if count~=#d.shadows then return false end
    if d.captured~=nil and (type(d.captured)~="string" or #d.captured>256) or d.themeShadow~=nil and (type(d.themeShadow)~="string" or #d.themeShadow>256) then return false end
    if d.capturedAlpha~=nil and (not d.captured or not finite(d.capturedAlpha,0,1)) then return false end
    local b=d.baseline
    if b~=nil then
        if not fields(b,keys("text font size rich scaled wrapped lineHeight x y truncate graphemes alpha color")) or type(b.text)~="string" or #b.text>8192 or type(b.font)~="table" or #b.font~=3 or type(b.font[1])~="string" or #b.font[1]>512 or not keys("Thin ExtraLight Light Regular Medium SemiBold Bold ExtraBold Heavy")[b.font[2]] or not keys("Normal Italic")[b.font[3]] or not finite(b.size,1,100) or type(b.rich)~="boolean" or type(b.scaled)~="boolean" or type(b.wrapped)~="boolean" or not finite(b.lineHeight,1,3) or not keys("Left Center Right")[b.x] or not keys("Top Center Bottom")[b.y] or not keys("None AtEnd SplitWord")[b.truncate] or not finite(b.graphemes,-1,1e9) or b.graphemes%1~=0 or not finite(b.alpha,0,1) or not tuple(b.color,3,0,1) then return false end
    end
    return true
end
local function disconnect(list) for _,c in ipairs(list) do c:Disconnect() end;table.clear(list) end
local function zoom(owner)
    local scale=1;local current=owner
    while current do
        if current:IsA("GuiObject") then local ui=current:FindFirstChildOfClass("UIScale");if ui then scale*=ui.Scale end end
        current=current.Parent
    end
    return scale
end
local function basis(parent)
    local scale=zoom(parent)
    local origin,size=Vector2.zero,parent.AbsoluteSize
    if parent:IsA("ScrollingFrame") then origin=-parent.CanvasPosition;size=parent.AbsoluteCanvasSize end
    local padding=parent:FindFirstChildOfClass("UIPadding")
    if padding then
        local left=padding.PaddingLeft.Scale*size.X+padding.PaddingLeft.Offset*scale
        local right=padding.PaddingRight.Scale*size.X+padding.PaddingRight.Offset*scale
        local top=padding.PaddingTop.Scale*size.Y+padding.PaddingTop.Offset*scale
        local bottom=padding.PaddingBottom.Scale*size.Y+padding.PaddingBottom.Offset*scale
        origin+=Vector2.new(left,top);size=Vector2.new(math.max(0,size.X-left-right),math.max(0,size.Y-top-bottom))
    end
    local sizing=size
    if parent:IsA("ScrollingFrame") and parent.AutomaticCanvasSize~=Enum.AutomaticSize.None then
        sizing=parent.AbsoluteSize
        local axis=parent.AutomaticCanvasSize
        size=Vector2.new((axis==Enum.AutomaticSize.X or axis==Enum.AutomaticSize.XY) and sizing.X or size.X,(axis==Enum.AutomaticSize.Y or axis==Enum.AutomaticSize.XY) and sizing.Y or size.Y)
    end
    return origin,size,sizing
end
local function alignBasis(owner,frame)
    if owner.AbsoluteSize.X<=0 or owner.AbsoluteSize.Y<=0 or (frame.AbsoluteSize-owner.AbsoluteSize).Magnitude>.001 then return false end
    local delta=frame.AbsolutePosition-owner.AbsolutePosition
    if delta.Magnitude<=.0005 then return true end
    local parent=owner.Parent
    while parent and not parent:IsA("GuiBase2d") do parent=parent.Parent end
    if not parent then return false end
    local angle=0;pcall(function() angle=parent.AbsoluteRotation end)
    local radians=math.rad(-angle)
    local localDelta=Vector2.new(delta.X*math.cos(radians)-delta.Y*math.sin(radians),delta.X*math.sin(radians)+delta.Y*math.cos(radians))
    local anchor=frame.AnchorPoint+Vector2.new(localDelta.X/owner.AbsoluteSize.X,localDelta.Y/owner.AbsoluteSize.Y)
    -- Shift the integer basis when it can put the measured target inside the
    -- native 0..1 anchor interval, including zoom below a logical pixel.
    local q=zoom(parent)
    if not finite(q,.000001,1e7) then return false end
    local function steps(a,size)
        if a<0 then return math.ceil(-a*size/q) elseif a>1 then return math.floor((1-a)*size/q) end
        return 0
    end
    local x,y=steps(anchor.X,owner.AbsoluteSize.X),steps(anchor.Y,owner.AbsoluteSize.Y)
    local adjusted=anchor+Vector2.new(x*q/owner.AbsoluteSize.X,y*q/owner.AbsoluteSize.Y)
    local validX=adjusted.X>=0 and adjusted.X<=1
    local validY=adjusted.Y>=0 and adjusted.Y<=1
    if not validX or not validY then
        -- Subpixel owners can be narrower than an Offset step. A nonpositive
        -- Scale residual preserves their pose without growing automatic canvas
        -- extents when Roblox evaluates that Scale against the larger canvas.
        -- Choose independently per axis: a normal Y must retain its legal anchor
        -- even if only X needs the subpixel residual.
        local _,size=basis(parent)
        if (not validX and size.X<=0) or (not validY and size.Y<=0) then return false end
        local sx=validX and frame.Position.X.Scale or frame.Position.X.Scale-localDelta.X/size.X
        local sy=validY and frame.Position.Y.Scale or frame.Position.Y.Scale-localDelta.Y/size.Y
        if not finite(sx,-1e7,0) or not finite(sy,-1e7,0) then return false end
        frame.Position=UDim2.new(sx,frame.Position.X.Offset+(validX and x or 0),sy,frame.Position.Y.Offset+(validY and y or 0))
        frame.AnchorPoint=Vector2.new(validX and adjusted.X or frame.AnchorPoint.X,validY and adjusted.Y or frame.AnchorPoint.Y)
        return true
    end
    frame.Position=UDim2.new(frame.Position.X.Scale,frame.Position.X.Offset+x,frame.Position.Y.Scale,frame.Position.Y.Offset+y)
    frame.AnchorPoint=adjusted
    return true
end
local function paintBasis(owner,frame,scale,constraint,host)
    local parent=owner.Parent
    while parent and not parent:IsA("GuiBase2d") do parent=parent.Parent end
    if not parent then frame.Visible=false;return false end
    local own=owner:FindFirstChildOfClass("UIScale")
    local ownScale=own and own.Scale or 1
    local parentScale=zoom(parent)
    local origin=basis(parent)
    if not finite(ownScale,.000001,1e7) or not finite(parentScale,.000001,1e7) or owner.AbsoluteSize.X<=0 or owner.AbsoluteSize.Y<=0 then frame.Visible=false;return false end
    local angle=0;pcall(function() angle=parent.AbsoluteRotation end)
    frame.Visible=owner.Visible;frame.ZIndex=owner.ZIndex-1;frame.ClipsDescendants=false
    local current={position=owner.AbsolutePosition,size=owner.AbsoluteSize,parent=parent,parentPosition=parent.AbsolutePosition,parentSize=parent.AbsoluteSize,angle=angle,ownScale=ownScale,parentScale=parentScale}
    local previous=host.basis
    local function sameSize(a,b)
        local epsilon=math.max(.000001,math.min(.0005,math.max(a.X,a.Y,b.X,b.Y)*.000001))
        return (a-b).Magnitude<=epsilon
    end
    -- Helper corrections can change AutomaticCanvasSize by native float noise.
    -- Reuse the corrected pose while actual rendered inputs remain stable;
    -- resetting it on raw canvas noise would continuously undo alignment.
    if previous and previous.parent==parent and previous.ownScale==ownScale and previous.parentScale==parentScale and previous.angle==angle
        and (previous.position-current.position).Magnitude<=.0005 and sameSize(previous.size,current.size)
        and (previous.parentPosition-current.parentPosition).Magnitude<=.0005 and sameSize(previous.parentSize,current.parentSize) then return alignBasis(owner,frame) end
    host.basis=current
    local center=parent.AbsolutePosition+parent.AbsoluteSize/2
    local delta=owner.AbsolutePosition+owner.AbsoluteSize/2-center
    local radians=math.rad(-angle)
    local localTopLeft=Vector2.new(delta.X*math.cos(radians)-delta.Y*math.sin(radians),delta.X*math.sin(radians)+delta.Y*math.cos(radians))+parent.AbsoluteSize/2-owner.AbsoluteSize/2
    scale.Scale=ownScale
    local logicalSize=owner.AbsoluteSize/(parentScale*ownScale)
    constraint.MaxSize=Vector2.new(math.max(constraint.MaxSize.X,logicalSize.X),math.max(constraint.MaxSize.Y,logicalSize.Y))
    constraint.MinSize=logicalSize;constraint.MaxSize=logicalSize
    -- Pure offsets prevent AutomaticCanvasSize evaluating a viewport-based Scale
    -- against its own growing canvas. Float constraints/anchor retain exact pose.
    local position=(localTopLeft-origin)/parentScale
    local rounded=Vector2.new(math.ceil(position.X)+1,math.ceil(position.Y)+1)
    frame.Position=UDim2.fromOffset(rounded.X,rounded.Y)
    frame.AnchorPoint=Vector2.new(math.clamp((rounded.X-position.X)*parentScale/owner.AbsoluteSize.X,0,1),math.clamp((rounded.Y-position.Y)*parentScale/owner.AbsoluteSize.Y,0,1))
    frame.Size=UDim2.fromOffset(0,0)
    frame.Visible=owner.Visible;frame.ZIndex=owner.ZIndex-1
    frame.ClipsDescendants=false
    -- Native scroll translation snaps to device pixels even when CanvasPosition
    -- retains a fraction. Match actual bounds without assuming that pixel density.
    return alignBasis(owner,frame)
end
local function shadowText(text,rich,alpha,thickness,color)
    if not rich then return text,true end
    local boundedInput=#text<=65536
    -- Keep shaping and fill opacity, but never copy foreground color/stroke/mark paint.
    text=text:gsub("<[fF][oO][nN][tT]%s+([^>]-)>",function(attributes)
        attributes=attributes:gsub("([%w_]+)%s*=%s*(['\"])(.-)%2",function(key,quote,value)
            if key:lower()=="color" or key:lower()=="c" then return "" end
            return key.."="..quote..value..quote
        end)
        return "<font "..attributes..">"
    end)
    text=text:gsub("</?[sS][tT][rR][oO][kK][eE][^>]*>",""):gsub("</?[hH][iI][gG][hH][lL][iI][gG][hH][tT][^>]*>",""):gsub("</?[mM][aA][rR][kK][^>]*>","")
    if thickness<=0 then return text,true end
    if not boundedInput then return text,false end
    -- Inline rich strokes override UIStroke.Color and default to black unless
    -- their trusted tag explicitly carries the effect's current shadow color.
    local colorHex=string.format("#%02X%02X%02X",math.floor(color.R*255+.5),math.floor(color.G*255+.5),math.floor(color.B*255+.5))
    local out,stack,cursor,tags,bytes={}, {0},1,0,0
    local function append(value)
        if bytes+#value>65536 then return false end
        bytes+=#value;table.insert(out,value);return true
    end
    local function paint(value)
        if #value==0 then return true end
        local runAlpha=1-stack[#stack]
        local transparency=(1-math.clamp(alpha*runAlpha,0,1))^(1/4)
        return append('<stroke color="'..colorHex..'" transparency="'..string.format("%.8f",transparency)..'" thickness="'..string.format("%.6f",thickness)..'" joins="round">'..value..'</stroke>')
    end
    while cursor<=#text do
        local start=text:find("<",cursor,true)
        if not start then if not paint(text:sub(cursor)) then return text,false end;break end
        if not paint(text:sub(cursor,start-1)) then return text,false end
        local ending=text:find(text:sub(start,start+3)=="<!--" and "-->" or ">",start,true)
        if not ending then if not paint(text:sub(start)) then return text,false end;break end
        if text:sub(start,start+3)=="<!--" then ending+=2 end
        local tag=text:sub(start,ending);tags+=1
        if tags>2048 then return text,false end
        local opening=tag:match("^<[fF][oO][nN][tT]%s+([^>]-)>$")
        if opening or tag:lower()=="<font>" then
            if #stack>128 then return text,false end
            local transparency=stack[#stack]
            if opening then for key,_,value in opening:gmatch("([%w_]+)%s*=%s*(['\"])(.-)%2") do
                if key:lower()=="transparency" then local number=tonumber(value);if finite(number,0,1) then transparency=number end end
            end end
            table.insert(stack,transparency)
        elseif tag:lower()=="</font>" then if #stack>1 then table.remove(stack) end end
        if not append(tag) then return text,false end;cursor=ending+1
    end
    return table.concat(out),true
end
local properties={"FontFace","TextSize","RichText","TextScaled","TextWrapped","LineHeight","TextXAlignment","TextYAlignment","TextTruncate","MaxVisibleGraphemes","AutoLocalize"}
function TextDecoration.mount(root)
    local source=root:GetAttribute("FramebridgeSource")
    local controller,connections,observations,entries={},{},{},{}
    local claim=tostring(controller)
    root:SetAttribute("FramebridgeTextDecorationController",claim)
    local destroyed,queued,rebuilding,rebuildQueued=false,false,false,false
    local refresh,rebuild,captured
    local function status(entry)
        entry.owner:SetAttribute("FramebridgeTextDecorationStatus",entry.richLimit and "Live glyphs (rich contour complexity limit)" or entry.owner.BackgroundTransparency<1 and "Live glyphs (background can cover shadow)" or entry.alignLimited and "Live glyphs (subpixel bounds may not align)" or "Live glyphs")
    end
    local function requestAlignment(entry)
        local host=entry.host
        if destroyed or not host or host.queued then return end
        host.queued=true;task.defer(function()
            host.queued=false
            if not destroyed and entry.host==host and entry.owner.Parent then entry.alignLimited=not alignBasis(entry.owner,host.frame);status(entry) end
        end)
    end
    local function connect(list,signal,callback) table.insert(list,signal:Connect(function(...) if not destroyed then callback(...) end end)) end
    local function release(instance,owner)
        -- Generated paint is disposable; unowned application children are not.
        for _,child in ipairs(instance:GetChildren()) do
            local owned=child:GetAttribute("FramebridgeTextDecorationHelper")==true
                and child:GetAttribute("FramebridgeSource")==owner:GetAttribute("FramebridgeSource")
                and child:GetAttribute("FramebridgeTextDecorationOwner")==owner:GetAttribute("FramebridgeId")
                and not child:IsA("LuaSourceContainer")
            if owned then release(child,owner) else
                local moved=pcall(function() child.Parent=owner end)
                if not moved then
                    local parent=instance.Parent
                    while parent and parent:GetAttribute("FramebridgeTextDecorationHelper")==true do parent=parent.Parent end
                    -- Owner destruction can lock its parenting target; keep custom
                    -- content with the nearest surviving authored ancestor instead.
                    local kept=parent and pcall(function() child.Parent=parent end)
                    if not kept then pcall(function() child.Parent=nil end) end
                end
            end
        end
        instance:Destroy()
    end
    local function releaseHost(entry)
        if entry.host then disconnect(entry.host.connections);release(entry.host.folder,entry.owner);entry.host=nil end
    end
    local function clear(entry)
        disconnect(entry.connections)
        for _,label in ipairs(entry.labels) do release(label,entry.owner) end
        table.clear(entry.labels)
        releaseHost(entry)
        if entry.capture then pcall(function() entry.capture.ImageTransparency=captured(entry) and entry.originalAlpha or 1 end) end
        pcall(function() entry.owner:SetAttribute("FramebridgeTextDecorationStatus",nil) end)
    end
    local function removeCopies(owner)
        -- Old child helpers and saved Folder hosts belong to this actual Instance,
        -- never merely to a shared reusable-component source ID.
        for _,child in ipairs(owner:GetChildren()) do
            if child:GetAttribute("FramebridgeTextDecorationHelper")==true and child:GetAttribute("FramebridgeSource")==owner:GetAttribute("FramebridgeSource") and child:GetAttribute("FramebridgeTextDecorationOwner")==owner:GetAttribute("FramebridgeId") and not child:IsA("LuaSourceContainer") then release(child,owner) end
        end
        if owner.Parent then for _,child in ipairs(owner.Parent:GetChildren()) do
            local reference=child:IsA("Folder") and child:GetAttribute("FramebridgeTextDecorationHost")==true and child:FindFirstChild("Owner")
            if reference and reference:IsA("ObjectValue") and reference.Value==owner
                and child:GetAttribute("FramebridgeTextDecorationHelper")==true and child:GetAttribute("FramebridgeSource")==owner:GetAttribute("FramebridgeSource") and child:GetAttribute("FramebridgeTextDecorationOwner")==owner:GetAttribute("FramebridgeId")
                and reference:GetAttribute("FramebridgeTextDecorationHelper")==true and reference:GetAttribute("FramebridgeSource")==owner:GetAttribute("FramebridgeSource") and reference:GetAttribute("FramebridgeTextDecorationOwner")==owner:GetAttribute("FramebridgeId") then release(child,owner) end
        end end
    end
    local function helper(entry,class,name,parent)
        local instance=Instance.new(class);instance.Name=name
        instance:SetAttribute("FramebridgeTextDecorationHelper",true)
        instance:SetAttribute("FramebridgeTextDecorationOwner",entry.owner:GetAttribute("FramebridgeId"))
        instance:SetAttribute("FramebridgeSource",entry.owner:GetAttribute("FramebridgeSource"))
        if parent then instance.Parent=parent end
        return instance
    end
    local function ensureHost(entry)
        if not entry.host then
            local folder=helper(entry,"Folder","Framebridge live text decoration")
            folder:SetAttribute("FramebridgeTextDecorationHost",true)
            local reference=helper(entry,"ObjectValue","Owner",folder);reference.Value=entry.owner
            local frame=helper(entry,"Frame","Glyph paint basis",folder)
            frame.BackgroundTransparency=1;frame.BorderSizePixel=0;frame.Active=false;frame.Interactable=false;frame.Selectable=false
            frame.AnchorPoint=Vector2.zero;frame.Rotation=0
            local scale=helper(entry,"UIScale","Owner scale",frame)
            local constraint=helper(entry,"UISizeConstraint","Exact rendered size",frame)
            entry.host={folder=folder,frame=frame,scale=scale,constraint=constraint,connections={}}
            for _,property in ipairs({"AbsolutePosition","AbsoluteSize"}) do connect(entry.host.connections,frame:GetPropertyChangedSignal(property),function() requestAlignment(entry) end) end
        end
        entry.host.folder.Parent=entry.owner.Parent
        entry.alignLimited=not paintBasis(entry.owner,entry.host.frame,entry.host.scale,entry.host.constraint,entry.host)
        requestAlignment(entry);return not entry.alignLimited
    end
    captured=function(entry)
        local o,d,b=entry.owner,entry.config,entry.config.baseline
        if not b or not entry.capture or entry.capture.Image=="" or o.BackgroundTransparency<1 or d.themeShadow or o:FindFirstChildOfClass("UIPadding") or o:FindFirstChildOfClass("UITextSizeConstraint") or o:FindFirstChildOfClass("UIGradient") or o:FindFirstChildOfClass("UIStroke") then return false end
        local f=o.FontFace;local scale=zoom(o)
        if scale<=0 or scale==math.huge then return false end
        local size=o.AbsoluteSize/scale
        local sized=(size.X==0 and size.Y==0) or (math.abs(size.X-d.reference[1])<=.5 and math.abs(size.Y-d.reference[2])<=.5)
        local features="";pcall(function() features=o.OpenTypeFeatures end)
        local direction="Auto";pcall(function() direction=o.TextDirection.Name end)
        return sized and not o.AutoLocalize and features=="" and direction=="Auto" and o.Text==b.text and f.Family==b.font[1] and f.Weight.Name==b.font[2] and f.Style.Name==b.font[3] and o.TextSize==b.size and o.RichText==b.rich and o.TextScaled==b.scaled and o.TextWrapped==b.wrapped and o.LineHeight==b.lineHeight and o.TextXAlignment.Name==b.x and o.TextYAlignment.Name==b.y and o.TextTruncate.Name==b.truncate and o.MaxVisibleGraphemes==b.graphemes and math.abs(o.TextTransparency-b.alpha)<.00001 and math.abs(o.TextColor3.R-b.color[1])<.00001 and math.abs(o.TextColor3.G-b.color[2])<.00001 and math.abs(o.TextColor3.B-b.color[3])<.00001 and not (o:IsA("TextBox") and o.Text=="")
    end
    local function shadows(entry)
        local d,o=entry.config,entry.owner
        local size=o.AbsoluteSize/ math.max(.000001,zoom(o))
        local x,y=d.scaled and size.X/d.reference[1] or 1,d.scaled and size.Y/d.reference[2] or 1
        local out={}
        if entry.theme then
            local s=entry.theme
            return {{color={s.Color.R,s.Color.G,s.Color.B,1-s.Transparency},offset={s.Offset.X.Scale*size.X+s.Offset.X.Offset,s.Offset.Y.Scale*size.Y+s.Offset.Y.Offset},radius=s.BlurRadius.Scale*math.min(size.X,size.Y)+s.BlurRadius.Offset,spread=math.max(s.Spread.X.Scale*size.X+s.Spread.X.Offset,s.Spread.Y.Scale*size.Y+s.Spread.Y.Offset)}}
        end
        for _,s in ipairs(d.shadows) do table.insert(out,{color=s.color,offset={s.offset[1]*x,s.offset[2]*y},radius=s.radius*math.min(x,y),spread=s.spread*math.min(x,y)}) end
        return out
    end
    local function createCopies(entry,amount)
        while #entry.labels>amount do entry.paintCache[#entry.labels]=nil;release(table.remove(entry.labels),entry.owner) end
        if amount==0 then releaseHost(entry);return end
        ensureHost(entry)
        while #entry.labels<amount do
            local label=helper(entry,"TextLabel","Live text shadow")
            label.BackgroundTransparency=1;label.BorderSizePixel=0;label.Active=false;label.Selectable=false;label.Interactable=false;label.AutoLocalize=false
            label.AnchorPoint=Vector2.zero;label.Size=UDim2.fromScale(1,1);label.ClipsDescendants=false
            local stroke=helper(entry,"UIStroke","Soft edge approximation",label);stroke.ApplyStrokeMode=Enum.ApplyStrokeMode.Contextual;stroke.LineJoinMode=Enum.LineJoinMode.Round
            table.insert(entry.labels,label);label.Parent=entry.host.frame
        end
    end
    refresh=function()
        if destroyed then return end
        for _,entry in ipairs(entries) do
            local o=entry.owner
            if o.Parent then
                local useCapture=captured(entry)
                if useCapture then
                    createCopies(entry,0);entry.capture.ImageTransparency=entry.originalAlpha;o:SetAttribute("FramebridgeTextDecorationStatus","Captured")
                else
                    if entry.capture then entry.capture.ImageTransparency=1 end
                    entry.richLimit=false
                    local values=shadows(entry)
                    createCopies(entry,#values*4)
                    local index=0
                    for effectIndex=#values,1,-1 do
                        local s=values[effectIndex]
                        for ring=1,4 do
                            index+=1
                            local label=entry.labels[index]
                            for _,property in ipairs(properties) do label[property]=o[property] end
                            pcall(function() label.OpenTypeFeatures=o.OpenTypeFeatures end)
                            pcall(function() label.TextDirection=o.TextDirection end)
                            local placeholder=o:IsA("TextBox") and o.Text==""
                            label.RichText=not placeholder and o.RichText

                            label.TextColor3=Color3.new(s.color[1],s.color[2],s.color[3])
                            local alpha=math.clamp(s.color[4]*(1-o.TextTransparency),0,1)
                            -- Four transparent contours approximate a soft edge with bounded work.
                            local perLayer=1-(1-alpha)^(1/4)
                            label.TextTransparency=ring==1 and 1-alpha or 1;label.TextStrokeTransparency=1
                            -- Keep every helper's Gui bounds equal to the owner.
                            -- Balanced text padding offsets paint without growing an
                            -- AutomaticCanvasSize or moving the native clipping box.
                            label.Position=UDim2.fromScale(0,0)
                            local localSize=o.AbsoluteSize/math.max(.000001,zoom(o))
                            label.Rotation=o.Rotation;label.ClipsDescendants=o.ClipsDescendants;label.ZIndex=o.ZIndex-1
                            local stroke=label:FindFirstChildOfClass("UIStroke")
                            stroke.Color=label.TextColor3;stroke.Transparency=1-perLayer
                            stroke.Thickness=math.clamp(math.max(0,s.spread)+math.max(0,s.radius)*(ring-1)/3,0,2000)
                            local content=placeholder and o.PlaceholderText or o.Text
                            local cache=entry.paintCache[index]
                            if not cache or cache.text~=content or cache.rich~=label.RichText or cache.alpha~=alpha or cache.thickness~=stroke.Thickness or cache.color~=label.TextColor3 then
                                local shadow,contours=shadowText(content,label.RichText,alpha,stroke.Thickness,label.TextColor3)
                                cache={text=content,rich=label.RichText,alpha=alpha,thickness=stroke.Thickness,color=label.TextColor3,shadow=shadow,contours=contours};entry.paintCache[index]=cache
                            end
                            label.Text=cache.shadow;stroke.Enabled=stroke.Thickness>0 and cache.contours
                            if not cache.contours then entry.richLimit=true end
                            local constraint=o:FindFirstChildOfClass("UITextSizeConstraint")
                            local copy=label:FindFirstChildOfClass("UITextSizeConstraint")
                            if constraint then
                                if not copy then copy=helper(entry,"UITextSizeConstraint","Text size limits",label) end
                                copy.MaxTextSize=math.max(copy.MaxTextSize,constraint.MinTextSize);copy.MinTextSize=constraint.MinTextSize;copy.MaxTextSize=constraint.MaxTextSize
                            elseif copy then release(copy,o) end
                            local padding=o:FindFirstChildOfClass("UIPadding")
                            local padCopy=label:FindFirstChildOfClass("UIPadding")
                            if not padCopy then padCopy=helper(entry,"UIPadding","Text padding and shadow offset",label) end
                            local dx=localSize.X>0 and s.offset[1]/localSize.X or 0
                            local dy=localSize.Y>0 and s.offset[2]/localSize.Y or 0
                            for _,key in ipairs({"PaddingLeft","PaddingRight","PaddingTop","PaddingBottom"}) do
                                local base=padding and padding[key] or UDim.new(0,0)
                                local shift=key=="PaddingLeft" and dx or key=="PaddingRight" and -dx or key=="PaddingTop" and dy or -dy
                                padCopy[key]=UDim.new(base.Scale+shift,base.Offset)
                            end
                        end
                    end
                    status(entry)
                end
            else createCopies(entry,0) end
        end
    end
    local function schedule()
        if destroyed or queued then return end
        queued=true;task.defer(function() queued=false;if not destroyed then refresh() end end)
    end
    local function requestRebuild(instance)
        local current=instance
        while current and current~=root do if current:GetAttribute("FramebridgeTextDecorationHelper")==true then return end;current=current.Parent end
        if destroyed or rebuilding or rebuildQueued then return end
        rebuildQueued=true;task.defer(function() rebuildQueued=false;if not destroyed then rebuild() end end)
    end
    rebuild=function()
        if destroyed or rebuilding then return end
        rebuilding=true
        disconnect(observations)
        for _,entry in ipairs(entries) do clear(entry) end;table.clear(entries)
        local nodes={}
        for _,node in ipairs(root:GetDescendants()) do
            local current,helper=node,false
            while current and current~=root do if current:GetAttribute("FramebridgeTextDecorationHelper")==true then helper=true;break end;current=current.Parent end
            if not helper then table.insert(nodes,node) end
        end
        if root:IsA("GuiObject") then table.insert(nodes,1,root) end
        local glyphs,owners=0,0
        if #nodes<=15000 then
            for _,o in ipairs(nodes) do
                if o:GetAttribute("FramebridgeSource")==source and (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) and not o:GetAttribute("FramebridgeTextDecorationHelper") then connect(observations,o:GetAttributeChangedSignal("FramebridgeTextDecoration"),requestRebuild) end
                local raw=o:GetAttribute("FramebridgeTextDecoration")
                if type(raw)=="string" and #raw<=65536 and o:GetAttribute("FramebridgeSource")==source and (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) then
                    local ok,d=pcall(Http.JSONDecode,Http,raw)
                    local glyphCount=ok and TextDecoration.valid(d) and (d.themeShadow and 4 or #d.shadows*4) or 0
                    if glyphCount>0 and glyphs+glyphCount<=4096 and #nodes+(glyphs+glyphCount)*4+(owners+1)*5<=15000 and type(o:GetAttribute("FramebridgeId"))=="string" then
                        glyphs+=glyphCount;owners+=1
                        local capture,theme
                        for _,child in ipairs(o:GetChildren()) do
                            if child:GetAttribute("FramebridgeSource")==source then
                                if child:GetAttribute("FramebridgeId")==d.captured and d.captured==o:GetAttribute("FramebridgeId").."/effect" and child:IsA("ImageLabel") and child:GetAttribute("FramebridgeDecorationRect") then capture=child end
                                if child:GetAttribute("FramebridgeId")==d.themeShadow and child:IsA("UIShadow") and not child.Enabled then theme=child end
                            end
                        end
                        removeCopies(o)
                        local entry={owner=o,config=d,capture=capture,theme=theme,originalAlpha=d.capturedAlpha or (capture and capture.ImageTransparency or 0),labels={},connections={},paintCache={}}
                        table.insert(entries,entry)
                        for _,property in ipairs(properties) do connect(entry.connections,o:GetPropertyChangedSignal(property),schedule) end
                        pcall(function() connect(entry.connections,o:GetPropertyChangedSignal("OpenTypeFeatures"),schedule) end)
                        pcall(function() connect(entry.connections,o:GetPropertyChangedSignal("TextDirection"),schedule) end)
                        for _,property in ipairs({"Text","TextTransparency","TextColor3","AbsoluteSize","AbsolutePosition","Rotation","ZIndex","Visible","ClipsDescendants","BackgroundTransparency"}) do connect(entry.connections,o:GetPropertyChangedSignal(property),schedule) end
                        pcall(function() connect(entry.connections,o:GetPropertyChangedSignal("AbsoluteRotation"),schedule) end)
                        connect(entry.connections,o.AncestryChanged,function()
                            createCopies(entry,0);requestRebuild(o)
                        end)
                        local ancestor=o
                        while ancestor do
                            if ancestor:IsA("GuiObject") then
                                local scale=ancestor:FindFirstChildOfClass("UIScale")
                                if scale then connect(entry.connections,scale:GetPropertyChangedSignal("Scale"),schedule) end
                                local pad=ancestor:FindFirstChildOfClass("UIPadding")
                                if pad then for _,key in ipairs({"PaddingLeft","PaddingRight","PaddingTop","PaddingBottom"}) do connect(entry.connections,pad:GetPropertyChangedSignal(key),schedule) end end
                                if ancestor~=o then for _,key in ipairs({"AbsoluteSize","AbsolutePosition","Visible"}) do connect(entry.connections,ancestor:GetPropertyChangedSignal(key),schedule) end end
                                if ancestor:IsA("ScrollingFrame") then for _,key in ipairs({"CanvasPosition","AbsoluteCanvasSize","AutomaticCanvasSize"}) do connect(entry.connections,ancestor:GetPropertyChangedSignal(key),schedule) end end
                                connect(entry.connections,ancestor.ChildAdded,requestRebuild);connect(entry.connections,ancestor.ChildRemoved,requestRebuild)
                            end
                            ancestor=ancestor.Parent
                        end
                        if o:IsA("TextBox") then connect(entry.connections,o:GetPropertyChangedSignal("PlaceholderText"),schedule) end
                        if capture then connect(entry.connections,capture:GetPropertyChangedSignal("Image"),schedule) end
                        if theme then for _,p in ipairs({"Color","Transparency","BlurRadius","Offset","Spread"}) do connect(entry.connections,theme:GetPropertyChangedSignal(p),schedule) end end
                        local constraint=o:FindFirstChildOfClass("UITextSizeConstraint")
                        if constraint then for _,p in ipairs({"MinTextSize","MaxTextSize"}) do connect(entry.connections,constraint:GetPropertyChangedSignal(p),schedule) end end
                    end
                end
            end
        end
        rebuilding=false;refresh()
    end
    function controller.destroy()
        if destroyed then return end;destroyed=true;disconnect(connections);disconnect(observations)
        for _,entry in ipairs(entries) do clear(entry) end;table.clear(entries)
        if root:GetAttribute("FramebridgeTextDecorationController")==claim then root:SetAttribute("FramebridgeTextDecorationController",nil) end
    end
    function controller.connectionCount() local n=#connections+#observations;for _,e in ipairs(entries) do n+=#e.connections+(e.host and #e.host.connections or 0) end;return n end
    function controller.refresh() refresh() end
    connect(connections,root.DescendantAdded,requestRebuild);connect(connections,root.DescendantRemoving,requestRebuild)
    connect(connections,root.AncestryChanged,function() for _,entry in ipairs(entries) do createCopies(entry,0) end;requestRebuild(root) end)
    connect(connections,root.Destroying,controller.destroy)
    connect(connections,root:GetAttributeChangedSignal("FramebridgeTextDecorationController"),function() if root:GetAttribute("FramebridgeTextDecorationController")~=claim then controller.destroy() end end)
    rebuild();return controller
end
function TextDecoration.watch(container,runService)
    local mounted,connections,destroyed={},{},false
    local function refresh()
        if destroyed then return end
        for root,controller in pairs(mounted) do if not root:IsDescendantOf(container) or not runService:IsEdit() then controller.destroy();mounted[root]=nil end end
        if runService:IsEdit() then for _,root in ipairs(container:GetChildren()) do if root:IsA("LayerCollector") and type(root:GetAttribute("FramebridgeSource"))=="string" and not mounted[root] then mounted[root]=TextDecoration.mount(root) end end end
    end
    table.insert(connections,container.ChildAdded:Connect(refresh));table.insert(connections,container.ChildRemoved:Connect(refresh))
    local editing=runService:IsEdit()
    table.insert(connections,runService.Heartbeat:Connect(function() local nextEditing=runService:IsEdit();if editing~=nextEditing then editing=nextEditing;refresh() end end))
    refresh()
    return {destroy=function() if destroyed then return end;destroyed=true;disconnect(connections);for _,c in pairs(mounted) do c.destroy() end;table.clear(mounted) end}
end
return TextDecoration`;
