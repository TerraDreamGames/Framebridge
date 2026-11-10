-- Run with Relay injected, using fake responses and real JSON serialization; no HTTP requests.
local Http=game:GetService("HttpService")
local calls,queue={},{}
local fake={JSONEncode=function(_,v) return Http:JSONEncode(v) end,JSONDecode=function(_,v) return Http:JSONDecode(v) end}
function fake:RequestAsync(options)
    table.insert(calls,options)
    local next=table.remove(queue,1)
    assert(next,"Unexpected request")
    if next.before then next.before() end
    return {Success=next.status==200,StatusCode=next.status,Body=Http:JSONEncode(next.body)}
end
local function respond(body,status) table.insert(queue,{body=body,status=status or 200}) end
local client=Relay.new("https://relay.example",fake)
client.betaAccess="private-tester-code"
respond({receiverToken="secret-receiver",code="ABCDEF123456",expiresAt=1234})
assert(client:connect()=="ABCDEF123456")
assert(calls[1].Headers.Authorization==nil)
assert(calls[1].Headers["X-Framebridge-Beta"]=="private-tester-code")
respond({paired=true,revision=1,package={format="framebridge"},pollAfterMs=5000})
assert(client:poll().revision==1)
assert(client.pollAfter==5)
assert(calls[2].Headers["X-Framebridge-Beta"]==nil)
assert(calls[2].Headers.Authorization=="Bearer secret-receiver")
assert(calls[2].Url=="https://relay.example/v1/inbox?after=0&paired=false&wait=15000")
local beforeConnect=#calls
client:connect()
assert(#calls==beforeConnect and client.token=="secret-receiver", "Connecting while paired must not generate a new session")
client.revision=1
respond({paired=true,revision=1,pollAfterMs=60000})
assert(client:poll().package==nil)
assert(client.pollAfter==30)
assert(calls[3].Url=="https://relay.example/v1/inbox?after=1&paired=true&wait=15000")
respond({ok=true})
client:ack(1,"imported","Done")
assert(calls[4].Method=="POST" and calls[4].Url=="https://relay.example/v1/receipt")
assert(calls[4].Headers.Authorization=="Bearer secret-receiver")
assert(Http:JSONDecode(calls[4].Body).status=="imported")
assert(client.token=="secret-receiver" and client.paired, "An import acknowledgment must keep the link")
respond({error="Connection expired"},401)
local ok,err=pcall(function() client:poll() end)
assert(not ok and string.find(err,"expired"))
assert(client.token==nil and client.code==nil and client:poll()==nil)
local empty=Relay.new("",fake)
assert(not pcall(function() empty:connect() end))

local saved={origin="https://relay.example",receiverToken=string.rep("a",64),expiresAt=9000}
local storage={load=function() return saved end,save=function(record) saved=record end}
local reopened=Relay.new("https://relay.example",fake,storage,function() return 1000 end)
respond({role="receiver",paired=true,expiresAt=9000,importedRevision=1})
assert(reopened:restore().paired and reopened.revision==1)
assert(calls[#calls].Url=="https://relay.example/v1/session")
assert(calls[#calls].Headers.Authorization=="Bearer " .. string.rep("a",64))
respond({paired=true,revision=1,pollAfterMs=5000})
reopened:poll()
assert(calls[#calls].Url=="https://relay.example/v1/inbox?after=1&paired=true&wait=15000", "Reload must not repeat an imported design")
respond({paired=true,revision=2,package={format="framebridge"},pollAfterMs=5000})
assert(reopened:poll().revision==2)
respond({ok=true})
reopened:ack(2,"imported")
assert(reopened.token==saved.receiverToken and reopened.paired)
local retry=Relay.new("https://relay.example",fake,storage,function() return 1000 end)
respond({error="Temporarily unavailable"},503)
assert(not pcall(function() retry:restore() end) and saved~=nil and retry.token==nil)
respond({role="receiver",paired=true,expiresAt=9000,importedRevision=2})
retry:connect() -- retry must resume, without POST or DELETE
assert(calls[#calls].Method=="GET" and retry.paired and retry.token==saved.receiverToken)
respond({ok=true})
retry:disconnect()
assert(saved==nil and retry.token==nil)
saved={origin="https://relay.example",receiverToken=string.rep("a",64),expiresAt=9000}
respond({error="Revoked"},401)
assert(reopened:restore()==nil and saved==nil)
saved={origin="https://other.example",receiverToken=string.rep("a",64),expiresAt=9000}
local before=#calls
assert(reopened:restore()==nil and saved==nil and #calls==before)
client.token=string.rep("a",64)
respond({error="Old connection expired"},401)
queue[1].before=function() client.token=string.rep("b",64) end
assert(client:poll()==nil and client.token==string.rep("b",64), "A stale 401 must not clear a newer connection")
respond({paired=false,revision=0,pollAfterMs=5000})
queue[1].before=function() client.token=string.rep("c",64); client.paired=true end
assert(client:poll()==nil and client.paired, "A stale success must not replace the newer connection state")
respond({paired=true,revision=2,longPoll=true,pollAfterMs=5000})
client:poll()
assert(client.pollAfter==0.1, "A long-poll response must not add another five-second sleep")
return {passed=23,scope="Relay reuse, import acknowledgments, restore, outage retry, revocation, stale responses and long polling; fake HTTP only; no place changes"}
