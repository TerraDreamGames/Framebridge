assert(game.PlaceId==0,"Handoff controller checks require the approved blank QA place")
local passed,failures=0,{}
local function test(name,body)
    local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
end
local starter,before=game:GetService("StarterGui"),#game:GetService("StarterGui"):GetChildren()
local nativeHttp=Http
local fixturePackage=Http:JSONDecode(fixture)
fixturePackage.sourceId="framebridge-handoff-controller-qa"
fixturePackage.roots[1].name="FramebridgeHandoffControllerQA"
local requests,mode,claim={},"valid",0
local paused,closed
local http={}
function http:GenerateGUID() claim+=1;return string.rep(string.format("%x",claim),32) end
function http:JSONEncode(value) return nativeHttp:JSONEncode(value) end
function http:JSONDecode(value) return nativeHttp:JSONDecode(value) end
function http:RequestAsync(options)
    table.insert(requests,{path=options.Url,body=options.Body and nativeHttp:JSONDecode(options.Body),headers=options.Headers})
    if mode=="offline" then error("offline") end
    if mode=="paused" and options.Url:match("/open$") then paused.Event:Wait() end
    local body=options.Url:match("/open$") and {expiresAt=DateTime.now().UnixTimestampMillis+3600000,package=mode=="invalid" and {} or fixturePackage,name="Handoff QA"} or {ok=true}
    return {Success=true,StatusCode=200,Body=nativeHttp:JSONEncode(body)}
end
handoff=Handoff.new("https://native-qa.invalid",http)
relay.token=string.rep("a",64);relay.paired=true;state.paired=true;state.autoImport=true
test("codes load for review despite live automatic import, and retain pairing",function()
    actions.handoffCode("FB-AAAAAA-BBBBBB-CCCCCC-DDDDDD")
    actions.openHandoff()
    assert(state.package.sourceId==fixturePackage.sourceId and state.update==false and state.handoffExpiresAt)
    assert(#starter:GetChildren()==before and handoff.pending.package==state.package)
    assert(relay.token==string.rep("a",64) and state.paired)
    assert(requests[1].body.receiptToken and not requests[1].headers.Authorization)
    handoff:flush();assert(requests[2].body.status=="ready")
end)
test("invalid snapshots retain the reviewed package and report their separate failure",function()
    local previous=state.package;mode="invalid";actions.openHandoff();mode="valid"
    assert(state.package==previous and state.failed and handoff.pending.package==previous)
    handoff:flush();assert(requests[#requests].body.status=="failed")
end)
test("selection utilities never confirm an import",function()
    local beforeRequests=#requests
    actions.tool("fill",{});handoff:flush()
    assert(#requests==beforeRequests and handoff.pending)
end)
test("actual native imports confirm once and keep capabilities out of history",function()
    local originalHistory=History
    History={TryBeginRecording=function() return "mcp-outer-handoff-qa" end,FinishRecording=function() end}
    local ok,message=actions.import();History=originalHistory;assert(ok,message)
    handoff:flush();assert(requests[#requests].body.status=="imported" and not handoff.pending)
    assert(#starter:GetChildren()==before+1)
    assert(not nativeHttp:JSONEncode(recent.entries):find("receiptToken",1,true))
    assert(not nativeHttp:JSONEncode(settings):find(requests[1].body.receiptToken,1,true))
end)
test("reopening creates a fresh claim and local replacement cancels only that claim",function()
    actions.openHandoff();local token=handoff.pending.token
    assert(token~=requests[1].body.receiptToken)
    assert(actions.load(fixture));handoff:flush()
    assert(requests[#requests].body.status=="failed" and not state.handoffExpiresAt and relay.token==string.rep("a",64))
end)
test("busy opening is rejected without a network call",function()
    local count=#requests;state.busy=true;actions.openHandoff();state.busy=false;assert(#requests==count)
end)
test("closing while an open request is in flight reports the accepted attempt as failed",function()
    paused=Instance.new("BindableEvent");mode="paused"
    local finished=false
    task.spawn(function() actions.openHandoff();finished=true end)
    task.wait(0.05);assert(state.busy)
    unloading:Fire();closed=true;task.wait(0.05)
    paused:Fire();task.wait(0.1);mode="valid";paused:Destroy()
    assert(finished and requests[#requests].body.status=="failed" and not handoff.pending)
end)
for _,root in ipairs(starter:GetChildren()) do
    if root:GetAttribute("FramebridgeSource")==fixturePackage.sourceId then root:Destroy() end
end
assert(#starter:GetChildren()==before,"QA cleanup failed")
if not closed then unloading:Fire() end
task.wait(0.2);unloading:Destroy();native:Destroy()
return {passed=passed,failed=#failures,failures=failures,scope="Actual controller/native import; HTTP, settings and recording boundary adapted; blank QA only"}
