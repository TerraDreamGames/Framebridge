-- Run the complete trusted runtime with simulated topology and property signals.
-- This does not claim native replication, installed-plugin or physical input acceptance.
local fs,serde,rbx=require("@lune/fs"),require("@lune/serde"),require("@lune/roblox")
local process=require("@lune/process")
local queue,deferredProperties={},false
local function defer(fn)table.insert(queue,fn)end
local function drain()
    for _=1,30 do
        if #queue==0 then return end
        local work=queue;queue={};for _,fn in ipairs(work)do fn()end
    end
    error("Unbounded runtime scheduling")
end
local function signal(property)
    local handlers={}
    return {Connect=function(_,fn)
        local c={Connected=true};function c:Disconnect()self.Connected=false end
        table.insert(handlers,{fn,c});return c
    end,Fire=function(_, ...)
        local args=table.pack(...)
        for _,h in ipairs(table.clone(handlers))do
            if h[2].Connected then
                local function invoke()if h[2].Connected then h[1](table.unpack(args,1,args.n))end end
                if property and deferredProperties then defer(invoke)else invoke()end
            end
        end
    end}
end
local function instance(class)
    local children,attributes,changes,attributeChanges={},{},{},{}
    local data={ClassName=class,Name=class,Visible=true,Enabled=true,Active=true,Interactable=true,LayoutOrder=0,GuiState=rbx.Enum.GuiState.Idle,
        Position=rbx.UDim2.fromOffset(0,0),Size=rbx.UDim2.fromOffset(100,100),AbsoluteSize=rbx.Vector2.new(100,100),Rotation=0,Scale=1,AutomaticSize=rbx.Enum.AutomaticSize.None}
    for _,k in ipairs({"DescendantAdded","DescendantRemoving","ChildAdded","ChildRemoved","Destroying","AncestryChanged","Activated"})do data[k]=signal()end
    local object,methods=nil,{}
    function methods:IsA(k)
        return class==k or k=="LayerCollector" and class=="ScreenGui"
            or k=="GuiObject" and (class=="Frame" or class=="TextButton")
            or k=="GuiButton" and class=="TextButton"
    end
    function methods:GetAttribute(k)return attributes[k]end
    function methods:SetAttribute(k,v)
        if attributes[k]~=v then attributes[k]=v;if attributeChanges[k]then attributeChanges[k]:Fire()end end
    end
    function methods:GetAttributeChangedSignal(k)attributeChanges[k]=attributeChanges[k]or signal();return attributeChanges[k]end
    function methods:GetPropertyChangedSignal(k)changes[k]=changes[k]or signal(true);return changes[k]end
    function methods:GetChildren()return table.clone(children)end
    function methods:GetDescendants()
        local out={};local function visit(n)for _,c in ipairs(n:GetChildren())do table.insert(out,c);visit(c)end end
        visit(object);return out
    end
    function methods:FindFirstChildOfClass(k)for _,c in ipairs(children)do if c:IsA(k)then return c end end end
    function methods:IsDescendantOf(root)local p=data.Parent;while p do if p==root then return true end;p=p.Parent end;return false end
    function methods:add(c)table.insert(children,c)end
    function methods:remove(c)local index=table.find(children,c);if index then table.remove(children,index)end end
    function methods:Destroy()
        data.Destroying:Fire();for _,c in ipairs(table.clone(children))do c:Destroy()end;object.Parent=nil
    end
    object=setmetatable({}, {__index=function(_,k)return methods[k]or data[k]end,__newindex=function(_,k,v)
        if data[k]==v then return end
        if k=="Parent"then
            local descendants={object};for _,c in ipairs(methods.GetDescendants())do table.insert(descendants,c)end
            local old=data.Parent
            if old then
                local current=old;while current do for _,c in ipairs(descendants)do current.DescendantRemoving:Fire(c)end;current=current.Parent end
                old:remove(object);old.ChildRemoved:Fire(object)
            end
            data.Parent=v
            if v then
                v:add(object);v.ChildAdded:Fire(object)
                local current=v;while current do for _,c in ipairs(descendants)do current.DescendantAdded:Fire(c)end;current=current.Parent end
            end
            data.AncestryChanged:Fire(object,v)
        else data[k]=v end
        if changes[k]then changes[k]:Fire()end
    end})
    return object
end
local Gui=instance("GuiService")
local Run={Heartbeat=signal()}
local Input={InputBegan=signal(),InputChanged=signal(),InputEnded=signal(),WindowFocusReleased=signal(),GetFocusedTextBox=function()return nil end}
local guid=0
local Http={JSONDecode=function(_,raw)return serde.decode("json",raw)end,JSONEncode=function(_,value)return serde.encode("json",value)end,
    GenerateGUID=function()guid+=1;return tostring(guid)end}
local services={HttpService=Http,Players={},GuiService=Gui,RunService=Run,UserInputService=Input,TextService={}}
local environment={game={GetService=function(_,name)return assert(services[name],name)end},Enum=rbx.Enum,Instance={new=instance},
    Vector2=rbx.Vector2,UDim2=rbx.UDim2,Color3=rbx.Color3,task={defer=defer},warn=function(message)error(message)end}
setmetatable(environment,{__index=getfenv()})
local runtimeSource=fs.readFile(process.args[1] or ".artifacts/tab-startup-order/runtime.luau")
local chunk=assert(loadstring(runtimeSource));setfenv(chunk,environment);local Runtime=chunk()
for _,name in ipairs({"client-0.luau","client-1.luau","client-2.luau","client-3.luau"})do
    assert(loadstring(fs.readFile(".artifacts/tab-startup-order/"..name)),name.." failed to compile")
end
local function managed(class,id,config,visible,order)
    local o=instance(class);o:SetAttribute("FramebridgeId",id);o:SetAttribute("FramebridgeSource","tab-order-regression")
    if config then o:SetAttribute("FramebridgeBehavior",Http:JSONEncode(config))end
    if visible~=nil then o.Visible=visible end;o.LayoutOrder=order or 0
    return o
end
local function fixture(body)
    local root=managed("ScreenGui","screen")
    local controllers={}
    local function mount()
        local c=Runtime.mount(root,{manualControls=true,manualMotion=true,manualKeyframes=true})
        table.insert(controllers,c);drain();return c
    end
    local function group(id)local g=managed("Frame",id,{role="tabGroup"});g.Parent=root;return g end
    local function panel(g,id,shown,order)local p=managed("Frame",id,{role="panel"},shown,order);p.Parent=g;return p end
    local function tab(id,target)local b=managed("TextButton",id,{action={kind="tab",target=target}});b.Parent=root;return b end
    local ok,why=xpcall(function()body(root,mount,group,panel,tab)end,debug.traceback)
    for _,c in ipairs(controllers)do c.destroy();assert(c.connectionCount()==0,"Runtime subscriptions leaked")end
    drain();root:Destroy();drain();assert(ok,why)
end
local passed,failures=0,{}
local function test(name,body)
    local ok,why=xpcall(body,debug.traceback)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end
end
for _,deferred in ipairs({false,true})do
    deferredProperties=deferred
    local mode=deferred and "deferred signals: " or "immediate signals: "
    test(mode.."hidden panel-two first yields to late authored panel-one",function()fixture(function(_,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",false,2);local b2=tab("tab-two","two")
        local c=mount();assert(two.Visible,"Missing provisional fallback")
        local one=panel(g,"one",true,1);local b1=tab("tab-one","one");drain()
        assert(one.Visible and not two.Visible,"Fallback visibility replaced author intent")
        assert(b1:GetAttribute("FramebridgeSelected")==true and b2:GetAttribute("FramebridgeSelected")==false)
        assert(c.activate("tab-two") and two.Visible and not one.Visible)
    end)end)
    test(mode.."reversed complete registration preserves intentional second tab",function()fixture(function(_,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",true,2);local one=panel(g,"one",false,1)
        tab("tab-two","two");mount();assert(two.Visible and not one.Visible)
    end)end)
    test(mode.."all-hidden fallback follows authored order after late arrival",function()fixture(function(_,mount,group,panel)
        local g=group("tabs");local two=panel(g,"two",false,2);mount();assert(two.Visible)
        local one=panel(g,"one",false,1);drain();assert(one.Visible and not two.Visible)
    end)end)
    test(mode.."both authored visible use order, independent of incremental registration",function()fixture(function(_,mount,group,panel)
        local g=group("tabs");local two=panel(g,"two",true,2);mount()
        local one=panel(g,"one",true,1);drain();assert(one.Visible and not two.Visible)
    end)end)
    test(mode.."explicit activation locks choice before a late default arrives",function()fixture(function(root,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",false,2);tab("tab-two","two");local c=mount()
        assert(c.activate("tab-two"));drain()
        local one=panel(g,"one",true,1);drain();assert(two.Visible and not one.Visible)
        local extra=managed("Frame","extra");extra.Parent=root;drain()
        two:SetAttribute("FramebridgeBehavior",Http:JSONEncode({role="panel",motion={}}));drain()
        assert(two.Visible and not one.Visible,"Rebuild reset selected tab")
    end)end)
    test(mode.."multiple groups initialize and keep selections independently",function()fixture(function(_,mount,group,panel,tab)
        local a,b=group("a"),group("b");local a2,b2=panel(a,"a-two",false,2),panel(b,"b-two",true,2)
        tab("a-tab-two","a-two");local c=mount();assert(c.activate("a-tab-two"))
        local a1,b1=panel(a,"a-one",true,1),panel(b,"b-one",false,1);drain()
        assert(a2.Visible and not a1.Visible and b2.Visible and not b1.Visible)
    end)end)
    test(mode.."selected removal chooses a present panel and additions retain that choice",function()fixture(function(_,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",false,2);local one=panel(g,"one",true,1)
        tab("tab-two","two");local c=mount();assert(c.activate("tab-two"));drain()
        two.Parent=nil;drain();assert(one.Visible)
        local zero=panel(g,"zero",true,0);two.Parent=g;drain()
        assert(one.Visible and not zero.Visible and not two.Visible,"Late addition reset removal fallback")
    end)end)
    test(mode.."external visible selection survives a later authored default",function()fixture(function(_,mount,group,panel)
        local g=group("tabs");local two=panel(g,"two",false,2);local one=panel(g,"one",true,1);mount()
        two.Visible=true;one.Visible=false;drain()
        local zero=panel(g,"zero",true,0);drain();assert(two.Visible and not one.Visible and not zero.Visible)
    end)end)
    test(mode.."ordinary panel actions keep their explicit visibility choice on rebuild",function()fixture(function(root,mount,group,panel)
        local g=group("tabs");local two=panel(g,"two",false,2);local one=panel(g,"one",true,1)
        local open=managed("TextButton","open-two",{action={kind="open",target="two"}});open.Parent=root
        local close=managed("TextButton","close-two",{action={kind="close",target="two"}});close.Parent=root
        local c=mount();assert(c.activate("open-two"))
        local zero=panel(g,"zero",true,0);drain();assert(two.Visible and not one.Visible and not zero.Visible)
        assert(c.activate("close-two"));zero:SetAttribute("FramebridgeBehavior",Http:JSONEncode({role="panel",motion={}}));drain()
        assert(zero.Visible and not one.Visible and not two.Visible,"All-hidden explicit close did not recover a fallback")
    end)end)
    test(mode.."a replacement group does not inherit the removed group's explicit choice",function()fixture(function(_,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",false,2);panel(g,"one",true,1)
        tab("tab-two","two");local c=mount();assert(c.activate("tab-two"));drain()
        g.Parent=nil;drain()
        local replacement=group("tabs");local freshTwo=panel(replacement,"two",false,2);local freshOne=panel(replacement,"one",true,1);drain()
        assert(freshOne.Visible and not freshTwo.Visible and two.Visible,"Stale group choice leaked into replacement")
    end)end)
    test(mode.."motion-slot panels use slot order and synchronized visibility",function()fixture(function(_,mount,group,panel)
        local g=group("tabs");local two=panel(g,"two",false,2);mount()
        local slot=managed("Frame","one/motion-slot",nil,true,1);slot.Parent=g
        local one=managed("Frame","one",{role="panel",motion={slot="one/motion-slot"}},true,99);one.Parent=slot;drain()
        assert(one.Visible and slot.Visible and not two.Visible)
    end)end)
    test(mode.."same-order panels use stable identity instead of creation order",function()fixture(function(_,mount,group,panel)
        local g=group("tabs");local z=panel(g,"z",false,0);mount()
        local a=panel(g,"a",false,0);drain();assert(a.Visible and not z.Visible)
    end)end)
    test(mode.."destroy cancels queued work and remount captures the current selection",function()fixture(function(_,mount,group,panel,tab)
        local g=group("tabs");local two=panel(g,"two",false,2);local one=panel(g,"one",true,1)
        local b=tab("tab-two","two");local c=mount();assert(c.activate("tab-two"));drain()
        panel(g,"zero",false,0);c.destroy();assert(c.connectionCount()==0);drain()
        assert(two.Visible and not one.Visible and not c.activate("tab-two"))
        b.Activated:Fire();drain();assert(two.Visible and not one.Visible)
        mount();assert(two.Visible and not one.Visible)
    end)end)
end
print(serde.encode("json",{passed=passed,failed=#failures,failures=failures,scope="Actual trusted runtime; simulated registration and immediate/deferred property signals; four client variants compile; installed startup unverified"}))
assert(#failures==0,"Tab startup runtime regression failed")
