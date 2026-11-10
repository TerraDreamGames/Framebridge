-- Execute the trusted theme mount with lightweight signals and real Roblox datatypes.
-- These checks do not claim native pointer/device acceptance.
local fs=require("@lune/fs")
local serde=require("@lune/serde")
local roblox=require("@lune/roblox")
local function signal()
    local handlers={}
    return {Connect=function(self,fn)
        local c={Connected=true};function c:Disconnect() self.Connected=false end
        table.insert(handlers,{fn,c});return c
    end,Fire=function(self,...)
        local args=table.pack(...)
        for _,pair in ipairs(table.clone(handlers)) do if pair[2].Connected then pair[1](table.unpack(args,1,args.n)) end end
    end}
end
local queue={}
local function drain() for _=1,10 do if #queue==0 then return end;local work=queue;queue={};for _,fn in ipairs(work) do fn() end end;error("Unbounded theme scheduling") end
local function instance(class)
    local data={ClassName=class,Parent=nil,Enabled=true,Visible=true,Active=true,Interactable=true,GuiState="Default"}
    local attrs,propertySignals,attributeSignals,children={},{},{},{}
    local methods={}
    local object
    function methods:IsA(kind) return class==kind or kind=="LayerCollector" and class=="ScreenGui" or kind=="GuiObject" and class~="ScreenGui" and class~="UIShadow" end
    function methods:GetAttribute(key) return attrs[key] end
    function methods:SetAttribute(key,value) if attrs[key]~=value then attrs[key]=value;if attributeSignals[key] then attributeSignals[key]:Fire() end end end
    function methods:GetAttributeChangedSignal(key) attributeSignals[key]=attributeSignals[key] or signal();return attributeSignals[key] end
    function methods:GetPropertyChangedSignal(key) propertySignals[key]=propertySignals[key] or signal();return propertySignals[key] end
    function methods:GetDescendants() local result={};local function visit(node) for _,child in ipairs(node.children) do table.insert(result,child);visit(child) end end;visit(object);return result end
    function methods:SetRaw(key,value) data[key]=value end -- Simulate a deferred native property-change callback.
    function methods:Add(child) table.insert(children,child);child.Parent=object;object.DescendantAdded:Fire(child) end
    data.DescendantAdded=signal();data.DescendantRemoving=signal();data.Destroying=signal()
    object=setmetatable({children=children},{__index=function(_,key)return methods[key] or data[key] end,__newindex=function(_,key,value) if data[key]~=value then data[key]=value;if propertySignals[key] then propertySignals[key]:Fire() end end end})
    return object
end
local Gui=instance("GuiService")
local environment={
    game={GetService=function(_,key) if key=="HttpService" then return {JSONDecode=function(_,raw)return serde.decode("json",raw) end} elseif key=="GuiService" then return Gui end;error(key) end},
    Color3=roblox.Color3,UDim=roblox.UDim,UDim2=roblox.UDim2,Font=roblox.Font,
    Enum={GuiState={Hover="Hover",Press="Press"},FontWeight=roblox.Enum.FontWeight,FontStyle=roblox.Enum.FontStyle},
    task={defer=function(fn)table.insert(queue,fn) end},warn=function()end,
}
setmetatable(environment,{__index=getfenv()})
local source=fs.readFile(".artifacts/theme-tokens/theme-mount.luau")
local factory=assert(loadstring(source));setfenv(factory,environment);local mount=factory()
local fixture=serde.decode("json",fs.readFile(".artifacts/theme-tokens/design.framebridge.json"))
local function setup()
    local root=instance("ScreenGui");root:SetAttribute("FramebridgeSource",fixture.sourceId);root:SetAttribute("FramebridgeThemes",serde.encode("json",fixture.roots[1].themes));root:SetAttribute("FramebridgeId",fixture.roots[1].id)
    local nodes={}
    local function build(node,parent)
        local item=instance(node.className);nodes[node.id]=item
        item:SetAttribute("FramebridgeId",node.id);item:SetAttribute("FramebridgeSource",fixture.sourceId)
        if node.theme then item:SetAttribute("FramebridgeThemeBinding",serde.encode("json",node.theme)) end
        for key,value in pairs(node.properties) do
            if type(value)=="table" and value.type=="Color3" then item[key]=roblox.Color3.new(table.unpack(value.value))
            elseif type(value)=="table" and value.type=="UDim" then item[key]=roblox.UDim.new(table.unpack(value.value))
            elseif type(value)=="table" and value.type=="UDim2" then item[key]=roblox.UDim2.new(table.unpack(value.value))
            elseif type(value)=="table" and value.type=="Font" then item[key]=roblox.Font.new(value.family,roblox.Enum.FontWeight[value.weight],roblox.Enum.FontStyle[value.style])
            else item[key]=value end
        end
        parent:Add(item);for _,child in ipairs(node.children) do build(child,item) end
    end
    for _,child in ipairs(fixture.roots[1].children) do build(child,root) end
    return root,nodes,mount(root)
end
local passed=0
local function test(name,fn) fn();passed+=1;print(name) end
test("explicit switch resolves all bound native property types",function()
    local root,nodes,c=setup();assert(c.setTheme("Dark"));assert(nodes.buy.BackgroundColor3==roblox.Color3.new(0.1,0.12,0.2));assert(nodes.sell.BackgroundColor3==nodes.buy.BackgroundColor3)
    assert(nodes.heading.TextColor3==roblox.Color3.new(0.65,0.75,1));assert(nodes["buy/theme-shadow"].BlurRadius.Offset==12);assert(nodes.heading.FontFace.Family=="rbxasset://fonts/families/SourceSansPro.json")
    assert(not c.setTheme("Missing"));assert(root:GetAttribute("FramebridgeTheme")=="Dark");c.destroy()
end)
test("hover and gamepad focus use shared theme style and restore resting colors",function()
    local root,nodes,c=setup();nodes.buy.GuiState="Hover";assert(nodes.buy.BackgroundColor3==roblox.Color3.new(0.8,0.85,1));assert(nodes.sell.BackgroundColor3~=nodes.buy.BackgroundColor3)
    c.setTheme("Dark");assert(nodes.buy.BackgroundColor3==roblox.Color3.new(0.2,0.25,0.4));nodes.buy.Interactable=false;assert(nodes.buy.BackgroundColor3==roblox.Color3.new(0.1,0.12,0.2))
    nodes.buy.GuiState="Default";nodes.buy.Interactable=true;Gui.SelectedObject=nodes.sell;assert(nodes.sell.BackgroundColor3==roblox.Color3.new(0.2,0.25,0.4));root.Enabled=false;assert(nodes.sell.BackgroundColor3==roblox.Color3.new(0.1,0.12,0.2));Gui.SelectedObject=nil;c.destroy()
end)
test("application overrides survive switching and unrelated descendant rebuilds",function()
    local root,nodes,c=setup();nodes.buy.BackgroundColor3=roblox.Color3.new(1,0,0);c.setTheme("Dark");assert(nodes.buy.BackgroundColor3==roblox.Color3.new(1,0,0))
    root:Add(instance("Frame"));drain();c.setTheme("Light");assert(nodes.buy.BackgroundColor3==roblox.Color3.new(1,0,0));c.destroy();assert(nodes.buy.BackgroundColor3==roblox.Color3.new(1,0,0))
end)
test("deferred native property events cannot race a hover or mode update",function()
    local root,nodes,c=setup();nodes.buy:SetRaw("BackgroundColor3",roblox.Color3.new(1,0,0));nodes.buy.GuiState="Hover"
    assert(nodes.buy.BackgroundColor3==roblox.Color3.new(1,0,0));c.setTheme("Dark");assert(nodes.buy.BackgroundColor3==roblox.Color3.new(1,0,0));c.destroy()
end)
test("unknown explicit mode retains last valid property state",function()
    local root,nodes,c=setup();c.setTheme("Dark");local before=nodes.sell.BackgroundColor3;root:SetAttribute("FramebridgeTheme","Unknown");assert(root:GetAttribute("FramebridgeThemeStatus")=="Unknown theme" and nodes.sell.BackgroundColor3==before);c.destroy()
end)
test("changed bindings rebuild without duplicate subscriptions",function()
    local root,nodes,c=setup();local before=c.connectionCount();nodes.buy:SetAttribute("FramebridgeThemeBinding",nodes.buy:GetAttribute("FramebridgeThemeBinding").." ");drain();assert(c.connectionCount()==before);c.setTheme("Dark");assert(nodes.buy.BackgroundColor3==roblox.Color3.new(0.1,0.12,0.2));c.destroy()
end)
test("cleanup restores originals and stops all subscriptions",function()
    local root,nodes,c=setup();local before=nodes.buy.BackgroundColor3;c.setTheme("Dark");c.destroy();assert(c.connectionCount()==0 and nodes.buy.BackgroundColor3==before);root:SetAttribute("FramebridgeTheme","Light");nodes.buy.GuiState="Hover";assert(nodes.buy.BackgroundColor3==before and not c.setTheme("Dark"))
end)
print(serde.encode("json",{passed=passed,failed=0,scope="Theme runtime signals with real Roblox datatypes; native UI acceptance separate"}))
