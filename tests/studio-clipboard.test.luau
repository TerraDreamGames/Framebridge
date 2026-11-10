-- Exercise real copy code and deferred UI gestures without touching the OS clipboard.
-- A separate Studio acceptance check verifies native copy/paste.
local fs, roblox = require("@lune/fs"), require("@lune/roblox")
local passed, service = 0, nil
local desktop = {IsWindows=true}
local function check(name, fn)
	local ok, why = xpcall(fn, debug.traceback)
	assert(ok, name .. ": " .. tostring(why)); passed += 1
end
local env = setmetatable({Enum=roblox.Enum, game={GetService=function(_,name)
	if name=="GuiService" then return desktop end
	assert(name=="UserInputService"); return service
end}}, {__index=getfenv()})
local source = assert(loadstring(fs.readFile("plugins/studio/src/Clipboard.luau")))
setfenv(source, env)
local Clipboard = source()
check("shortcut labels follow the host platform",function()
	for _,case in ipairs({
		{roblox.Enum.Platform.OSX,"⌘C"},
		{roblox.Enum.Platform.Windows,"Ctrl+C"},
		{roblox.Enum.Platform.Linux,"Ctrl+C"},
	}) do
		assert(Clipboard.shortcut({GetPlatform=function()return case[1]end},{})==case[2])
	end
end)
check("restricted platform access falls back to Studio's desktop flag",function()
	local blocked={GetPlatform=function()error("Restricted")end}
	assert(Clipboard.shortcut(blocked,{IsWindows=true})=="Ctrl+C")
	assert(Clipboard.shortcut(blocked,{IsWindows=false})=="⌘C")
	assert(Clipboard.shortcut(blocked,{})==nil)
end)
local function textbox(value)
	return {Text=value or "SYNTHETIC-CODE", TextEditable=false, Parent={}, focused=true,
		CursorPosition=4, SelectionStart=-1,
		IsFocused=function(self) return self.focused end,
		CaptureFocus=function(self) self.focused=true end,
		FindFirstAncestorOfClass=function(_,name) assert(name=="DockWidgetPluginGui"); return {} end}
end
local function input(options)
	options=options or {}
	local h={calls={},created=0}
	function h:IsKeyDown(key) return options.held==key end
	function h:CreateVirtualInput()
		self.created+=1
		if options.unavailable then return nil end
		if options.denied then error("Feature unavailable") end
		return {SendKey=function(_,down,key,repeated)
			assert(repeated==false)
			table.insert(h.calls,{down=down,key=key})
			if #h.calls==options.failAt then error("Input rejected") end
		end}
	end
	return h
end
check("full field selected and C released before Control",function()
	local box,h=textbox(),input()
	assert(Clipboard.copy(box,h))
	assert(box.CursorPosition==1 and box.SelectionStart==#box.Text+1)
	assert(#h.calls==4 and h.calls[1].down and h.calls[1].key==roblox.Enum.KeyCode.LeftControl)
	assert(h.calls[2].down and h.calls[2].key==roblox.Enum.KeyCode.C)
	assert(not h.calls[3].down and h.calls[3].key==roblox.Enum.KeyCode.C)
	assert(not h.calls[4].down and h.calls[4].key==roblox.Enum.KeyCode.LeftControl)
end)
check("unfocused, editable, empty, destroyed and non-plugin fields never inject keys",function()
	for _,kind in ipairs({"unfocused","editable","empty","destroyed","outside"}) do
		local box,h=textbox(),input()
		if kind=="unfocused" then box.focused=false
		elseif kind=="editable" then box.TextEditable=true
		elseif kind=="empty" then box.Text=""
		elseif kind=="destroyed" then box.Parent=nil
		else box.FindFirstAncestorOfClass=function()return nil end end
		assert(not Clipboard.copy(box,h) and h.created==0 and #h.calls==0)
	end
end)
check("unsupported input leaves manual selection without throwing",function()
	for _,options in ipairs({{unavailable=true},{denied=true}}) do
		local box,h=textbox(),input(options)
		assert(not Clipboard.copy(box,h) and #h.calls==0)
		assert(box.CursorPosition==1 and box.SelectionStart==#box.Text+1)
	end
end)
check("held physical modifiers and C are never synthesized or released",function()
	for _,key in ipairs({roblox.Enum.KeyCode.LeftControl,roblox.Enum.KeyCode.RightMeta,roblox.Enum.KeyCode.LeftShift,roblox.Enum.KeyCode.C}) do
		local h=input({held=key})
		assert(not Clipboard.copy(textbox(),h) and h.created==0 and #h.calls==0)
	end
end)
check("partially failed sends still release attempted keys",function()
	for failAt=1,4 do
		local h=input({failAt=failAt})
		assert(not Clipboard.copy(textbox(),h))
		assert(not h.calls[#h.calls].down and h.calls[#h.calls].key==roblox.Enum.KeyCode.LeftControl)
		if failAt>1 then assert(not h.calls[#h.calls-1].down and h.calls[#h.calls-1].key==roblox.Enum.KeyCode.C) end
	end
end)

local current, pending = nil, {}
local React={Event={},Change={}}
function React.createElement(kind,props,children) return {kind=kind,props=props or {},children=children or {}} end
local function slot()
	current.index+=1
	local index=current.index
	if not current.hooks[index] then current.hooks[index]={} end
	return current.hooks[index]
end
function React.useState(value)
	local state,host=slot(),current
	if not state.initialized then state.value=value;state.initialized=true end
	return state.value,function(nextValue) host.dirty=host.dirty or state.value~=nextValue;state.value=nextValue end
end
function React.useRef(value)
	local ref=slot()
	if not ref.ref then ref.ref={current=value} end
	return ref.ref
end
function React.useEffect(fn,deps)
	local hook=slot()
	local changed=not hook.deps
	if hook.deps then
		for i,v in ipairs(deps) do if hook.deps[i]~=v then changed=true end end
	end
	if changed then
		hook.deps=table.clone(deps)
		table.insert(current.effects,function() if hook.cleanup then hook.cleanup() end;hook.cleanup=fn() end)
	end
end
local reactNode, clipboardNode={},{}
local controlsEnv=setmetatable({
	script={Parent={ReactLua={React=reactNode},Clipboard=clipboardNode}},
	require=function(node) if node==clipboardNode then return Clipboard end;assert(node==reactNode);return React end,
	Color3=roblox.Color3,UDim=roblox.UDim,UDim2=roblox.UDim2,Vector2=roblox.Vector2,Enum=roblox.Enum,
	Font={fromEnum=function(value)return value end},task={defer=function(fn)table.insert(pending,fn)end},
},{__index=getfenv()})
local controls=assert(loadstring(fs.readFile("plugins/studio/src/Components.luau")))
setfenv(controls,controlsEnv)
local UI=controls()
local function mount(props)
	local h={props=props or {Name="PairingCode",Value="SYNTHETIC-CODE"},hooks={},effects={},box=textbox()}
	h.box.Text=h.props.Value or ""
	function h.render()
		for _=1,5 do
			current=h;h.index=0;h.effects={};h.dirty=false
			h.tree=UI.CopyInput(h.props)
			h.row=h.tree.props.Items[1].children
			h.row.Input.props.InputRef.current=h.box
			for _,effect in ipairs(h.effects) do effect() end
			if not h.dirty then return end
		end
		error("Copy field did not settle")
	end
	function h.flush()
		local tasks=pending;pending={}
		for _,fn in ipairs(tasks) do fn() end
		h.render()
	end
	function h.click()
		local mouse={UserInputType=roblox.Enum.UserInputType.MouseButton1}
		h.row.Input.props.OnPointerBegan(h.box,mouse)
		h.row.Input.props.OnPointerEnded(h.box,mouse)
	end
	function h.destroy() for _,hook in ipairs(h.hooks) do if hook.cleanup then hook.cleanup() end end end
	service=input();h.render()
	return h
end
check("mount, parent rerender and programmatic focus do not overwrite clipboard",function()
	local h=mount()
	h.render();h.row.Input.props.OnFocused(h.box);h.flush()
	assert(service.created==0 and #pending==0)
	assert(h.row.Input.props.ReadOnly and h.row.Copy.props.Text=="Copy")
end)
check("pointer gesture copies once after native caret changes",function()
	local h=mount();h.click()
	assert(service.created==0)
	h.box.CursorPosition=5;h.box.SelectionStart=-1;h.flush()
	assert(service.created==1 and #service.calls==4)
	assert(h.box.CursorPosition==1 and h.box.SelectionStart==#h.box.Text+1)
	assert(h.tree.props.Items[2].props.Text=="Copied to clipboard.")
end)
check("Copy button focuses and copies the same full field",function()
	local h=mount();h.box.focused=false;h.row.Copy.props.OnClick();h.flush()
	assert(service.created==1 and h.box.focused and h.box.SelectionStart==#h.box.Text+1)
end)
check("keyboard releases and a pointer release without a press do not copy",function()
	local h=mount()
	h.row.Input.props.OnPointerEnded(h.box,{UserInputType=roblox.Enum.UserInputType.MouseButton1})
	local key={UserInputType=roblox.Enum.UserInputType.Keyboard}
	h.row.Input.props.OnPointerBegan(h.box,key);h.row.Input.props.OnPointerEnded(h.box,key);h.flush()
	assert(service.created==0)
end)
check("touch uses one matching press and release",function()
	local h=mount();local touch={UserInputType=roblox.Enum.UserInputType.Touch}
	h.row.Input.props.OnPointerBegan(h.box,touch);h.row.Input.props.OnPointerEnded(h.box,touch);h.flush()
	assert(service.created==1)
end)
check("blur, replacement, disabled state, removed field and unmount cancel deferred copying",function()
	for _,kind in ipairs({"blur","replace","disable","removed","unmount"}) do
		local h=mount();h.click()
		if kind=="blur" then h.box.focused=false;h.row.Input.props.OnFocusLost(h.box)
		elseif kind=="replace" then h.props.Value="NEW-CODE";h.box.Text="NEW-CODE";h.render()
		elseif kind=="disable" then h.props.Disabled=true;h.render()
		elseif kind=="removed" then h.box.Parent=nil
		else h.destroy() end
		h.flush();assert(service.created==0,kind)
	end
end)
check("disabled controls never focus or copy",function()
	local h=mount({Name="PairingCode",Value="SYNTHETIC-CODE",Disabled=true});h.box.focused=false
	h.row.Copy.props.OnClick();h.click();h.flush()
	assert(not h.box.focused and service.created==0 and h.row.Copy.props.Disabled)
end)
check("unavailable copy gives an honest manual fallback and resets for a new guide",function()
	local h=mount({Name="DocumentationLink",Value="https://framebridge.terradream.games/#docs"})
	service=input({unavailable=true});h.click();h.flush()
	assert(h.tree.props.Items[2].props.Text=="Selected. Press Ctrl+C to copy.")
	h.props.Value="https://framebridge.terradream.games/#docs/studio-import";h.box.Text=h.props.Value;h.render()
	assert(h.tree.props.Items[2].props.Text=="Click to copy · Ctrl+C also works.")
end)
print("Studio clipboard checks passed: " .. passed)
