-- Appended to the actual controller with an in-memory plugin settings adapter.
-- Invokes the real importer only for a uniquely identified temporary QA screen; cleans it up.
local passed, failures = 0, {}
local function test(name, body)
	local ok, why = pcall(body)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local originalCount = #game:GetService("StarterGui"):GetChildren()
local first, title
test("controller defaults to review and loads parent-relative scale geometry", function()
	assert(state.autoImport == false)
	assert(actions.load(fixture))
	first = state.package.roots[1].children[1]
	title = Editor.find(state.package, "demo:23")
	assert(first.properties.Size.value[2] == 540)
	assert(state.previewPackage.roots[1].children[1].properties.Size.value[1] == 1)
	assert(state.previewPackage.roots[1].children[1].properties.Size.value[2] == 0)
end)
test("global sizing survives reload and leaves exported geometry intact", function()
	actions.geometry("offset")
	assert(settings["FramebridgeEditor:" .. state.package.sourceId].mode == "offset")
	assert(actions.load(fixture))
	assert(state.editor.mode == "offset" and state.previewPackage.roots[1].children[1].properties.Size.value[2] == 540)
	actions.geometry("source")
	assert(state.previewPackage.roots[1].children[1].properties.Size.value[2] == 540)
	actions.resetEdits()
	assert(state.editor.mode == "scale" and not next(state.editor.layers))
end)
test("legacy saved overrides remain recoverable without an inspector", function()
	local config = Editor.change(state.package, state.editor, title.id, "Text", "Legacy edit")
	settings["FramebridgeEditor:" .. state.package.sourceId] = config
	assert(actions.load(fixture))
	assert(Editor.find(state.previewPackage, title.id).properties.Text == "Legacy edit")
	actions.resetEdits()
	assert(Editor.find(state.previewPackage, title.id).properties.Text == "A new adventure awaits.")
	assert(type(actions.tool) == "function" and actions.edit == nil)
end)
test("busy actions are rejected and review preference persists", function()
	state.busy = true
	actions.geometry("offset")
	assert(state.editor.mode == "scale")
	assert(not actions.tool("fill", {}))
	state.busy = false
	actions.autoImport()
	assert(state.autoImport and settings.FramebridgeAutoImport == true)
	assert(type(state.selection.count) == "number")
	assert(#game:GetService("StarterGui"):GetChildren() == originalCount)
end)
test("recent history restores its own sizing for review without importing",function()
    local saved=Editor.restore(state.package,nil);saved.mode="offset"
    assert(recent:record(state.package,{},saved))
    actions.geometry("source")
    actions.restoreImport(1)
    assert(state.editor.mode=="offset" and state.update==false and state.package)
    assert(#game:GetService("StarterGui"):GetChildren()==originalCount)
    actions.clearHistory();assert(#state.recent==0)
end)
test("successful native import appears in history and reopen does not repeat the import",function()
    -- The MCP command owns an outer Studio recording. Adapt only this boundary;
    -- the actual controller still stages/applies native instances and saves history.
    local originalHistory = History
    local finished
    History = {TryBeginRecording=function() return "outer-mcp-qa" end,
        FinishRecording=function(_,id,operation) assert(id=="outer-mcp-qa"); finished=operation end}
    local data=Http:JSONDecode(fixture);data.sourceId="framebridge-history-controller-qa";data.name="History QA";data.roots[1].name="FramebridgeHistoryControllerQA"
    assert(actions.load(Http:JSONEncode(data)))
    state.update=false
    local ok,message=actions.import()
    History=originalHistory
    assert(ok,message)
    assert(finished==Enum.FinishRecordingOperation.Commit)
    assert(#state.recent==1 and state.recent[1].sourceId==data.sourceId)
    local count=#game:GetService("StarterGui"):GetChildren()
    actions.restoreImport(1)
    assert(#game:GetService("StarterGui"):GetChildren()==count and state.update==false)
    for _,root in ipairs(game:GetService("StarterGui"):GetChildren()) do
        if root:GetAttribute("FramebridgeSource")==data.sourceId then root:Destroy() end
    end
    assert(#game:GetService("StarterGui"):GetChildren()==originalCount)
end)
test("default manual review import reports its actual native result",function()
    local originalHistory,originalAck=History,relay.ack
    local sourceId="framebridge-manual-review-controller-qa"
    local acks={}
    local ok,why=pcall(function()
        receiver:reset();state.autoImport=false;state.update=false
        relay.ack=function(_,revision,status,message) table.insert(acks,{revision=revision,status=status,message=message}) end
        History={TryBeginRecording=function() return "outer-mcp-manual-review-qa" end,
            FinishRecording=function(_,id,operation) assert(id=="outer-mcp-manual-review-qa" and operation==Enum.FinishRecordingOperation.Commit) end}
        local data=Http:JSONDecode(fixture);data.sourceId=sourceId;data.roots[1].name="FramebridgeManualReviewQA"
        receiver:receive(101,data);receiver:tick()
        assert(#acks==1 and acks[1].status=="ready" and receiver.reviewed)
        assert(#game:GetService("StarterGui"):GetChildren()==originalCount,"Review imported before the user confirmed")
        local imported,message=actions.import();assert(imported,message)
        receiver:tick();receiver:tick()
        assert(#acks==2 and acks[2].revision==101 and acks[2].status=="imported" and not receiver.reviewed)
        local root=game:GetService("StarterGui"):FindFirstChild("FramebridgeManualReviewQA")
        assert(root and root:GetAttribute("FramebridgeSource")==sourceId and #root:GetDescendants()>10)
    end)
    History=originalHistory;relay.ack=originalAck;receiver:reset()
    for _,root in ipairs(game:GetService("StarterGui"):GetChildren()) do
        if root:GetAttribute("FramebridgeSource")==sourceId then root:Destroy() end
    end
    assert(ok,why)
end)
test("failed native manual import retains review for a successful explicit retry",function()
    local originalHistory,originalAck=History,relay.ack
    local sourceId="framebridge-manual-retry-controller-qa"
    local acks={}
    local ok,why=pcall(function()
        receiver:reset();state.autoImport=false;state.update=false
        relay.ack=function(_,revision,status,message) table.insert(acks,{revision=revision,status=status,message=message}) end
        History={TryBeginRecording=function() return nil end}
        local data=Http:JSONDecode(fixture);data.sourceId=sourceId;data.roots[1].name="FramebridgeManualRetryQA"
        receiver:receive(102,data)
        local imported=actions.import();assert(not imported and receiver.reviewed)
        assert(#acks==2 and acks[2].status=="failed" and #game:GetService("StarterGui"):GetChildren()==originalCount)
        state.autoImport=true;receiver:tick();receiver:tick()
        assert(#acks==2 and #game:GetService("StarterGui"):GetChildren()==originalCount,"A failed review was retried automatically")
        History={TryBeginRecording=function() return "outer-mcp-manual-retry-qa" end,
            FinishRecording=function(_,id,operation) assert(id=="outer-mcp-manual-retry-qa" and operation==Enum.FinishRecordingOperation.Commit) end}
        local retried,message=actions.import();assert(retried,message)
        assert(#acks==3 and acks[3].revision==102 and acks[3].status=="imported" and not receiver.reviewed)
        assert(game:GetService("StarterGui"):FindFirstChild("FramebridgeManualRetryQA"))
    end)
    History=originalHistory;relay.ack=originalAck;receiver:reset();state.autoImport=false
    for _,root in ipairs(game:GetService("StarterGui"):GetChildren()) do
        if root:GetAttribute("FramebridgeSource")==sourceId then root:Destroy() end
    end
    assert(ok,why)
end)
-- Exercises the actual controller's unload handler and pending poll-loop cleanup.
unloading:Fire()
task.wait(1.1)
unloading:Destroy()
native:Destroy()
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Real controller/native import; settings and recording boundary adapted for MCP; temporary QA objects cleaned up",
}
