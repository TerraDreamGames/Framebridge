-- Production storage/Relay with serialized device-settings and HTTP doubles.
-- No native settings, credentials, network requests or places are accessed.
local fs, serde = require("@lune/fs"), require("@lune/serde")
local function module(name) return assert(loadstring(fs.readFile("plugins/studio/src/"..name..".luau")))() end
local Storage, Relay = module("ConnectionStorage"), module("Relay")
local origin, token, expiry = "https://relay.example", string.rep("a",64), 9000
local function record(value) return {origin=origin,receiverToken=value or token,expiresAt=expiry} end
local function host(initialPlace, disk)
    local h={place=initialPlace or 1234,disk=disk or {},reads={},writes={},calls={},queue={}}
    local plugin={}
    function plugin:GetSetting(key)
        h.reads[key]=(h.reads[key] or 0)+1
        if h.readHook then h.readHook(key) end
        local value=h.disk[key]
        if value==nil then return nil end
        return serde.decode("json",value)
    end
    function plugin:SetSetting(key,value)
        assert(key:match("^[A-Za-z0-9_]+$"),"Unsafe settings key")
        table.insert(h.writes,{key=key,value=value})
        if not h.silent then h.disk[key]=serde.encode("json",value) end
    end
    local http={JSONEncode=function(_,value) return serde.encode("json",value) end,JSONDecode=function(_,value) return serde.decode("json",value) end}
    function http:RequestAsync(options)
        table.insert(h.calls,options)
        local response=assert(table.remove(h.queue,1),"Unexpected HTTP request")
        if response.before then response.before() end
        return {Success=response.status==200,StatusCode=response.status,Body=serde.encode("json",response.body)}
    end
    h.storage=Storage.new(plugin,origin,function() return h.place end,function() return 1000 end)
    h.client=Relay.new(origin,http,h.storage,function() return 1000 end)
    function h.respond(body,status,before) table.insert(h.queue,{body=body,status=status or 200,before=before}) end
    function h.pair()
        h.client.betaAccess="synthetic-tester-code"
        h.respond({receiverToken=token,code="ABCDEF123456",expiresAt=expiry})
        h.client:connect()
        h.respond({paired=true,revision=0})
        h.client:poll()
        return h.writes[#h.writes] and h.writes[#h.writes].key
    end
    return h,plugin
end
local passed=0
local function check(name,fn)
    local ok,why=pcall(fn)
    assert(ok,name..": "..tostring(why));passed+=1
end
local function resumed() return {role="receiver",paired=true,expiresAt=expiry,importedRevision=2} end
check("safe collision-free keys preserve backend and real-place isolation",function()
    local h,plugin=host()
    h.storage.save(record())
    local first=h.writes[1].key
    assert(first:match("^FramebridgeConnectionV2_[a-f0-9]+_1234$"))
    local second=Storage.new(plugin,"https://relay_example",function() return 1234 end,function() return 1000 end)
    second.save({origin="https://relay_example",receiverToken=token,expiresAt=expiry})
    assert(h.writes[2].key~=first)
    h.place=5678;assert(h.storage.load()==nil)
    h.storage.save(record());assert(h.writes[3].key~=first)
end)
check("fresh serialized settings restore the receiver without retaining tester access",function()
    local h=host();local key=h.pair()
    local reopened=host(1234,h.disk)
    reopened.respond(resumed());assert(reopened.client:restore().paired)
    assert(reopened.client.token==token and reopened.client.revision==2)
    assert(reopened.calls[1].Method=="GET" and reopened.calls[1].Headers.Authorization=="Bearer "..token)
    assert(reopened.calls[1].Headers["X-Framebridge-Beta"]==nil and reopened.client.betaAccess=="")
    local saved=serde.decode("json",h.disk[key]);local fields=0
    for field in pairs(saved) do assert(field=="origin" or field=="receiverToken" or field=="expiresAt");fields+=1 end
    assert(fields==3 and saved.origin==origin and saved.receiverToken==token and saved.expiresAt==expiry)
end)
check("legacy migration reads once, retries outage and writes only verified V2",function()
    local legacy="FramebridgeConnection:"..origin..":1234"
    local h=host(1234,{[legacy]=serde.encode("json",record())})
    h.respond({error="Unavailable"},503)
    assert(not pcall(function() h.client:restore() end) and #h.writes==0)
    h.respond(resumed());assert(h.client:restore().paired)
    assert(h.reads[legacy]==1 and #h.writes==1 and h.writes[1].key~=legacy)
    assert(serde.decode("json",h.disk[legacy]).receiverToken==token)
    h.respond({ok=true});h.client:disconnect()
    local reopened=host(1234,h.disk)
    assert(reopened.client:restore()==nil and #reopened.calls==0 and not reopened.reads[legacy])
end)
check("malformed, expired and wrong-origin legacy records never migrate or authenticate",function()
    for _,bad in ipairs({{origin="https://other.example",receiverToken=token,expiresAt=expiry},{origin=origin,receiverToken="bad",expiresAt=expiry},{origin=origin,receiverToken=token,expiresAt=999},{origin=origin,receiverToken=token,expiresAt=expiry,betaAccess="must-not-migrate"}}) do
        local h=host(1234,{["FramebridgeConnection:"..origin..":1234"]=serde.encode("json",bad)})
        assert(h.client:restore()==nil and #h.calls==0 and #h.writes==0)
    end
end)
check("silent settings failures keep the live capability and report it as unsaved",function()
    local h=host();h.silent=true;h.pair()
    assert(h.client.token==token and h.client.paired and h.client.storageError and not h.client.storagePersistent)
    local reopened=host(1234,h.disk);assert(reopened.client:restore()==nil and #reopened.calls==0)
end)
check("a blank-place session stays memory-only and is saved on first publication",function()
    local h=host(0);h.pair()
    assert(#h.writes==0 and next(h.reads)==nil and not h.client.storageError and h.client.storagePersistent==false)
    local anotherBlank=host(0,h.disk);assert(anotherBlank.client:restore()==nil and #anotherBlank.calls==0)
    h.place=79318715690547;assert(h.client:syncScope()=="promoted" and h.client.token==token and h.client.paired)
    assert(#h.writes==1 and h.client.storagePersistent and not h.client.storageError)
    local reopened=host(h.place,h.disk);reopened.respond(resumed());assert(reopened.client:restore().paired)
end)
check("cloud place assignment after plugin creation resolves the existing real-place record",function()
    local saved=host(1234);saved.storage.save(record())
    local h=host(0,saved.disk);assert(h.client:restore()==nil and #h.calls==0)
    h.place=1234;assert(h.client:syncScope()=="changed")
    h.respond(resumed());assert(h.client:restore().paired and h.client.token==token)
end)
check("published place changes preserve old storage and restore only the new place capability",function()
    local h=host(1234);local first=h.pair();local old=h.disk[first]
    h.place=5678;assert(h.client:syncScope()=="changed" and h.client.token==nil and h.disk[first]==old)
    assert(h.client:restore()==nil)
    local secondToken=string.rep("b",64);h.storage.save(record(secondToken))
    h.respond(resumed());h.client:restore();assert(h.client.token==secondToken)
    assert(h.calls[#h.calls].Headers.Authorization=="Bearer "..secondToken)
    for _,call in ipairs(h.calls) do assert(call.Method~="DELETE") end
    h.place=0;h.client:syncScope();assert(h.client.token==nil and h.client:restore()==nil)
end)
check("an A-to-B-to-A restore response cannot clear the newly restored connection",function()
    local h=host();h.storage.save(record())
    h.respond({error="Old request rejected"},401,function()
        h.place=5678;h.client:syncScope();h.place=1234;h.client:syncScope()
        assert(h.client:restore().paired)
    end)
    h.respond(resumed())
    assert(h.client:restore()==nil and h.client.token==token and h.client.paired)
    assert(h.storage.load().receiverToken==token)
end)
check("a restore completing after unload or replacement cannot erase saved capabilities",function()
    for _,status in ipairs({200,503}) do
        for _,replacement in ipairs({false,true}) do
            local h=host();h.storage.save(record());local key=h.writes[1].key;local original=h.disk[key]
            h.respond(status==200 and resumed() or {error="Offline"},status,function()
                h.client.token=replacement and string.rep("b",64) or nil
                h.client.paired=replacement
            end)
            assert(h.client:restore()==nil and h.disk[key]==original and #h.writes==1)
            assert(h.client.paired==replacement and h.client.token==(replacement and string.rep("b",64) or nil))
        end
    end
end)
check("a late poll from the old place cannot replace the new connection",function()
    local h=host();h.pair()
    h.respond({paired=false,revision=3,package={}},200,function()
        h.place=5678;h.client:syncScope();h.storage.save(record(string.rep("b",64)))
        assert(h.client:restore().paired)
    end)
    h.respond(resumed())
    assert(h.client:poll()==nil and h.client.token==string.rep("b",64) and h.client.paired)
end)
check("late disconnect and replacement DELETEs cannot clear or create a session in the next place",function()
    for _,action in ipairs({"disconnect","connect"}) do
        local h=host();h.pair();h.client.paired=action~="connect"
        h.respond({ok=true},200,function()
            h.place=5678;h.client:syncScope();h.storage.save(record(string.rep("b",64)))
            assert(h.client:restore().paired)
        end)
        h.respond(resumed())
        pcall(function() h.client[action](h.client) end)
        assert(h.client.token==string.rep("b",64) and h.client.paired)
        assert(#h.calls==4 and h.calls[3].Method=="DELETE" and h.calls[4].Method=="GET")
        assert(h.storage.load().receiverToken==string.rep("b",64))
    end
end)
check("disconnect clears local settings before a slow revoke and preserves a newer same-place connection",function()
    for _,pollStatus in ipairs({200,401}) do
        for _,deleteStatus in ipairs({200,401,503}) do
            local h=host();local key=h.pair()
            h.respond(pollStatus==200 and {paired=true,revision=3,package={}} or {error="Old poll rejected"},pollStatus,function() coroutine.yield() end)
            local oldPollResult="pending"
            local poll=coroutine.create(function() oldPollResult=h.client:poll() end)
            assert(coroutine.resume(poll) and coroutine.status(poll)=="suspended")
            h.respond(deleteStatus==200 and {ok=true} or {error="Old revoke rejected"},deleteStatus,function() coroutine.yield() end)
            local disconnect=coroutine.create(function() h.client:disconnect() end)
            assert(coroutine.resume(disconnect) and coroutine.status(disconnect)=="suspended")
            assert(h.client.token==nil and not h.client.paired and h.client.code==nil and h.client.expiresAt==0)
            assert(h.storage.load()==nil and serde.decode("json",h.disk[key])==false)
            assert(h.calls[#h.calls].Method=="DELETE" and h.calls[#h.calls].Headers.Authorization=="Bearer "..token)
            local newerToken=string.rep("b",64)
            h.respond({receiverToken=newerToken,code="DEFABC654321",expiresAt=expiry})
            h.client:connect()
            h.respond({paired=true,revision=0});h.client:poll()
            assert(coroutine.resume(poll) and coroutine.status(poll)=="dead" and oldPollResult==nil)
            assert(coroutine.resume(disconnect) and coroutine.status(disconnect)=="dead")
            assert(h.client.token==newerToken and h.client.paired and h.storage.load().receiverToken==newerToken)
        end
    end
end)
check("a storage operation cannot write a capability into a changed place",function()
    local h=host();h.place=5678
    assert(not pcall(function() h.storage.save(record(),1234) end) and #h.writes==0)
    h.place=1234;h.readHook=function() h.place=5678 end
    assert(not pcall(function() h.storage.save(record(),1234) end))
    assert(#h.writes==1 and h.writes[1].key:sub(-5)=="_1234")
end)
print("Studio saved-connection checks: "..passed.." passed")
