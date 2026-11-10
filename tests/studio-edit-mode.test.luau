-- Execute the complete production plugin with service/module doubles. These
-- checks cover integration and delivery orchestration, not native engine/UI.
local fs, roblox = require("@lune/fs"), require("@lune/roblox")
local function module(path)
    return assert(loadstring(fs.readFile("plugins/studio/src/" .. path .. ".luau")))()
end
local EditMode, Receiver, ConnectionStorage = module("EditMode"), module("Receiver"), module("ConnectionStorage")
local PlayConnection=module("PlayConnection")
local commandChunk = assert(loadstring(fs.readFile("plugins/studio/src/CommandTools.luau")))
setfenv(commandChunk, setmetatable({Vector2=roblox.Vector2}, {__index=getfenv()}))
local Commands = commandChunk()
local source = fs.readFile("plugins/studio/src/Plugin.server.luau")
local passed, failures = 0, {}
local function check(name, fn)
    local ok, why = pcall(fn)
    if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(why)) end
end
local function signal()
    return {Connect=function(_, fn) return {Disconnect=function() end, callback=fn} end}
end
local function host(context, options)
    options = options or {}
    local h = {
        context=context, tasks={}, settingsReads=0, settingsWrites=0, requires=0,
        widgets=0, toolbarCount=0, restoreCalls=0, applyCalls=0, historyCalls=0,
        toolsCalls=0, worldCalls=0, classCalls=0, selectionWrites=0, acks={},
    }
    local runService = {
        IsEdit=function() return context.edit end,
        IsRunning=function() return context.running end,
    }
    local testService = setmetatable({}, {__index=function(_, key)
        assert(key=="EditModeActive")
        if options.unreadable then error("State unavailable") end
        return context.active
    end})
    local selection = {
        SelectionChanged=signal(), Get=function() return {} end,
        Set=function() h.selectionWrites+=1 end,
    }
    local history = {
        TryBeginRecording=function() h.historyCalls+=1; return "synthetic-recording" end,
        FinishRecording=function() h.historyCalls+=1 end,
    }
    local services = {
        RunService=runService, StudioService={}, ChangeHistoryService=history,
        Selection=selection, StarterGui={GetChildren=function() return {} end},
        HttpService={JSONEncode=function(_, value) return value end},
        UserInputService={InputEnded=signal()},
    }
    local gameDouble = {PlaceId=1234, GetPropertyChangedSignal=function(_, name)
        assert(name=="PlaceId")
        return {Connect=function(_, fn) h.placeChanged=fn;return {Disconnect=function() end} end}
    end, GetService=function(_, name)
        if name=="StudioTestService" then
            if options.missing then error("Unsupported service") end
            return testService
        end
        return assert(services[name], name)
    end}
    local relay = {
        scopeVersion=0, scopeResetVersion=0, revision=0,
        ack=function(_, revision, status, message)
            table.insert(h.acks, {revision=revision,status=status,message=message})
        end,
        restore=function() h.restoreCalls+=1 end,
        syncScope=function(self)
            local change=h.scopeChange;h.scopeChange=nil
            if change then
                self.scopeVersion+=1
                if change=="changed" then self.scopeResetVersion=self.scopeVersion end
            end
            return change or false
        end,
    }
    local stateDescriptions = {describe=function() return {} end}
    local modules = {
        Brand={Image="rbxassetid://96241964720742"},
        PlayConnection=PlayConnection,
        PlayConnectionView={mount=function()
            -- Only the connection-specific view is permitted in Test contexts.
            h.widgets+=1;h.toolbarCount+=1;h.playViewMounted=true
        end},
        EditMode=EditMode,
        ImportHistory={new=function() return {entries={},record=function() return true end} end},
        AssetGallery={}, BehaviorSource={},
        Cleanup={review=function() return {roots=0,attributes=0,scripts=0,bytes=0,skipped={}} end,
            run=function() return {attributes=0,scripts={},skipped={}} end},
        Importer={
            scriptFeatures=function() return {total=0,interactions=0,visuals=0,worlds=0} end,
            decode=function(raw) return raw end,
            stage=function(_,_,_,_,options) h.scriptOptions=options;return {} end,
            apply=function() h.applyCalls+=1; return {},{created=1,updated=0,removed=0} end,
            destroy=function() error("Unexpected staging failure") end,
        },
        MaskLayout={watch=function() return {destroy=function() end} end},
        TextDecoration={watch=function() return {destroy=function() end} end},
        Relay={new=function() return relay end},
        ConnectionStorage=ConnectionStorage,
        Handoff={new=function() return {cancel=function() end,complete=function() end} end},
        Editor={restore=function() return {} end,prepare=function(pkg) return pkg,{} end},
        SelectionTools={describe=stateDescriptions.describe,run=function()
            h.toolsCalls+=1; return {count=1,skipped={}}
        end},
        WorldTools={describe=stateDescriptions.describe,run=function()
            h.worldCalls+=1; return {root={}}
        end},
        ClassTools={describe=stateDescriptions.describe,review=function() return {} end,run=function()
            h.classCalls+=1; return {selection={},count=1,losses={}}
        end},
        Receiver={new=function(callbacks)
            h.receiverCallbacks=callbacks; h.receiver=Receiver.new(callbacks); return h.receiver
        end},
        View={mount=function(_, _, actions)
            h.actions=actions
            return {
                render=function(state) h.state=state end,
                status=function() end, destroy=function() end,
            }
        end},
        CommandPalette={mount=function(_, deps)
            h.commandDeps=deps; return {open=function() end,destroy=function() end}
        end},
    }
    local plugin = {
        Unloading=signal(),
        GetSetting=function(_, key)
            h.settingsReads+=1
            if key=="FramebridgeAutoImport" then return options.autoImport~=false end
            return nil
        end,
        SetSetting=function() h.settingsWrites+=1 end,
        CreateToolbar=function()
            h.toolbarCount+=1
            return {CreateButton=function()
                return {Click=signal(),SetActive=function() end}
            end}
        end,
        CreateDockWidgetPluginGuiAsync=function()
            h.widgets+=1
            return {
                GetPropertyChangedSignal=function() return signal() end,
                BindToClose=function() end,
            }
        end,
    }
    local env = setmetatable({
        game=gameDouble, plugin=plugin, script=setmetatable({}, {__index=function(_, key) return key end}),
        require=function(name) h.requires+=1; return assert(modules[name], name) end,
        task={spawn=function(fn) table.insert(h.tasks,fn) end,wait=function() coroutine.yield() end},
        Enum=roblox.Enum, DockWidgetPluginGuiInfo={new=function() return {} end},
    }, {__index=getfenv()})
    local run = assert(loadstring(source))
    setfenv(run, env); run()
    h.relay=relay
    function h.package()
        return {sourceId="synthetic-edit-mode-source",createdAt="fixed",assets={}}
    end
    function h.load()
        assert(h.actions.load(h.package(),false))
    end
    function h.mutations()
        return h.applyCalls+h.toolsCalls+h.worldCalls+h.classCalls+h.historyCalls+h.selectionWrites
    end
    function h.restore()
        -- The final startup task is the production saved-connection restore.
        assert(#h.tasks==4); h.tasks[4]()
    end
    return h
end
check("normal idle Edit starts one receiver and can restore its connection", function()
    local h=host({edit=true,running=false,active=true})
    assert(h.requires>0 and h.widgets==1 and h.toolbarCount==1 and h.receiver)
    assert(not h.receiverCallbacks.running() and not h.commandDeps.running())
    h.restore(); assert(h.restoreCalls==1)
end)
for _, context in ipairs({
    {name="Client",edit=false,running=true,active=false},
    {name="Server",edit=false,running=true,active=false},
    {name="paused runtime",edit=false,running=false,active=false},
}) do
    check(context.name .. " loads only the Play connection view, without receiver capabilities", function()
        local h=host(context)
        assert(h.requires==2 and h.settingsReads==0 and h.settingsWrites==0)
        assert(h.playViewMounted and h.widgets==1 and h.toolbarCount==1 and #h.tasks==0 and h.restoreCalls==0)
        assert(not h.actions and not h.receiver)
        assert(h.mutations()==0)
    end)
end
check("retained Edit remains the receiver during a separate test", function()
    local h=host({edit=true,running=false,active=false})
    h.restore()
    assert(h.restoreCalls==1 and h.receiverCallbacks.running() and h.commandDeps.running())
end)
local function blockedActions(context, options)
    local h=host(context,options); h.load()
    assert(not h.actions.tool("fill",{}))
    assert(not h.actions.worldTool("screen",{}))
    assert(not h.actions.convertClass())
    assert(not h.actions.cleanup())
    assert(not h.actions.import())
    assert(h.mutations()==0 and not h.state.busy and h.state.failed)
    assert(h.receiverCallbacks.running() and h.commandDeps.running())
    local ok, why=pcall(Commands.run,"create:ScreenGui",h.commandDeps,{selection={}})
    assert(not ok and tostring(why):find("Stop the play test",1,true))
    assert(h.mutations()==0)
end
check("all production mutation callbacks reject Play in retained stopped Edit", function()
    blockedActions({edit=true,running=false,active=false})
end)
check("all production mutation callbacks reject a paused runtime", function()
    local context={edit=true,running=false,active=true}
    local h=host(context); h.load()
    context.edit=false;context.active=false
    assert(not h.actions.tool("fill",{}) and not h.actions.worldTool("screen",{}))
    assert(not h.actions.convertClass() and not h.actions.import())
    assert(h.mutations()==0 and h.commandDeps.running() and h.receiverCallbacks.running())
end)
check("idle Edit still permits each authored-place operation", function()
    local h=host({edit=true,running=false,active=true});h.load()
    assert(h.actions.tool("fill",{}) and h.toolsCalls==1)
    assert(h.actions.worldTool("screen",{}) and h.worldCalls==1)
    assert(h.actions.convertClass() and h.classCalls==1)
    assert(h.actions.import() and h.applyCalls==1 and h.historyCalls==2)
    assert(not h.state.busy and not h.state.failed)
end)
check("generated scripts require explicit per-design consent in the production controller", function()
    local h=host({edit=true,running=false,active=true});h.load()
    assert(h.state.addScripts==false)
    assert(h.actions.import() and h.scriptOptions.scripts==false)
    h.actions.addScripts()
    assert(h.state.addScripts==true)
    assert(h.actions.import() and h.scriptOptions.scripts==true)
    h.actions.addScripts()
    assert(h.actions.import() and h.scriptOptions.scripts==false)
    h.load()
    assert(h.state.addScripts==false, "Unconfigured designs must not inherit script consent")
end)
check("production receiver queues in retained Edit and imports once after Stop", function()
    local context={edit=true,running=false,active=false};local h=host(context)
    h.receiver:receive(1,h.package());h.receiver:tick();h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==1 and h.acks[1].status=="queued")
    assert(h.receiver.pending and h.state.status:find("stop the play test",1,true))
    context.active=true;h.receiver:tick();h.receiver:tick()
    assert(h.applyCalls==1 and #h.acks==2 and h.acks[2].status=="imported")
    assert(not h.receiver.pending and not h.receiver.reviewed and not h.state.busy)
end)
check("first publication preserves the pending same-place delivery", function()
    local h=host({edit=true,running=false,active=false})
    h.receiver:receive(1,h.package());local pending=h.receiver.pending
    h.relay.token="same-memory-capability";h.relay.paired=true
    h.scopeChange="promoted";h.placeChanged()
    assert(h.receiver.pending==pending and h.state.paired and h.applyCalls==0)
end)
check("a different published place resets old queued and reviewed deliveries", function()
    local h=host({edit=true,running=false,active=false})
    h.receiver:receive(1,h.package());assert(h.receiver.pending)
    h.scopeChange="changed";h.placeChanged()
    assert(not h.receiver.pending and not h.receiver.reviewed and #h.tasks==5)
end)
check("changing place during Connect retries restoration after the old operation finishes", function()
    local h=host({edit=true,running=false,active=true})
    h.relay.connect=function()
        h.scopeChange="changed";h.placeChanged()
        assert(h.state.connecting and #h.tasks==4)
        return "stale-code"
    end
    h.actions.connect()
    assert(not h.state.connecting and #h.tasks==5 and h.state.code==nil)
    h.tasks[5]();assert(h.restoreCalls==1)
end)
check("a scope change consumed before the native signal still resets and restores", function()
    local h=host({edit=true,running=false,active=false})
    h.receiver:receive(1,h.package());h.state.paired=true;h.state.code="old-code"
    h.relay.scopeVersion=1;h.relay.scopeResetVersion=1
    h.placeChanged()
    assert(not h.receiver.pending and not h.receiver.reviewed and not h.state.paired and h.state.code==nil)
    assert(#h.tasks==5);h.tasks[5]();assert(h.restoreCalls==1)
end)
check("stale Disconnect UI cannot clear the next place's saved connection", function()
    local h=host({edit=true,running=false,active=true})
    h.relay.scopeVersion=1;h.relay.scopeResetVersion=1
    h.relay.disconnect=function() error("A stale UI action reached the new connection") end
    h.actions.disconnect();assert(#h.tasks==5 and not h.state.paired)
end)
check("a delivery accepted before a busy wait cannot import after a place change", function()
    local h=host({edit=true,running=false,active=true})
    h.relay.token="old-place-capability"
    h.relay.poll=function()
        h.state.busy=true
        return {paired=true,revision=1,package=h.package()}
    end
    local thread=coroutine.create(h.tasks[1])
    assert(coroutine.resume(thread));assert(coroutine.resume(thread))
    h.scopeChange="changed";h.placeChanged();h.state.busy=false
    assert(coroutine.resume(thread))
    assert(h.applyCalls==0 and not h.receiver.pending and not h.receiver.reviewed and #h.acks==0)
end)
check("a retained Edit queue stays blocked throughout pause and resumes only when idle", function()
    local context={edit=true,running=false,active=false};local h=host(context)
    h.receiver:receive(1,h.package());h.receiver:tick()
    -- In the retained Edit context, local RunService stays stopped in both phases.
    context.running=false;h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==1 and h.acks[1].status=="queued")
    context.active=true;h.receiver:tick();assert(h.applyCalls==1)
end)
check("turning Auto-import off during Play releases the queue for manual review", function()
    local context={edit=true,running=false,active=false};local h=host(context)
    h.receiver:receive(1,h.package());h.actions.autoImport();h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==1 and h.acks[1].status=="queued")
    context.active=true;h.receiver:tick();h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==2 and h.acks[2].status=="ready")
    assert(h.actions.import())
    assert(h.applyCalls==1 and #h.acks==3 and h.acks[3].status=="imported")
end)
check("disconnect starts by cancelling the Play queue before network revocation can yield", function()
    local context={edit=true,running=false,active=false};local h=host(context)
    h.relay.token="synthetic-live-capability";h.relay.paired=true
    h.receiver:receive(1,h.package())
    h.relay.disconnect=function(self) coroutine.yield();self.token=nil;self.paired=false end
    local disconnect=coroutine.create(h.actions.disconnect)
    assert(coroutine.resume(disconnect))
    context.active=true
    h.receiver:tick();h.receiver:tick()
    assert(h.applyCalls==0 and h.mutations()==0 and not h.receiver.pending and not h.receiver.reviewed)
    assert(#h.acks==1 and h.acks[1].status=="queued")
    assert(h.state.connecting and not h.state.paired and h.state.code==nil)
    assert(coroutine.resume(disconnect))
    h.receiver:tick();assert(h.applyCalls==0 and #h.acks==1 and not h.state.connecting)
end)
check("disconnect serializes Connect and repeated Disconnect while revocation is pending", function()
    local h=host({edit=true,running=false,active=true})
    local disconnectCalls,connectCalls=0,0
    h.relay.token="synthetic-live-capability";h.relay.paired=true
    h.relay.disconnect=function(self)
        disconnectCalls+=1;coroutine.yield();self.token=nil;self.paired=false
    end
    h.relay.connect=function() connectCalls+=1;return "new-code" end
    local disconnect=coroutine.create(h.actions.disconnect)
    assert(coroutine.resume(disconnect))
    assert(h.state.connecting,"Disconnect did not lock connection actions before yielding")
    h.actions.connect();h.actions.disconnect()
    assert(disconnectCalls==1 and connectCalls==0 and h.state.connecting)
    assert(coroutine.resume(disconnect))
    assert(not h.state.connecting and not h.state.paired)
end)
check("changing place during Disconnect restores the new scope after revocation finishes", function()
    local h=host({edit=true,running=false,active=true})
    h.relay.token="synthetic-old-place-capability";h.relay.paired=true
    h.relay.disconnect=function()
        h.scopeChange="changed";h.placeChanged()
        assert(h.state.connecting and #h.tasks==4)
    end
    h.actions.disconnect()
    assert(not h.state.connecting and not h.state.disconnecting and #h.tasks==5)
    h.tasks[5]();assert(h.restoreCalls==1)
end)
check("replacing a queued package cancels it and never imports after Stop", function()
    local context={edit=true,running=false,active=false};local h=host(context)
    local queued=h.package();h.receiver:receive(1,queued)
    local replacement=h.package();replacement.sourceId="synthetic-local-replacement"
    assert(h.actions.load(replacement,false))
    context.active=true;h.receiver:tick();h.receiver:tick()
    assert(h.applyCalls==0 and h.mutations()==0 and h.state.package==replacement)
    assert(not h.receiver.pending and not h.receiver.reviewed)
    assert(#h.acks==2 and h.acks[2].revision==1 and h.acks[2].status=="failed")
end)
check("manual review can receive during Play without mutating the place", function()
    local context={edit=true,running=false,active=false};local h=host(context,{autoImport=false})
    h.receiver:receive(1,h.package());h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==1 and h.acks[1].status=="ready")
    assert(not h.actions.import() and h.applyCalls==0 and #h.acks==1)
    context.active=true;assert(h.actions.import())
    assert(h.applyCalls==1 and #h.acks==2 and h.acks[2].status=="imported")
end)
check("command guard is live when Play starts after an idle preview", function()
    local context={edit=true,running=false,active=true};local h=host(context)
    assert(not h.commandDeps.running())
    context.active=false
    local ok, why=pcall(Commands.run,"create:ScreenGui",h.commandDeps,{selection={}})
    assert(not ok and tostring(why):find("Stop the play test",1,true) and h.mutations()==0)
    context.active=true;assert(not h.commandDeps.running())
end)
for _, options in ipairs({{missing=true},{unreadable=true}}) do
    check((options.missing and "missing" or "unreadable") .. " test-session API fails closed", function()
        blockedActions({edit=true,running=false,active=true}, options)
    end)
end
check("an unreadable active session cannot release an existing queued import", function()
    local context={edit=true,running=false,active=false};local options={}
    local h=host(context,options);h.receiver:receive(1,h.package())
    options.unreadable=true;context.active=true;h.receiver:tick()
    assert(h.applyCalls==0 and #h.acks==1 and h.acks[1].status=="queued")
    options.unreadable=false;h.receiver:tick();assert(h.applyCalls==1 and h.acks[2].status=="imported")
end)
check("only a literal true idle flag permits editing", function()
    for _, value in ipairs({false,0,1,"true"}) do
        local canEdit=EditMode.new({IsEdit=function() return true end},function()
            return {EditModeActive=value}
        end)
        assert(not canEdit())
    end
    local canEdit=EditMode.new({IsEdit=function() return true end},function() return {} end)
    assert(not canEdit())
end)
print("Studio Edit-session integration checks: " .. passed .. " passed, " .. #failures .. " failed")
assert(#failures==0, table.concat(failures,"\n"))
