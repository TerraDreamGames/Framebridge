-- Focused React UI in temporary widgets. No imports, network or settings writes.
local native = PluginManager():CreatePlugin()
local widgets, views = {}, {}
local passed, failures = 0, {}
local function check(name, fn)
	local ok, why = pcall(fn)
	if ok then
		passed += 1
	else
		table.insert(failures, name .. ": " .. tostring(why))
	end
end
local function settle()
	task.wait(0.2)
end
local function mount(width, height, initial)
	local widget = native:CreateDockWidgetPluginGuiAsync(
		"FramebridgeFocusedTest" .. width,
		DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, true, width, height, 360, 480)
	)
	table.insert(widgets, widget)
	widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	widget.Enabled = true
	local state = {
		bindings = {},
		update = false,
		placeholders = false,
		busy = false,
		status = "Ready",
		failed = false,
		paste = "",
		transfer = false,
		autoImport = false,
		selection = { count = 0, descendants = 0, total = 0 },
	}
	for key, value in pairs(initial or {}) do state[key] = value end
	local actions = {}
	for _, key in ipairs({
		"open",
		"load",
		"bind",
		"import",
		"mode",
		"connect",
		"placeholders",
		"showTransfer",
		"showConnection",
		"autoImport",
		"disconnect",
		"geometry",
		"resetEdits",
		"tool",
	}) do
		actions[key] = function() end
	end
	function actions.missing()
		local count = 0
		for _, asset in ipairs(state.package and state.package.assets or {}) do
			if not (Importer.assetId(state.bindings[asset.id]) or Importer.assetId(asset.robloxId)) then
				count += 1
			end
		end
		return count
	end
	actions.resolved = function()
		return false
	end
	actions.connect = function() state.connectCalls = (state.connectCalls or 0) + 1 end
	actions.draft = function(value)
		state.paste = value
	end
	local view = View.mount(widget, Importer, actions)
	makeConnectionActions(state, view, actions)
	table.insert(views, view)
	view.render(state)
	settle()
	return widget, state, view, actions
end
local function content(widget)
	return widget.Framebridge.Workspace.Content
end
local function assertConnectionFirst(widget)
	local panel=assert(content(widget):FindFirstChild("ImportContent",true))
	local connection=assert(panel:FindFirstChild("Figma connection"))
	local peers,recent=0,false
	for _,peer in ipairs(panel:GetChildren()) do
		if peer:IsA("GuiObject") and peer.Visible and peer~=connection then
			peers+=1;recent=recent or peer.Name=="Recent imports"
			assert(peer.LayoutOrder>connection.LayoutOrder,"A peer section sorts before connection: "..peer.Name)
			assert(peer.AbsolutePosition.Y>=connection.AbsolutePosition.Y+connection.AbsoluteSize.Y-1,"A peer is rendered before connection: "..peer.Name)
		end
	end
	assert(peers>=3 and recent,"Compare actual peer sections including Recent imports")
end
local ok, why = pcall(function()
	local wide, state, view, actions = mount(860, 680)
	check("empty importer gives connection and file options without an editor", function()
		assert(not wide.Framebridge.Footer.ImportButton.Active)
		assert(content(wide):FindFirstChild("Figma connection", true))
		assert(not wide.Framebridge:FindFirstChild("Explorer", true))
		assert(not wide.Framebridge:FindFirstChild("NativeCanvas", true))
	end)
	state.privateBeta = true
	state.betaAccess = "test-only-access-code"
	view.render(state)
	settle()
	check("connection is first and header reveal does not connect", function()
		assertConnectionFirst(wide)
		wide.Framebridge.Workspace.CanvasPosition = Vector2.new(0, 100)
		actions.showConnection()
		settle()
		assert((state.connectCalls or 0) == 0 and not state.connecting)
		assert(wide.Framebridge.Workspace.CanvasPosition.Y == 0)
		assert(content(wide):FindFirstChild("BetaAccess", true):IsFocused())
		assertConnectionFirst(wide)
	end)
	check("private beta access keeps raw editable value with masked presentation", function()
		local access = content(wide):FindFirstChild("BetaAccess", true)
		assert(access and access.Text == state.betaAccess and access.TextEditable)
		assert(access.TextTransparency == 1 and access.TextStrokeTransparency == 1)
		assert(access.Stroke.ApplyStrokeMode == Enum.ApplyStrokeMode.Border)
		assert(access.SecretMask.Text == string.rep("•", #state.betaAccess))
		assert(not access.SecretMask.Active and not access.SecretMask.Selectable)
	end)
	check("native beta access changes update only masked presentation", function()
		local access = content(wide):FindFirstChild("BetaAccess", true)
		access.Text = "synthetic-pasted-access"
		settle()
		assert(access.Text == "synthetic-pasted-access")
		assert(access.SecretMask.Text == string.rep("•", #access.Text))
		access.Text = ""
		settle()
		assert(access.Text == "" and access.SecretMask.Text == "Private beta access code")
		access.Text = state.betaAccess
		settle()
	end)
	state.code = "ABCDEF123456"
	view.render(state)
	settle()
	check("pairing code is selectable", function()
		local code = content(wide):FindFirstChild("PairingCode", true)
		assert(code.Text == "ABCDEF 123456" and not code.TextEditable)
		assert(code.TextTransparency == 0 and not code:FindFirstChild("SecretMask"))
	end)
	state.paired = true
	state.expiresAt = DateTime.now().UnixTimestampMillis + 7200000
	view.render(state)
	settle()
	check("paired header replaces the expired code", function()
		assert(string.find(wide.Framebridge.Header.Connect.Text, "Connected · 2h"))
		assert(not content(wide):FindFirstChild("PairingCode", true))
		assert(not content(wide):FindFirstChild("BetaAccess", true))
	end)
    state.expiresAt = DateTime.now().UnixTimestampMillis + 4500
    view.render(state)
    settle()
    check("expiry warning ticks independently in the header", function()
        local header=wide.Framebridge.Header.Connect
        local before=header.Text
        assert(string.find(before,"Connected · 0:"))
        task.wait(1.2)
        assert(header.Text~=before, "Countdown did not update")
    end)
	state.transfer = true
	view.render(state)
	settle()
	local draft = content(wide):FindFirstChild("PackageJson", true)
	draft.Text = "Draft survives redraw"
	settle()
	view.render(state)
	settle()
	check("package draft survives redraw", function()
		assert(state.paste == "Draft survives redraw" and draft.Text == state.paste)
	end)
	check("opening the form preserves the current JSON draft instance", function()
		actions.showConnection()
		settle()
		assert(content(wide):FindFirstChild("PackageJson", true) == draft)
		assert(draft.Text == "Draft survives redraw" and state.paste == draft.Text)
		assert(state.paired and state.code == "ABCDEF123456" and (state.connectCalls or 0) == 0)
	end)
	state.package = Importer.decode(fixture)
	state.editor = Editor.restore(state.package, nil)
	state.previewPackage, state.editorNotices = Editor.prepare(state.package, state.editor)
	view.render(state)
	settle()
	check("import exposes global scale sizing and mode", function()
		assertConnectionFirst(wide)
		assert(content(wide):FindFirstChild("ImportSizing", true):FindFirstChild("scale"))
		assert(content(wide):FindFirstChild("ImportMode", true))
		assert(not content(wide):FindFirstChild("Size X scale", true))
	end)
	check("linked package enables import", function()
		assert(wide.Framebridge.Footer.ImportButton.Active)
	end)
	table.insert(state.package.assets, { id = "missing", name = "Test image" })
	view.render(state)
	settle()
	check("missing image links are disclosed and block import", function()
		assert(not wide.Framebridge.Footer.ImportButton.Active)
		assert(content(wide):FindFirstChild("AssetId", true))
        assert(content(wide):FindFirstChild("Recent imports", true))
        assert(content(wide):FindFirstChild("Inserted image gallery", true))
        assert(content(wide):FindFirstChild("ImageLink:missing", true).Thumbnail.Size.X.Offset==36)
	end)
	state.placeholders = true
	view.render(state)
	settle()
	check("explicit placeholders enable import", function()
		assert(wide.Framebridge.Footer.ImportButton.Active)
	end)
	state.busy = true
	view.status()
	settle()
	check("busy import cannot be repeated", function()
		assert(
			not wide.Framebridge.Footer.ImportButton.Active
				and wide.Framebridge.Footer.ImportButton.Text == "Importing…"
		)
	end)
	state.busy = false
	state.update = true
	view.status()
	settle()
	check("update action is explicit", function()
		assert(wide.Framebridge.Footer.ImportButton.Text == "Update in StarterGui")
	end)
	view.selectTab("Tools")
	settle()
	check("tools uses Studio selection and hides import action", function()
		assert(content(wide).ToolsPanel.Visible and not content(wide).ImportPanel.Visible)
		assert(not wide.Framebridge.Footer.ImportButton.Visible)
		assert(content(wide):FindFirstChild("SelectionSummary", true).Text == "Select UI in Roblox Explorer")
		assert(not content(wide):FindFirstChild("ConvertUnits", true).scale.Active)
	end)
	state.selection = { count = 2, descendants = 4, total = 2, name = "2 selected instances" }
	view.render(state)
	settle()
	check("selection changes enable tools without loading a design", function()
		assert(content(wide):FindFirstChild("SelectionSummary", true).Text:find("2 UI elements", 1, true))
		assert(content(wide):FindFirstChild("ConvertUnits", true).scale.Active)
		assert(not content(wide):FindFirstChild("Minimum size", true))
		assert(content(wide):FindFirstChild("Responsive text", true))
	end)
	check("header reveal from UI tools selects Import and retains selection", function()
		actions.showConnection()
		settle()
		assert(content(wide).ImportPanel.Visible and not content(wide).ToolsPanel.Visible)
		assert(state.selection.count == 2 and state.selection.descendants == 4)
		assert(state.paired and (state.connectCalls or 0) == 0)
	end)
	view.selectTab("Import")
	settle()
	check("tab switch preserves the JSON draft", function()
		assert(content(wide):FindFirstChild("PackageJson", true).Text == "Draft survives redraw")
	end)
	local smallPackage = Importer.decode(fixture)
	local narrow, small, smallView, smallActions = mount(360, 480, {
		package = smallPackage,
		editor = Editor.restore(smallPackage, nil),
		privateBeta = true,
	})
	check("narrow loaded design header reveals the tester field and submit above the fold", function()
		assert(not content(narrow):FindFirstChild("BetaAccess", true))
		smallActions.showConnection()
		settle()
		assertConnectionFirst(narrow)
		local workspace = narrow.Framebridge.Workspace
		local access = content(narrow):FindFirstChild("BetaAccess", true)
		local submit = content(narrow):FindFirstChild("Connect to Figma", true)
		assert(access and access:IsFocused() and submit and submit.Active)
		assert((small.connectCalls or 0) == 0 and workspace.CanvasPosition.Y == 0)
		for _,item in ipairs({access,submit}) do
			assert(item.AbsolutePosition.Y >= workspace.AbsolutePosition.Y)
			assert(item.AbsolutePosition.Y + item.AbsoluteSize.Y <= workspace.AbsolutePosition.Y + workspace.AbsoluteSize.Y)
		end
	end)
	check("minimum window keeps scroll content and import action separate", function()
		local base = narrow.Framebridge
		assert(base.Workspace.AbsolutePosition.Y + base.Workspace.AbsoluteSize.Y <= base.Footer.AbsolutePosition.Y)
		assert(
			base.Footer.Status.AbsolutePosition.Y + base.Footer.Status.AbsoluteSize.Y
				<= base.Footer.ImportButton.AbsolutePosition.Y
		)
		assert(
			base.Footer.ImportButton.AbsolutePosition.Y + base.Footer.ImportButton.AbsoluteSize.Y
				<= base.AbsolutePosition.Y + base.AbsoluteSize.Y
		)
		assert(base.Workspace.Content.AbsoluteSize.X <= base.AbsoluteSize.X - 30)
	end)
end)
for _, view in ipairs(views) do
	pcall(view.destroy)
end
settle()
for _, widget in ipairs(widgets) do
	widget:Destroy()
end
native:Destroy()
if not ok then
	table.insert(failures, "test setup: " .. tostring(why))
end
return {
	passed = passed,
	failed = #failures,
	failures = failures,
	scope = "Temporary focused React widgets; no imports/settings/place changes",
}
