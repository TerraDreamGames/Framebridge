// Trusted local behavior; data never supplies code or remotes.
export const ADVANCED_CONTROLS_RUNTIME = String.raw`local UserInput = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local GuiService = game:GetService("GuiService")
return function(root,nodes,configs,options)
    local controller={}
    local connections,originals,controls,watchers,selections,touchTooltips={},{},{},{},{},{}
    local dead,drag=false,nil
    local writing,lastWrite={},{}
    local function connect(signal,fn)
        local c=signal:Connect(function(...) if not dead then fn(...) end end)
        table.insert(connections,c);return c
    end
    local function remember(instance,property)
        originals[instance]=originals[instance] or {}
        if originals[instance][property]==nil then
            originals[instance][property]=instance[property]
            connect(instance:GetPropertyChangedSignal(property),function()
                if not writing[instance] and (not lastWrite[instance] or lastWrite[instance][property]~=instance[property]) then originals[instance][property]=instance[property] end
            end)
        end
    end
    local function set(instance,property,value) remember(instance,property);writing[instance]=true;lastWrite[instance]=lastWrite[instance] or {};lastWrite[instance][property]=value;instance[property]=value;writing[instance]=nil end
    local function visible(instance)
        local current=instance
        while current do
            if current:IsA("GuiObject") and not current.Visible then return false end
            if current:IsA("LayerCollector") then return current.Enabled end
            current=current.Parent
        end
        return instance:IsDescendantOf(root) or instance==root
    end
    local function enabled(instance) return instance:IsA("GuiButton") and instance.Active and instance.Interactable and visible(instance) end
    local function attr(instance,key,value) instance:SetAttribute(key,value) end
    local function fill(entry,ratio)
        local artwork=entry.config.fill and nodes[entry.config.fill]
        if not artwork then return end
        ratio=math.clamp(ratio,0,1)
        local axis=entry.config.axis or "X"
        remember(artwork,"Size")
        local size=originals[artwork].Size
        if axis=="X" then set(artwork,"Size",UDim2.new(size.X.Scale*ratio,size.X.Offset*ratio,size.Y.Scale,size.Y.Offset))
        else set(artwork,"Size",UDim2.new(size.X.Scale,size.X.Offset,size.Y.Scale*ratio,size.Y.Offset*ratio)) end
    end
    local function refreshSkill(entry)
        local instance,c=entry.instance,entry.config
        local available=true
        for _,id in ipairs(c.requires) do
            local other=nodes[id]
            if not other or other:GetAttribute("FramebridgeUnlocked")~=true then available=false end
        end
        local unlocked=instance:GetAttribute("FramebridgeUnlocked")==true
        attr(instance,"FramebridgeSkillStatus",unlocked and "Unlocked" or available and "Available" or "Locked")
        attr(instance,"FramebridgeSelected",unlocked)
    end
    local function apply(entry,value,external)
        local instance,c=entry.instance,entry.config
        if c.kind=="toggle" then
            if type(value)~="boolean" then attr(instance,"FramebridgeControlStatus","Missing data");return false end
            attr(instance,"FramebridgeValue",value);attr(instance,"FramebridgeSelected",value)
        elseif c.kind=="skill" then
            if type(value)~="boolean" then attr(instance,"FramebridgeControlStatus","Missing data");return false end
            attr(instance,"FramebridgeUnlocked",value);refreshSkill(entry)
        elseif c.kind=="progress" or c.kind=="slider" then
            if type(value)~="number" or value~=value or math.abs(value)==math.huge then attr(instance,"FramebridgeControlStatus","Missing data");return false end
            value=math.clamp(value,c.min,c.max)
            if c.kind=="slider" then value=math.clamp(c.min+math.floor((value-c.min)/c.step+.5)*c.step,c.min,c.max) end
            attr(instance,"FramebridgeValue",value)
            local ratio=(value-c.min)/(c.max-c.min)
            fill(entry,ratio)
            local thumb=c.thumb and nodes[c.thumb]
            if thumb then
                remember(thumb,"Position")
                local position=originals[thumb].Position
                if c.axis=="X" then set(thumb,"Position",UDim2.new(ratio,0,position.Y.Scale,position.Y.Offset))
                else set(thumb,"Position",UDim2.new(position.X.Scale,position.X.Offset,ratio,0)) end
            end
        else return false end
        attr(instance,"FramebridgeControlStatus",external and "Bound" or "Ready");return true
    end
    local function tooltip(entry,show)
        local target=nodes[entry.config.target]
        if target then set(target,"Visible",show) end
        attr(entry.instance,"FramebridgeTooltipVisible",show)
    end
    local function inputPoint(input)
        if input.UserInputType==Enum.UserInputType.Touch then return Vector2.new(input.Position.X,input.Position.Y) end
        return UserInput:GetMouseLocation()-GuiService:GetGuiInset()
    end
    local function pointValue(entry,x,y)
        local instance,c=entry.instance,entry.config
        local pos,size=instance.AbsolutePosition,instance.AbsoluteSize
        local ratio=c.axis=="X" and size.X>0 and (x-pos.X)/size.X or c.axis=="Y" and size.Y>0 and (y-pos.Y)/size.Y or 0
        return apply(entry,c.min+math.clamp(ratio,0,1)*(c.max-c.min),false)
    end
    function controller.setValue(id,value)
        local entry=controls[id]
        if dead or not entry or entry.config.data then return false end
        return apply(entry,value,false)
    end
    function controller.setSliderRatio(id,ratio)
        local e=controls[id]
        if dead or not e or e.config.kind~="slider" or e.config.data or not enabled(e.instance) or type(ratio)~="number" or ratio~=ratio then return false end
        return apply(e,e.config.min+math.clamp(ratio,0,1)*(e.config.max-e.config.min),false)
    end
    local function focusTooltip(e,focus)
        e.focus=focus and enabled(e.instance);e.wait=0
        if not e.focus then tooltip(e,false) elseif e.config.delay==0 then tooltip(e,true) end
    end
    function controller.focusTooltip(id,focus)
        local e=controls[id]
        if dead or not e or e.config.kind~="tooltip" then return false end
        e.touchOwned=nil;e.touchOpen=nil;touchTooltips[id]=nil
        focusTooltip(e,focus)
        return true
    end
    local function releaseTouchTooltips()
        for id,e in pairs(touchTooltips) do
            controller.focusTooltip(id,e.instance.GuiState==Enum.GuiState.Hover or GuiService.SelectedObject==e.instance)
        end
    end
    local function windowBounds(instance,parent,scale)
        if not parent then
            local camera=workspace.CurrentCamera
            return camera and Vector2.zero,camera and camera.ViewportSize
        end
        local position,size=parent.AbsolutePosition,parent.AbsoluteSize
        local canvas=parent:IsA("ScrollingFrame") and parent.AbsoluteCanvasSize or size
        local left,right,top,bottom=0,0,0,0
        local padding=parent:FindFirstChildOfClass("UIPadding")
        if padding then
            left=padding.PaddingLeft.Scale*canvas.X+padding.PaddingLeft.Offset*scale
            right=padding.PaddingRight.Scale*canvas.X+padding.PaddingRight.Offset*scale
            top=padding.PaddingTop.Scale*canvas.Y+padding.PaddingTop.Offset*scale
            bottom=padding.PaddingBottom.Scale*canvas.Y+padding.PaddingBottom.Offset*scale
        end
        local content=Vector2.new(math.max(0,canvas.X-left-right),math.max(0,canvas.Y-top-bottom))
        local basis=content
        if parent:IsA("ScrollingFrame") then
            local axis=parent.AutomaticCanvasSize
            basis=Vector2.new((axis==Enum.AutomaticSize.X or axis==Enum.AutomaticSize.XY) and size.X or content.X,(axis==Enum.AutomaticSize.Y or axis==Enum.AutomaticSize.XY) and size.Y or content.Y)
        end
        -- Resolve from the actual child pose: native scroll translation can snap
        -- to device pixels, and left canvas insets remain even without a track.
        local p=instance.Position
        local anchor=instance.AnchorPoint
        local origin=instance.AbsolutePosition+Vector2.new(instance.AbsoluteSize.X*anchor.X,instance.AbsoluteSize.Y*anchor.Y)-Vector2.new(p.X.Scale*basis.X+p.X.Offset*scale,p.Y.Scale*basis.Y+p.Y.Offset*scale)
        local extent=origin+content
        if parent:IsA("ScrollingFrame") then
            local window=parent.AbsoluteWindowSize
            if parent.VerticalScrollBarPosition==Enum.VerticalScrollBarPosition.Left then position+=Vector2.new(size.X-window.X,0) end
            size=window
        end
        local start=Vector2.new(math.max(position.X,origin.X),math.max(position.Y,origin.Y))
        local finish=Vector2.new(math.min(position.X+size.X,extent.X),math.min(position.Y+size.Y,extent.Y))
        return start,Vector2.new(math.max(0,finish.X-start.X),math.max(0,finish.Y-start.Y))
    end
    function controller.moveWindow(id,dx,dy,originState)
        local e=controls[id]
        if dead or not e or e.config.kind~="window" or not visible(e.instance) or type(dx)~="number" or type(dy)~="number" or dx~=dx or dy~=dy or math.abs(dx)>100000 or math.abs(dy)>100000 then return false end
        local i=e.instance
        local parent=i.Parent
        while parent and not parent:IsA("GuiBase2d") do parent=parent.Parent end
        local scale=1;local ancestor=i
        while ancestor do if ancestor:IsA("GuiObject") and ancestor.Rotation~=0 then return false end;ancestor=ancestor.Parent end
        ancestor=i.Parent
        while ancestor do
            if ancestor:IsA("GuiObject") then local modifier=ancestor:FindFirstChildOfClass("UIScale");if modifier then scale*=modifier.Scale end end
            ancestor=ancestor.Parent
        end
        if scale<=0 or scale~=scale or scale==math.huge then return false end
        local startPosition=originState and originState.position or i.Position
        -- A competing application writer owns a changed Scale coordinate. Do
        -- not restore the stale drag baseline or clamp against a different pose.
        if originState and (i.Position.X.Scale~=startPosition.X.Scale or i.Position.Y.Scale~=startPosition.Y.Scale) then return false end
        -- Re-evaluate the drag's authored baseline in the current rendered parent.
        -- A resize, scale change or scroll must not reuse its old absolute origin.
        local startAbsolute=i.AbsolutePosition-Vector2.new((i.Position.X.Offset-startPosition.X.Offset)*scale,(i.Position.Y.Offset-startPosition.Y.Offset)*scale)
        local p=startPosition
        local x,y=p.X.Offset+dx/scale,p.Y.Offset+dy/scale
        if e.config.constrain then
            local origin,bounds=windowBounds(i,parent,scale)
            if not bounds then return false end
            if bounds.X<=0 or bounds.Y<=0 then return false end
            local function clampOffset(value,offset,absolute,minimum,available,size)
                -- Native Offset is integral. Keep its representable value inside
                -- the content box instead of truncating past a fractional edge.
                local low=math.ceil(offset+(minimum-absolute)/scale-.000001)
                local high=math.floor(offset+(minimum+math.max(0,available-size)-absolute)/scale+.000001)
                if high<low then if size>available then high=low else return nil end end
                return math.clamp(value,low,high)
            end
            x=clampOffset(x,p.X.Offset,startAbsolute.X,origin.X,bounds.X,i.AbsoluteSize.X)
            y=clampOffset(y,p.Y.Offset,startAbsolute.Y,origin.Y,bounds.Y,i.AbsoluteSize.Y)
            if not x or not y then return false end
        end
        set(i,"Position",UDim2.new(p.X.Scale,x,p.Y.Scale,y));return true
    end
    function controller.activate(id,input)
        local e=controls[id]
        if not e then return nil end
        local i,c=e.instance,e.config
        if dead then return false end
        if not enabled(i) then
            if c.kind=="tooltip" then controller.focusTooltip(id,false) end
            return false
        end
        if c.kind=="toggle" then if c.data then return false end;return apply(e,not (i:GetAttribute("FramebridgeValue")==true),false)
        elseif c.kind=="slider" then
            if c.data then return false end
            if input and (input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch) then return true end
            return apply(e,(i:GetAttribute("FramebridgeValue") or c.min)+c.step,false)
        elseif c.kind=="cooldown" then
            if e.remaining and e.remaining>0 then return false end
            e.remaining=c.duration;attr(i,"FramebridgeCooldownRemaining",c.duration);attr(i,"FramebridgeCooldownReady",false);fill(e,1);return true
        elseif c.kind=="skill" then
            refreshSkill(e)
            if c.data or i:GetAttribute("FramebridgeSkillStatus")~="Available" then return false end
            return apply(e,true,false)
        elseif c.kind=="roulette" then
            if e.spin then return false end
            local random=options.controlRandom or function(count) return math.random(1,count) end
            local index=random(#c.items)
            if type(index)~="number" or index%1~=0 or index<1 or index>#c.items then return false end
            e.spin={elapsed=0,index=index};attr(i,"FramebridgeRouletteStatus","Spinning");attr(i,"FramebridgeRouletteValue",nil);return true
        elseif c.kind=="tooltip" then
            if input and input.UserInputType==Enum.UserInputType.Touch then
                -- A tap owns its toggle independently of incidental hover/selection.
                e.touchOwned=true;e.touchOpen=not e.touchOpen;touchTooltips[id]=e
                focusTooltip(e,e.touchOpen);return true
            end
            return controller.focusTooltip(id,not e.focus)
        end
        return false
    end
    function controller.step(dt)
        if dead or type(dt)~="number" or dt~=dt or dt<=0 then return end
        dt=math.min(dt,.25)
        for id,e in pairs(controls) do
            local i,c=e.instance,e.config
            if c.kind=="cooldown" and e.remaining and e.remaining>0 then
                e.remaining=math.max(0,e.remaining-dt)
                if e.remaining<.000001 then e.remaining=0 end
                attr(i,"FramebridgeCooldownRemaining",e.remaining);attr(i,"FramebridgeCooldownReady",e.remaining==0);fill(e,e.remaining/c.duration)
            elseif c.kind=="tooltip" then
                if not visible(i) or not i.Active or not i.Interactable then controller.focusTooltip(id,false) end
                if e.focus then e.wait+=dt;if e.wait>=c.delay-.000001 then tooltip(e,true) end else tooltip(e,false) end
            elseif c.kind=="roulette" and e.spin then
                local spin=e.spin;spin.elapsed=math.min(c.duration,spin.elapsed+dt)
                local t=spin.elapsed/c.duration
                local frame=math.floor((1-(1-t)^3)*#c.items*4)
                local index=(spin.index+frame)%#c.items+1
                if spin.elapsed>=c.duration-.000001 then index=spin.index;e.spin=nil;attr(i,"FramebridgeRouletteValue",c.items[index]);attr(i,"FramebridgeRouletteStatus","Complete") end
                attr(i,"FramebridgeRouletteIndex",index);attr(i,"FramebridgeRoulettePreview",c.items[index])
            end
        end
    end
    local function bind(entry)
        local data=entry.config.data
        local player=options.player or game:GetService("Players").LocalPlayer
        if not data then return end
        local nested,playerNames={},{}
        local dataChildLimit=1024
        local playerTopologyValid,dataOverflowWarned=true,false
        table.insert(watchers,nested)
        table.insert(watchers,playerNames)
        local function clear() for _,c in ipairs(nested) do c:Disconnect() end;table.clear(nested) end
        local function clearPlayerNames() for _,c in ipairs(playerNames) do c:Disconnect() end;table.clear(playerNames) end
        if not player then apply(entry,nil,true);return end
        if data.source=="attribute" then
            connect(player:GetAttributeChangedSignal(data.key),function() apply(entry,player:GetAttribute(data.key),true) end)
            apply(entry,player:GetAttribute(data.key),true)
        else
            local refresh
            refresh=function()
                clear()
                local folder=playerTopologyValid and player:FindFirstChild("leaderstats")
                local stat=folder and folder:FindFirstChild(data.key)
                local function value() if stat and (stat:IsA("IntValue") or stat:IsA("NumberValue") or stat:IsA("BoolValue")) then return stat.Value end end
                local function watch(signal,fn) table.insert(nested,signal:Connect(function(...) if not dead then fn(...) end end)) end
                if folder then
                    watch(folder.ChildAdded,refresh);watch(folder.ChildRemoved,refresh)
                    local children=folder:GetChildren()
                    if #children>dataChildLimit then
                        stat=nil
                        if not dataOverflowWarned then warn("Framebridge control leaderstats exceeds 1024 direct children; data is treated as missing.");dataOverflowWarned=true end
                    else
                        dataOverflowWarned=false
                        for _,child in ipairs(children) do watch(child:GetPropertyChangedSignal("Name"),refresh) end
                    end
                end
                if stat and stat:IsA("ValueBase") then watch(stat.Changed,function() apply(entry,value(),true) end) end
                apply(entry,value(),true)
            end
            local function observePlayerNames()
                clearPlayerNames()
                local children=player:GetChildren()
                playerTopologyValid=#children<=dataChildLimit
                if playerTopologyValid then
                    for _,child in ipairs(children) do table.insert(playerNames,child:GetPropertyChangedSignal("Name"):Connect(function() if not dead then refresh() end end)) end
                elseif not dataOverflowWarned then
                    warn("Framebridge control player data exceeds 1024 direct children; leaderstats is treated as missing.");dataOverflowWarned=true
                end
                refresh()
            end
            connect(player.ChildAdded,observePlayerNames)
            connect(player.ChildRemoved,observePlayerNames)
            observePlayerNames()
        end
    end
    local timed=false
    for id,config in pairs(configs) do
        local c=config.control;local i=nodes[id]
        if c and i then controls[id]={instance=i,config=c};end
    end
    for id,e in pairs(controls) do
        local i,c=e.instance,e.config
        if c.kind=="progress" or c.kind=="slider" or c.kind=="toggle" or c.kind=="skill" then
            local key=c.kind=="skill" and "FramebridgeUnlocked" or "FramebridgeValue"
            local value=i:GetAttribute(key);if value==nil then if c.kind=="skill" then value=c.unlocked else value=c.value end end
            apply(e,value,false)
            connect(i:GetAttributeChangedSignal(key),function() apply(e,i:GetAttribute(key),c.data~=nil) end)
            bind(e)
        end
        if c.kind=="skill" then
            for _,otherId in ipairs(c.requires) do connect(nodes[otherId]:GetAttributeChangedSignal("FramebridgeUnlocked"),function() refreshSkill(e) end) end
        elseif c.kind=="cooldown" then timed=true;attr(i,"FramebridgeCooldownRemaining",0);attr(i,"FramebridgeCooldownReady",true)
        elseif c.kind=="roulette" then timed=true;attr(i,"FramebridgeRouletteStatus","Ready")
        elseif c.kind=="tooltip" then
            timed=true;tooltip(e,false)
            connect(i.MouseEnter,function() if not e.touchOwned then controller.focusTooltip(id,true) end end)
            connect(i.MouseLeave,function() if not e.touchOwned then controller.focusTooltip(id,false) end end)
            connect(i.SelectionGained,function() if not e.touchOwned then controller.focusTooltip(id,true) end end)
            connect(i.SelectionLost,function() if not e.touchOwned then controller.focusTooltip(id,false) end end)
        end
        if c.kind=="slider" then
            local keys=c.axis=="X" and {"NextSelectionLeft","NextSelectionRight"} or {"NextSelectionUp","NextSelectionDown"}
            selections[i]={keys=keys,values={}}
            for _,key in ipairs(keys) do selections[i].values[key]=i[key];i[key]=i end
        end
        if c.kind=="slider" or c.kind=="window" then
            local handle=c.kind=="window" and c.handle and nodes[c.handle] or i
            set(handle,"Active",true)
            connect(handle.InputBegan,function(input)
                if input.UserInputType~=Enum.UserInputType.MouseButton1 and input.UserInputType~=Enum.UserInputType.Touch then return end
                if not visible(i) or (c.kind=="slider" and (c.data or not enabled(i))) then return end
                local point=inputPoint(input)
                drag={entry=e,input=input,x=point.X,y=point.Y,position=i.Position,absolute=i.AbsolutePosition}
                if c.kind=="slider" then pointValue(e,point.X,point.Y) end
            end)
        end
    end
    for _,e in pairs(controls) do if e.config.kind=="skill" then refreshSkill(e) end end
    if next(controls) then
        connect(UserInput.InputChanged,function(input)
            if input.UserInputType==Enum.UserInputType.MouseMovement then
                releaseTouchTooltips()
            end
            if not drag then return end
            if drag.input.UserInputType==Enum.UserInputType.Touch then if input~=drag.input then return end
            elseif input.UserInputType~=Enum.UserInputType.MouseMovement then return end
            local e=drag.entry
            if not visible(e.instance) or (e.config.kind=="slider" and not enabled(e.instance)) then drag=nil;return end
            local point=inputPoint(input)
            if e.config.kind=="slider" then pointValue(e,point.X,point.Y)
            else controller.moveWindow(e.instance:GetAttribute("FramebridgeId"),point.X-drag.x,point.Y-drag.y,drag) end
        end)
        connect(UserInput.InputEnded,function(input)
            if drag and (input==drag.input or input.UserInputType==Enum.UserInputType.MouseButton1) then
                local point=inputPoint(input);local e=drag.entry
                if e.config.kind=="window" then controller.moveWindow(e.instance:GetAttribute("FramebridgeId"),point.X-drag.x,point.Y-drag.y,drag)
                elseif enabled(e.instance) then pointValue(e,point.X,point.Y) end
                drag=nil
            end
        end)
        connect(UserInput.WindowFocusReleased,function() drag=nil;for id,e in pairs(controls) do if e.config.kind=="tooltip" then controller.focusTooltip(id,false) end end end)
        connect(UserInput.InputBegan,function(input,processed)
            if input.UserInputType==Enum.UserInputType.Keyboard or input.UserInputType.Name:match("^Gamepad") then releaseTouchTooltips() end
            if UserInput:GetFocusedTextBox() then return end
            local i=GuiService.SelectedObject;local e=i and controls[i:GetAttribute("FramebridgeId")]
            if not e or e.config.kind~="slider" or e.config.data or not enabled(i) then return end
            local horizontal=e.config.axis=="X"
            local positive=horizontal and (input.KeyCode==Enum.KeyCode.Right or input.KeyCode==Enum.KeyCode.DPadRight) or not horizontal and (input.KeyCode==Enum.KeyCode.Up or input.KeyCode==Enum.KeyCode.DPadUp)
            local negative=horizontal and (input.KeyCode==Enum.KeyCode.Left or input.KeyCode==Enum.KeyCode.DPadLeft) or not horizontal and (input.KeyCode==Enum.KeyCode.Down or input.KeyCode==Enum.KeyCode.DPadDown)
            local direction=positive and 1 or negative and -1 or 0
            if direction~=0 then apply(e,(i:GetAttribute("FramebridgeValue") or e.config.min)+direction*e.config.step,false) end
        end)
    end
    if timed and not options.manualControls then connect(RunService.Heartbeat,controller.step) end
    function controller.connectionCount()
        local count=#connections
        for _,list in ipairs(watchers) do count+=#list end
        return count
    end
    function controller.destroy()
        if dead then return end;dead=true;drag=nil
        for _,c in ipairs(connections) do c:Disconnect() end;table.clear(connections)
        for _,list in ipairs(watchers) do for _,c in ipairs(list) do c:Disconnect() end;table.clear(list) end;table.clear(watchers)
        for i,props in pairs(originals) do for key,value in pairs(props) do pcall(function() i[key]=value end) end end
        for _,e in pairs(controls) do
            for _,key in ipairs({"FramebridgeControlStatus","FramebridgeSkillStatus","FramebridgeCooldownRemaining","FramebridgeCooldownReady","FramebridgeTooltipVisible","FramebridgeRouletteStatus","FramebridgeRouletteIndex","FramebridgeRoulettePreview","FramebridgeRouletteValue"}) do pcall(function() e.instance:SetAttribute(key,nil) end) end
        end
        for i,selection in pairs(selections) do for _,key in ipairs(selection.keys) do pcall(function() i[key]=selection.values[key] end) end end
        table.clear(selections);table.clear(originals);table.clear(controls);table.clear(touchTooltips)
    end
    return controller
end`;
