-- Actual trusted runtime; fixed rendered inputs, not native pointer acceptance.
local fs,serde,rbx=require("@lune/fs"),require("@lune/serde"),require("@lune/roblox")
local process=require("@lune/process")
local V,U,E=rbx.Vector2,rbx.UDim2,rbx.Enum
local function signal()
    local list={}
    return {Connect=function(_,fn)local c={Connected=true};function c:Disconnect()self.Connected=false end;table.insert(list,{fn,c});return c end,
        Fire=function(_,...)for _,p in ipairs(table.clone(list))do if p[2].Connected then p[1](...)end end end}
end
local function instance(class)
    local data={Visible=true,Enabled=true,Active=true,Interactable=true,Rotation=0,AnchorPoint=V.zero,Position=U.fromOffset(0,0),AbsolutePosition=V.zero,AbsoluteSize=V.zero,children={}}
    local attributes,changes={},{}
    data.InputBegan=signal()
    local methods={}
    function methods:IsA(k)return k==class or k=="LayerCollector" and class=="ScreenGui" or k=="GuiBase2d" and (class=="ScreenGui" or class=="Frame" or class=="ScrollingFrame") or k=="GuiObject" and (class=="Frame" or class=="ScrollingFrame")end
    function methods:GetAttribute(k)return attributes[k]end
    function methods:SetAttribute(k,v)attributes[k]=v end
    function methods:GetPropertyChangedSignal(k)changes[k]=changes[k]or signal();return changes[k]end
    function methods:IsDescendantOf(root)local p=data.Parent;while p do if p==root then return true end;p=p.Parent end;return false end
    function methods:GetChildren()return data.children end
    function methods:FindFirstChildOfClass(k)for _,c in ipairs(data.children)do if c:IsA(k)then return c end end end
    function methods:native(position,size,basis,scale)data.AbsolutePosition=position;data.AbsoluteSize=size;data.basis=basis;data.zoom=scale end
    function methods:add(child)table.insert(data.children,child);child.Parent=self end
    return setmetatable({}, {__index=function(_,k)return methods[k]or data[k]end,__newindex=function(_,k,v)
        local previous=data[k]
        if k=="Position" and data.basis then
            data.AbsolutePosition+=V.new((v.X.Scale-previous.X.Scale)*data.basis.X+(v.X.Offset-previous.X.Offset)*data.zoom,(v.Y.Scale-previous.Y.Scale)*data.basis.Y+(v.Y.Offset-previous.Y.Offset)*data.zoom)
        end
        if previous~=v then data[k]=v;if changes[k]then changes[k]:Fire()end end
    end})
end
local Input={InputBegan=signal(),InputChanged=signal(),InputEnded=signal(),WindowFocusReleased=signal(),GetFocusedTextBox=function()return nil end}
local environment={game={GetService=function(_,k)return assert(({UserInputService=Input,RunService={Heartbeat=signal()},GuiService={SelectedObject=nil}})[k],k)end},Enum=E,Vector2=V,UDim2=U,workspace={CurrentCamera={ViewportSize=V.new(1000,800)}}}
setmetatable(environment,{__index=getfenv()})
local source=fs.readFile(process.args[1] or ".artifacts/window-bounds/controls-runtime.luau")
local chunk=assert(loadstring(source));setfenv(chunk,environment);local mount=chunk()
local passed,failures=0,{}
local function test(name,body)local ok,why=xpcall(body,debug.traceback);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end end
local function close(actual,expected)assert((actual-expected).Magnitude<.0001,tostring(actual).." differs from "..tostring(expected))end
local function padding(parent)
    local p=instance("UIPadding")
    p.PaddingLeft=rbx.UDim.new(.1,10);p.PaddingRight=rbx.UDim.new(.1,6);p.PaddingTop=rbx.UDim.new(.1,7);p.PaddingBottom=rbx.UDim.new(.1,11);parent:add(p);return p
end
local function withFixture(class,body,constrain)
    local root=instance("ScreenGui");root.AbsolutePosition=V.zero;root.AbsoluteSize=V.new(1000,800)
    local parent=class=="ScreenGui" and root or instance(class);if parent~=root then root:add(parent)end
    parent.AbsolutePosition=V.new(300,100);parent.AbsoluteSize=V.new(200,160)
    parent.AbsoluteCanvasSize=V.new(500,400);parent.AbsoluteWindowSize=V.new(207,147);parent.AutomaticCanvasSize=E.AutomaticSize.None;parent.VerticalScrollBarPosition=E.VerticalScrollBarPosition.Right
    local window=instance("Frame");parent:add(window);window:native(V.new(330,123),V.new(40,30),V.new(144,110),1)
    local c=mount(root,{window=window},{window={control={kind="window",constrain=constrain~=false}}},{manualControls=true})
    local ok,why=xpcall(function()body(c,window,parent,root)end,debug.traceback)
    c.destroy();assert(c.connectionCount()==0,"Window input/property subscriptions leaked")
    assert(ok,why)
end
test("native padded Frame corners, not its outer rectangle",function()withFixture("Frame",function(c,w,p)
    padding(p);assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(434,203))
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(330,123))
end)end)
test("current parent resize and changed padding are read for each move",function()withFixture("Frame",function(c,w,p)
    local pad=padding(p);p.AbsoluteSize=V.new(300,200);w:native(V.new(340,127),V.new(40,30),V.new(224,142),1)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(524,239))
    pad.PaddingLeft=rbx.UDim.new(0,50);pad.PaddingTop=rbx.UDim.new(0,35)
    w:native(V.new(534,247),V.new(40,30),V.new(214,134),1)
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(350,135))
end)end)
test("current ancestor UIScale uses rendered offsets",function()withFixture("Frame",function(c,w,p)
    padding(p);local scale=instance("UIScale");scale.Scale=1.5;p:add(scale);p.AbsoluteSize=V.new(450,300)
    w:native(V.new(360,140.5),V.new(60,45),V.new(336,213),1.5)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(636,308.5))
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(360,140.5))
end)end)
test("cumulative drag origin survives resize and ancestor-scale changes",function()withFixture("Frame",function(c,w,p)
    padding(p);w.Position=U.fromOffset(10,5);local origin={position=w.Position,absolute=w.AbsolutePosition}
    assert(c.moveWindow("window",30,20,origin));close(w.AbsolutePosition,V.new(370,148))
    p.AbsoluteSize=V.new(300,200);w:native(V.new(380,152),V.new(40,30),V.new(224,142),1)
    assert(c.moveWindow("window",10000,10000,origin));close(w.AbsolutePosition,V.new(524,239))
    local scale=instance("UIScale");scale.Scale=1.5;p:add(scale);p.AbsoluteSize=V.new(450,300)
    w:native(V.new(636,308.5),V.new(60,45),V.new(336,213),1.5)
    assert(c.moveWindow("window",-10000,-10000,origin));close(w.AbsolutePosition,V.new(360,140.5))
end)end)
test("external Scale edit invalidates a cumulative drag without overwriting it",function()withFixture("Frame",function(c,w,p)
    p.AbsolutePosition=V.zero;p.AbsoluteSize=V.new(100,100)
    w.Position=U.new(.25,0,.25,0);w:native(V.new(25,25),V.new(20,20),V.new(100,100),1)
    local origin={position=w.Position,absolute=w.AbsolutePosition}
    assert(c.moveWindow("window",10,10,origin));close(w.AbsolutePosition,V.new(35,35))
    w.Position=U.new(.5,10,.5,10);local external=w.Position;local absolute=w.AbsolutePosition
    assert(not c.moveWindow("window",-10000,-10000,origin));assert(w.Position==external);close(w.AbsolutePosition,absolute)
    c.destroy();assert(w.Position==external,"Disposal overwrote the external Scale edit")
end)end)
test("Scale position and centered anchor retain legal fractional bounds",function()withFixture("Frame",function(c,w,p)
    padding(p);w.AnchorPoint=V.new(.5,.5);w.Position=U.new(.25,5,.75,9);w:native(V.new(351,199.5),V.new(40,30),V.new(144,110),1)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(434,202.5));assert(w.Position.X.Scale==.25 and w.Position.Y.Scale==.75)
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(330,123.5))
end)end)
for _,side in ipairs({"Right","Left"})do
    test("scroll viewport intersects padded canvas after scroll: "..side,function()withFixture("ScrollingFrame",function(c,w,p)
        p.AbsolutePosition=V.new(600,100);p.AbsoluteSize=V.new(220,160);p.VerticalScrollBarPosition=E.VerticalScrollBarPosition[side];padding(p)
        w:native(V.new(590,107),V.new(40,30),V.new(384,302),1)
        assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(side=="Left" and 613 or 600,107))
        assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(side=="Left" and 780 or 767,217))
    end)end)
end
test("canvas-end padding trims the visible right and bottom edges",function()withFixture("ScrollingFrame",function(c,w,p)
    p.AbsolutePosition=V.new(600,100);p.AbsoluteSize=V.new(220,160);padding(p)
    w:native(V.new(367,-106),V.new(40,30),V.new(384,302),1)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(711,166))
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(600,100))
end)end)
test("Always left inset remains native even when no scrollbar track is visible",function()withFixture("ScrollingFrame",function(c,w,p)
    p.AbsolutePosition=V.new(600,100);p.AbsoluteSize=V.new(220,160);p.AbsoluteWindowSize=V.new(220,160);p.AbsoluteCanvasSize=V.new(207,147);p.VerticalScrollBarPosition=E.VerticalScrollBarPosition.Left
    w:native(V.new(613,100),V.new(40,30),V.new(207,147),1)
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(613,100))
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(780,217))
end)end)
test("scroll UIScale and native snapped origin are not guessed from CanvasPosition",function()withFixture("ScrollingFrame",function(c,w,p)
    padding(p);local scale=instance("UIScale");scale.Scale=1.5;p:add(scale)
    p.AbsolutePosition=V.new(300,100);p.AbsoluteSize=V.new(330,240);p.AbsoluteWindowSize=V.new(310.5,220.5);p.AbsoluteCanvasSize=V.new(750,600);p.VerticalScrollBarPosition=E.VerticalScrollBarPosition.Left
    w:native(V.new(339.5,130.5),V.new(60,45),V.new(576,453),1.5)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(569,274.5))
    assert(c.moveWindow("window",-10000,-10000));close(w.AbsolutePosition,V.new(339.5,130.5))
end)end)
test("direct collector bounds use native inset and safe-area dimensions",function()withFixture("ScreenGui",function(c,w,p)
    p.AbsolutePosition=V.new(0,36);p.AbsoluteSize=V.new(800,564)
    w.AnchorPoint=V.new(.5,.5);w.Position=U.new(.25,10,.2,20);w:native(V.new(170,148.8),V.new(80,40),V.new(800,564),1)
    assert(c.moveWindow("window",10000,10000));assert(w.AbsolutePosition.X==720 and w.AbsolutePosition.Y>=559 and w.AbsolutePosition.Y<=560)
    assert(c.moveWindow("window",-10000,-10000));assert(w.AbsolutePosition.X==0 and w.AbsolutePosition.Y>=36 and w.AbsolutePosition.Y<=37)
end)end)
test("zero content refuses movement; oversized windows pin the leading edge",function()withFixture("Frame",function(c,w,p)
    local pad=padding(p);pad.PaddingRight=rbx.UDim.new(1,0);local initial=w.Position
    assert(not c.moveWindow("window",10,10) and w.Position==initial)
    pad.PaddingRight=rbx.UDim.new(.1,6);w:native(V.new(330,123),V.new(180,140),V.new(144,110),1)
    assert(c.moveWindow("window",10000,10000));close(w.AbsolutePosition,V.new(330,123))
end)end)
test("unrestricted movement and external edits retain existing disposal semantics",function()withFixture("Frame",function(c,w,p)
    padding(p);local initial=w.Position;assert(c.moveWindow("window",30,20));close(w.AbsolutePosition,V.new(360,143))
    w.Position=U.fromOffset(200,100);c.destroy();assert(w.Position==U.fromOffset(200,100) and not c.moveWindow("window",1,1))
end,false)end)
print(serde.encode("json",{passed=passed,failed=#failures,failures=failures,scope="Actual trusted runtime with fixed native-derived geometry inputs; native pointer, safe-inset Play and engine layout acceptance not established"}))
assert(#failures==0,"Window content-bounds regression failed")
