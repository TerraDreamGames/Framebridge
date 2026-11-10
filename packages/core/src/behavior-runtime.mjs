import { RUNTIME_LICENSE_LUAU } from "./runtime-license.mjs";
import { KEYFRAME_RUNTIME } from "./keyframe-runtime.mjs";
import { withParticles } from "./particles-runtime.mjs";
import { ADVANCED_CONTROLS_RUNTIME } from "./advanced-controls-runtime.mjs";
import { THEME_RUNTIME } from "./theme-runtime.mjs";
// This is trusted, versioned product code. No transfer-package text enters its source.
import { MOTION_RUNTIME } from "./motion-runtime.mjs";
import { WORLD_RUNTIME } from "./world-runtime.mjs";
import { MASK_LAYOUT_RUNTIME } from "./mask-layout-runtime.mjs";
import { LAYOUT_CANVAS_RUNTIME } from "./layout-canvas-runtime.mjs";
import { CONDITIONAL_RUNTIME } from "./conditional-runtime.mjs";
import { TEXT_DECORATION_RUNTIME } from "./text-decoration-runtime.mjs";
export const BEHAVIOR_VERSION = "11";
export const BEHAVIOR_RUNTIME = String.raw`${RUNTIME_LICENSE_LUAU}
local Runtime = {}
local Http = game:GetService("HttpService")
local Players = game:GetService("Players")
local GuiService = game:GetService("GuiService")
local mounted = setmetatable({}, {__mode = "k"})
local MaskLayout = (function()
${MASK_LAYOUT_RUNTIME}
end)()
local LayoutCanvas = (function()
${LAYOUT_CANVAS_RUNTIME}
end)()
local TextDecoration = (function()
${TEXT_DECORATION_RUNTIME}
end)()
local mountMotion = (function()
${MOTION_RUNTIME}
end)()
local mountKeyframes = (function()
${KEYFRAME_RUNTIME}
end)()
local mountControls = (function()
${ADVANCED_CONTROLS_RUNTIME}
end)()
local mountWorld = (function()
${WORLD_RUNTIME}
end)()
local mountRules = (function()
${CONDITIONAL_RUNTIME}
end)()
local function disconnect(connections)
    for _, connection in ipairs(connections) do connection:Disconnect() end
    table.clear(connections)
end
local function escape(text)
    return (text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end
function Runtime.mount(root, options)
    assert(root:IsA('ScreenGui') or root:IsA('SurfaceGui') or root:IsA('BillboardGui') or root:IsA('GuiObject'), 'Framebridge interactions need a UI collector or component.')
    if mounted[root] then mounted[root].destroy() end
    options = options or {}
    local controller = {}
    local worldOptions=table.clone(options)
    worldOptions.onWorldTargetLost=function() if controller.destroy then controller.destroy() end;if root:IsA('LayerCollector') then root.Enabled=false end end
    local worldController = mountWorld(root, worldOptions)
    local maskController = MaskLayout.mount(root)
    local layoutCanvasController = LayoutCanvas.mount(root)
    local textDecorationController = TextDecoration.mount(root)
    local player = options.player or Players.LocalPlayer
    local source = root:GetAttribute("FramebridgeSource")
    local connections, liveConnections, originals = {}, {}, {}
    local bindingWatchers = {}
    local nodes, configs, states, buttons = {}, {}, {}, {}
    local tabGroups = {}
    local destroyed, queued = false, false
    local motionController, controlController, rulesController, keyframeController
    local function logicalParent(instance)
        local id = instance:GetAttribute("FramebridgeId")
        local config = configs[id]
        local parent = instance.Parent
        if parent and config and ((config.motion and config.motion.slot) or (config.keyframes and config.keyframes.slot)) == parent:GetAttribute("FramebridgeId") then return parent.Parent end
        return parent
    end
    local function connect(list, signal, callback)
        table.insert(list, signal:Connect(function(...)
            if not destroyed then callback(...) end
        end))
    end
    local function visible(instance)
        local current = instance
        while current and current ~= root do
            if current:IsA("GuiObject") and not current.Visible then return false end
            current = current.Parent
        end
        if current ~= root then return false end
        if root:IsA('LayerCollector') then return root.Enabled end
        while current do
            if current:IsA('GuiObject') and not current.Visible then return false end
            if current:IsA('LayerCollector') then return current.Enabled end
            current=current.Parent
        end
        return true
    end
    local function enabled(button)
        return button and button:IsA("GuiButton") and button.Active and button.Interactable and visible(button)
    end
    local function panelVisible(panel, value)
        local original=originals[panel]
        if original then original.tabLastVisible=value end
        panel.Visible=value
        local config=configs[panel:GetAttribute("FramebridgeId")]
        local slot=config and nodes[(config.motion and config.motion.slot) or (config.keyframes and config.keyframes.slot)]
        if slot then slot.Visible=value end
        if motionController then motionController.refreshVisibility() end
        if keyframeController then keyframeController.refreshVisibility() end
    end
    local function rememberTabSelection(panel)
        local choice=tabGroups[logicalParent(panel)]
        if not choice then return end
        choice.explicit=true
        local id=panel:GetAttribute("FramebridgeId")
        if panel.Visible then choice.selected=id
        elseif choice.selected==id then choice.selected=nil end
    end
    local function updateState(id)
        local button = nodes[id]
        if not button or not button:IsA("GuiButton") then return end
        local config = configs[id]
        local selected = button:GetAttribute("FramebridgeSelected") == true
        if config and type(config.action) == "table" and config.action.kind == "tab" then
            local target = nodes[config.action.target]
            selected = target ~= nil and target.Visible
        end
        local state = "default"
        if not button.Active or not button.Interactable then state = "disabled"
        elseif button.GuiState == Enum.GuiState.Press then state = "pressed"
        elseif selected then state = "selected"
        elseif button.GuiState == Enum.GuiState.Hover or GuiService.SelectedObject == button then state = "hover" end
        local variants = states[id] or {}
        -- Missing states retain the resting visual rather than making a button disappear.
        local chosen = variants[state] and state or "default"
        for kind, visual in pairs(variants) do visual.Visible = kind == chosen end
        -- State attributes serve authored variants, not every native button.
        button:SetAttribute("FramebridgeState", next(variants) and state or nil)
        if config and type(config.action) == "table" and config.action.kind == "tab" then button:SetAttribute("FramebridgeSelected", selected) end
    end
    local function updateStates()
        for id in pairs(buttons) do updateState(id) end
    end
    function controller.activate(id,input)
        if destroyed then return false end
        local button, config = nodes[id], configs[id]
        if not enabled(button) then return false end
        local handled=controlController and controlController.activate(id,input)
        if handled==false then return false end
        local played=keyframeController and keyframeController.activate(id) or false
        if not config or type(config.action) ~= "table" then return handled==true or played end
        local action = config.action
        local panel = nodes[action.target]
        if not panel or not panel:IsA("GuiObject") or not configs[action.target] or configs[action.target].role ~= "panel" then return false end
        if action.kind == "open" then panelVisible(panel,true)
        elseif action.kind == "close" then panelVisible(panel,false)
        elseif action.kind == "toggle" then panelVisible(panel,not panel.Visible)
        elseif action.kind == "tab" then
            local group = logicalParent(panel)
            local groupId = group and group:GetAttribute("FramebridgeId")
            if not configs[groupId] or configs[groupId].role ~= "tabGroup" then return false end
            tabGroups[group] = {selected=action.target, explicit=true}
            for otherId, other in pairs(nodes) do
                if logicalParent(other) == group and configs[otherId] and configs[otherId].role == "panel" then panelVisible(other,other == panel) end
            end
        else return false end
        rememberTabSelection(panel)
        updateStates()
        return true
    end
    function controller.destroy()
        if destroyed then return end
        destroyed = true
        if rulesController then rulesController.destroy(); rulesController = nil end
        worldController.destroy()
        maskController.destroy()
        layoutCanvasController.destroy()
        if keyframeController then keyframeController.destroy(); keyframeController=nil end
        if controlController then controlController.destroy(); controlController=nil end
        if motionController then motionController.destroy(); motionController = nil end
        disconnect(connections)
        disconnect(liveConnections)
        table.clear(bindingWatchers)
        for instance, original in pairs(originals) do
            pcall(function()
                if original.visible ~= nil then instance.Visible = original.visible end
                if original.text ~= nil then instance.Text = original.text; instance:SetAttribute("FramebridgeBindingStatus", nil) end
                if instance:IsA("GuiButton") then instance:SetAttribute("FramebridgeState", nil); instance:SetAttribute("FramebridgeSelected", original.selected) end
            end)
        end
        textDecorationController.destroy()
        table.clear(originals)
        table.clear(tabGroups)
        table.clear(nodes); table.clear(configs); table.clear(states); table.clear(buttons)
        if mounted[root] == controller then mounted[root] = nil end
    end
    function controller.connectionCount()
        local bindings=0;for _,list in ipairs(bindingWatchers) do bindings+=#list end
        return bindings + (keyframeController and keyframeController.connectionCount() or 0) + (rulesController and rulesController.connectionCount() or 0) + (controlController and controlController.connectionCount() or 0) + #connections + #liveConnections + worldController.connectionCount() + maskController.connectionCount() + layoutCanvasController.connectionCount() + textDecorationController.connectionCount() + (motionController and motionController.connectionCount() or 0)
    end
    function controller.playKeyframes(id) return keyframeController and keyframeController.play(id) or false end
    function controller.stopKeyframes(id) return keyframeController and keyframeController.stop(id) or false end
    function controller.stepKeyframes(dt) if keyframeController then keyframeController.step(dt) end end
    function controller.setControlValue(id,value) return controlController and controlController.setValue(id,value) or false end
    function controller.setSliderRatio(id,value) return controlController and controlController.setSliderRatio(id,value) or false end
    function controller.focusTooltip(id,value) return controlController and controlController.focusTooltip(id,value) or false end
    function controller.moveWindow(id,x,y,originState) return controlController and controlController.moveWindow(id,x,y,originState) or false end
    function controller.stepControls(dt) if controlController then controlController.step(dt) end end
    function controller.refreshRules() if rulesController then rulesController.refresh() end end
    function controller.stepMotion(dt) if motionController then motionController.step(dt) end end
    local schedule
    local function rebuild()
        if destroyed then return end
        if keyframeController then keyframeController.destroy(); keyframeController=nil end
        if controlController then controlController.destroy(); controlController=nil end
        if rulesController then rulesController.destroy(); rulesController = nil end
        if motionController then motionController.destroy(); motionController = nil end
        disconnect(liveConnections)
        table.clear(bindingWatchers)
        for instance, original in pairs(originals) do
            pcall(function()
                if original.visible ~= nil then instance.Visible = original.visible end
                if original.text ~= nil then instance.Text = original.text end
            end)
        end
        nodes, configs, states, buttons = {}, {}, {}, {}
        local descendants = root:GetDescendants()
        if root:IsA('GuiObject') then table.insert(descendants, 1, root) end
        if #descendants > 15000 then warn("Framebridge: interaction screen exceeds 15,000 instances."); return end
        local function remember(instance)
            if not originals[instance] then originals[instance] = { selected = instance:GetAttribute("FramebridgeSelected") } end
            return originals[instance]
        end
        for _, instance in ipairs(descendants) do
            local id = instance:GetAttribute("FramebridgeId")
            if type(id) == "string" and instance:GetAttribute("FramebridgeSource") == source and instance:IsA("GuiObject") and not instance:GetAttribute("FramebridgeMotionHelper") then
                if nodes[id] then warn("Framebridge: duplicate runtime identity " .. id); return end
                nodes[id] = instance
                local raw = instance:GetAttribute("FramebridgeBehavior")
                if type(raw) == "string" and #raw <= 16384 then
                    local ok, config = pcall(Http.JSONDecode, Http, raw)
                    if ok and type(config) == "table" then configs[id] = config end
                end
                remember(instance)
            end
        end
        for instance, original in pairs(originals) do
            if instance ~= root and not instance:IsDescendantOf(root) then
                pcall(function()
                    if original.visible ~= nil then instance.Visible = original.visible end
                    if original.text ~= nil then instance.Text = original.text; instance:SetAttribute("FramebridgeBindingStatus", nil) end
                end)
                originals[instance] = nil
            end
        end
        local bindings, stateOwners = {}, {}
        for _, config in pairs(configs) do
            if type(config.state) == "table" and type(config.state.owner) == "string" then stateOwners[config.state.owner] = true end
        end
        for id, instance in pairs(nodes) do
            local config = configs[id]
            connect(liveConnections, instance:GetAttributeChangedSignal("FramebridgeBehavior"), schedule)
            if instance:IsA("GuiButton") and ((config and config.action) or stateOwners[id]) then
                buttons[id] = true
                connect(liveConnections, instance.Activated, function(input) controller.activate(id,input) end)
                if stateOwners[id] then
                    for _, property in ipairs({"GuiState", "Active", "Interactable"}) do
                        connect(liveConnections, instance:GetPropertyChangedSignal(property), function() updateState(id) end)
                    end
                    connect(liveConnections, instance:GetAttributeChangedSignal("FramebridgeSelected"), function() updateState(id) end)
                end
            end
            if config and config.state and type(config.state) == "table" then
                local state = config.state
                local owner = nodes[state.owner]
                if type(state.kind) == "string" and owner and owner:IsA("GuiButton") and instance:IsDescendantOf(owner) then
                    states[state.owner] = states[state.owner] or {}
                    states[state.owner][state.kind] = instance
                    local original = remember(instance)
                    if original.visible == nil then original.visible = instance.Visible end
                end
            end
            if config and config.role == "panel" then
                local original=remember(instance)
                -- Keep author intent separate from the provisional fallback we may show
                -- before the other panels have registered.
                if original.tabVisible == nil then original.tabVisible=instance.Visible end
                connect(liveConnections, instance:GetPropertyChangedSignal("Visible"), function()
                    local choice=tabGroups[logicalParent(instance)]
                    -- Compare the last write too: native property signals can be deferred.
                    if choice and instance.Visible~=original.tabLastVisible then
                        rememberTabSelection(instance)
                    end
                    updateStates()
                end)
            end
            if config and config.binding and type(config.binding) == "table" and (instance:IsA("TextLabel") or instance:IsA("TextButton")) then
                local binding = config.binding
                if (binding.source == "attribute" or binding.source == "leaderstats") and type(binding.key) == "string" and binding.key:match("^[%a_][%w_-]*$") and #binding.key <= 128 and type(binding.template) == "string" and #binding.template <= 4096 then
                    local original = remember(instance)
                    if original.text == nil then original.text = instance.Text end
                    local key = binding.source .. ":" .. binding.key
                    bindings[key] = bindings[key] or {binding = binding, labels = {}}
                    table.insert(bindings[key].labels, {instance = instance, template = binding.template})
                end
            end
        end
        for group in pairs(tabGroups) do
            local id=group:GetAttribute("FramebridgeId")
            if nodes[id]~=group or not configs[id] or configs[id].role~="tabGroup" then tabGroups[group]=nil end
        end
        -- Registration order is not author order. A fallback is provisional until
        -- an explicit selection; late authored panels may still establish the default.
        for id, config in pairs(configs) do
            if config.role == "tabGroup" then
                local panels = {}
                local function panelsInOrder(parent)
                    for _, child in ipairs(parent:GetChildren()) do
                        local childId = child:GetAttribute("FramebridgeId")
                        if configs[childId] and configs[childId].role == "panel" and logicalParent(child)==nodes[id] then table.insert(panels, child)
                        elseif childId and childId:sub(-12)=="/motion-slot" then panelsInOrder(child) end
                    end
                end
                panelsInOrder(nodes[id])
                local function order(panel)
                    local parent=panel.Parent
                    return parent~=nodes[id] and parent.LayoutOrder or panel.LayoutOrder
                end
                table.sort(panels,function(a,b)
                    local x,y=order(a),order(b)
                    if x~=y then return x<y end
                    return a:GetAttribute("FramebridgeId")<b:GetAttribute("FramebridgeId")
                end)
                local choice=tabGroups[nodes[id]] or {}
                tabGroups[nodes[id]]=choice
                local selected
                if choice.explicit then
                    local current=nodes[choice.selected]
                    if table.find(panels,current) then selected=current end
                end
                for _, panel in ipairs(panels) do
                    local preferred=choice.explicit and panel.Visible or (not choice.explicit and originals[panel].tabVisible)
                    if preferred and not selected then selected=panel end
                end
                selected = selected or panels[1]
                choice.selected=selected and selected:GetAttribute("FramebridgeId")
                for _, panel in ipairs(panels) do panelVisible(panel,panel == selected) end
            end
        end
        local function display(group, value)
            local primitive = type(value) == "string" or type(value) == "number" or type(value) == "boolean"
            for _, label in ipairs(group.labels) do
                local text = label.template:gsub("{value}", function() return primitive and tostring(value) or "—" end)
                label.instance.Text = label.instance.RichText and escape(text) or text
                label.instance:SetAttribute("FramebridgeBindingStatus", primitive and "Ready" or "Missing data")
            end
        end
        for _, group in pairs(bindings) do
            local binding = group.binding
            if player and binding.source == "attribute" then
                local function refresh() display(group, player:GetAttribute(binding.key)) end
                connect(liveConnections, player:GetAttributeChangedSignal(binding.key), refresh)
                refresh()
            elseif player then
                local watchers,playerNames = {},{}
                local dataChildLimit=1024
                local playerTopologyValid,dataOverflowWarned=true,false
                table.insert(bindingWatchers,watchers)
                table.insert(bindingWatchers,playerNames)
                local function refresh()
                    disconnect(watchers)
                    local folder = playerTopologyValid and player:FindFirstChild("leaderstats")
                    local stat = folder and folder:FindFirstChild(binding.key)
                    local function value()
                        if stat and (stat:IsA("IntValue") or stat:IsA("NumberValue") or stat:IsA("StringValue") or stat:IsA("BoolValue")) then return stat.Value end
                    end
                    if folder then
                        connect(watchers, folder.ChildAdded, function() refresh() end)
                        connect(watchers, folder.ChildRemoved, function() refresh() end)
                        local children=folder:GetChildren()
                        if #children>dataChildLimit then
                            stat=nil
                            if not dataOverflowWarned then warn("Framebridge live-label leaderstats exceeds 1024 direct children; data is treated as missing.");dataOverflowWarned=true end
                        else
                            dataOverflowWarned=false
                            for _,child in ipairs(children) do connect(watchers,child:GetPropertyChangedSignal("Name"),refresh) end
                        end
                    end
                    if stat and stat:IsA("ValueBase") then connect(watchers, stat.Changed, function() display(group, value()) end) end
                    display(group, value())
                end
                local function observePlayerNames()
                    disconnect(playerNames)
                    local children=player:GetChildren()
                    playerTopologyValid=#children<=dataChildLimit
                    if playerTopologyValid then
                        for _,child in ipairs(children) do connect(playerNames,child:GetPropertyChangedSignal("Name"),refresh) end
                    elseif not dataOverflowWarned then
                        warn("Framebridge live-label player data exceeds 1024 direct children; leaderstats is treated as missing.");dataOverflowWarned=true
                    end
                    refresh()
                end
                connect(liveConnections, player.ChildAdded, observePlayerNames)
                connect(liveConnections, player.ChildRemoved, observePlayerNames)
                -- Own the nested subscriptions through the same disconnect path.
                table.insert(liveConnections, {Disconnect = function() disconnect(watchers);disconnect(playerNames) end})
                observePlayerNames()
            else display(group, nil) end
        end
        controlController = mountControls(root,nodes,configs,options)
        updateStates()
        motionController = mountMotion(root,nodes,configs,options)
        keyframeController = mountKeyframes(root,nodes,configs,options)
        rulesController = mountRules(root,nodes,configs,options,function() updateStates();if motionController then motionController.refreshVisibility() end;if keyframeController then keyframeController.refreshVisibility() end end)
    end
    schedule = function()
        if queued or destroyed then return end
        queued = true
        task.defer(function()
            queued = false
            if not destroyed then local ok,why=pcall(rebuild);if not ok then controller.destroy();warn("Framebridge runtime rebuild: "..tostring(why)) end end
        end)
    end
    local function changed(instance)
        local current=instance
        while current and current~=root do
            if current:GetAttribute("FramebridgeMotionHelper") or current:GetAttribute("FramebridgeParticleHelper") or current:GetAttribute("FramebridgeTextDecorationHelper") then return end
            current=current.Parent
        end
        schedule()
    end
    connect(connections, root.DescendantAdded, changed)
    connect(connections, root.DescendantRemoving, changed)
    if root:IsA('GuiObject') then connect(connections, root.AncestryChanged, schedule) end
    connect(connections, GuiService:GetPropertyChangedSignal("SelectedObject"), updateStates)
    connect(connections, root.Destroying, controller.destroy)
    local ok,why=pcall(rebuild)
    if not ok then controller.destroy();error(why,0) end
    mounted[root] = controller
    return controller
end
return Runtime`;

export const BEHAVIOR_CLIENT_SOURCE = `-- Framebridge generated interactions v${BEHAVIOR_VERSION}. Configure in Figma; keep application logic in your own scripts.
local Runtime = (function()
${BEHAVIOR_RUNTIME}
end)()
local root=script.Parent
local controller,connections,targetConnections=nil,{},{}
local destroyed,mounting=false,false
local function waiting(message)
    if controller then controller.destroy();controller=nil end
    if root:GetAttribute("FramebridgeWorld") then root.Enabled=false end
    script:SetAttribute("FramebridgeRuntimeStatus",message)
end
local mount
local function watchTarget(target)
    for _,connection in ipairs(targetConnections) do connection:Disconnect() end
    table.clear(targetConnections)
    if not target then return end
    table.insert(targetConnections,target.Destroying:Connect(function() waiting("Awaiting world target") end))
    table.insert(targetConnections,target.AncestryChanged:Connect(function() mount() end))
    if target:IsA("ProximityPrompt") then table.insert(targetConnections,target:GetPropertyChangedSignal("Style"):Connect(function() mount() end)) end
end
mount=function()
    if destroyed or mounting then return end
    local world=root:GetAttribute("FramebridgeWorld")
    local target
    if world then
        local config=game:GetService("HttpService"):JSONDecode(world)
        if config.kind=="prompt" then
            local reference=root:FindFirstChild("FramebridgeWorldTarget")
            target=reference and reference:IsA("ObjectValue") and reference.Value
            watchTarget(target)
            if not target or not target:IsA("ProximityPrompt") or target.Style~=Enum.ProximityPromptStyle.Custom or not target:IsDescendantOf(workspace) then
                waiting("Awaiting custom prompt target");return
            end
        else
            target=root.Adornee
            watchTarget(target)
            if not target or not target:IsDescendantOf(workspace) then waiting("Awaiting world target");return end
        end
    end
    if not world then watchTarget(nil) end
    mounting=true
    if controller then controller.destroy();controller=nil end
    if world then root.Enabled=true end
    local ok,result=pcall(Runtime.mount,root,{worldTarget=target})
    mounting=false
    if ok then controller=result;script:SetAttribute("FramebridgeRuntimeStatus","Ready")
    else script:SetAttribute("FramebridgeRuntimeStatus","Failed");warn("Framebridge runtime: "..tostring(result)) end
end
local function connect(signal,callback) table.insert(connections,signal:Connect(callback)) end
local function watchReference(reference)
    if reference.Name=="FramebridgeWorldTarget" and reference:IsA("ObjectValue") then
        connect(reference:GetPropertyChangedSignal("Value"),mount)
        connect(reference.Destroying,function() waiting("Awaiting world target") end)
        return true
    end
    return false
end
if root:IsA("SurfaceGui") or root:IsA("BillboardGui") then
    for _,child in ipairs(root:GetChildren()) do watchReference(child) end
    connect(root.ChildAdded,function(child) if watchReference(child) then mount() end end)
    connect(root.ChildRemoved,function(child) if child.Name=="FramebridgeWorldTarget" then mount() end end)
    connect(root:GetPropertyChangedSignal("Adornee"),mount)
end
connect(root:GetAttributeChangedSignal("FramebridgeWorld"),mount)
local function cleanup()
    if destroyed then return end
    destroyed=true
    for _,connection in ipairs(connections) do connection:Disconnect() end
    for _,connection in ipairs(targetConnections) do connection:Disconnect() end
    if controller then controller.destroy();controller=nil end
end
connect(script.Destroying,cleanup)
connect(root.Destroying,cleanup)
mount()
`;

// Connections created during a ModuleScript's initialization survive deferred
// destruction of the requiring LocalScript, allowing owned properties to restore.
export const BEHAVIOR_BOOTSTRAP_SOURCE = `-- Framebridge generated runtime bootstrap.\nrequire(script.FramebridgeRuntime)\n`;
export function behaviorModuleSource(clientSource) {
  return `local runtimeModule=script\nlocal script=runtimeModule.Parent\n${clientSource}\nconnect(runtimeModule.Destroying,cleanup)\nreturn true\n`;
}

// Retain the established runtime for unthemed exports; only used theme code is emitted.
export const THEMED_BEHAVIOR_RUNTIME = BEHAVIOR_RUNTIME.replace(
  "local mounted =",
  `local mountTheme = (function()\n${THEME_RUNTIME}\nend)()\nlocal mounted =`,
)
  .replace(
    "local motionController",
    "local themeController = mountTheme(root)\n    local motionController",
  )
  .replace(
    "worldController.destroy()",
    "worldController.destroy()\n        themeController.destroy()",
  )
  .replace(
    "#connections + #liveConnections +",
    "#connections + #liveConnections + themeController.connectionCount() +",
  )
  .replace(
    "function controller.stepMotion",
    "function controller.setTheme(mode) return themeController.setTheme(mode) end\n    function controller.stepMotion",
  );
export const THEMED_BEHAVIOR_CLIENT_SOURCE = BEHAVIOR_CLIENT_SOURCE.replace(
  BEHAVIOR_RUNTIME,
  THEMED_BEHAVIOR_RUNTIME,
);
export const PARTICLE_BEHAVIOR_RUNTIME = withParticles(BEHAVIOR_RUNTIME);
export const THEMED_PARTICLE_BEHAVIOR_RUNTIME = withParticles(
  THEMED_BEHAVIOR_RUNTIME,
);
export const PARTICLE_BEHAVIOR_CLIENT_SOURCE = BEHAVIOR_CLIENT_SOURCE.replace(
  BEHAVIOR_RUNTIME,
  PARTICLE_BEHAVIOR_RUNTIME,
);
export const THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE =
  BEHAVIOR_CLIENT_SOURCE.replace(
    BEHAVIOR_RUNTIME,
    THEMED_PARTICLE_BEHAVIOR_RUNTIME,
  );
export const selectBehaviorRuntime = (themes, particles) =>
  particles
    ? themes
      ? THEMED_PARTICLE_BEHAVIOR_RUNTIME
      : PARTICLE_BEHAVIOR_RUNTIME
    : themes
      ? THEMED_BEHAVIOR_RUNTIME
      : BEHAVIOR_RUNTIME;
export const selectBehaviorClient = (themes, particles) =>
  particles
    ? themes
      ? THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE
      : PARTICLE_BEHAVIOR_CLIENT_SOURCE
    : themes
      ? THEMED_BEHAVIOR_CLIENT_SOURCE
      : BEHAVIOR_CLIENT_SOURCE;
