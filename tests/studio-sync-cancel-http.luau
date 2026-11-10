-- Real production Relay/Receiver over local HTTP + workerd. No Roblox place,
-- native settings, production credentials or external services are accessed.
local fs, net, process = require("@lune/fs"), require("@lune/net"), require("@lune/process")
local serde, task = require("@lune/serde"), require("@lune/task")
local function module(name) return assert(loadstring(fs.readFile("plugins/studio/src/"..name..".luau")))() end
local Relay, Receiver = module("Relay"), module("Receiver")
local url = assert(process.env.FRAMEBRIDGE_TEST_RELAY)
assert(url:match("^http://127%.0%.0%.1:%d+$"), "Local test server only")
local http={JSONEncode=function(_,v) return serde.encode("json",v) end,JSONDecode=function(_,v) return serde.decode("json",v) end}
function http:RequestAsync(options)
    local r=net.request({url=options.Url,method=options.Method,headers=options.Headers,body=options.Body})
    return {Success=r.statusCode>=200 and r.statusCode<300,StatusCode=r.statusCode,Body=r.body}
end
local function call(path,token,body,method)
    local response=http:RequestAsync({Url=url..path,Method=method or (body and "POST" or "GET"),Headers={
        ["Content-Type"]="application/json",Authorization=token and "Bearer "..token or nil,
    },Body=body and (type(body)=="string" and body or serde.encode("json",body))})
    return response.StatusCode,serde.decode("json",response.Body)
end
local saved
local storage={load=function() return saved end,save=function(record)
    saved=record and serde.decode("json",serde.encode("json",record)) or nil
    return true
end}
local function now() return os.time()*1000 end
local relay=Relay.new(url,http,storage,now)
relay.betaAccess="local-sync-cancel-invitation-1234567890"
local function pair()
    local code=relay:connect()
    local status,data=call("/v1/pair",nil,{code=code})
    assert(status==200 and type(data.senderToken)=="string")
    assert(relay:poll().paired)
    return data.senderToken
end
local sender=pair()
local state={imports=0,running=true,auto=true,acks={}}
local receiver=Receiver.new({
    load=function(pkg) state.package=pkg;return true end,
    current=function() return state.package end,
    import=function() state.imports+=1;return true,"Isolated import" end,
    autoImport=function() return state.auto end,running=function() return state.running end,
    busy=function() return false end,tell=function() end,
    ack=function(revision,status,message)
        relay:ack(revision,status,message);table.insert(state.acks,status)
    end,
})
local sends=0
local function send()
    sends+=1
    -- Keep the real source packet bytes: serde cannot round-trip empty JSON arrays.
    local pkg=http:RequestAsync({Url=url.."/__test__/package?revision="..sends,Method="GET",Headers={}}).Body
    local status,data=call("/v1/package",sender,pkg)
    assert(status==200)
    local delivery=relay:poll()
    assert(delivery.revision==data.revision and delivery.package)
    relay.revision=delivery.revision
    receiver:receive(delivery.revision,delivery.package)
    return delivery.revision
end
local revision=send()
local function receipt(token,number)
    local status,data=call("/v1/receipt?revision="..number,token)
    assert(status==200);return data.status
end
assert(state.imports==0 and receipt(sender,revision)=="queued")
state.auto=false;state.running=false;receiver:tick();receiver:tick()
assert(state.imports==0 and receipt(sender,revision)=="ready")
receiver:cancel("Replaced with a local package.")
state.package={localReplacement=true};receiver:tick();receiver:tick()
assert(state.imports==0 and receipt(sender,revision)=="failed")
assert(#state.acks==3 and state.acks[1]=="queued" and state.acks[2]=="ready" and state.acks[3]=="failed")

state.auto=true;state.running=true
local pendingRevision=send()
assert(receipt(sender,pendingRevision)=="queued" and state.imports==0)
local oldReceiverToken=relay.token
call("/__test__/hold-inbox",nil,{})
local pollFinished,oldPollResult=false,"pending"
task.spawn(function() oldPollResult=relay:poll();pollFinished=true end)
local function waitFor(field,seconds)
    for _=1,math.ceil(seconds/0.05) do
        local _,control=call("/__test__/state")
        if control[field] then return end
        task.wait(0.05)
    end
    error("Test control did not reach "..field)
end
waitFor("inboxEntered",2)
call("/__test__/hold-delete",nil,{})
-- Production controller cancels its queue and serializes actions before Relay
-- starts the revoke; its complete-controller tests cover that UI boundary.
receiver:reset()
local disconnectFinished=false
task.spawn(function() relay:disconnect();disconnectFinished=true end)
waitFor("deleteHeld",2)
assert(not disconnectFinished and relay.token==nil and not relay.paired and saved==nil)
state.running=false;receiver:tick();receiver:tick()
assert(state.imports==0 and receipt(sender,pendingRevision)=="queued")
-- Let the real 15-second inbox timeout finish, but hold its HTTP response.
waitFor("inboxHeld",18)
assert(not pollFinished)
call("/__test__/release-delete",nil,{})
for _=1,40 do if disconnectFinished then break end;task.wait(0.05) end
assert(disconnectFinished)
local newSender=pair()
assert(relay.token~=oldReceiverToken and saved.receiverToken==relay.token)
call("/__test__/release-inbox",nil,{})
for _=1,40 do if pollFinished then break end;task.wait(0.05) end
assert(pollFinished and oldPollResult==nil and relay.paired and state.imports==0)
local revoked=call("/v1/session",oldReceiverToken)
assert(revoked==401)
local reopened=Relay.new(url,http,storage,now)
assert(reopened:restore().paired and reopened.token==relay.token)
sender=newSender;relay=reopened;receiver:reset();state.running=false
local finalRevision=send();receiver:tick();receiver:tick()
assert(state.imports==1 and receipt(sender,finalRevision)=="imported")
assert(relay.token and relay.paired)
relay:disconnect()
print("Studio real HTTP queued cancellation/reconnect: 10 boundaries passed; actual 15000ms wait; isolated workerd only")
