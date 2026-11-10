-- Actual production transport with asynchronous engine-message/service doubles.
-- Native PluginConnection availability and widget presentation are separate QA.
local fs,serde=require("@lune/fs"),require("@lune/serde")
local Bridge=assert(loadstring(fs.readFile("plugins/studio/src/PlayConnection.luau")))()
local passed,failures=0,{}
local function check(name,fn)
    local ok,why=pcall(fn)
    if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local function signal()
    local self={bindings={}}
    function self:Connect(fn)
        local b={callback=fn,connected=true,Disconnect=function(b) b.connected=false end}
        table.insert(self.bindings,b);return b
    end
    function self:fire(...)
        for _,b in ipairs(self.bindings) do if b.connected then b.callback(...) end end
    end
    return self
end
local function host(count,options)
    options=options or {}
    local h={queue={},wire={},pairs={},changes={},disconnects=0,context={generation=1,phase="paired",delivery="queued",expiresAt=100000,canDisconnect=true,receiverToken="private-receiver",code="private-code",betaAccess="private-tester"}}
    local function endpoint(kind)
        local node={Connected=true,Type=kind,changed=signal(),binds=0,buffers={}}
        function node:SendMessage(raw)
            assert(type(raw)=="string","Variant transport must be a JSON string")
            table.insert(h.wire,raw);table.insert(h.queue,{target=self.remote,raw=raw})
        end
        function node:BindToMessage(fn)
            assert(not self.binding or not self.binding.connected,"Only one callback per plugin/connection")
            self.binds+=1
            self.binding={callback=fn,connected=true,Disconnect=function(b) b.connected=false end}
            for _,raw in ipairs(self.buffers) do fn(raw) end
            self.buffers={};return self.binding
        end
        function node:GetPropertyChangedSignal(name) assert(name=="Connected");return self.changed end
        return node
    end
    for index=1,count do
        local server,client=endpoint("Test"),endpoint("Edit");server.remote=client;client.remote=server
        h.pairs[index]={server=server,client=client}
    end
    local function service(kind,nodes,race)
        local s={Connected=signal()}
        function s:CanHaveConnectionType(target) return target==kind end
        function s:GetPluginConnectionsOfType(target)
            assert(target==kind)
            if race then self.Connected:fire(nodes[1]) end
            return nodes
        end
        return s
    end
    local nodes={};for _,pair in ipairs(h.pairs) do table.insert(nodes,pair.server) end
    h.service=service("Test",nodes,options.race)
    local common={encode=function(value) return serde.encode("json",value) end,decode=function(raw) return serde.decode("json",raw) end}
    h.encode=common.encode
    function h.edit()
        local opts=table.clone(common);opts.targetType="Test";opts.service=function() return h.service end;opts.newSession=function() return "edit-host-nonce" end
        opts.snapshot=function() return h.context end
        opts.disconnect=function()
            h.disconnects+=1;h.context.canDisconnect=false;h.context.phase="disconnecting";h.context.delivery="none";h.context.generation+=1
            h.pendingCancelled=true
            h.editBridge.publish()
            if h.holdRevoke then coroutine.yield("HTTP revoke pending") end
            h.context.phase="disconnected";h.context.expiresAt=0
        end
        h.editBridge=Bridge.edit(opts);return h.editBridge
    end
    function h.client(index)
        local pair=h.pairs[index];local opts=table.clone(common)
        opts.targetType="Edit";opts.service=function() return service("Edit",{pair.client},options.race) end
        opts.changed=function(value) h.changes[index]=value end
        pair.bridge=Bridge.test(opts);return pair.bridge
    end
    function h.flush()
        local count=0
        while #h.queue>0 do
            count+=1;assert(count<300,"Unexpected message loop")
            local item=table.remove(h.queue,1);local binding=item.target.binding
            if binding and binding.connected then binding.callback(item.raw) else table.insert(item.target.buffers,item.raw) end
        end
    end
    function h.message(index,fields)
        fields.protocol=fields.protocol or "framebridge.play-connection.v1"
        h.pairs[index].server.binding.callback(h.encode(fields))
    end
    return h
end
check("two Test contexts share status without receiving capability/code/tester fields",function()
    local h=host(2);h.edit();h.client(1);h.client(2);h.flush()
    for index=1,2 do assert(h.changes[index].linked and h.changes[index].phase=="paired" and h.changes[index].delivery=="queued" and h.changes[index].canDisconnect) end
    for _,raw in ipairs(h.wire) do assert(not raw:find("private-",1,true)) end
    assert(h.disconnects==0)
end)
check("Connected/enumeration races bind each peer once",function()
    local h=host(2,{race=true});h.edit();h.client(1);h.client(2);h.flush()
    for _,pair in ipairs(h.pairs) do assert(pair.server.binds==1 and pair.client.binds==1) end
end)
check("buffered status callbacks can run immediately during Test binding",function()
    local h=host(1);h.edit();h.flush();assert(#h.pairs[1].client.buffers==1)
    h.client(1);assert(h.changes[1].linked and h.changes[1].canDisconnect);h.flush()
end)
check("buffered Edit status-request callbacks are safe before binding returns",function()
    local h=host(1);h.pairs[1].server.buffers={h.encode({protocol="framebridge.play-connection.v1",kind="status-request"})}
    h.edit();h.client(1);h.flush();assert(h.changes[1].linked and h.disconnects==0)
end)
check("Disconnect clears the original Edit queue before a yielding revoke, and reaches all peers",function()
    local h=host(2);h.edit();h.client(1);h.client(2);h.flush();h.holdRevoke=true
    assert(h.pairs[1].bridge.disconnect());local message=table.remove(h.queue,1)
    local revoke=coroutine.create(function() message.target.binding.callback(message.raw) end)
    local ok,why=coroutine.resume(revoke);assert(ok and why=="HTTP revoke pending")
    assert(h.pendingCancelled and h.disconnects==1 and h.context.delivery=="none")
    h.flush();for index=1,2 do assert(h.changes[index].phase=="disconnecting" and not h.changes[index].canDisconnect) end
    assert(not h.pairs[2].bridge.disconnect() and h.disconnects==1)
    assert(coroutine.resume(revoke));h.flush()
    for index=1,2 do assert(h.changes[index].phase=="disconnected" and not h.changes[index].canDisconnect) end
end)
check("old connection-generation commands cannot cancel a newer link",function()
    local h=host(1);h.edit();h.client(1);h.flush()
    h.context.generation=2;h.editBridge.publish();h.flush()
    h.message(1,{kind="disconnect",session="edit-host-nonce",generation=1})
    h.message(1,{kind="disconnect",session="old-edit-host",generation=2})
    assert(h.disconnects==0 and h.context.canDisconnect)
    assert(h.pairs[1].bridge.disconnect());h.flush();assert(h.disconnects==1)
end)
check("unknown, malformed, oversized and expanded command envelopes never invoke actions",function()
    local h=host(1);h.edit();h.client(1);h.flush();local callback=h.pairs[1].server.binding.callback
    for _,raw in ipairs({"{",string.rep("x",2049),"[]",h.encode({kind="disconnect"}),h.encode({protocol="other-plugin",kind="disconnect",session="edit-host-nonce",generation=1})}) do callback(raw) end
    callback({protocol="framebridge.play-connection.v1",kind="disconnect"})
    for _,value in ipairs({{kind="import",session="edit-host-nonce",generation=1},{kind="disconnect",session="edit-host-nonce",generation=1,assetId=123},{kind="disconnect",session="edit-host-nonce",generation=-1}}) do h.message(1,value) end
    assert(h.disconnects==0)
end)
check("detached connections clear visible status and stale callbacks do nothing",function()
    local h=host(1);h.edit();h.client(1);h.flush();local pair=h.pairs[1]
    local oldServer,oldClient=pair.server.binding.callback,pair.client.binding.callback
    pair.server.Connected=false;pair.client.Connected=false;pair.server.changed:fire();pair.client.changed:fire()
    assert(not h.changes[1].linked and not h.changes[1].canDisconnect)
    oldServer(h.encode({protocol="framebridge.play-connection.v1",kind="disconnect",session="edit-host-nonce",generation=1}))
    oldClient(h.encode({protocol="framebridge.play-connection.v1",kind="status",session="edit-host-nonce",sequence=999,generation=1,phase="paired",delivery="queued",expiresAt=10000,canDisconnect=true}))
    assert(h.disconnects==0 and not h.changes[1].linked and not pair.bridge.disconnect())
    assert(not pair.server.binding.connected and not pair.client.binding.connected)
end)
check("a wrong target context cannot attach or change state",function()
    local h=host(1);h.pairs[1].server.Type="Edit";h.edit();assert(h.pairs[1].server.binds==0)
    h.pairs[1].client.Type="Test";h.client(1);assert(h.pairs[1].client.binds==0 and not h.changes[1].linked)
end)
check("missing service/enum support fails closed with a usable disabled fallback",function()
    for _,supplier in ipairs({function() error("Unsupported Studio") end,function() return {} end}) do
        local state
        local client=Bridge.test({service=supplier,targetType="Edit",changed=function(value) state=value end})
        assert(not client.available and not client.disconnect() and not state.linked and state.reason=="unsupported");client.destroy()
        local edit=Bridge.edit({service=supplier,targetType="Test"});assert(not edit.available);edit.publish();edit.destroy()
    end
    local state;local noEnum=Bridge.test({targetType=nil,changed=function(value) state=value end})
    assert(state.reason=="unsupported" and not noEnum.disconnect());noEnum.destroy()
end)
check("invalid and older status packets cannot enable controls or overwrite a current status",function()
    local h=host(1);h.edit();h.client(1);h.flush();local pair=h.pairs[1];local previous=h.changes[1]
    local base={protocol="framebridge.play-connection.v1",kind="status",session="edit-host-nonce",sequence=0,generation=1,phase="paired",delivery="queued",expiresAt=10000,canDisconnect=true}
    pair.client.binding.callback(h.encode(base));assert(h.changes[1]==previous)
    for key,value in pairs({generation=-1,phase="import",delivery="execute",canDisconnect="true",expiresAt=-1}) do
        local invalid=table.clone(base);invalid.sequence=999;invalid[key]=value;pair.client.binding.callback(h.encode(invalid));assert(h.changes[1]==previous)
    end
end)
check("status changes are reconciled but unchanged heartbeat does not flood the bridge",function()
    local h=host(1);h.edit();h.client(1);h.flush();local initial=#h.wire
    for _=1,10 do h.editBridge.publish() end;assert(#h.wire==initial)
    h.context.delivery="review";h.editBridge.publish();h.flush();assert(h.changes[1].delivery=="review")
    assert(#h.wire==initial+1)
end)
check("unload unsubscribes all peers and makes captured callbacks inert",function()
    local h=host(2);h.edit();h.client(1);h.client(2);h.flush();local callbacks={}
    for _,pair in ipairs(h.pairs) do table.insert(callbacks,pair.server.binding.callback) end
    h.editBridge.destroy();for _,pair in ipairs(h.pairs) do pair.bridge.destroy() end
    for _,callback in ipairs(callbacks) do callback(h.encode({protocol="framebridge.play-connection.v1",kind="disconnect",session="edit-host-nonce",generation=1})) end
    h.service.Connected:fire(h.pairs[1].server);h.editBridge.publish(true)
    assert(h.disconnects==0 and not h.editBridge.available)
    for _,pair in ipairs(h.pairs) do assert(not pair.server.binding.connected and not pair.client.binding.connected and not pair.server.changed.bindings[1].connected and not pair.client.changed.bindings[1].connected) end
    assert(not h.service.Connected.bindings[1].connected)
end)
check("production Play view uses only the bridge and cleans up its UI and stale callbacks",function()
    local h=host(1);h.edit();h.flush()
    local unload,click,enabled=signal(),signal(),signal()
    local widget={Enabled=true,GetPropertyChangedSignal=function() return enabled end,BindToClose=function() end}
    function widget:Destroy() self.destroyed=true end
    local toolbar={CreateButton=function() return {Click=click,SetActive=function() end} end}
    function toolbar:Destroy() self.destroyed=true end
    local plugin={Unloading=unload,GetSetting=function() error("Play cannot read settings") end,SetSetting=function() error("Play cannot save settings") end,
        CreateToolbar=function() return toolbar end,CreateDockWidgetPluginGuiAsync=function() return widget end}
    local rendered,unmounted,imports=nil,false,{}
    local modules={React={createElement=function(kind,props,children) return kind=="ThemeProvider" and children or props end},ReactRoblox={createRoot=function()
        return {render=function(_,props) rendered=props end,unmount=function() unmounted=true end}
    end},Components={colors={},ThemeProvider="ThemeProvider"},ConnectionLifetime={},Brand={Image="rbxassetid://96241964720742"}}
    local gameDouble={GetService=function(_,name)
        if name=="HttpService" then return {JSONEncode=function(_,value) return serde.encode("json",value) end,JSONDecode=function(_,raw) return serde.decode("json",raw) end} end
        assert(name=="PluginConnectionService","Play tried to access "..name)
        return {Connected=signal(),CanHaveConnectionType=function(_,kind) return kind=="Edit" end,GetPluginConnectionsOfType=function() return {h.pairs[1].client} end}
    end}
    local parent={ReactLua={React="React",ReactRoblox="ReactRoblox"},Components="Components",ConnectionLifetime="ConnectionLifetime",Brand="Brand"}
    local chunk=assert(loadstring(fs.readFile("plugins/studio/src/PlayConnectionView.luau")))
    setfenv(chunk,setmetatable({game=gameDouble,script={Parent=parent},require=function(name) table.insert(imports,name);return assert(modules[name],"Unexpected Play module") end,
        Enum={InitialDockState={Float=1},PluginConnectionTargetType={Edit="Edit"}},DockWidgetPluginGuiInfo={new=function() return {} end}}, {__index=getfenv()}))
    local view=chunk();view.mount(plugin,Bridge);h.flush()
    assert(rendered.State.linked and rendered.State.canDisconnect and #imports==5)
    assert(table.find(imports,"Brand"),"Play UI must share the product mark")
    local staleClick=click.bindings[1].callback;local staleDisconnect=rendered.Disconnect
    rendered.Disconnect();h.flush();assert(h.disconnects==1 and rendered.State.phase=="disconnected")
    unload:fire();assert(unmounted and widget.destroyed and toolbar.destroyed)
    local wire=#h.wire;staleClick();staleDisconnect();assert(#h.wire==wire and h.disconnects==1)
    assert(not click.bindings[1].connected and not enabled.bindings[1].connected and not unload.bindings[1].connected)
end)
local report={passed=passed,failed=#failures,failures=failures,scope="Production JSON bridge with isolated service/event doubles; native API/widget unverified"}
print(serde.encode("json",report));assert(#failures==0,"Studio Play connection bridge checks failed")
return report
