local Players=game:GetService("Players")
local Input=game:GetService("UserInputService")
local Gui=game:GetService("GuiService")
assert(Players.LocalPlayer,"Run this observer in Client Play")
assert(not _G.FramebridgeDeviceInputQA,"The observer is already running")
local playerGui=Players.LocalPlayer:WaitForChild("PlayerGui")
local root=playerGui:WaitForChild("__FramebridgeDeviceAcceptance_controls",15)
local inventory=playerGui:WaitForChild("__FramebridgeDeviceAcceptance_inventory",15)
assert(root and inventory and root:GetAttribute("FramebridgeDeviceAcceptanceQA")==true and inventory:GetAttribute("FramebridgeDeviceAcceptanceQA")==true,"Exact owned fixture is missing")
local nodes={}
for _,instance in ipairs(root:GetDescendants()) do
    local id=instance:GetAttribute("FramebridgeId")
    if id and instance:IsA("GuiObject") then nodes[id]=instance end
end
local inventoryNodes={}
for _,instance in ipairs(inventory:GetDescendants()) do
    local id=instance:GetAttribute("FramebridgeId")
    if id and instance:IsA("GuiObject") then inventoryNodes[id]=instance end
end
for _,id in ipairs({"toggle","slider","window","window-handle","tip","tooltip","tab-two","panel-two"}) do assert(nodes[id],"Missing device control "..id) end
assert(inventoryNodes.inventory,"Missing native scrolling frame")
local deadline=os.clock()+15
repeat task.wait() until nodes.toggle:GetAttribute("FramebridgeControlStatus")=="Ready" or os.clock()>deadline
assert(nodes.toggle:GetAttribute("FramebridgeControlStatus")=="Ready","Generated helper did not initialize automatically")
local connections,events={},{}
local dead=false
local gamepadsAtStart=Input:GetConnectedGamepads()
local function connect(signal,callback)
    table.insert(connections,signal:Connect(function(...) if not dead then callback(...) end end))
end
local function vector(v) return {v.X,v.Y} end
local function properties()
    return {
        toggle=nodes.toggle:GetAttribute("FramebridgeValue"),
        slider=nodes.slider:GetAttribute("FramebridgeValue"),
        tooltip=nodes.tooltip.Visible,
        windowPosition={nodes.window.Position.X.Scale,nodes.window.Position.X.Offset,nodes.window.Position.Y.Scale,nodes.window.Position.Y.Offset},
        secondTab=nodes["panel-two"].Visible,
        canvasPosition=vector(inventoryNodes.inventory.CanvasPosition),
    }
end
local initial=properties()
local function record(kind,id,input,processed)
    if #events>=2048 then return end
    local event={kind=kind,id=id,time=os.clock(),processed=processed,properties=properties()}
    if input then
        event.inputType=input.UserInputType.Name
        event.keyCode=input.KeyCode.Name
        event.inputState=input.UserInputState.Name
        event.position={input.Position.X,input.Position.Y,input.Position.Z}
    end
    local selected=Gui.SelectedObject
    event.selected=selected and selected:GetAttribute("FramebridgeId") or nil
    table.insert(events,event)
end
connect(Input.InputBegan,function(input,processed) record("input-began",nil,input,processed) end)
connect(Input.InputEnded,function(input,processed) record("input-ended",nil,input,processed) end)
connect(Input.GamepadConnected,function(gamepad) record("gamepad-connected",gamepad.Name) end)
connect(Input.GamepadDisconnected,function(gamepad) record("gamepad-disconnected",gamepad.Name) end)
for id,instance in pairs(nodes) do
    if instance:IsA("GuiButton") then
        connect(instance.Activated,function(input) task.defer(function() if not dead then record("activated",id,input) end end) end)
        connect(instance.SelectionGained,function() record("selection-gained",id) end)
        connect(instance.SelectionLost,function() record("selection-lost",id) end)
    end
end
for _,id in ipairs({"toggle","slider"}) do
    connect(nodes[id]:GetAttributeChangedSignal("FramebridgeValue"),function() record("value-changed",id) end)
end
connect(nodes.window:GetPropertyChangedSignal("Position"),function() record("window-moved","window") end)
connect(nodes.tooltip:GetPropertyChangedSignal("Visible"),function() record("tooltip-visible","tooltip") end)
connect(nodes["panel-two"]:GetPropertyChangedSignal("Visible"),function() record("tab-visible","panel-two") end)
connect(inventoryNodes.inventory:GetPropertyChangedSignal("CanvasPosition"),function() record("canvas-moved","inventory") end)
local qa={}
function qa.snapshot()
    local touch,gamepad,mouse=0,0,0
    for _,event in ipairs(events) do
        if event.kind=="activated" then
            if event.inputType=="Touch" then touch+=1
            elseif event.inputType and event.inputType:match("^Gamepad") then gamepad+=1
            elseif event.inputType=="MouseButton1" then mouse+=1 end
        end
    end
    local gamepads={};for _,pad in ipairs(gamepadsAtStart) do table.insert(gamepads,pad.Name) end
    local currentGamepads={};for _,pad in ipairs(Input:GetConnectedGamepads()) do table.insert(currentGamepads,pad.Name) end
    local inset=Gui:GetGuiInset()
    local camera=workspace.CurrentCamera
    return {
        placeId=game.PlaceId,
        touchEnabled=Input.TouchEnabled,gamepadEnabled=Input.GamepadEnabled,
        gamepadsAtStart=gamepads,currentGamepads=currentGamepads,
        viewport=camera and vector(camera.ViewportSize) or nil,
        guiInset=vector(inset),screenInsets=root.ScreenInsets.Name,ignoreGuiInset=root.IgnoreGuiInset,
        initial=initial,current=properties(),events=table.clone(events),
        nativeActivations={touch=touch,gamepad=gamepad,mouse=mouse},
        observerConnections=#connections,
        scope={nativeEventsOnly=true,controllerActivation=false,physicalDeviceEstablished=false,publishedPlaceEstablished=false},
    }
end
function qa.connectionCount() return #connections end
function qa.destroy()
    if dead then return end;dead=true
    for _,connection in ipairs(connections) do connection:Disconnect() end
    table.clear(connections)
end
_G.FramebridgeDeviceInputQA=qa
return qa.snapshot()
