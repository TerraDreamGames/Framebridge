-- Fake HTTP and package identities only; never reads or modifies a place.
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local code="FB-AAAAAA-BBBBBB-CCCCCC-DDDDDD"
local function setup()
    local state={time=1000,calls={},guid=0,fail=false,status=nil}
    local http={}
    function http:GenerateGUID() state.guid+=1;return string.rep(string.format("%x",state.guid),32) end
    function http:JSONEncode(body) return body end
    function http:JSONDecode(body) return body end
    function http:RequestAsync(options)
        table.insert(state.calls,options)
        if state.yieldReceipt and options.Url:match("handoff%-receipt$") then state.yieldReceipt=false;coroutine.yield() end
        if state.fail then error("offline") end
        if state.status then return {Success=false,StatusCode=state.status,Body={error="Denied"}} end
        if options.Url:match("/open$") then return {Success=true,Body={expiresAt=2000,package={format="framebridge"},name="Design"}} end
        return {Success=true,Body={ok=true}}
    end
    return Handoff.new("https://private.test",http,function() return state.time end),state
end
test("opens using a tester invitation and an independent retry capability",function()
    local client,state=setup();state.fail=true
    assert(not pcall(function() client:open(code,"tester") end))
    local first=state.calls[1].Body.receiptToken;state.fail=false
    local data=client:open(code,"tester")
    assert(data.receiptToken==first and state.guid==2)
    assert(state.calls[2].Headers["X-Framebridge-Beta"]=="tester" and not state.calls[2].Headers.Authorization)
    local identity={};client:accept(data,identity);client:flush()
    assert(state.calls[3].Body.status=="ready" and state.calls[3].Headers.Authorization=="Bearer "..first)
    client:complete(identity,true,"Done");client:flush()
    assert(state.calls[4].Body.status=="imported" and not client.pending and not next(client.receipts))
end)
test("successful repeat opens create separate import attempts",function()
    local client,state=setup();local first=client:open(code);client:accept(first,{})
    local second=client:open(code);assert(first.receiptToken~=second.receiptToken)
    client:accept(second,{});client:flush()
    local statuses={};for _,call in ipairs(state.calls) do if call.Body.status then statuses[call.Body.status]=true end end
    assert(statuses.failed and statuses.ready)
end)
test("failed receipts retry independently without reopening or repeating import",function()
    local client,state=setup();local data,identity=client:open(code),{}
    client:accept(data,identity);state.fail=true;client:flush();assert(next(client.receipts) and client.error)
    client:complete(identity,true,"Done");state.fail=false;client:flush();client:flush()
    assert(#state.calls==3 and state.calls[3].Body.status=="imported" and not client.pending)
end)
test("expiry discards receipt access while keeping a loaded design locally",function()
    local client,state=setup();local data,identity=client:open(code),{}
    client:accept(data,identity);state.time=2000;client:complete(identity,true);client:flush()
    assert(#state.calls==1 and not next(client.receipts))
end)
test("wrong package identity is reported as failure",function()
    local client,state=setup();client:accept(client:open(code),{});client:complete({},true);client:flush()
    assert(state.calls[2].Body.status=="failed")
end)
test("invalid native package rejection has its own final receipt",function()
    local client,state=setup();client:reject(client:open(code),"Invalid package");client:flush()
    assert(state.calls[2].Body.status=="failed" and not client.pending)
end)
test("expired capabilities stop retrying and do not affect another client",function()
    local client,state=setup();client:accept(client:open(code),{});state.status=401;client:flush();client:flush()
    assert(#state.calls==2 and not next(client.receipts) and client.error)
end)
test("invalid pairing codes cannot be sent as design codes",function()
    local client,state=setup();assert(not pcall(function() client:open("ABCDEF123456") end));assert(#state.calls==0)
end)
test("overlapping receipt completion preserves the newer terminal receipt",function()
    local client,state=setup();local data,identity=client:open(code),{};client:accept(data,identity)
    -- The request callback can yield, just like HttpService. Completion replaces
    -- the queued ready receipt while that earlier request is still in flight.
    state.yieldReceipt=true
    local thread=coroutine.create(function() client:flush() end)
    assert(coroutine.resume(thread))
    assert(#state.calls==2 and state.calls[2].Body.status=="ready")
    client:complete(identity,true,"Done")
    client:flush();assert(#state.calls==2)
    assert(coroutine.resume(thread));client:flush()
    assert(not next(client.receipts) and state.calls[3].Body.status=="imported")
end)
return {passed=passed,failed=#failures,failures=failures,scope="Fake HTTP; no place mutation"}
