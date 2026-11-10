-- Execute the actual trusted control runtime with signals, not native UI input.
local fs,serde,rbx=require("@lune/fs"),require("@lune/serde"),require("@lune/roblox")
local function signal()
    local list={}
    return {Connect=function(_,fn)local c={Connected=true};function c:Disconnect()self.Connected=false end;table.insert(list,{fn,c});return c end,
        Fire=function(_,...)for _,p in ipairs(table.clone(list))do if p[2].Connected then p[1](...)end end end}
end
local function instance(class)
    local properties={Visible=true,Enabled=true,Active=true,Interactable=true,GuiState=rbx.Enum.GuiState.Idle}
    local attributes,changes={},{}
    for _,key in ipairs({"MouseEnter","MouseLeave","SelectionGained","SelectionLost"})do properties[key]=signal()end
    local methods={}
    function methods:IsA(k)return k==class or k=="LayerCollector" and class=="ScreenGui" or k=="GuiObject" and class~="ScreenGui" or k=="GuiButton" and class=="TextButton"end
    function methods:GetAttribute(k)return attributes[k]end
    function methods:SetAttribute(k,v)attributes[k]=v end
    function methods:GetPropertyChangedSignal(k)changes[k]=changes[k]or signal();return changes[k]end
    function methods:IsDescendantOf(root)local p=properties.Parent;while p do if p==root then return true end;p=p.Parent end;return false end
    return setmetatable({}, {__index=function(_,k)return methods[k]or properties[k]end,__newindex=function(_,k,v)if properties[k]~=v then properties[k]=v;if changes[k]then changes[k]:Fire()end end end})
end
local Input={InputBegan=signal(),InputChanged=signal(),InputEnded=signal(),WindowFocusReleased=signal(),GetFocusedTextBox=function()return nil end}
local Run={Heartbeat=signal()}
local Gui={SelectedObject=nil}
local environment={game={GetService=function(_,k)return assert(({UserInputService=Input,RunService=Run,GuiService=Gui})[k],k)end},Enum=rbx.Enum}
setmetatable(environment,{__index=getfenv()})
local chunk=assert(loadstring(fs.readFile(".artifacts/tooltip-input/controls-runtime.luau")));setfenv(chunk,environment);local mount=chunk()
local touch={UserInputType=rbx.Enum.UserInputType.Touch}
local function withFixture(body,delay)
    Gui.SelectedObject=nil
    local root=instance("ScreenGui");local parent=instance("Frame");parent.Parent=root
    local owner=instance("TextButton");owner.Parent=parent
    local panel=instance("Frame");panel.Parent=parent
    local c=mount(root,{tip=owner,tooltip=panel},{tip={control={kind="tooltip",target="tooltip",delay=delay or .2}}},{})
    local ok,why=xpcall(function()body(c,owner,panel,parent,root)end,debug.traceback)
    c.destroy();assert(c.connectionCount()==0,"Control listeners leaked")
    assert(ok,why)
end
local passed,failures=0,{}
local function test(name,body)
    local ok,why=xpcall(body,debug.traceback)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end
end
local function step(seconds)Run.Heartbeat:Fire(seconds)end
for _,kind in ipairs({"hover","selection","public focus"})do
    test("first touch after "..kind.." starts its delay and opens",function()withFixture(function(c,o,p)
        if kind=="hover"then o.MouseEnter:Fire()elseif kind=="selection"then Gui.SelectedObject=o;o.SelectionGained:Fire()else assert(c.focusTooltip("tip",true))end
        step(.05);assert(not p.Visible)
        assert(c.activate("tip",touch));step(.19);assert(not p.Visible);step(.01);assert(p.Visible)
    end)end)
end
test("incidental hover and selection changes cannot cancel open or reopen a second-tap dismissal",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));o.MouseLeave:Fire();o.SelectionLost:Fire();o.MouseEnter:Fire();o.SelectionGained:Fire();step(.2);assert(p.Visible)
    assert(c.activate("tip",touch));assert(not p.Visible)
    o.MouseEnter:Fire();o.SelectionGained:Fire();o.MouseLeave:Fire();o.SelectionLost:Fire();step(.2);assert(not p.Visible)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
end)end)
for _,gate in ipairs({"active","interactable","owner","ancestor","root"})do
    test(gate.." cancellation clears the touch latch before re-enable",function()withFixture(function(c,o,p,parent,root)
        assert(c.activate("tip",touch));step(.2);assert(p.Visible)
        if gate=="active"then o.Active=false elseif gate=="interactable"then o.Interactable=false elseif gate=="owner"then o.Visible=false elseif gate=="ancestor"then parent.Visible=false else root.Enabled=false end
        step(.1);assert(not p.Visible and not c.activate("tip",touch))
        o.Active=true;o.Interactable=true;o.Visible=true;parent.Visible=true;root.Enabled=true
        assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    end)end)
end
test("public cancellation and window focus loss reset tap state",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    assert(c.focusTooltip("tip",false));assert(not p.Visible)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    Input.WindowFocusReleased:Fire();assert(not p.Visible)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
end)end)
test("mouse movement relinquishes touch and preserves normal hover delay",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    Input.InputChanged:Fire({UserInputType=rbx.Enum.UserInputType.MouseMovement});assert(not p.Visible)
    o.GuiState=rbx.Enum.GuiState.Hover;o.MouseEnter:Fire();step(.1)
    Input.InputChanged:Fire({UserInputType=rbx.Enum.UserInputType.MouseMovement});step(.1);assert(p.Visible,"Repeated movement reset passive delay")
    o.GuiState=rbx.Enum.GuiState.Idle;o.MouseLeave:Fire();assert(not p.Visible)
end)end)
test("mouse takeover retains selected focus and resets the next touch toggle",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    assert(c.activate("tip",touch));assert(not p.Visible)
    Gui.SelectedObject=o;Input.InputChanged:Fire({UserInputType=rbx.Enum.UserInputType.MouseMovement});step(.2);assert(p.Visible)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
end)end)
for _,kind in ipairs({rbx.Enum.UserInputType.Keyboard,rbx.Enum.UserInputType.Gamepad1})do
    test(kind.Name.." takeover restores legitimate selection gain/loss",function()withFixture(function(c,o,p)
        assert(c.activate("tip",touch));step(.2);assert(p.Visible)
        Input.InputBegan:Fire({UserInputType=kind},false)
        Gui.SelectedObject=o;o.SelectionGained:Fire();step(.2);assert(p.Visible)
        Gui.SelectedObject=nil;o.SelectionLost:Fire();assert(not p.Visible)
        assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    end)end)
end
test("nil and mouse activation preserve generic toggle behavior",function()withFixture(function(c,o,p)
    assert(c.activate("tip"));step(.2);assert(p.Visible)
    assert(c.activate("tip"));assert(not p.Visible)
    assert(c.activate("tip",{UserInputType=rbx.Enum.UserInputType.MouseButton1}));step(.2);assert(p.Visible)
end)end)
test("zero-delay first touch opens despite priming",function()withFixture(function(c,o,p)
    o.MouseEnter:Fire();assert(p.Visible);assert(c.activate("tip",touch));assert(p.Visible)
    assert(c.activate("tip",touch));assert(not p.Visible)
end,0)end)
test("destroy retains external target edits and disconnects every input/timer",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));step(.2);assert(p.Visible)
    p.Visible=false;c.destroy();assert(c.connectionCount()==0 and p.Visible==false and o:GetAttribute("FramebridgeTooltipVisible")==nil)
    o.MouseEnter:Fire();o.SelectionGained:Fire();Input.WindowFocusReleased:Fire();step(.2)
    assert(p.Visible==false and not c.activate("tip",touch))
end)end)
print(serde.encode("json",{passed=passed,failed=#failures,failures=failures,scope="Actual trusted runtime with simulated native signals and typed inputs; native touch presentation not established"}))
assert(#failures==0,"Tooltip input runtime regression failed")
