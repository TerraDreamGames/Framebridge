-- The engine routes these messages only between instances of this same plugin.
-- Keep capabilities, settings, the receiver and authored-place operations in Edit.
-- PluginConnection accepts strings/buffers; the protocol uses bounded JSON strings.
local PlayConnection = {}
local PROTOCOL = "framebridge.play-connection.v1"
local PHASES = {paired=true, pairing=true, disconnected=true, disconnecting=true, busy=true}
local DELIVERIES = {none=true, queued=true, review=true}
local function integer(value)
    return type(value)=="number" and value>=0 and value<1e15 and value%1==0
end
local function connected(connection, targetType)
    local ok, live = pcall(function() return connection.Connected and connection.Type==targetType end)
    return ok and live
end
local function decode(options, raw)
    if type(raw)~="string" or #raw>2048 then return nil end
    local ok, value = pcall(options.decode, raw)
    if ok and type(value)=="table" and value.protocol==PROTOCOL then return value end
    return nil
end
local function send(options, connection, message)
    local ok, raw = pcall(options.encode, message)
    return ok and type(raw)=="string" and #raw<=2048 and pcall(function() connection:SendMessage(raw) end)
end
local function service(options)
    if options.targetType==nil then return nil end
    local ok, value = pcall(options.service)
    if not ok or not value then return nil end
    local allowed, yes = pcall(function() return value:CanHaveConnectionType(options.targetType) end)
    return allowed and yes and value or nil
end
local function disconnect(binding)
    if binding then pcall(function() binding:Disconnect() end) end
end
local function status(value, session, sequence, executing)
    return {protocol=PROTOCOL, kind="status", session=session, sequence=sequence,
        generation=integer(value.generation) and value.generation or 0,
        phase=PHASES[value.phase] and value.phase or "disconnected",
        delivery=DELIVERIES[value.delivery] and value.delivery or "none",
        expiresAt=integer(value.expiresAt) and value.expiresAt or 0,
        canDisconnect=value.canDisconnect==true and not executing}
end
function PlayConnection.edit(options)
    local bridge={available=false, publish=function() end, destroy=function() end}
    local link=service(options)
    if not link then return bridge end
    local alive, executing, peers, sequence, signature = true, false, {}, 0, nil
    local ok, session = pcall(options.newSession)
    if not ok or type(session)~="string" or #session>80 then return bridge end
    local function snapshot()
        local readable, value = pcall(options.snapshot)
        return status(readable and type(value)=="table" and value or {}, session, sequence, executing)
    end
    local function remove(connection)
        local peer=peers[connection]; peers[connection]=nil
        if peer then peer.alive=false; disconnect(peer.binding); disconnect(peer.changed) end
    end
    function bridge.destroy()
        if not alive then return end
        alive=false; bridge.available=false; disconnect(bridge.subscription)
        for connection in pairs(peers) do remove(connection) end
    end
    function bridge.publish(force)
        if not alive then return end
        local value=snapshot()
        local nextSignature=table.concat({value.generation,value.phase,value.delivery,value.expiresAt,tostring(value.canDisconnect)}, ":")
        if not force and nextSignature==signature then return end
        signature=nextSignature; sequence+=1; value.sequence=sequence
        for connection, peer in pairs(peers) do
            if peer.alive and connected(connection,options.targetType) then send(options,connection,value)
            else remove(connection) end
        end
    end
    local function attach(connection)
        if not alive or peers[connection] or not connected(connection,options.targetType) then return end
        local peer={alive=true}; peers[connection]=peer -- buffered callbacks may run during BindToMessage
        local bound, binding = pcall(function() return connection:BindToMessage(function(raw)
            if not alive or not peer.alive or not connected(connection,options.targetType) then return end
            local message=decode(options,raw)
            if not message then return end
            if message.kind=="status-request" then bridge.publish(true); return end
            if message.kind~="disconnect" then return end
            for key in pairs(message) do
                if key~="protocol" and key~="kind" and key~="session" and key~="generation" then return end
            end
            local value=snapshot()
            if executing or not value.canDisconnect or message.session~=session or message.generation~=value.generation then
                bridge.publish(true); return
            end
            executing=true; bridge.publish(true)
            -- The production callback clears its queue/tombstone before its HTTP revoke yields.
            pcall(options.disconnect)
            executing=false; bridge.publish(true)
        end) end)
        if not bound then remove(connection); return end
        peer.binding=binding
        if not alive or not peer.alive then disconnect(binding); return end
        local watching, changed=pcall(function() return connection:GetPropertyChangedSignal("Connected"):Connect(function()
            if not connected(connection,options.targetType) then remove(connection) end
        end) end)
        if not watching then remove(connection); return end
        if not alive or not peer.alive then disconnect(changed); return end
        peer.changed=changed
        if not connected(connection,options.targetType) then remove(connection); return end
        bridge.publish(true)
    end
    -- Subscribe before enumeration and deduplicate a connection seen by both paths.
    local subscribed, subscription=pcall(function() return link.Connected:Connect(attach) end)
    if not subscribed then alive=false; return bridge end
    bridge.subscription=subscription
    local listed, existing=pcall(function() return link:GetPluginConnectionsOfType(options.targetType) end)
    if listed and type(existing)=="table" then for _,connection in ipairs(existing) do attach(connection) end end
    bridge.available=alive
    return bridge
end
function PlayConnection.test(options)
    local alive, current, subscription = true, nil, nil
    local bridge={available=false}
    local function update(value)
        if alive then pcall(options.changed,value) end
    end
    local function remove()
        local peer=current; current=nil
        if peer then peer.alive=false; disconnect(peer.binding); disconnect(peer.changed) end
        update({linked=false,reason="unavailable",canDisconnect=false})
    end
    local function attach(connection)
        if not alive or current or not connected(connection,options.targetType) then return end
        local peer={connection=connection,alive=true,sequence=-1};current=peer
        local bound, binding=pcall(function() return connection:BindToMessage(function(raw)
            if not alive or current~=peer or not peer.alive or not connected(connection,options.targetType) then return end
            local message=decode(options,raw)
            if not message or message.kind~="status" or type(message.session)~="string" or #message.session>80
                or not integer(message.sequence) or not integer(message.generation) or not integer(message.expiresAt)
                or not PHASES[message.phase] or not DELIVERIES[message.delivery] or type(message.canDisconnect)~="boolean" then return end
            if peer.session==message.session and message.sequence<=peer.sequence then return end
            peer.session=message.session;peer.sequence=message.sequence;peer.generation=message.generation;peer.pending=false
            peer.canDisconnect=message.canDisconnect
            -- Never pass arbitrary decoded fields into the UI.
            update({linked=true,phase=message.phase,delivery=message.delivery,expiresAt=message.expiresAt,canDisconnect=message.canDisconnect})
        end) end)
        if not bound then remove();return end
        peer.binding=binding
        if not alive or current~=peer or not peer.alive then disconnect(binding);return end
        local watching, changed=pcall(function() return connection:GetPropertyChangedSignal("Connected"):Connect(function()
            if current==peer and not connected(connection,options.targetType) then remove() end
        end) end)
        if not watching then remove();return end
        if not alive or current~=peer or not peer.alive then disconnect(changed);return end
        peer.changed=changed
        if not connected(connection,options.targetType) then remove();return end
        if not send(options,connection,{protocol=PROTOCOL,kind="status-request"}) then remove() end
    end
    function bridge.disconnect()
        local peer=current
        if not alive or not peer or not peer.alive or peer.pending or not peer.canDisconnect or not connected(peer.connection,options.targetType) then return false end
        peer.pending=true;peer.canDisconnect=false
        update({linked=true,phase="disconnecting",delivery="none",canDisconnect=false})
        if not send(options,peer.connection,{protocol=PROTOCOL,kind="disconnect",session=peer.session,generation=peer.generation}) then remove();return false end
        return true
    end
    function bridge.destroy()
        if not alive then return end
        alive=false;disconnect(subscription);remove()
    end
    local link=service(options)
    if not link then update({linked=false,reason="unsupported",canDisconnect=false});return bridge end
    local subscribed;subscribed,subscription=pcall(function() return link.Connected:Connect(attach) end)
    if not subscribed then update({linked=false,reason="unsupported",canDisconnect=false});return bridge end
    bridge.available=true
    local listed, existing=pcall(function() return link:GetPluginConnectionsOfType(options.targetType) end)
    if listed and type(existing)=="table" then for _,connection in ipairs(existing) do attach(connection) end end
    if not current then update({linked=false,reason="unavailable",canDisconnect=false}) end
    return bridge
end
return PlayConnection
