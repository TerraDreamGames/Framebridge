-- A connection-only Play panel. It never reads settings, restores a capability,
-- polls the relay, loads a design or changes either simulation's instances.
local React = require(script.Parent.ReactLua.React)
local ReactRoblox = require(script.Parent.ReactLua.ReactRoblox)
local UI = require(script.Parent.Components)
local Brand = require(script.Parent.Brand)
local Lifetime = require(script.Parent.ConnectionLifetime)
local e = React.createElement
local PlayConnectionView = {}
local function Panel(props)
    local C = UI.useTheme()
    local state=props.State
    local now,setNow=React.useState(DateTime.now().UnixTimestampMillis)
    React.useEffect(function()
        local alive=true
        local thread=task.spawn(function() while alive do task.wait(1);if alive then setNow(DateTime.now().UnixTimestampMillis) end end end)
        return function() alive=false;task.cancel(thread) end
    end,{})
    local title,note="Connection unavailable", "Stop the play test to manage your connection in Edit."
    if state.linked then
        title=state.phase=="disconnecting" and "Disconnecting from Figma…"
            or state.phase=="disconnected" and "Disconnected from Figma"
            or state.phase=="paired" and "Connected to Figma"
            or state.phase=="pairing" and "Waiting for Figma" or "Connection busy"
        note=state.delivery=="queued" and "A design is queued. Disconnect before stopping Play to cancel the import."
            or state.delivery=="review" and "A design is waiting for review. Stop Play to review it in Edit."
            or state.phase=="disconnected" and "Stop Play to reconnect. Cancelled designs will not import."
            or "Imports wait until Play stops. You can disconnect this connection here."
    end
    local remaining=state.expiresAt and state.expiresAt>0 and Lifetime.read(state.expiresAt,now) or nil
    return e("Frame",{Name="PlayConnection",Size=UDim2.fromScale(1,1),BackgroundColor3=C.bg,BorderSizePixel=0},{
        Padding=e("UIPadding",{PaddingTop=UDim.new(0,16),PaddingBottom=UDim.new(0,16),PaddingLeft=UDim.new(0,16),PaddingRight=UDim.new(0,16)}),
        Logo=e("ImageLabel",{Name="FramebridgeLogo",Image=Brand.Image,ImageRectOffset=Brand.RectOffset,ImageRectSize=Brand.RectSize,BackgroundTransparency=1,BorderSizePixel=0,Size=UDim2.fromOffset(24,24),ScaleType=Enum.ScaleType.Fit}),
        Title=e(UI.Label,{Name="PlayConnectionStatus",Text=title,Bold=true,TextSize=14,Position=UDim2.fromOffset(32,0),Size=UDim2.new(1,-32,0,24)}),
        Expiry=e(UI.Label,{Name="PlayConnectionExpiry",Text=remaining and (remaining.seconds==0 and "Connection expired" or "Expires in "..remaining.label) or "Play test · connection controls",Color=C.muted,Position=UDim2.fromOffset(0,30)}),
        Note=e(UI.Label,{Name="PlayConnectionNote",Text=note,Wrap=true,FixedHeight=true,Position=UDim2.fromOffset(0,62),Size=UDim2.new(1,0,0,64),Color=C.muted}),
        Disconnect=e(UI.Button,{Name="PlayDisconnect",Text=state.phase=="disconnecting" and "Disconnecting…" or "Disconnect and cancel queued import",TextSize=12,Position=UDim2.new(0,0,1,-32),Size=UDim2.new(1,0,0,32),Disabled=not state.linked or not state.canDisconnect,OnClick=props.Disconnect}),
    })
end
function PlayConnectionView.mount(plugin, Bridge)
    local alive, bridge = true,nil
    local toolbar=plugin:CreateToolbar("Framebridge")
    local launch=toolbar:CreateButton("FramebridgePlayConnection","Manage your Figma connection during Play",Brand.Image,"Framebridge")
    launch.ClickableWhenViewportHidden=true
    local widget=plugin:CreateDockWidgetPluginGuiAsync("Framebridge_PlayConnection_v1",DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float,true,false,380,230,340,220))
    widget.Title="Framebridge · Play connection"
    local root=ReactRoblox.createRoot(widget)
    local function render(state)
        if alive then root:render(e(UI.ThemeProvider,nil,e(Panel,{State=state,Disconnect=function() if alive and bridge then bridge.disconnect() end end}))) end
    end
    render({linked=false})
    local Http=game:GetService("HttpService")
    local ok, targetType=pcall(function() return Enum.PluginConnectionTargetType.Edit end)
    bridge=Bridge.test({targetType=ok and targetType or nil,service=function() return game:GetService("PluginConnectionService") end,
        encode=function(value) return Http:JSONEncode(value) end,decode=function(raw) return Http:JSONDecode(raw) end,changed=render})
    local click=launch.Click:Connect(function() if alive then widget.Enabled=not widget.Enabled end end)
    local enabled=widget:GetPropertyChangedSignal("Enabled"):Connect(function() if alive then launch:SetActive(widget.Enabled) end end)
    widget:BindToClose(function() if alive then widget.Enabled=false end end)
    local unloading
    unloading=plugin.Unloading:Connect(function()
        if not alive then return end
        alive=false;bridge.destroy();click:Disconnect();enabled:Disconnect();unloading:Disconnect()
        root:unmount();widget:Destroy();toolbar:Destroy()
    end)
    return bridge
end
return PlayConnectionView
