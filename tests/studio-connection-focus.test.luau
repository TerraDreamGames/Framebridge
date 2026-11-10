-- Execute the production callbacks and View functions without native services.
-- Engine layout, native focus and pointer behavior remain Studio acceptance.
local fs, roblox = require("@lune/fs"), require("@lune/roblox")
local source = fs.readFile("plugins/studio/src/Plugin.server.luau")
local function callback(name)
	return assert(source:match("(function actions%." .. name .. "%([^\n]*\n.-\nend)\nfunction actions%."), name)
end
local factory = assert(loadstring("return function(state, view, relay, receiver, tell)\nlocal actions = {}\nlocal unloaded = false\n"
	.. callback("showConnection") .. "\n" .. callback("connect") .. "\n" .. callback("betaAccess") .. "\nreturn actions\nend"))()
local passed = 0
local function check(name, fn)
	local ok, why = pcall(fn)
	assert(ok, name .. ": " .. tostring(why)); passed += 1
end
local function host(state)
	local h = { state=state, renders=0, tabs={}, connects=0, resets=0, messages={} }
	h.relay = { token=state.paired and "synthetic-session" or nil, paired=state.paired, code=state.code, expiresAt=state.expiresAt }
	function h.relay:connect() h.connects+=1;return "synthetic-code" end
	h.actions = factory(state, {
		render=function(value) assert(value==state);h.renders+=1 end,
		selectTab=function(tab) table.insert(h.tabs,tab) end,
	}, h.relay, {reset=function() h.resets+=1 end}, function(message) table.insert(h.messages,message) end)
	return h
end
check("opening an unpaired private form never starts transport", function()
	local state={privateBeta=true,betaAccess="",recent={{name="Keep"}},package={},editor={mode="source"}}
	local h=host(state);h.actions.showConnection()
	assert(state.connectionOpen==1 and h.renders==1 and h.tabs[1]=="Import")
	assert(h.connects==0 and h.resets==0 and not state.connecting)
	assert(state.betaAccess=="" and state.recent[1].name=="Keep" and state.editor.mode=="source")
end)
check("opening pairing and connected expiry retains the reusable session", function()
	for _,paired in ipairs({false,true}) do
		local state={paired=paired,code="synthetic-existing",expiresAt=12345,connectionOpen=3}
		local h=host(state);local token=h.relay.token;h.actions.showConnection()
		assert(state.connectionOpen==4 and h.connects==0 and h.resets==0)
		assert(state.paired==paired and state.code=="synthetic-existing" and state.expiresAt==12345 and h.relay.token==token)
	end
end)
check("busy and connecting opening requests cannot switch views", function()
	for _,flag in ipairs({"busy","connecting"}) do
		local state={[flag]=true,connectionOpen=2};local h=host(state);h.actions.showConnection()
		assert(state.connectionOpen==2 and h.renders==0 and #h.tabs==0 and h.connects==0)
	end
end)
check("only explicit connect submits the accepted normalized tester code", function()
	local state={privateBeta=true,betaAccess=""};local h=host(state)
	h.actions.showConnection();h.actions.betaAccess(" synthetic\t tester\n code ")
	assert(h.connects==0 and state.betaAccess=="synthetictestercode")
	h.actions.connect()
	assert(h.connects==1 and h.resets==1 and h.relay.betaAccess==state.betaAccess and not state.connecting)
end)
local current, React = nil, {Event={},Change={}}
function React.createElement(kind,props,children) return {kind=kind,props=props or {},children=children} end
function React.cloneElement(element,props)
	local nextProps=table.clone(element.props)
	for key,value in pairs(props) do nextProps[key]=value end
	return {kind=element.kind,props=nextProps,children=element.children}
end
function React.useState(value) return current.tab or value,function(tab) current.nextTab=tab end end
function React.useRef(value)
	current.refIndex+=1;local index=current.refIndex
	if not current.refs[index] then current.refs[index]={current=value} end
	return current.refs[index]
end
function React.useEffect(fn) table.insert(current.effects,fn) end
local nodes={React={},ReactRoblox={},Components={},Clipboard={},ConnectionLifetime={},Brand={}}
local clipboard=assert(loadstring(fs.readFile("plugins/studio/src/Clipboard.luau")))()
local env=setmetatable({
		script={Parent={ReactLua={React=nodes.React,ReactRoblox=nodes.ReactRoblox},Components=nodes.Components,Clipboard=nodes.Clipboard,ConnectionLifetime=nodes.ConnectionLifetime,Brand=nodes.Brand}},
	require=function(node)
		if node==nodes.React then return React end
		if node==nodes.Clipboard then return clipboard end
		if node==nodes.Components then return nodes.ui end
			if node==nodes.Brand then return nodes.brand end
		assert(node==nodes.ReactRoblox or node==nodes.ConnectionLifetime);return {}
	end,
	Color3=roblox.Color3,Vector2=roblox.Vector2,UDim=roblox.UDim,UDim2=roblox.UDim2,Enum=roblox.Enum,
	Font={fromEnum=function(value) return value end},
},{__index=getfenv()})
local controls=assert(loadstring(fs.readFile("plugins/studio/src/Components.luau")));setfenv(controls,env);nodes.ui=controls()
local brand=assert(loadstring(fs.readFile("plugins/studio/src/Brand.luau")));setfenv(brand,env);nodes.brand=brand()
local viewSource=fs.readFile("plugins/studio/src/View.luau")
assert(viewSource:sub(-12)=="return View\n")
local view=assert(loadstring(viewSource:sub(1,-13).."return {Connection=Connection,ImportOptions=ImportOptions,App=App}\n"));setfenv(view,env);view=view()
local actions={missing=function() return 0 end,resolved=function() return false end,connect=function() error("Premature connect") end}
check("the connection form comes before handoff, package and recent content", function()
	for _,loaded in ipairs({false,true}) do
		local state={recent={{name="Keep"}},editor={layers={},mode="source"}}
		if loaded then state.package={name="QA",roots={},assets={},issues={},instanceCount=0} end
		local result=view.ImportOptions({State=state,Actions=actions});local first=result.props.Items[1]
		assert(first.props.Title=="Figma connection" and first.props.DefaultOpen==not loaded)
		assert(result.props.Items[2].props.Title=="Import a design code")
		state.connectionOpen=1;local opened=view.ImportOptions({State=state,Actions=actions}).props.Items[1]
		assert(opened.props.DefaultOpen and opened.props.key~=first.props.key)
	end
end)
check("private input and explicit submission precede auto-import settings", function()
	local items=view.Connection({State={privateBeta=true,betaAccess=""},Actions=actions}).props.Items
	assert(items[1].props.Name=="BetaAccess" and items[3].props.Text=="Connect to Figma")
	assert(items[3].props.OnClick==actions.connect)
	local auto;for i,item in ipairs(items) do if item.props.Text=="Auto-import designs" then auto=i end end
	assert(auto and auto>3)
end)
check("all rendered peer wrappers keep connection first including recent imports", function()
	local function outerFrame(element)
		while type(element.kind)=="function" do element=element.kind(element.props) end
		return element
	end
	for _,loaded in ipairs({false,true}) do
		current={refs={},effects={},refIndex=0}
		local state={recent={{name="Keep",mode="source"}},editor={layers={},mode="source"}}
		if loaded then state.package={name="QA",roots={},assets={},issues={},instanceCount=0} end
		local parent=outerFrame(view.ImportOptions({State=state,Actions=actions}))
		local connection,recent,peers
		peers={}
		for _,child in pairs(parent.children) do
			local frame=outerFrame(child)
			if frame.kind=="Frame" then
				table.insert(peers,frame)
				if frame.props.Name=="Figma connection" then connection=frame end
				if frame.props.Name=="Recent imports" then recent=frame end
			end
		end
		assert(connection and recent and #peers>=4)
		for _,peer in ipairs(peers) do
			if peer~=connection then assert((peer.props.LayoutOrder or 0)>connection.props.LayoutOrder,peer.props.Name) end
		end
	end
end)
local function focusHost(tab,request,pairing)
	local h={tab=tab,refIndex=0,refs={},effects={},state={connectionOpen=request,privateBeta=true}}
	h.access={calls=0,CaptureFocus=function(self) self.calls+=1 end}
	h.pairing=pairing and {calls=0,CaptureFocus=function(self) self.calls+=1 end} or nil
	h.workspace={CanvasPosition=roblox.Vector2.new(0,250),FindFirstChild=function(_,name) return name=="PairingCode" and h.pairing or name=="BetaAccess" and h.access or nil end}
	h.refs[1]={current=h.workspace}
	function h.render()
		current=h;h.refIndex,h.effects=0,{};view.App({State=h.state,Actions=actions})
		for _,effect in ipairs(h.effects) do effect() end
	end
	return h
end
check("a header reveal scrolls to the form and focuses the tester input once", function()
	local h=focusHost("Import",1);h.render()
	assert(h.workspace.CanvasPosition==roblox.Vector2.new() and h.access.calls==1)
	h.workspace.CanvasPosition=roblox.Vector2.new(0,200);h.render()
	assert(h.workspace.CanvasPosition.Y==200 and h.access.calls==1)
	h.state.connectionOpen=2;h.render();assert(h.workspace.CanvasPosition.Y==0 and h.access.calls==2)
end)
check("ordinary renders preserve scroll and do not seize text focus", function()
	local h=focusHost("Import",0);h.render();assert(h.workspace.CanvasPosition.Y==250 and h.access.calls==0)
end)
check("a request waits for Import when opened from UI tools", function()
	local h=focusHost("Tools",1);h.render();assert(h.workspace.CanvasPosition.Y==250 and h.access.calls==0)
	h.tab="Import";h.render();assert(h.workspace.CanvasPosition.Y==0 and h.access.calls==1)
end)
check("an existing pairing code takes focus ahead of the tester field", function()
	local h=focusHost("Import",1,true);h.render();assert(h.pairing.calls==1 and h.access.calls==0)
end)
check("paired storage failure and blank-place sessions explain restart limits", function()
    for _,state in ipairs({
        {paired=true,connectionStorageError=true},
        {paired=true,connectionMemoryOnly=true},
    }) do
        current={refs={},effects={},refIndex=0}
        local items=view.Connection({State=state,Actions=actions}).props.Items
        local found=false
        for _,item in ipairs(items) do
            local text=item.props.Text or ""
            if state.connectionStorageError then found=found or text:find("could not save it for reopening",1,true)~=nil
            else found=found or text:find("Save this place to Roblox",1,true)~=nil end
        end
        assert(found)
    end
end)
print("Studio connection reveal/callback checks: "..passed)
