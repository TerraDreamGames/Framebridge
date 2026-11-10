-- Run only against the owned loopback QA relay and a code created in the
-- browser preview. The actual controller and importer use real HTTP here;
-- plugin settings and the MCP outer Undo recording remain adapted.
assert(game.PlaceId==0,"Handoff HTTP acceptance requires the blank QA place")
local starter=game:GetService("StarterGui")
local existing={};for _,root in ipairs(starter:GetChildren()) do existing[root]=true end
local code=Http:GetAsync("http://127.0.0.1:4331/handoff-code.txt"):gsub("%s","")
handoff=Handoff.new("http://127.0.0.1:4329",Http)
local claims={}
local ok,why=pcall(function()
    local first
    for index=1,2 do
        actions.handoffCode(code);actions.openHandoff()
        assert(state.package and not state.failed,state.status)
        assert(state.update==false and state.handoffExpiresAt)
        assert(handoff.pending and not relay.token)
        if first then assert(Http:JSONEncode(state.package)==first,"Code snapshot changed between imports")
        else first=Http:JSONEncode(state.package) end
        claims[index]=handoff.pending.token
        handoff:flush();assert(not handoff.error)
        local originalHistory=History
        History={TryBeginRecording=function() return "mcp-handoff-http-qa" end,FinishRecording=function() end}
        local imported,message=actions.import();History=originalHistory
        assert(imported,message);handoff:flush();assert(not handoff.error and not handoff.pending)
    end
    assert(claims[1]~=claims[2],"Repeated opens need independent receipts")
    local imported=0
    for _,root in ipairs(starter:GetChildren()) do
        if not existing[root] then
            imported+=1
            assert(root:IsA("ScreenGui") and root:GetAttribute("FramebridgeSource")==state.package.sourceId)
            assert(#root:GetDescendants()>10,"Expected the complete native design hierarchy")
            for _,object in ipairs(root:GetDescendants()) do
                for _,value in pairs(object:GetAttributes()) do
                    assert(value~=claims[1] and value~=claims[2],"Receipt capability entered the design")
                end
            end
        end
    end
    assert(imported==2,"Repeated opens should allow two native copies")
    actions.openHandoff();assert(handoff.pending)
    assert(actions.load(fixture));handoff:flush();assert(not handoff.pending and not state.handoffExpiresAt)
end)
for _,root in ipairs(starter:GetChildren()) do
    if not existing[root] and root:GetAttribute("FramebridgeSource") then root:Destroy() end
end
unloading:Fire();task.wait(0.2);unloading:Destroy();native:Destroy()
assert(ok,why)
return {passed=3,failed=0,scope="Browser-created code → real HTTP → actual Studio controller/native import; two immutable copies and replacement receipt; temporary objects cleaned up"}
