-- Actual trusted engine with lightweight instance/signals; real Roblox value types.
-- Native rendering, actual installed Emitter2D and input acceptance are separate.
local fs,serde,rbx=require("@lune/fs"),require("@lune/serde"),require("@lune/roblox")
local function signal()
    local list={}
    return {Connect=function(_,fn)local c={Connected=true};function c:Disconnect()self.Connected=false end;table.insert(list,{fn,c});return c end,
        Fire=function(_,...)for _,p in ipairs(table.clone(list))do if p[2].Connected then p[1](...) end end end}
end
local function instance(class)
    local data={ClassName=class,Visible=true,Enabled=true,Active=true,Interactable=true,ZIndex=1,AbsoluteSize=rbx.Vector2.new(180,60)}
    local attributes,signals,children={},{},{}
    local object,methods
    methods={}
    function methods:IsA(kind)return kind==class or kind=="GuiObject" and ({Frame=true,TextButton=true,ImageButton=true,ImageLabel=true})[class]==true or kind=="GuiButton" and (class=="TextButton" or class=="ImageButton") or kind=="LayerCollector" and class=="ScreenGui" or kind=="LuaSourceContainer" and class=="LocalScript" end
    function methods:GetAttribute(key)return attributes[key]end
    function methods:SetAttribute(key,v)if attributes[key]~=v then attributes[key]=v;if signals[key]then signals[key]:Fire()end end end
    function methods:GetAttributeChangedSignal(key)signals[key]=signals[key] or signal();return signals[key]end
    function methods:GetChildren()return table.clone(children)end
    function methods:GetDescendants()local result={};for _,child in ipairs(children)do table.insert(result,child);for _,n in ipairs(child:GetDescendants())do table.insert(result,n)end end;return result end
    function methods:FindFirstChild(name)for _,child in ipairs(children)do if child.Name==name then return child end end end
    function methods:FindFirstAncestorWhichIsA(kind)local p=data.Parent;while p do if p:IsA(kind)then return p end;p=p.Parent end end
    function methods:Destroy()for _,child in ipairs(table.clone(children))do child:Destroy()end;object.Parent=nil;data.Destroyed=true end
    function methods:Clone()local copy=instance(class);for k,v in pairs(data)do if k~="Parent" and k~="Event" then copy[k]=v end end;for k,v in pairs(attributes)do copy:SetAttribute(k,v)end;for _,child in ipairs(children)do local n=child:Clone();n.Parent=copy end;return copy end
    if class=="BindableEvent"then data.Event=signal();function methods:Fire(...)data.Event:Fire(...)end end
    object=setmetatable({_children=children},{__index=function(_,k)return methods[k] or data[k] or methods.FindFirstChild(object,k)end,
        __newindex=function(_,k,v)if k=="Parent"and data.Parent~=v then if data.Parent then local old=data.Parent._children;local i=table.find(old,object);if i then table.remove(old,i)end end;if v then table.insert(v._children,object)end end;data[k]=v end})
    return object
end
local rep=instance("Folder")
local env={game={GetService=function(_,name)if name=="ReplicatedStorage"then return rep elseif name=="RunService"then return {RenderStepped=signal()}elseif name=="GuiService"then return {ReducedMotionEnabled=false}end;error(name)end},Instance={new=instance},
    Random={new=function(seed)return {NextNumber=function(_,lo,hi)seed=(seed*1664525+1013904223)%4294967296;return lo+(hi-lo)*seed/4294967296 end,NextInteger=function(self,lo,hi)return math.min(hi,math.floor(self:NextNumber(lo,hi+1)))end}end}}
for _,key in ipairs({"Color3","Vector2","UDim2","NumberRange","NumberSequence","ColorSequence","ColorSequenceKeypoint"})do env[key]=rbx[key]end
setmetatable(env,{__index=getfenv()})
local chunk=assert(loadstring(fs.readFile(".artifacts/ui-particles/particles.luau")));setfenv(chunk,env);local mount=chunk()
local fixture=serde.decode("json",fs.readFile(".artifacts/ui-particles/design.framebridge.json"))
local function setup(options,modify)
    local root=instance("ScreenGui");local nodes,configs={},{}
    local copy=serde.decode("json",serde.encode("json",fixture))
    local function build(node,parent)local n=instance(node.className);n.Name=node.name;n.Parent=parent;nodes[node.id]=n;configs[node.id]=node.behavior or {};for _,c in ipairs(node.children)do build(c,n)end end
    for _,n in ipairs(copy.roots[1].children)do build(n,root)end
    if modify then modify(nodes,configs,root)end
    return root,nodes,mount(root,nodes,configs,options or {autoParticles=false,reducedMotion=false})
end
local passed=0
local function test(name,fn)fn();passed+=1;print(name)end
test("native value physics, capacity, step clamp and expiry",function()
    local _,n,c=setup();assert(c.emit("celebrate",128)==24 and c.emit("celebrate")==0)
    local dot=n.celebrate["Framebridge particles"]:GetChildren()[1];local before=dot.Position
    c.step(999);assert(dot.Position~=before and dot.BackgroundTransparency==.2)
    c.clear("ambient");for _=1,5 do c.step(.1)end;assert(n.celebrate:GetAttribute("FramebridgeParticleCount")==0)
    assert(c.emit("celebrate",129)==0 and c.emit("celebrate",0/0)==0);c.destroy()
end)
test("seeded built-in emission is reproducible without mutating data",function()
    local _,a,c=setup();local _,b,d=setup();c.emit("celebrate");d.emit("celebrate")
    local x,y=a.celebrate["Framebridge particles"]:GetChildren(),b.celebrate["Framebridge particles"]:GetChildren()
    for i,p in ipairs(x)do assert(p.Position==y[i].Position and p.Rotation==y[i].Rotation and p.BackgroundColor3==y[i].BackgroundColor3)end
    c.step(.1);d.step(.1);for i,p in ipairs(x)do assert(p.Position==y[i].Position)end;c.destroy();d.destroy()
end)
test("ancestor visibility, reduced motion and clear cancel live work",function()
    local root,n,c=setup();assert(c.activate("celebrate"));n.celebrate:SetAttribute("FramebridgeParticlesClear",1);assert(n.celebrate:GetAttribute("FramebridgeParticleCount")==0)
    n.celebrate:SetAttribute("FramebridgeParticleBurst",1);assert(n.celebrate:GetAttribute("FramebridgeParticleCount")==12)
    root.Enabled=false;c.step(.1);assert(c.count()==0 and c.emit("celebrate")==0);root.Enabled=true
    n.celebrate:SetAttribute("FramebridgeParticlesEnabled",false);assert(c.emit("celebrate")==0);c.destroy()
    root,n,c=setup({autoParticles=false,reducedMotion=true});assert(c.count()==0 and c.emit("celebrate")==0);c.destroy()
end)
test("manual dependency handshake times out, recovers and respects conservative capacity",function()
    local _,n,c=setup();assert(n.external:GetAttribute("FramebridgeParticlesStatus")=="Missing or mismatched Emitter2D template")
    local folder=instance("Folder");folder.Name="FramebridgeParticleTemplates";folder.Parent=rep
    local wrapper=instance("Folder");wrapper.Name="FramebridgeParticleQA";wrapper:SetAttribute("FramebridgeEmitter2DContract",1);wrapper:SetAttribute("FramebridgeEmitter2DClientRevision","reviewed-qa-v1");wrapper.Parent=folder
    local template=instance("Frame");template.Name="Emitter";template:SetAttribute("ClassName","Emitter2D");template:SetAttribute("Version",1);template.Parent=wrapper
    for _,name in ipairs({"Emit","Clear"})do local stale=instance("BindableEvent");stale.Name=name;stale.Parent=template end
    assert(not c.retry("external"));for _=1,31 do c.step(.1)end;assert(n.external:GetAttribute("FramebridgeParticlesStatus")=="Emitter2D client unavailable; retry")
    local clone=n.external["Framebridge particles"]["Framebridge Emitter2D"];local emitted,cleared=0,0
    assert(not clone:FindFirstChild("Emit") and not clone:FindFirstChild("Clear"),"Cloned events falsely reported an installed client")
    for _,name in ipairs({"Emit","Clear"})do local e=instance("BindableEvent");e.Name=name;e.Parent=clone;e.Event:Connect(function(k)if name=="Emit"then emitted+=k else cleared+=1 end end)end
    assert(c.emit("external")==3 and c.emit("external",128)==3 and c.emit("external")==0 and emitted==6)
    for _=1,19 do c.step(.1)end;assert(n.external:GetAttribute("FramebridgeParticleCount")==6)
    c.clear("external");assert(cleared==1);c.step(.1);assert(cleared==1)
    c.destroy();folder:Destroy()
end)
test("global budget is bounded independently of per-emitter settings",function()
    local _,_,c=setup(nil,function(nodes,configs,root)
        table.clear(configs);for i=1,6 do local id="budget"..i;nodes[id]=instance("Frame");nodes[id].Parent=root
            local p=serde.decode("json",serde.encode("json",fixture.roots[1].children[1].children[2].behavior.particles));p.trigger="manual";p.count=128;p.capacity=128;p.rate=0;configs[id]={particles=p}
        end
    end)
    for i=1,6 do c.emit("budget"..i)end;assert(c.count()==512);c.destroy();assert(c.count()==0)
end)
test("invalid dynamic configuration is isolated and cleanup removes status and signals",function()
    local _,n,c=setup(nil,function(_,configs)configs.celebrate.particles.capacity=100000 end)
    assert(n.celebrate:GetAttribute("FramebridgeParticlesStatus")=="Invalid particle settings" and c.emit("celebrate")==0)
    assert(n.ambient:GetAttribute("FramebridgeParticlesStatus")=="Ready");c.destroy()
    assert(c.connectionCount()==0 and n.celebrate:GetAttribute("FramebridgeParticlesStatus")==nil and not n.ambient:FindFirstChild("Framebridge particles"))
    n.ambient:SetAttribute("FramebridgeParticleBurst",1);assert(c.count()==0)
end)
print(serde.encode("json",{passed=passed,failed=0,scope="Actual particle engine with lightweight instances/signals and Roblox values; installed engine/rendering/input separate"}))
