assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local Http=game:GetService("HttpService")
local Core=game:GetService("CoreGui")
assert(not Core:FindFirstChild("FramebridgeWindowBoundsQA"),"Owned bounds fixture already exists")
local root=Instance.new("ScreenGui");root.Name="FramebridgeWindowBoundsQA";root.IgnoreGuiInset=true
root:SetAttribute("FramebridgeSource","FramebridgeWindowBoundsQA");root.Parent=Core
local passed,failures,rows,controllers=0,{},{},{}
local function finite(v)return v==v and math.abs(v)<math.huge end
local function xy(v)return {v.X,v.Y}end
local function waitGeometry()task.wait(.06)end
local function make(class,parent,name)
    local i=Instance.new(class);i.Name=name;i.Parent=parent
    if i:IsA("GuiObject")then i.BorderSizePixel=0;i.BackgroundTransparency=1 end
    return i
end
local function padding(parent)
    local p=make("UIPadding",parent,"Padding")
    p.PaddingLeft=UDim.new(.1,10);p.PaddingRight=UDim.new(.1,6);p.PaddingTop=UDim.new(.1,7);p.PaddingBottom=UDim.new(.1,11);return p
end
local function fixture(class,options)
    options=options or {}
    local outer=make("Frame",root,"Outer");outer.Position=UDim2.fromOffset(80,60);outer.Size=UDim2.fromOffset(600,450)
    local ancestor=make("UIScale",outer,"AncestorScale");ancestor.Scale=options.ancestorScale or 1
    local parent=class=="ScreenGui" and root or make(class,outer,"Parent")
    if parent~=root then parent.Position=UDim2.fromOffset(45,35);parent.Size=UDim2.fromOffset(220,160)end
    local modifier=parent~=root and make("UIScale",parent,"ParentScale") or nil
    if modifier then modifier.Scale=options.scale or 1 end
    local pad=options.padding and padding(parent) or nil
    if class=="ScrollingFrame"then
        parent.CanvasSize=UDim2.fromOffset(options.smallCanvas and 60 or 500,options.smallCanvas and 40 or 400)
        parent.ScrollBarThickness=options.thickness or 12
        parent.VerticalScrollBarPosition=options.side or Enum.VerticalScrollBarPosition.Right
        parent.VerticalScrollBarInset=options.inset or Enum.ScrollBarInset.None
        parent.HorizontalScrollBarInset=options.inset or Enum.ScrollBarInset.None
        parent.ScrollingDirection=options.direction or Enum.ScrollingDirection.XY
        if options.enabled==false then parent.ScrollingEnabled=false end
        parent.AutomaticCanvasSize=options.automatic or Enum.AutomaticSize.None
    end
    local reference=make("Frame",parent,"ReferenceOrigin");reference.Position=UDim2.fromOffset(0,0);reference.Size=UDim2.fromOffset(0,0)
    local endReference=make("Frame",parent,"ReferenceEnd");endReference.AnchorPoint=Vector2.zero;endReference.Position=UDim2.fromScale(1,1);endReference.Size=UDim2.fromOffset(0,0)
    local w=make("Frame",parent,"Window");w.Position=options.position or UDim2.fromOffset(10,5);w.Size=UDim2.fromOffset(40,30);w.AnchorPoint=options.anchor or Vector2.zero
    if options.ownScale then local s=make("UIScale",w,"OwnScale");s.Scale=options.ownScale end
    w:SetAttribute("FramebridgeId","window");w:SetAttribute("FramebridgeSource","FramebridgeWindowBoundsQA")
    w:SetAttribute("FramebridgeBehavior",Http:JSONEncode({control={kind="window",constrain=options.constrain~=false}}))
    waitGeometry()
    if class=="ScrollingFrame"then parent.CanvasPosition=options.scroll or Vector2.zero;waitGeometry()end
    local c=Runtime.mount(root,{manualControls=true});table.insert(controllers,c)
    local q=(options.ancestorScale or 1)*(class=="ScreenGui" and 1 or options.scale or 1)
    return {controller=c,outer=outer,parent=parent,window=w,reference=reference,endReference=endReference,padding=pad,ancestor=ancestor,scale=modifier,zoom=q}
end
local function expected(f)
    local p,w=f.parent,f.window
    local start=f.reference.AbsolutePosition
    local finish=f.endReference.AbsolutePosition
    if p:IsA("ScrollingFrame")and p.AutomaticCanvasSize~=Enum.AutomaticSize.None then
        -- Separate origin marker is an independent native readback. Automatic
        -- axes use a viewport Position basis, while content is the actual canvas.
        local canvas=p.AbsoluteCanvasSize;local pad=f.padding
        local width,height=canvas.X,canvas.Y
        if pad then
            width-=canvas.X*(pad.PaddingLeft.Scale+pad.PaddingRight.Scale)+(pad.PaddingLeft.Offset+pad.PaddingRight.Offset)*f.zoom
            height-=canvas.Y*(pad.PaddingTop.Scale+pad.PaddingBottom.Scale)+(pad.PaddingTop.Offset+pad.PaddingBottom.Offset)*f.zoom
        end
        finish=start+Vector2.new(math.max(0,width),math.max(0,height))
    end
    local viewportPosition,viewportSize=p.AbsolutePosition,p.AbsoluteSize
    if p:IsA("ScrollingFrame")then
        viewportSize=p.AbsoluteWindowSize
        if p.VerticalScrollBarPosition==Enum.VerticalScrollBarPosition.Left then viewportPosition+=Vector2.new(p.AbsoluteSize.X-viewportSize.X,0)end
    end
    start=Vector2.new(math.max(start.X,viewportPosition.X),math.max(start.Y,viewportPosition.Y))
    finish=Vector2.new(math.min(finish.X,viewportPosition.X+viewportSize.X),math.min(finish.Y,viewportPosition.Y+viewportSize.Y))
    return start,finish-w.AbsoluteSize
end
local function moveCheck(f,name,dx,dy,origin)
    local low,high=expected(f);local before=f.window.Position
    assert(finite(low.X)and finite(low.Y)and high.X>=low.X and high.Y>=low.Y,"Invalid independent fit fixture")
    assert(f.controller.moveWindow("window",dx,dy,origin),"Move rejected")
    waitGeometry()
    low,high=expected(f)
    local actual=f.window.AbsolutePosition
    local eps=.005
    assert(actual.X>=low.X-eps and actual.Y>=low.Y-eps and actual.X<=high.X+eps and actual.Y<=high.Y+eps,"Window escaped current native content viewport")
    local target=dx<0 and dy<0 and low or high
    local gap=(actual-target).Magnitude
    assert(math.abs(actual.X-target.X)<=f.zoom+eps and math.abs(actual.Y-target.Y)<=f.zoom+eps,"Did not reach closest representable content corner")
    assert(f.window.Position.X.Scale==before.X.Scale and f.window.Position.Y.Scale==before.Y.Scale,"Movement changed authored Scale coordinates")
    table.insert(rows,{name=name,low=xy(low),high=xy(high),actual=xy(actual),zoom=f.zoom,cornerGap=gap,position={f.window.Position.X.Scale,f.window.Position.X.Offset,f.window.Position.Y.Scale,f.window.Position.Y.Offset}})
end
local function cleanupFixture(f)
    f.controller.destroy();assert(f.controller.connectionCount()==0,"Window runtime listeners leaked")
    if f.parent==root then f.window:Destroy();f.reference:Destroy();f.endReference:Destroy();if f.padding then f.padding:Destroy()end end
    f.outer:Destroy()
end
local function test(name,body)
    local ok,why=xpcall(body,debug.traceback)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end
end
local function one(name,class,options,body)
    test(name,function()
        local f=fixture(class,options)
        local ok,why=xpcall(function()
            moveCheck(f,name.." leading",-10000,-10000)
            moveCheck(f,name.." trailing",10000,10000)
            if body then body(f)end
        end,debug.traceback)
        cleanupFixture(f);assert(ok,why)
    end)
end
local ok,unexpected=xpcall(function()
    one("padded Frame","Frame",{padding=true})
    one("mixed Scale and anchor","Frame",{padding=true,position=UDim2.new(.25,5,.75,9),anchor=Vector2.new(.5,.5),ownScale=.85})
    one("current resize, padding, ancestor zoom and cumulative drag","Frame",{padding=true},function(f)
        local origin={position=f.window.Position,absolute=f.window.AbsolutePosition}
        assert(f.controller.moveWindow("window",-15,-10,origin));waitGeometry()
        f.parent.Size=UDim2.fromOffset(300,220);f.padding.PaddingLeft=UDim.new(.1,17);f.padding.PaddingBottom=UDim.new(.15,13);waitGeometry()
        moveCheck(f,"resized drag leading",-10000,-10000,origin);moveCheck(f,"resized drag trailing",10000,10000,origin)
        f.ancestor.Scale=.85;f.scale.Scale=1.5;f.zoom=.85*1.5;waitGeometry()
        moveCheck(f,"scaled drag leading",-10000,-10000,origin);moveCheck(f,"scaled drag trailing",10000,10000,origin)
    end)
    test("external Scale edit cancels the stale drag write",function()
        local f=fixture("Frame",{position=UDim2.new(.25,0,.25,0)})
        local ok,why=xpcall(function()
            local origin={position=f.window.Position,absolute=f.window.AbsolutePosition}
            assert(f.controller.moveWindow("window",10,10,origin));waitGeometry()
            f.window.Position=UDim2.new(.5,10,.5,10);waitGeometry()
            local external,absolute=f.window.Position,f.window.AbsolutePosition
            assert(not f.controller.moveWindow("window",-10000,-10000,origin),"Stale Scale drag was accepted")
            waitGeometry()
            assert(f.window.Position==external and (f.window.AbsolutePosition-absolute).Magnitude<.005,"Stale drag overwrote the application edit")
            f.controller.destroy();assert(f.window.Position==external,"Disposal overwrote the application edit")
        end,debug.traceback)
        cleanupFixture(f);assert(ok,why)
    end)
    for _,side in ipairs({Enum.VerticalScrollBarPosition.Right,Enum.VerticalScrollBarPosition.Left})do
        for _,inset in ipairs({Enum.ScrollBarInset.None,Enum.ScrollBarInset.ScrollBar,Enum.ScrollBarInset.Always})do
            one("scroll "..side.Name.." "..inset.Name,"ScrollingFrame",{padding=true,side=side,inset=inset,scroll=Vector2.new(70,40),position=UDim2.new(.25,10,.3,5),anchor=Vector2.new(.5,.5)},function(f)
                f.parent.CanvasPosition=f.parent.AbsoluteCanvasSize-f.parent.AbsoluteWindowSize;waitGeometry()
                moveCheck(f,"canvas end leading",-10000,-10000);moveCheck(f,"canvas end trailing",10000,10000)
            end)
        end
    end
    one("Always no visible track","ScrollingFrame",{smallCanvas=true,side=Enum.VerticalScrollBarPosition.Left,inset=Enum.ScrollBarInset.Always})
    one("scaled left scroll","ScrollingFrame",{scale=1.5,padding=true,side=Enum.VerticalScrollBarPosition.Left,inset=Enum.ScrollBarInset.Always,scroll=Vector2.new(70.4,40.8),ownScale=.75})
    for _,axis in ipairs({Enum.ScrollingDirection.X,Enum.ScrollingDirection.Y})do one("axis "..axis.Name,"ScrollingFrame",{side=Enum.VerticalScrollBarPosition.Left,inset=Enum.ScrollBarInset.ScrollBar,direction=axis,enabled=false})end
    for _,axis in ipairs({Enum.AutomaticSize.X,Enum.AutomaticSize.Y,Enum.AutomaticSize.XY})do one("automatic "..axis.Name,"ScrollingFrame",{padding=true,automatic=axis,scroll=Vector2.new(70,40),position=UDim2.new(.25,10,.3,5),anchor=Vector2.new(.5,.5)})end
    one("direct native collector","ScreenGui",{position=UDim2.new(.25,10,.3,5),anchor=Vector2.new(.5,.5)})
end,debug.traceback)
for _,c in ipairs(controllers)do pcall(c.destroy)end
root:Destroy()
assert(ok,unexpected)
return {passed=passed,failed=#failures,failures=failures,rows=rows,ownedRootDestroyed=root.Parent==nil,controllerChecksOnly=true,nativePointerAccepted=false,playSafeInsetAccepted=false,scope="Actual generated runtime controller calls with independent native origin/end markers and current viewport readbacks"}
