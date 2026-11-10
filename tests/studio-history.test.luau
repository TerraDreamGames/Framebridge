local passed, failures = 0, {}
local function test(name, run)
    local ok, why = pcall(run)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function setup(initial)
    local store = {value=initial, clock=100, writes=0}
    local function open()
        return ImportHistory.new({
            load=function() if store.failRead then error("offline") end return store.value end,
            save=function(value) store.writes+=1; if store.failWrite then error("offline") end store.value=decodeJson(encodeJson(value)) end,
            encode=encodeJson,decode=decodePackage,editor=Editor.restore,now=function() store.clock+=1; return store.clock end,
        })
    end
    return open(),store,open
end
local function package()
    local p=decodePackage(fixture)
    p.name="History example"
    return p
end
test("saved authored geometry and editor configuration survive reopening",function()
    local history,store,open=setup()
    local p=package();p.secret="do-not-store";p.assets={{id="icon",nodeId="icon",name="Icon",filename="icon.png",width=10,height=10,scale=1,reason="Vector",png="do-not-store",key="do-not-store"}}
    table.insert(p.roots[1].children,{id="history-image",name="History icon",className="ImageLabel",assetRef="icon",properties={Image=""},children={}})
    local config=Editor.restore(p,nil);config.mode="offset"
    assert(history:record(p,{icon="rbxassetid://987"},config))
    local fresh=open();assert(#fresh.entries==1 and fresh.entries[1].mode=="offset" and not fresh.error)
    local restored=decodePackage(fresh.entries[1].raw)
    assert(restored.assets[1].robloxId=="rbxassetid://987")
    assert(restored.roots[1].children[#restored.roots[1].children].properties.Image=="rbxassetid://987")
    if Importer then
        local stage=Importer.stage(restored,{},false)
        assert(stage.byId["history-image"].instance.Image=="rbxassetid://987")
        Importer.destroy(stage)
    end
    assert(restored.roots[1].children[1].properties.Size.value[2]==p.roots[1].children[1].properties.Size.value[2])
    assert(not string.find(encodeJson(store.value),"do%-not%-store"))
end)
test("cleared image assignments cannot reappear from the original package",function()
    local p=package();p.assets={{id="icon",name="Icon",robloxId="987"}}
    local copy=ImportHistory.snapshot(p,{icon=""})
    assert(copy.assets[1].robloxId==nil)
end)
test("same export refreshes one entry; different revisions remain distinct",function()
    local history=setup();local p=package();local config=Editor.restore(p,nil)
    history:record(p,{},config);config.mode="source";history:record(p,{},config)
    assert(#history.entries==1 and history.entries[1].mode=="source")
    p.createdAt="second";history:record(p,{},config)
    assert(#history.entries==2 and history.entries[1].createdAt=="second")
end)
test("history evicts oldest entries and honors its byte bound",function()
    local history,store=setup();local p=package()
    for i=1,20 do p.createdAt=tostring(i);history:record(p,{},Editor.restore(p,nil)) end
    assert(#history.entries==ImportHistory.LIMIT and history.entries[1].createdAt=="20" and history.entries[12].createdAt=="9")
    assert(#encodeJson(store.value)<ImportHistory.BYTES)
end)
test("oversized designs still import but skip history with an explanation",function()
    local history,store=setup();local p=package();p.name=string.rep("x",ImportHistory.ITEM_BYTES+1)
    local ok,message=history:record(p,{},Editor.restore(p,nil))
    assert(not ok and string.find(message,"too large") and store.writes==0)
end)
test("unread settings are never overwritten by recording a new import",function()
    local _,store,open=setup({});store.failRead=true
    local history=open();local p=package()
    assert(not history:record(p,{},Editor.restore(p,nil)) and store.writes==0)
    store.failRead=false;assert(history:reload());assert(history:record(p,{},Editor.restore(p,nil)))
end)
test("write failure retains in-session history and a later save recovers",function()
    local history,store,open=setup();local p=package();store.failWrite=true
    assert(not history:record(p,{},Editor.restore(p,nil)) and #history.entries==1 and history.error)
    store.failWrite=false;assert(history:record(p,{},Editor.restore(p,nil)))
    assert(not history.error and #open().entries==1)
    assert(history:clear() and #open().entries==0)
end)
test("invalid persisted records are excluded during restore",function()
    local history=setup({{raw="invalid-json",savedAt=1},{raw=fixture,savedAt="wrong"}})
    assert(#history.entries==0 and not history.error)
end)
return {passed=passed,failed=#failures,failures=failures,scope="Local history state and persisted package readback"}
