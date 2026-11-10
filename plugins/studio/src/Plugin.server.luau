-- Framebridge Studio companion. Built with native ModuleScripts through Rojo.
local RunService = game:GetService("RunService")
local PlayConnection = require(script.PlayConnection)
-- Play creates separate plugin instances; only the original Edit instance may
-- restore the receiver capability or change the authored place.
if not RunService:IsEdit() then
    require(script.PlayConnectionView).mount(plugin, PlayConnection)
    return
end
local EditMode = require(script.EditMode)
local canEdit = EditMode.new(RunService, function()
    return game:GetService("StudioTestService")
end)
local ImportHistory = require(script.ImportHistory)
local AssetGallery = require(script.AssetGallery)
local Importer = require(script.Importer)
local Cleanup = require(script.Cleanup)
local BehaviorSource = require(script.BehaviorSource)
local MaskLayout = require(script.MaskLayout)
local TextDecoration = require(script.TextDecoration)
local Relay = require(script.Relay)
local ConnectionStorage = require(script.ConnectionStorage)
local Handoff = require(script.Handoff)
local View = require(script.View)
local Receiver = require(script.Receiver)
local Editor = require(script.Editor)
local SelectionTools = require(script.SelectionTools)
local ClassTools = require(script.ClassTools)
local WorldTools = require(script.WorldTools)
local CommandPalette = require(script.CommandPalette)
local Http = game:GetService("HttpService")
local StudioService = game:GetService("StudioService")
local History = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local maskLayoutWatcher = MaskLayout.watch(game:GetService("StarterGui"), RunService)
local textDecorationWatcher = TextDecoration.watch(game:GetService("StarterGui"), RunService)
local relayUrl = "__FRAMEBRIDGE_RELAY_URL__"
-- Resolve the place dynamically: cloud loading/publishing can assign its ID later.
local connectionStorage = ConnectionStorage.new(plugin, relayUrl, function() return game.PlaceId end)
local relay = Relay.new(relayUrl, Http, connectionStorage)
local handoff = Handoff.new(relayUrl,Http)
local privateBeta = "__FRAMEBRIDGE_PRIVATE_BETA__" == "true"
local unloaded = false
local receiver
local restoreConnection
local reconcileConnectionScope
local autoImport = plugin:GetSetting("FramebridgeAutoImport") == true
local recent = ImportHistory.new({
    load = function() return plugin:GetSetting("FramebridgeRecentImportsV1") end,
    save = function(entries) plugin:SetSetting("FramebridgeRecentImportsV1", entries) end,
    encode = function(value) return Http:JSONEncode(value) end,
    decode = Importer.decode,
    editor = Editor.restore,
    now = function() return DateTime.now().UnixTimestampMillis end,
})
local state = {
    privateBeta = privateBeta,
    betaAccess = "",
    handoffCode = "",
    recent = recent.entries, historyError = recent.error, gallery = {},
	package = nil,
	bindings = {},
	update = false,
	placeholders = false,
    addScripts = false,
    cleanupMode = "unused",
    cleanup = Cleanup.review(Selection:Get(), "unused"),
	busy = false,
	connecting = false,
	disconnecting = false,
	paired = false,
	autoImport = autoImport,
	transfer = false,
	paste = "",
	status = "Connect Figma or open a package to import UI.",
	selection = SelectionTools.describe(Selection:Get()),
    worldSelection = WorldTools.describe(Selection:Get()),
    classTarget = ClassTools.describe(Selection:Get()).preferred,
	failed = false,
}
state.classSelection = ClassTools.describe(Selection:Get())
state.classPreview = ClassTools.review(Selection:Get(),state.classTarget)
local classTargetChosen = false
local toolbar = plugin:CreateToolbar("Framebridge")
local launch = toolbar:CreateButton("Framebridge", "Bring your Figma UI into Studio", require(script.Brand).Image, "Framebridge")
launch.ClickableWhenViewportHidden = true
local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 440, 640, 360, 480)
local widget = plugin:CreateDockWidgetPluginGuiAsync("Framebridge_v1", info)
widget.Title = "Framebridge · Figma to Roblox"
widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
local view, commandPalette, playConnection
local function tell(message, failed)
	state.status = message
	state.failed = failed or false
	if view then
		view.status()
	end
    if playConnection then playConnection.publish() end
end
local function missing()
	local count = 0
	if state.package then
		for _, asset in ipairs(state.package.assets) do
			if not (Importer.assetId(state.bindings[asset.id]) or Importer.assetId(asset.robloxId)) then
				count += 1
			end
		end
	end
	return count
end
local function load(raw, received, restored)
	if state.busy then
		return
	end
	local ok, result = pcall(Importer.decode, raw)
	if not ok then
		tell(tostring(result), true)
		return false, tostring(result)
	end
	if receiver and not received then
		receiver:cancel("The received design was replaced by a local package.")
	end
    handoff:cancel("The design was replaced by another package.")
    state.handoffExpiresAt=nil;state.handoffReceiptError=nil
    state.dragImage = nil; state.dropTarget = nil
	state.package = result
    state.addScripts = plugin:GetSetting("FramebridgeAddScripts:" .. result.sourceId) == true
	state.placeholders = false
	state.transfer = false
	local stored = not restored and plugin:GetSetting("FramebridgeAssets:" .. result.sourceId) or nil
	state.bindings = type(stored) == "table" and stored or {}
	local savedRevision = not restored and plugin:GetSetting("FramebridgeAssetRevision:" .. result.sourceId) or nil
	local sameExport = type(result.createdAt) == "string" and savedRevision == result.createdAt
	for _, asset in ipairs(result.assets) do
		local saved = state.bindings[asset.id]
		if Importer.assetId(asset.robloxId) and not sameExport then
			state.bindings[asset.id] = asset.robloxId
		elseif saved == "" then
			asset.robloxId = nil
		elseif not Importer.assetId(saved) then
			state.bindings[asset.id] = asset.robloxId
		end
	end
	state.editor = Editor.restore(result, plugin:GetSetting("FramebridgeEditor:" .. result.sourceId))
	state.previewPackage, state.editorNotices = Editor.prepare(result, state.editor)
    state.scriptFeatures = Importer.scriptFeatures(state.previewPackage)
	tell("Ready to import. Continue editing in Roblox Explorer and Properties.")
	view.render(state)
	return true
end
local actions = { load = load, missing = missing }
function actions.openCommands() if commandPalette then commandPalette.open() end end
function actions.handoffCode(value)
    if state.busy then return end
    state.handoffCode=tostring(value):sub(1,80)
end
function actions.openHandoff()
    if state.busy or state.connecting then return end
    state.busy=true;state.handoffLoading=true
    view.render(state);tell("Opening the private design snapshot…")
    local ok,data=pcall(function() return handoff:open(state.handoffCode,state.betaAccess) end)
    if unloaded then
        if ok then
            handoff:reject(data,"Studio plugin closed before this code could be reviewed.")
            task.spawn(function() handoff:flush() end)
        end
        return
    end
    state.busy=false;state.handoffLoading=false
    if ok then
        local accepted,message=load(Http:JSONEncode(data.package),false)
        if accepted then
            handoff:accept(data,state.package);state.handoffExpiresAt=data.expiresAt;state.update=false
            widget.Enabled=true;tell("Design code opened · review and click Import. Automatic live import does not apply to codes.")
        else handoff:reject(data,message) end
    else tell(tostring(data),true) end
    view.render(state)
end
function actions.restoreImport(index)
    if state.busy then return end
    local entry = recent.entries[index]
    if not entry then return end
    local ok = load(entry.raw, false, true)
    if ok then
        state.editor = Editor.restore(state.package, entry.editor or {mode=entry.mode})
        state.previewPackage, state.editorNotices = Editor.prepare(state.package, state.editor)
        state.update = false
        tell("Recent import reopened for review. Choose New copy or Update existing before importing.")
        view.render(state)
    end
end
function actions.clearHistory()
    if state.busy then return end
    recent:clear(); state.recent = recent.entries; state.historyError = recent.error
    view.render(state)
end
function actions.retryHistory()
    recent:reload(); state.recent = recent.entries; state.historyError = recent.error
    view.render(state)
end
function actions.scanAssets()
    if state.busy then return end
    local images, limited = AssetGallery.scan({game:GetService("ServerStorage"), game:GetService("ReplicatedStorage"), game:GetService("Workspace")}, Importer.assetId)
    state.gallery = images
    if state.package then
        local matches, ambiguous = AssetGallery.matches(state.package, images, state.bindings, Importer.assetId)
        for _, match in ipairs(matches) do actions.bind(match.asset, match.image, state.package.sourceId) end
        tell(string.format("%d images found; %d empty links matched. %d ambiguous links need a manual choice.%s", #images, #matches, ambiguous, limited and " Scan limit reached; insert artwork into a smaller Loaded folder." or ""))
    else tell(string.format("%d images found. Open a package to assign them.", #images)) end
    view.render(state)
end
function actions.galleryTarget(id)
    if state.busy then return end
    state.galleryTarget = id; view.render(state)
end
function actions.assignGallery(id, target)
    if state.busy or not state.package then return end
    for _, entry in ipairs(state.gallery) do
        if entry.id == id then
            actions.bind(target or state.galleryTarget, id, state.package.sourceId)
            return
        end
    end
end
function actions.finishGalleryDrag()
    local image, target = state.dragImage, state.dropTarget
    state.dragImage = nil; state.dropTarget = nil
    if image and target then actions.assignGallery(image,target) end
end
function actions.dragGallery(id)
    if not state.busy then state.dragImage = id end
end
function actions.dropGallery(id)
    if not state.busy then state.dropTarget = id end
end
function actions.showUses(asset)
    if not state.package then return end
    local uses = AssetGallery.uses(state.package, {[asset] = true}, game:GetService("StarterGui"):GetChildren())
    if #uses > 0 then Selection:Set(uses); tell(string.format("Selected %d imported uses in Explorer.", #uses))
    else tell("No imported use is present in this place yet.") end
end
function actions.open()
	if state.busy then
		return
	end
	local ok, raw = pcall(function()
		local file = StudioService:PromptImportFileAsync({ "json" })
		return file and file:GetBinaryContents()
	end)
	if ok and raw then
		load(raw)
	elseif not ok then
		state.transfer = true
		view.render(state)
		tell("Could not open the file picker. Paste the package in the Import tab.", true)
	end
end
function actions.autoImport()
	if state.busy then
		return
	end
	state.autoImport = not state.autoImport
	plugin:SetSetting("FramebridgeAutoImport", state.autoImport)
	view.render(state)
end
function actions.disconnect()
	if state.connecting or state.busy then
		return
	end
	if reconcileConnectionScope and reconcileConnectionScope() then return end
	local connectionVersion=relay.scopeVersion
	state.connecting = true
	state.disconnecting = true
	state.paired = false
	state.code = nil
	receiver:reset()
	tell("Disconnecting from Figma…")
	view.render(state)
	local ok, err = pcall(function()
		relay:disconnect()
	end)
	if unloaded then return end
	state.connecting = false
	state.disconnecting = false
	if connectionVersion~=relay.scopeVersion then
        if not reconcileConnectionScope() then task.spawn(restoreConnection) end
        return
    end
	receiver:reset()
	state.expiresAt = relay.expiresAt
	state.connectionStorageError = relay.storageError
	state.connectionMemoryOnly = relay.storagePersistent == false and not relay.storageError
	view.render(state)
	tell(ok and "Disconnected from Figma." or tostring(err), not ok)
end
function actions.showTransfer()
	state.transfer = true
	view.render(state)
end
function actions.showConnection()
	if state.busy or state.connecting then return end
	state.connectionOpen = (state.connectionOpen or 0) + 1
	view.render(state)
	view.selectTab("Import")
end
function actions.mode(value)
	if state.busy then
		return
	end
	state.update = value
	view.render(state)
end
function actions.placeholders()
	if state.busy then
		return
	end
	state.placeholders = not state.placeholders
	view.render(state)
end
function actions.addScripts()
    if state.busy or not state.package then return end
    state.addScripts = not state.addScripts
    local saved = pcall(function() plugin:SetSetting("FramebridgeAddScripts:" .. state.package.sourceId, state.addScripts) end)
    tell(state.addScripts and "Generated scripts enabled for this design. Import to apply."
        or "Generated scripts disabled for this design. Import to apply.", not saved)
    view.render(state)
end
function actions.cleanupMode(mode)
    if state.busy or (mode ~= "unused" and mode ~= "detach") then return end
    state.cleanupMode = mode
    state.cleanup = Cleanup.review(Selection:Get(), mode)
    view.render(state)
end
function actions.cleanup()
    if state.busy then return false end
    if not canEdit() then tell("Stop the play test before cleaning UI.", true);return false end
    state.busy = true
    view.render(state)
    local ok,result = pcall(Cleanup.run, Selection:Get(), state.cleanupMode, History)
    state.busy = false
    state.cleanup = Cleanup.review(Selection:Get(), state.cleanupMode)
    if ok then
        local message = string.format("Removed %d attributes and %d generated scripts. Undo with Ctrl/Cmd+Z.", result.attributes, #result.scripts)
        if #result.skipped > 0 then message ..= " Skipped: " .. result.skipped[1] end
        tell(message, false)
    else tell(tostring(result), true) end
    view.render(state)
    return ok
end
function actions.draft(value)
	state.paste = value
end
local function commitEditor(config)
	local ok, package, notices = pcall(Editor.prepare, state.package, config)
	if not ok then
		tell(tostring(package), true)
		return false
	end
	state.editor = config
	state.previewPackage = package
    state.scriptFeatures = Importer.scriptFeatures(package)
	state.editorNotices = notices
	local saved = pcall(function()
		plugin:SetSetting("FramebridgeEditor:" .. state.package.sourceId, config)
	end)
	tell(saved and "Import sizing saved." or "Sizing works for this session, but Studio could not save it.", not saved)
	view.render(state)
	return true
end
function actions.geometry(mode)
	if state.busy or not state.package then
		return
	end
	if mode ~= "scale" and mode ~= "offset" and mode ~= "source" then
		return
	end
	local config = Editor.restore(state.package, state.editor)
	config.mode = mode
	commitEditor(config)
end
function actions.resetEdits()
	if state.busy or not state.package then
		return
	end
	commitEditor(Editor.restore(state.package, nil))
end
function actions.tool(operation, options)
	if state.busy then
		return false
	end
	if not canEdit() then
		tell("Stop the play test before preparing UI.", true)
		return false
	end
	state.busy = true
	view.render(state)
	local ok, result = pcall(SelectionTools.run, Selection:Get(), operation, options, History)
	state.busy = false
	state.selection = SelectionTools.describe(Selection:Get())
	if ok then
		local message = result.count > 0
				and string.format(
					"Updated %d UI %s. Undo with Ctrl/Cmd+Z.",
					result.count,
					result.count == 1 and "element" or "elements"
				)
			or "No changes were needed."
		if #result.skipped > 0 then
			message ..= string.format(" %d skipped: %s", #result.skipped, result.skipped[1])
		end
		tell(message, result.count == 0 and #result.skipped > 0)
	else
		tell(tostring(result), true)
	end
	return ok
end
function actions.worldTool(operation, options)
    if state.busy then return false end
    if not canEdit() then tell("Stop the play test before changing world UI.",true);return false end
    state.busy=true;view.render(state)
    local ok,result=pcall(WorldTools.run,Selection:Get(),operation,options,History,BehaviorSource)
    state.busy=false
    if ok then
        Selection:Set({result.root})
        tell(result.replaced and "Converted UI. Children and scripts were preserved; references to the old root need updating. Undo with Ctrl/Cmd+Z." or "Bound world UI to the selected target. Undo with Ctrl/Cmd+Z.")
    else tell(tostring(result),true) end
    state.worldSelection=WorldTools.describe(Selection:Get());view.render(state)
    return ok
end
function actions.classTarget(target)
    if state.busy or not table.find(ClassTools.classes,target) then return false end
    classTargetChosen=true
    state.classTarget=target
    state.classPreview=ClassTools.review(Selection:Get(),target)
    view.render(state)
    return true
end
function actions.convertClass()
    if state.busy then return false end
    if not canEdit() then tell("Stop the play test before converting UI.",true);return false end
    state.busy=true;view.render(state)
    local ok,result=pcall(ClassTools.run,Selection:Get(),state.classTarget,History)
    state.busy=false
    if ok then
        Selection:Set(result.selection)
        local message=result.count>0 and string.format("Converted %d UI %s. Children and scripts retained; update references to replaced instances. Undo with Ctrl/Cmd+Z.",result.count,result.count==1 and "instance" or "instances") or "The selection already uses this class."
        if #result.losses>0 then message ..= " Discarded class-specific properties: "..result.losses[1] end
        tell(message)
    else tell(tostring(result),true) end
    state.selection=SelectionTools.describe(Selection:Get())
    state.worldSelection=WorldTools.describe(Selection:Get())
    state.classSelection=ClassTools.describe(Selection:Get())
    state.classPreview=ClassTools.review(Selection:Get(),state.classTarget)
    view.render(state)
    return ok
end
function actions.resolved(issue)
	if issue.code == "asset-required" then
		for _, asset in ipairs(state.package.assets) do
			if
				asset.nodeId == issue.nodeId
				and (Importer.assetId(state.bindings[asset.id]) or Importer.assetId(asset.robloxId))
			then
				return true
			end
		end
	end
	return false
end
function actions.bind(assetId, value, sourceId)
	if not state.package or not assetId then return end
	local known = false
	for _, asset in ipairs(state.package.assets) do if asset.id == assetId then known = true end end
	if not known then return end
	if state.busy or not state.package or (sourceId and sourceId ~= state.package.sourceId) then
		return
	end
	local id = Importer.assetId(value)
	-- Clearing a packaged ID must clear the preview and readiness as well.
	for _, asset in ipairs(state.package.assets) do
		if asset.id == assetId then
			asset.robloxId = nil
		end
	end
	state.bindings[assetId] = id or value
	state.previewPackage, state.editorNotices = Editor.prepare(state.package, state.editor)
	if value ~= "" and not id then
		tell("Enter a numeric Roblox image ID or rbxassetid:// ID.", true)
	else
		local saved = {}
		for key, binding in pairs(state.bindings) do
			if binding == "" then
				saved[key] = ""
			elseif Importer.assetId(binding) then
				saved[key] = Importer.assetId(binding)
			end
		end
		plugin:SetSetting("FramebridgeAssets:" .. state.package.sourceId, saved)
		if type(state.package.createdAt) == "string" then
			plugin:SetSetting("FramebridgeAssetRevision:" .. state.package.sourceId, state.package.createdAt)
		end
		tell(value == "" and "Image unlinked. Add an ID or allow placeholders." or "Image link saved.")
	end
	task.defer(function()
		if not unloaded then
			view.refreshImages()
		end
	end)
end
function actions.connect()
	if state.connecting or state.busy then
		return
	end
	if reconcileConnectionScope and reconcileConnectionScope() then return end
	if relay.token and relay.paired then
		tell("Already connected. Send another design from Figma.")
		return
	end
	receiver:reset()
	local connectionVersion=relay.scopeVersion
	relay.betaAccess = state.betaAccess
	state.connecting = true
	view.render(state)
	local ok, result = pcall(function()
		return relay:connect()
	end)
	if unloaded then
		return
	end
	state.connecting = false
	if connectionVersion~=relay.scopeVersion then
        if not reconcileConnectionScope() then task.spawn(restoreConnection) end
        return
    end
	state.paired = relay.paired
	state.code = relay.code
	state.expiresAt = relay.expiresAt
	state.connectionStorageError = relay.storageError
	state.connectionMemoryOnly = relay.storagePersistent == false and not relay.storageError
	if ok then
		state.update = true
	end
	view.render(state)
	tell(ok and (relay.storageError and "Studio could not save this connection for reopening. Keep Studio open to use it."
        or state.paired and "Connection restored. Send another design from Figma."
        or "Paste the code into Framebridge's Studio tab in Figma.") or tostring(result), not ok)
end
function actions.betaAccess(value)
    if state.connecting or state.busy then return end
    state.betaAccess = tostring(value):gsub("%s+", "")
    view.render(state)
end
function actions.import(automatic)
	if not state.package or state.busy then
		return false, "No design is ready to import."
	end
	if missing() > 0 and not state.placeholders then
		tell("Link the remaining images or allow placeholders in Import.", true)
		return false, state.status
	end
	if not canEdit() then
		tell("Stop the play test before importing UI.", true)
		return false, state.status
	end
	state.busy = true
	local importedPackage=state.package
    local manualDelivery=automatic~=true and receiver:beginManual(importedPackage) or nil
	tell("Validating and building your UI…")
	local stage, recording
	local ok, result = pcall(function()
		local package = Editor.prepare(state.package, state.editor)
		stage = Importer.stage(package, state.bindings, state.placeholders, BehaviorSource, {scripts=state.addScripts == true})
		recording = History:TryBeginRecording("FramebridgeImport", "Import Figma UI")
		if not recording then
			error("Another Studio operation is recording. Try again.", 0)
		end
        local selected=Selection:Get()
        local worldTarget=#selected==1 and (selected[1]:IsA('BasePart') or selected[1]:IsA('Attachment')) and selected[1] or nil
        local roots, stats = Importer.apply(stage, package, game:GetService("StarterGui"), state.update, worldTarget)
		History:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
		recording = nil
		stage = nil
		pcall(function()
			Selection:Set(roots)
		end)
		return string.format(
			"Done · %d created, %d updated, %d removed. Undo with Ctrl/Cmd+Z.",
			stats.created,
			stats.updated,
			stats.removed
		)
	end)
	if not ok then
		if stage then
			pcall(Importer.destroy, stage)
		end
		if recording then
			History:FinishRecording(recording, Enum.FinishRecordingOperation.Cancel)
		end
	end
    if ok then
        local saved, message = recent:record(state.package, state.bindings, state.editor)
        state.recent = recent.entries; state.historyError = recent.error
        if not saved and message then result ..= " " .. message end
    end
	state.busy = false
	handoff:complete(importedPackage,ok,tostring(result))
	tell(tostring(result), not ok)
    view.render(state)
	if automatic ~= true then
		receiver:completeManual(manualDelivery, ok, tostring(result))
	end
	return ok, tostring(result)
end
view = View.mount(widget, Importer, actions)
commandPalette = CommandPalette.mount(plugin, {
    selection = Selection, starterGui = game:GetService("StarterGui"), history = History, tools = SelectionTools,
    running = function() return not canEdit() end,
    busy = function() return state.busy end,
    tell = tell,
})
local pointerConnection = game:GetService("UserInputService").InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 then
        actions.finishGalleryDrag()
    end
end)
local selectionConnection = Selection.SelectionChanged:Connect(function()
	if unloaded then
		return
	end
	state.selection = SelectionTools.describe(Selection:Get())
    state.cleanup = Cleanup.review(Selection:Get(), state.cleanupMode)
	state.worldSelection = WorldTools.describe(Selection:Get())
	state.classSelection = ClassTools.describe(Selection:Get())
	if not classTargetChosen then state.classTarget = state.classSelection.preferred end
	state.classPreview = ClassTools.review(Selection:Get(),state.classTarget)
	view.render(state)
end)
launch.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	launch:SetActive(widget.Enabled)
end)
widget:BindToClose(function()
	widget.Enabled = false
end)
plugin.Unloading:Connect(function()
    maskLayoutWatcher.destroy()
    textDecorationWatcher.destroy()
	unloaded = true
    if playConnection then playConnection.destroy() end
    handoff:cancel("Studio plugin closed before import.")
    task.spawn(function() handoff:flush() end)
	selectionConnection:Disconnect()
    pointerConnection:Disconnect()
	relay.token = nil
	commandPalette.destroy()
	view.destroy()
	widget:Destroy()
	toolbar:Destroy()
end)
-- Receipts retry without repeating an import. Queued deliveries retain package identity.
receiver = Receiver.new({
	load = function(package)
		local ok, message = load(Http:JSONEncode(package), true)
		if ok then
			widget.Enabled = true
		end
		return ok, message
	end,
	current = function()
		return state.package
	end,
	import = function()
		return actions.import(true)
	end,
	ack = function(revision, status, message)
		relay:ack(revision, status, message)
	end,
	autoImport = function()
		return state.autoImport
	end,
	running = function()
		return not canEdit()
	end,
	busy = function()
		return state.busy
	end,
	tell = tell,
})
task.spawn(function()
	local failures = 0
	while not unloaded do
		task.wait(not relay.token and 0.25 or failures > 0 and math.min(math.max(relay.pollAfter or 2, 1) * 2 ^ failures, 30) or (relay.pollAfter or 2))
		if not unloaded and relay.token and not state.busy and not state.connecting then
			local connectionVersion=relay.scopeVersion
			local ok, data = pcall(function()
				return relay:poll()
			end)
			if unloaded then
				break
			end
			if connectionVersion~=relay.scopeVersion then reconcileConnectionScope(); continue end
			if ok and data then
				failures = 0
				if state.paired ~= data.paired or state.connectionStorageError ~= relay.storageError then
					state.paired = data.paired
					state.code = relay.code
					state.connectionStorageError = relay.storageError
					state.connectionMemoryOnly = relay.storagePersistent == false and not relay.storageError
					view.render(state)
					if state.paired then
						tell("Connected. Send your design from Figma.")
					end
				end
				if data.package and data.revision > relay.revision then
                    while not unloaded and state.busy and connectionVersion==relay.scopeVersion do task.wait(0.1) end
                    if unloaded then break end
                    if connectionVersion~=relay.scopeVersion then reconcileConnectionScope(); continue end
					relay.revision = data.revision
					receiver:receive(data.revision, data.package)
				end
			elseif not ok then
				failures = math.min(failures + 1, 4)
				tell(tostring(data), true)
				if not relay.token then
					state.paired = false
					state.code = nil
					receiver:reset()
					view.render(state)
				end
			end
		end
	end
end)
-- Import a queued design as soon as Play stops, even while inbox HTTP is waiting.
task.spawn(function()
    while not unloaded do
        task.wait(0.25)
        if not unloaded and relay.token and not state.connecting then receiver:tick() end
        if not unloaded and playConnection then playConnection.publish() end
    end
end)
task.spawn(function()
    while not unloaded do
        task.wait(2)
        if not unloaded then
            handoff:flush()
            if state.handoffReceiptError~=handoff.error then
                state.handoffReceiptError=handoff.error
                view.render(state)
            end
        end
    end
end)
restoreConnection = function()
    if relayUrl == "" then return end
    state.connecting = true
    reconcileConnectionScope()
    local connectionVersion=relay.scopeVersion
    view.render(state)
    local ok, data = pcall(function() return relay:restore() end)
    if unloaded then return end
    state.connecting = false
    if connectionVersion~=relay.scopeVersion then task.spawn(restoreConnection); return end
    if ok and data then
        state.paired = relay.paired
        state.code = relay.code
        state.expiresAt = relay.expiresAt
        state.connectionStorageError = relay.storageError
        state.connectionMemoryOnly = relay.storagePersistent == false and not relay.storageError
        state.update = true
        tell(relay.storageError and "Studio could not save this connection for reopening. Keep Studio open to use it."
            or state.paired and "Connection restored. Send another design from Figma." or "Pairing code restored. Connect from Figma.")
    elseif not ok then
        tell("Could not restore the saved connection. Check your network and reopen Framebridge to retry.", true)
    end
    view.render(state)
end
local handledScopeVersion=relay.scopeVersion
reconcileConnectionScope = function()
    if unloaded then return false end
    relay:syncScope()
    if handledScopeVersion==relay.scopeVersion then return false end
    if (relay.scopeResetVersion or 0)>handledScopeVersion then receiver:reset() end
    handledScopeVersion=relay.scopeVersion
    state.paired=relay.paired; state.code=relay.code; state.expiresAt=relay.expiresAt
    state.connectionStorageError=relay.storageError
    state.connectionMemoryOnly=relay.storagePersistent==false and not relay.storageError
    view.render(state)
    if not relay.token and not state.connecting then task.spawn(restoreConnection) end
    return true
end
local placeConnection=game:GetPropertyChangedSignal("PlaceId"):Connect(reconcileConnectionScope)
plugin.Unloading:Connect(function() placeConnection:Disconnect() end)
-- Only this Edit instance owns the session; active Test instances receive a
-- bounded status projection and can ask this controller to disconnect it.
local playToken, playScope, playGeneration=nil,nil,0
local ok, testTarget=pcall(function() return Enum.PluginConnectionTargetType.Test end)
playConnection=PlayConnection.edit({targetType=ok and testTarget or nil,
    service=function() return game:GetService("PluginConnectionService") end,
    newSession=function() return Http:GenerateGUID(false) end,
    encode=function(value) return Http:JSONEncode(value) end,
    decode=function(raw) return Http:JSONDecode(raw) end,
    snapshot=function()
        if relay.token~=playToken or relay.scopeVersion~=playScope then
            playToken=relay.token;playScope=relay.scopeVersion;playGeneration+=1
        end
        return {generation=playGeneration,expiresAt=relay.expiresAt,
            phase=state.disconnecting and "disconnecting" or (state.connecting or state.busy) and "busy"
                or not relay.token and "disconnected" or state.paired and "paired" or "pairing",
            delivery=receiver.pending and "queued" or receiver.reviewed and "review" or "none",
            canDisconnect=relay.token~=nil and not state.busy and not state.connecting}
    end,
    disconnect=function() if not unloaded then actions.disconnect() end end,
})
view.render(state)
task.spawn(restoreConnection)
