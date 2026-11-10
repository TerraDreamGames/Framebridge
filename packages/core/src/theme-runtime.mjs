// Trusted client code. Compiled packages carry only resolved values and property bindings.
export const THEME_RUNTIME = String.raw`local Http=game:GetService("HttpService")
local GuiService=game:GetService("GuiService")
local function decode(value)
    if type(value)~="table" then return value end
    if value.type=="Color3" then return Color3.new(table.unpack(value.value)) end
    if value.type=="UDim" then return UDim.new(table.unpack(value.value)) end
    if value.type=="UDim2" then return UDim2.new(table.unpack(value.value)) end
    if value.type=="Font" then return Font.new(value.family,Enum.FontWeight[value.weight],Enum.FontStyle[value.style]) end
    error("Unsupported theme value")
end
return function(root)
    local controller,connections,live,records={},{},{},{}
    local source=root:GetAttribute("FramebridgeSource")
    local destroyed,writing,queued=false,false,false
    local settings,settingsRaw
    local function connect(list,signal,callback) table.insert(list,signal:Connect(function(...) if not destroyed then callback(...) end end)) end
    local function disconnect(list) for _,c in ipairs(list) do c:Disconnect() end;table.clear(list) end
    local function json(raw)
        if type(raw)~="string" or #raw>60000 then return nil end
        local ok,result=pcall(Http.JSONDecode,Http,raw)
        return ok and type(result)=="table" and result or nil
    end
    local function captureOverrides()
        -- Native property signals may be deferred behind another theme/input event.
        -- Observe foreign writes before assigning or rebuilding, not only in callbacks.
        for _,record in ipairs(records) do
            for key in pairs(record.original) do
                pcall(function() if record.instance[key]~=record.last[key] then record.locked[key]=true end end)
            end
        end
    end
    local function restore()
        captureOverrides()
        writing=true
        for _,record in ipairs(records) do
            for key,original in pairs(record.original) do
                pcall(function() if not record.locked[key] and record.instance[key]==record.last[key] then record.instance[key]=original end end)
            end
        end
        writing=false
    end
    local function visible(button)
        local n=button
        while n and n~=root do
            if n:IsA("GuiObject") and not n.Visible then return false end
            n=n.Parent
        end
        if n~=root then return false end
        if root:IsA("LayerCollector") then return root.Enabled end
        while n do
            if n:IsA("GuiObject") and not n.Visible then return false end
            if n:IsA("LayerCollector") then return n.Enabled end
            n=n.Parent
        end
        return true
    end
    local function apply()
        if destroyed or not settings then return end
        local mode=root:GetAttribute("FramebridgeTheme") or settings.initial
        local tokens=settings.modes[mode]
        if not tokens then root:SetAttribute("FramebridgeThemeStatus","Unknown theme");return end
        captureOverrides()
        writing=true
        local ok,why=pcall(function()
            for _,record in ipairs(records) do
                local active=record.owner and record.owner.Active and record.owner.Interactable and visible(record.owner) and (record.owner.GuiState==Enum.GuiState.Hover or record.owner.GuiState==Enum.GuiState.Press or GuiService.SelectedObject==record.owner)
                for key,original in pairs(record.original) do
                    if not record.locked[key] then
                        local ref=active and record.config.hover and record.config.hover[key] or record.config.base[key]
                        local value=ref and decode(tokens[ref[1]][ref[2]]) or original
                        record.instance[key]=value;record.last[key]=record.instance[key]
                    end
                end
            end
        end)
        writing=false
        root:SetAttribute("FramebridgeThemeStatus",ok and "Ready" or "Invalid theme data")
        if not ok then warn("Framebridge theme: "..tostring(why)) end
    end
    function controller.setTheme(mode)
        if destroyed or not settings or not settings.modes[mode] then return false end
        root:SetAttribute("FramebridgeTheme",mode);apply();return true
    end
    function controller.destroy()
        if destroyed then return end
        destroyed=true;disconnect(connections);disconnect(live);restore();table.clear(records)
        root:SetAttribute("FramebridgeThemeStatus",nil)
    end
    function controller.connectionCount() return #connections+#live end
    local rebuild
    local function schedule(child)
        local n=child
        while typeof(n)=="Instance" and n~=root do if n:GetAttribute("FramebridgeParticleHelper") then return end;n=n.Parent end
        if destroyed or queued then return end
        queued=true;task.defer(function() queued=false;if not destroyed then rebuild() end end)
    end
    rebuild=function()
        local previous={}
        local nextRaw=root:GetAttribute("FramebridgeThemes")
        if nextRaw==settingsRaw then for _,record in ipairs(records) do previous[record.instance]=record end end
        restore();disconnect(live);table.clear(records)
        settingsRaw=nextRaw
        settings=json(nextRaw)
        if not settings or settings.version~=1 or type(settings.modes)~="table" then settings=nil;return end
        local all=root:GetDescendants();table.insert(all,1,root)
        if #all>15000 then settings=nil;return end
        local byId={}
        for _,instance in ipairs(all) do
            if instance:GetAttribute("FramebridgeSource")==source then byId[instance:GetAttribute("FramebridgeId") or ""]=instance end
        end
        for _,instance in ipairs(all) do
            if instance:GetAttribute("FramebridgeSource")==source then
                connect(live,instance:GetAttributeChangedSignal("FramebridgeThemeBinding"),schedule)
                local raw=instance:GetAttribute("FramebridgeThemeBinding")
                local config=json(raw)
                if config and type(config.base)=="table" then
                    local prior=previous[instance]
                    local record={instance=instance,raw=raw,config=config,original={},last={},locked=prior and prior.raw==raw and table.clone(prior.locked) or {},owner=byId[config.owner]}
                    local keys={}
                    for key in pairs(config.base) do keys[key]=true end
                    for key in pairs(config.hover or {}) do keys[key]=true end
                    for key in pairs(keys) do
                        record.original[key]=instance[key];record.last[key]=instance[key]
                        connect(live,instance:GetPropertyChangedSignal(key),function()
                            if not writing and instance[key]~=record.last[key] then record.locked[key]=true end
                        end)
                    end
                    table.insert(records,record)
                    if record.owner then
                        for _,key in ipairs({"GuiState","Active","Interactable"}) do connect(live,record.owner:GetPropertyChangedSignal(key),apply) end
                        local parent=record.owner
                        while parent do
                            if parent:IsA("GuiObject") then connect(live,parent:GetPropertyChangedSignal("Visible"),apply) end
                            if parent:IsA("LayerCollector") then connect(live,parent:GetPropertyChangedSignal("Enabled"),apply) end
                            parent=parent.Parent
                        end
                    end
                end
            end
        end
        local selected=root:GetAttribute("FramebridgeTheme")
        if selected==nil then root:SetAttribute("FramebridgeTheme",settings.initial) end
        apply()
    end
    connect(connections,root:GetAttributeChangedSignal("FramebridgeThemes"),schedule)
    connect(connections,root:GetAttributeChangedSignal("FramebridgeTheme"),apply)
    connect(connections,root.DescendantAdded,schedule);connect(connections,root.DescendantRemoving,schedule)
    connect(connections,GuiService:GetPropertyChangedSignal("SelectedObject"),apply)
    connect(connections,root.Destroying,controller.destroy)
    local ok,why=pcall(rebuild);if not ok then controller.destroy();error(why,0) end
    return controller
end`;
