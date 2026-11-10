-- Fake imports and acknowledgments only. Never touches the place.
local passed,failures=0,{}
local function test(name,run)
    local ok,err=pcall(run)
    if ok then passed+=1 else table.insert(failures,name .. ": " .. tostring(err)) end
end
local function setup()
    local state={auto=true,running=false,busy=false,imports=0,ackFails=false,acks={},tells={}}
    local receiver=Receiver.new({
        load=function(package)
            if package.invalid then return false,"Invalid package" end
            state.package=package
            if state.onLoad then state.onLoad(package) end
            return true
        end,
        current=function() return state.package end,
        import=function()
            state.imports+=1
            if state.onImport then state.onImport() end
            return not state.importFails,"Import result"
        end,
        ack=function(revision,status,message)
            if state.ackFails then error("offline") end
            if state.onAck then state.onAck(revision,status) end
            table.insert(state.acks,{revision=revision,status=status,message=message})
        end,
        autoImport=function() return state.auto end,
        running=function() return state.running end,
        busy=function() return state.busy end,
        tell=function(message) table.insert(state.tells,{package=state.package,message=message}) end,
    })
    return receiver,state
end
test("duplicate delivery imports once",function()
    local receiver,state=setup(); local package={}
    receiver:receive(1,package); receiver:receive(1,package); receiver:tick()
    assert(state.imports==1 and state.acks[1].status=="imported")
end)
test("failed receipt retries without reimporting",function()
    local receiver,state=setup(); state.ackFails=true
    receiver:receive(1,{}); receiver:tick(); assert(state.imports==1 and receiver.receipt)
    state.ackFails=false; receiver:tick(); receiver:tick()
    assert(state.imports==1 and #state.acks==1 and not receiver.receipt)
end)
test("play test queues then imports once",function()
    local receiver,state=setup(); state.running=true
    receiver:receive(1,{}); receiver:tick(); assert(state.imports==0 and state.acks[1].status=="queued")
    state.running=false; state.busy=true; receiver:tick(); assert(state.imports==0)
    state.busy=false; receiver:tick(); receiver:tick(); assert(state.imports==1 and state.acks[2].status=="imported")
end)
test("review mode never auto-imports",function()
    local receiver,state=setup(); state.auto=false
    receiver:receive(1,{}); receiver:tick(); assert(state.imports==0 and state.acks[1].status=="ready")
end)
test("turning off auto-import releases queue to review",function()
    local receiver,state=setup(); state.running=true; receiver:receive(1,{})
    state.auto=false; state.running=false; receiver:tick()
    assert(state.imports==0 and state.acks[2].status=="ready")
end)
test("queued design cannot import a locally replaced package",function()
    local receiver,state=setup(); state.running=true; receiver:receive(1,{})
    state.package={localCopy=true}; state.running=false; receiver:tick()
    assert(state.imports==0 and state.acks[2].status=="failed")
end)
test("manual completion consumes queued delivery",function()
    local receiver,state=setup(); state.running=true; receiver:receive(1,{})
    state.running=false; receiver:completeManual(receiver:beginManual(state.package),true,"Done"); receiver:tick()
    assert(state.imports==0 and state.acks[2].status=="imported")
end)
test("default review imports acknowledge the reviewed revision once",function()
    local receiver,state=setup(); state.auto=false
    receiver:receive(1,{})
    assert(receiver.reviewed and not receiver.pending and state.acks[1].status=="ready")
    local delivery=assert(receiver:beginManual(state.package))
    assert(receiver:completeManual(delivery,true,"Manual import done"))
    receiver:tick();receiver:tick()
    assert(#state.acks==2 and state.acks[2].revision==1 and state.acks[2].status=="imported")
    assert(not receiver.reviewed and not receiver.pending and not receiver:beginManual(state.package))
    assert(not receiver:completeManual(delivery,true,"Duplicate completion") and #state.acks==2)
end)
test("failed manual review import can be retried without automatic import",function()
    local receiver,state=setup();state.auto=false;receiver:receive(1,{})
    local delivery=assert(receiver:beginManual(state.package))
    assert(not receiver:completeManual(delivery,false,"Native import failed"))
    assert(state.acks[2].status=="failed" and state.acks[2].message=="Native import failed")
    state.auto=true;receiver:tick();receiver:tick()
    assert(state.imports==0 and #state.acks==2 and receiver.reviewed==delivery)
    assert(receiver:completeManual(receiver:beginManual(state.package),true,"Retry done"))
    assert(state.acks[3].status=="imported" and not receiver.reviewed)
end)
test("review hold remains explicit when Auto-import is enabled",function()
    local receiver,state=setup();state.auto=false;receiver:receive(1,{})
    local held=receiver.reviewed
    receiver:tick();receiver:tick();state.auto=true;receiver:tick()
    assert(state.imports==0 and #state.acks==1 and receiver.reviewed==held)
    receiver:receive(2,{})
    assert(state.imports==1 and state.acks[2].revision==2 and state.acks[2].status=="imported")
end)
test("auto queue released to review retains manual completion and sends ready once",function()
    local receiver,state=setup();state.running=true;receiver:receive(1,{})
    local delivery=assert(receiver:beginManual(state.package))
    state.auto=false;state.running=false;receiver:tick();receiver:tick()
    assert(not receiver.pending and receiver.reviewed==delivery and #state.acks==2)
    assert(state.acks[2].status=="ready" and state.imports==0)
    assert(receiver:completeManual(delivery,true,"Reviewed queued design"))
    assert(state.acks[3].status=="imported")
end)
test("manual imported receipt retries without repeating the import",function()
    local receiver,state=setup();state.auto=false;receiver:receive(1,{})
    state.ackFails=true
    assert(receiver:completeManual(receiver:beginManual(state.package),true,"Done"))
    assert(receiver.receipt and receiver.receipt.status=="imported" and not receiver.reviewed)
    receiver:tick();state.ackFails=false;receiver:tick();receiver:tick()
    assert(state.imports==0 and #state.acks==2 and state.acks[2].status=="imported" and not receiver.receipt)
end)
test("ready receipt retry does not resend ready after confirmation",function()
    local receiver,state=setup();state.auto=false;state.ackFails=true;receiver:receive(1,{})
    local delivery=receiver.reviewed;receiver:tick();state.ackFails=false;receiver:tick();receiver:tick()
    assert(receiver.reviewed==delivery and #state.acks==1 and state.acks[1].status=="ready")
    assert(receiver:completeManual(delivery,true,"Done") and state.acks[2].status=="imported")
end)
test("manual completion never consumes a newer delivery even with the same package object",function()
    local receiver,state=setup();state.auto=false;local package={};receiver:receive(1,package)
    local old=assert(receiver:beginManual(package));receiver:receive(2,package)
    local newer=assert(receiver:beginManual(package));local count=#state.acks
    assert(old~=newer and not receiver:completeManual(old,true,"Old import done"))
    assert(receiver.reviewed==newer and #state.acks==count)
    assert(receiver:completeManual(newer,true,"New import done") and state.acks[count+1].revision==2)
end)
test("reset and reconnect cannot reuse an old manual completion",function()
    local receiver,state=setup();state.auto=false;local package={};receiver:receive(1,package)
    local old=assert(receiver:beginManual(package));receiver:reset();receiver:receive(1,package)
    local newer=assert(receiver:beginManual(package));local count=#state.acks
    assert(not receiver:completeManual(old,true,"Old session done") and receiver.reviewed==newer and #state.acks==count)
    assert(receiver:completeManual(newer,true,"New session done"))
end)
test("local imports have no delivery and cannot consume review",function()
    local receiver,state=setup()
    assert(not receiver:beginManual({}) and not receiver:completeManual(nil,true,"Local import"))
    state.auto=false;receiver:receive(1,{})
    local held=receiver.reviewed
    assert(not receiver:beginManual({}) and not receiver:completeManual(nil,true,"Other local package"))
    assert(receiver.reviewed==held and #state.acks==1)
end)
test("a replaced current package receives a failed receipt rather than imported",function()
    local receiver,state=setup();state.auto=false;receiver:receive(1,{})
    local delivery=assert(receiver:beginManual(state.package));state.package={localCopy=true}
    assert(not receiver:completeManual(delivery,true,"Wrong package done"))
    assert(not receiver.reviewed and state.acks[2].revision==1 and state.acks[2].status=="failed")
end)
test("cancelling review reports failure and discards later manual completion",function()
    local receiver,state=setup();state.auto=false;receiver:receive(1,{})
    local delivery=assert(receiver:beginManual(state.package));receiver:cancel("Local package replaced design")
    assert(not receiver.reviewed and not receiver.pending and state.acks[2].status=="failed")
    assert(not receiver:completeManual(delivery,true,"Late import") and #state.acks==2)
end)
test("automatic failure becomes review for a successful manual retry",function()
    local receiver,state=setup();state.importFails=true;receiver:receive(1,{})
    assert(state.imports==1 and state.acks[1].status=="failed" and receiver.reviewed)
    receiver:tick();assert(state.imports==1)
    assert(receiver:completeManual(receiver:beginManual(state.package),true,"Manual retry"))
    assert(state.acks[2].status=="imported")
end)
test("yielding automatic import cannot acknowledge a new session at the same revision",function()
    local receiver,state=setup();local package={}
    state.onImport=function() coroutine.yield() end
    local thread=coroutine.create(function() receiver:receive(1,package) end)
    assert(coroutine.resume(thread));receiver:reset();state.auto=false;receiver:receive(1,package)
    local newer=receiver.reviewed;assert(coroutine.resume(thread))
    assert(receiver.reviewed==newer and #state.acks==1 and state.acks[1].status=="ready")
    assert(receiver:completeManual(newer,true,"New session import"))
end)
test("yielding automatic import cannot replace a newer delivery receipt",function()
    local receiver,state=setup();state.onImport=function() coroutine.yield() end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread));state.auto=false;receiver:receive(2,{})
    local newer=receiver.reviewed;assert(coroutine.resume(thread))
    assert(receiver.reviewed==newer and #state.acks==1 and state.acks[1].revision==2)
end)
test("cancel while automatic import yields suppresses the stale outcome",function()
    local receiver,state=setup();state.onImport=function() coroutine.yield() end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread));receiver:cancel("Replaced while importing");assert(coroutine.resume(thread))
    assert(#state.acks==0 and not receiver.reviewed and not receiver.pending)
end)
test("yielding load cannot overwrite a newer reviewed delivery",function()
    local receiver,state=setup();state.auto=false;local first={}
    state.onLoad=function(package) if package==first then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:receive(1,first) end)
    assert(coroutine.resume(thread));local latest={};receiver:receive(2,latest)
    local newer=receiver.reviewed;assert(coroutine.resume(thread))
    assert(receiver.reviewed==newer and newer.package==latest and #state.acks==1 and state.acks[1].revision==2)
end)
test("yielding load cannot restore review after disconnect",function()
    local receiver,state=setup();state.auto=false;state.onLoad=function() coroutine.yield() end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread));receiver:reset();assert(coroutine.resume(thread))
    assert(not receiver.reviewed and not receiver.pending and receiver.revision==0 and #state.acks==0)
end)
test("yielding ready acknowledgment cannot overwrite a newer status message",function()
    local receiver,state=setup();state.auto=false
    state.onAck=function(revision) if revision==1 then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread));local latest={};receiver:receive(2,latest)
    assert(#state.tells==1 and state.tells[1].package==latest)
    assert(coroutine.resume(thread));receiver:tick()
    assert(#state.tells==1 and receiver.reviewed.package==latest and #state.acks==2)
end)
test("ready acknowledgment resumed after manual success cannot restore review message",function()
    local receiver,state=setup();state.auto=false
    state.onAck=function(_,status) if status=="ready" then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread))
    assert(receiver:completeManual(receiver:beginManual(state.package),true,"Done"))
    assert(coroutine.resume(thread));receiver:tick()
    assert(#state.tells==0 and state.acks[2].status=="imported" and not receiver.reviewed)
end)
test("ready acknowledgment resumed after manual failure cannot hide import error",function()
    local receiver,state=setup();state.auto=false
    state.onAck=function(_,status) if status=="ready" then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread))
    local delivery=assert(receiver:beginManual(state.package))
    assert(not receiver:completeManual(delivery,false,"Import failed"))
    assert(coroutine.resume(thread));receiver:tick()
    assert(#state.tells==0 and state.acks[2].status=="failed" and receiver.reviewed==delivery)
end)
test("queued acknowledgment resumed after automatic completion cannot restore Play message",function()
    local receiver,state=setup();state.running=true
    state.onAck=function(_,status) if status=="queued" then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread));state.running=false;receiver:tick()
    assert(state.imports==1);assert(coroutine.resume(thread));receiver:tick()
    assert(#state.tells==0 and state.acks[2].status=="imported")
end)
test("queue release acknowledgment resumed after manual completion cannot restore review message",function()
    local receiver,state=setup();state.running=true;receiver:receive(1,{})
    state.running=false;state.auto=false
    state.onAck=function(_,status) if status=="ready" then coroutine.yield() end end
    local thread=coroutine.create(function() receiver:tick() end)
    assert(coroutine.resume(thread))
    assert(receiver:completeManual(receiver:beginManual(state.package),true,"Done"))
    assert(coroutine.resume(thread));receiver:tick()
    assert(#state.tells==1 and state.acks[3].status=="imported" and not receiver.reviewed)
end)
test("new revision supersedes queued design",function()
    local receiver,state=setup(); state.running=true; receiver:receive(1,{old=true})
    local latest={new=true}; receiver:receive(2,latest); state.running=false; receiver:tick()
    assert(state.package==latest and state.imports==1 and state.acks[3].revision==2)
end)
test("invalid design and import failure are reported",function()
    local receiver,state=setup(); receiver:receive(1,{invalid=true})
    assert(state.imports==0 and state.acks[1].status=="failed")
    state.importFails=true; receiver:receive(2,{})
    assert(state.imports==1 and state.acks[2].status=="failed")
end)
test("overlapping delivery and ticks serialize receipt HTTP and preserve a newer receipt",function()
    local state={acks={}}
    local receiver=Receiver.new({
        load=function(package) state.package=package; return true end,
        current=function() return state.package end,
        autoImport=function() return false end,
        tell=function() end,
        ack=function(revision,status)
            table.insert(state.acks,revision)
            if revision==1 then coroutine.yield() end
        end,
    })
    local thread=coroutine.create(function() receiver:receive(1,{}) end)
    assert(coroutine.resume(thread))
    receiver:tick(); receiver:receive(2,{})
    assert(#state.acks==1 and receiver.receipt.revision==2)
    assert(coroutine.resume(thread))
    receiver:tick(); receiver:tick()
    assert(#state.acks==2 and state.acks[2]==2 and not receiver.receipt)
end)
test("disconnect discards queue and pending receipt",function()
    local receiver,state=setup(); state.running=true; state.ackFails=true; receiver:receive(1,{})
    receiver:reset(); state.running=false; receiver:tick()
    assert(state.imports==0 and not receiver.pending and not receiver.receipt)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Fake imports only; no place changes"}
