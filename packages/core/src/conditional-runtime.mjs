// Static product code. Rule JSON is decoded as bounded data and is never evaluated.
export const CONDITIONAL_VALIDATOR = String.raw`local Rules = {}
local function fields(v, names)
    if type(v)~="table" then return false end
    for key in pairs(v) do if not names[key] then return false end end
    return true
end
local function set(words) local out={};for word in words:gmatch("%S+") do out[word]=true end;return out end
local function list(v,limit)
    if type(v)~="table" or #v<1 or #v>limit then return false end
    local count=0;for key in pairs(v) do if type(key)~="number" or key%1~=0 or key<1 or key>#v then return false end;count+=1 end
    return count==#v
end
local function scalar(v) return type(v)=="boolean" or (type(v)=="string" and #v<=4096) or (type(v)=="number" and v==v and math.abs(v)<1e9) end
local function identity(v) return type(v)=="string" and #v>0 and #v<=256 and v:find("%S")~=nil end
function Rules.validPredicate(p)
    if not fields(p,set("source key operator value")) or not set("attribute leaderstats viewport")[p.source] or type(p.key)~="string" or #p.key>128 or not p.key:match("^[%a_][%w_-]*$") then return false end
    if p.source=="viewport" and p.key~="width" and p.key~="height" then return false end
    if p.operator=="exists" or p.operator=="missing" then return p.value==nil end
    if not set("eq ne lt lte gt gte")[p.operator] or not scalar(p.value) then return false end
    if p.source=="viewport" and type(p.value)~="number" then return false end
    return p.operator=="eq" or p.operator=="ne" or type(p.value)=="number"
end
function Rules.validAction(a)
    if not fields(a,set("target property value")) or not identity(a.target) then return false end
    local p=a.property
    if p=="Visible" or p=="Interactable" then return type(a.value)=="boolean" end
    if p=="Text" then return type(a.value)=="string" and #a.value<=4096 end
    if set("BackgroundTransparency TextTransparency ImageTransparency")[p] then return type(a.value)=="number" and a.value==a.value and a.value>=0 and a.value<=1 end
    if not set("BackgroundColor3 TextColor3 ImageColor3")[p] then return false end
    local v=a.value
    if not fields(v,set("type value")) or v.type~="Color3" or not list(v.value,3) or #v.value~=3 then return false end
    for _,n in ipairs(v.value) do if type(n)~="number" or n~=n or n<0 or n>1 then return false end end
    return true
end
function Rules.valid(rules)
    if not list(rules,8) then return false end
    local ids={}
    local function actions(items)
        if not list(items,8) then return false end
        local seen={}
        for _,a in ipairs(items) do
            if not Rules.validAction(a) then return false end
            local key=a.target.."/"..a.property;if seen[key] then return false end;seen[key]=true
        end
        return true
    end
    for _,r in ipairs(rules) do
        if not fields(r,set("id branches else")) or type(r.id)~="string" or #r.id>64 or not r.id:match("^[%a_][%w_-]*$") or ids[r.id] or not list(r.branches,8) then return false end
        ids[r.id]=true
        for _,b in ipairs(r.branches) do
            if not fields(b,set("when then")) or not fields(b.when,set("mode predicates")) or (b.when.mode~="all" and b.when.mode~="any") or not list(b.when.predicates,8) or not actions(b["then"]) then return false end
            for _,p in ipairs(b.when.predicates) do if not Rules.validPredicate(p) then return false end end
        end
        if r["else"]~=nil and not actions(r["else"]) then return false end
    end
    local ok,encoded=pcall(function() return game:GetService("HttpService"):JSONEncode(rules) end)
    return ok and #encoded<=12288
end
function Rules.actions(r)
    local out={};for _,b in ipairs(r.branches) do for _,a in ipairs(b["then"]) do table.insert(out,a) end end
    for _,a in ipairs(r["else"] or {}) do table.insert(out,a) end;return out
end
function Rules.compatible(class,p)
    if class:match("^UI") or set("ScreenGui SurfaceGui BillboardGui")[class] then return false end
    if p=="Interactable" then return class=="TextButton" or class=="ImageButton" end
    if p:match("^Text") then return set("TextLabel TextButton TextBox")[class]==true end
    if p:match("^Image") then return set("ImageLabel ImageButton ViewportFrame")[class]==true end
    return true
end
function Rules.validate(nodes)
    local byId,owned,parents,tabTargets,tooltipTargets,count={},{},{},{},{},0
    for _,n in ipairs(nodes) do
        byId[n.id]=n;for _,child in ipairs(n.children or {}) do if child.id then parents[child.id]=n end end
        local action=n.behavior and n.behavior.action;if action and action.kind=="tab" then tabTargets[action.target]=true end
        local control=n.behavior and n.behavior.control;if control and control.kind=="tooltip" then tooltipTargets[control.target]=true end
    end
    for _,n in ipairs(nodes) do
        local rules=n.behavior and n.behavior.rules
        if rules~=nil then
            assert(Rules.valid(rules),"Invalid conditional rules.");count+=#rules;assert(count<=32,"Screen rule limit exceeded.")
            for _,r in ipairs(rules) do for _,a in ipairs(Rules.actions(r)) do
                local target=byId[a.target]
                assert(target and Rules.compatible(target.className,a.property) and not target.maskBasis and not target.decorationRect and target.sourceType~="MOTION_SLOT","Conditional actions need compatible targets in the same screen.")
                local b=target.behavior or {}
                assert(not (target.theme and (target.theme.base[a.property] or (target.theme.hover and target.theme.hover[a.property]))),"Conditional action conflicts with a theme property owner.")
                if a.property:match("Color3$") then for _,child in ipairs(target.children or {}) do assert(child.className~="UIGradient","Conditional color requires a flat fill.") end end
                if a.property:match("Transparency$") then
                    local ancestor=target
                    while ancestor and ancestor.className~="CanvasGroup" do local behavior=ancestor.behavior or {};local motion=behavior.motion;assert(not (behavior.keyframes or (motion and (motion.enter or motion.blink))),"Conditional transparency conflicts with an animated fade owner.");ancestor=parents[ancestor.id] end
                end
                assert(not ((a.property=="Visible" and (b.state or b.role=="tabGroup" or tooltipTargets[target.id] or (b.role=="panel" and tabTargets[target.id]))) or (a.property=="Text" and b.binding) or (a.property:match("Color3$") and b.motion and b.motion.hover and b.motion.hover.tint)),"Conditional property ownership conflict.")
                local key=a.target.."/"..a.property;assert(not owned[key] or owned[key]==r,"Only one conditional rule may own each target property.");owned[key]=r
            end end
        end
    end
end
function Rules.test(p,data)
    local source=data[p.source];local v=source and source[p.key];local exists=scalar(v)
    if p.operator=="exists" then return exists end;if p.operator=="missing" then return not exists end
    if not exists or type(v)~=type(p.value) then return false end
    if p.operator=="eq" then return v==p.value end;if p.operator=="ne" then return v~=p.value end
    if type(v)~="number" then return false end
    if p.operator=="lt" then return v<p.value end;if p.operator=="lte" then return v<=p.value end;if p.operator=="gt" then return v>p.value end;return v>=p.value
end
function Rules.evaluate(r,data)
    for index,b in ipairs(r.branches) do
        local pass=b.when.mode=="all"
        for _,p in ipairs(b.when.predicates) do local result=Rules.test(p,data);if b.when.mode=="all" then pass=pass and result else pass=pass or result end end
        if pass then return b["then"],index end
    end
    return r["else"] or {},0
end
return Rules`;

export const CONDITIONAL_RUNTIME = String.raw`local Rules=(function()
${CONDITIONAL_VALIDATOR}
end)()
local function mountRules(root,nodes,configs,options,onChange)
    local controller={};local connections,watchers,playerNames,originals={},{},{},{}
    local dataChildLimit=1024
    local playerTopologyValid,dataOverflowWarned=true,false
    local destroyed,queued=false,false
    local data={attribute={},leaderstats={},viewport={}}
    local active,descriptors,inputs={},{},{}
    for id,node in pairs(nodes) do
        local config=configs[id]
        local children={};for _,child in ipairs(node:GetChildren()) do table.insert(children,{id=child:GetAttribute("FramebridgeId"),className=child.ClassName}) end
        table.insert(descriptors,{id=id,className=node.ClassName,behavior=config,children=children,maskBasis=node:GetAttribute("FramebridgeMaskBasis"),decorationRect=node:GetAttribute("FramebridgeDecorationRect"),sourceType=id:sub(-12)=="/motion-slot" and "MOTION_SLOT" or nil})
        if config and config.rules then
            for _,r in ipairs(config.rules) do
                table.insert(active,{owner=node,rule=r})
                for _,b in ipairs(r.branches) do for _,p in ipairs(b.when.predicates) do inputs[p.source.."/"..p.key]=p end end
            end
        end
    end
    Rules.validate(descriptors)
    local function connect(list,signal,callback) table.insert(list,signal:Connect(function(...) if not destroyed then callback(...) end end)) end
    local function disconnect(list) for _,c in ipairs(list) do c:Disconnect() end;table.clear(list) end
    local function escape(s) return (s:gsub("&","&amp;"):gsub("<","&lt;"):gsub(">","&gt;"):gsub('"',"&quot;")) end
    local function design(instance)
        local raw=instance:GetAttribute("FramebridgeBehavior")
        local id=instance:GetAttribute("FramebridgeId")
        if raw==nil and type(id)=="string" and id:sub(-12)=="/motion-slot" then
            for _,child in ipairs(instance:GetChildren()) do if child:GetAttribute("FramebridgeId")==id:sub(1,-13) then raw=child:GetAttribute("FramebridgeBehavior");break end end
        end
        if type(raw)~="string" or #raw>16384 then return nil end
        local ok,value=pcall(game:GetService("HttpService").JSONDecode,game:GetService("HttpService"),raw)
        return ok and type(value)=="table" and value.ruleDesign or nil
    end
    local function remember(instance,p)
        originals[instance]=originals[instance] or {};local original=originals[instance][p]
        if not original then original={value=instance[p],design=design(instance)};originals[instance][p]=original end
        return original
    end
    local function write(instance,p,value)
        local original=remember(instance,p)
        if original.last~=nil and instance[p]~=original.last then original.value=instance[p] end
        if p=="Text" and instance.RichText then value=escape(value) end
        instance[p]=value;original.last=value
        if p=="Visible" then
            local config=configs[instance:GetAttribute("FramebridgeId")];local slot=config and nodes[(config.motion and config.motion.slot) or (config.keyframes and config.keyframes.slot)]
            if slot then local resting=remember(slot,"Visible");slot.Visible=value;resting.last=value end
        end
    end
    local function restore(instance,p,original)
        if original.last~=nil and instance[p]==original.last and original.design==design(instance) then instance[p]=original.value end
        original.last=nil
    end
    local function evaluate()
        if destroyed then return end
        local assigned={}
        for _,item in ipairs(active) do
            local actions,branch=Rules.evaluate(item.rule,data)
            item.owner:SetAttribute("FramebridgeRule_"..item.rule.id,branch==0 and (item.rule["else"] and "ELSE" or "DESIGN") or "IF "..branch)
            for _,a in ipairs(actions) do
                local target=nodes[a.target];local value=a.value
                if type(value)=="table" then value=Color3.new(table.unpack(value.value)) end
                write(target,a.property,value);assigned[target]=assigned[target] or {};assigned[target][a.property]=true
                if a.property=="Visible" then local config=configs[a.target];local slot=config and nodes[(config.motion and config.motion.slot) or (config.keyframes and config.keyframes.slot)];if slot then assigned[slot]={Visible=true} end end
            end
        end
        for instance,props in pairs(originals) do for p,original in pairs(props) do if not (assigned[instance] and assigned[instance][p]) then restore(instance,p,original) end end end
        if onChange then onChange() end
    end
    local function schedule()
        if queued or destroyed then return end;queued=true
        task.defer(function() queued=false;if not destroyed then evaluate() end end)
    end
    function controller.destroy()
        if destroyed then return end;destroyed=true;disconnect(connections);disconnect(watchers);disconnect(playerNames)
        for instance,props in pairs(originals) do for p,original in pairs(props) do pcall(restore,instance,p,original) end end
        for _,item in ipairs(active) do pcall(function() item.owner:SetAttribute("FramebridgeRule_"..item.rule.id,nil) end) end
        table.clear(originals);table.clear(active)
    end
    function controller.connectionCount() return #connections+#watchers+#playerNames end
    function controller.refresh() evaluate() end
    local player=options.player or game:GetService("Players").LocalPlayer
    local hasStats,hasViewport=false,false
    for _,p in pairs(inputs) do
        if p.source=="attribute" and player then
            local function read() data.attribute[p.key]=player:GetAttribute(p.key);schedule() end
            connect(connections,player:GetAttributeChangedSignal(p.key),read);data.attribute[p.key]=player:GetAttribute(p.key)
        elseif p.source=="leaderstats" then hasStats=true
        elseif p.source=="viewport" then hasViewport=true end
    end
    local function readStats()
        disconnect(watchers);table.clear(data.leaderstats)
        local folder=playerTopologyValid and player and player:FindFirstChild("leaderstats")
        if folder then
            connect(watchers,folder.ChildAdded,readStats);connect(watchers,folder.ChildRemoved,readStats)
            local children=folder:GetChildren()
            if #children>dataChildLimit then
                if not dataOverflowWarned then warn("Framebridge conditional leaderstats exceeds 1024 direct children; data is treated as missing.");dataOverflowWarned=true end
                schedule();return
            end
            dataOverflowWarned=false
            -- Keep observing names after a requested value is renamed away, and
            -- notice an existing unrelated child renamed into a requested key.
            -- A rename does not emit ChildAdded/ChildRemoved on its parent.
            for _,child in ipairs(children) do connect(watchers,child:GetPropertyChangedSignal("Name"),readStats) end
            for _,p in pairs(inputs) do if p.source=="leaderstats" then
                local stat=folder:FindFirstChild(p.key)
                if stat and (stat:IsA("IntValue") or stat:IsA("NumberValue") or stat:IsA("StringValue") or stat:IsA("BoolValue")) then
                    data.leaderstats[p.key]=stat.Value
                    connect(watchers,stat.Changed,function() data.leaderstats[p.key]=stat.Value;schedule() end)
                end
            end end
        end
        schedule()
    end
    if hasStats and player then
        local function observePlayerNames()
            disconnect(playerNames)
            local children=player:GetChildren()
            playerTopologyValid=#children<=dataChildLimit
            if playerTopologyValid then
                for _,child in ipairs(children) do connect(playerNames,child:GetPropertyChangedSignal("Name"),readStats) end
            elseif not dataOverflowWarned then
                warn("Framebridge conditional player data exceeds 1024 direct children; leaderstats is treated as missing.");dataOverflowWarned=true
            end
            readStats()
        end
        connect(connections,player.ChildAdded,observePlayerNames)
        connect(connections,player.ChildRemoved,observePlayerNames)
        observePlayerNames()
    end
    local cameraConnection
    if hasViewport then
        local function readCamera()
            if cameraConnection then cameraConnection:Disconnect();cameraConnection=nil end
            local camera=workspace.CurrentCamera
            local function read() if camera then data.viewport={width=camera.ViewportSize.X,height=camera.ViewportSize.Y} else data.viewport={} end;schedule() end
            if camera then cameraConnection=camera:GetPropertyChangedSignal("ViewportSize"):Connect(read) end
            read()
        end
        connect(connections,workspace:GetPropertyChangedSignal("CurrentCamera"),readCamera)
        table.insert(connections,{Disconnect=function() if cameraConnection then cameraConnection:Disconnect();cameraConnection=nil end end})
        readCamera()
    end
    local ok,why=pcall(evaluate);if not ok then controller.destroy();error(why,0) end
    return controller
end
return mountRules`;
