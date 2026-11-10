assert(game.PlaceId == 0, "Blank QA only")
local storage, starter = game:GetService("ServerStorage"), game:GetService("StarterGui")
assert(not storage:FindFirstChild("__FramebridgeCommandsUIQA"), "Inspect existing command QA first")
local qa = Instance.new("Folder")
qa.Name = "__FramebridgeCommandsUIQA"
qa.Parent = storage
local screen = Instance.new("ScreenGui")
screen.Name = "__FramebridgeCommandsUIQA"
screen.Parent = starter
local Selection = game:GetService("Selection")
local previous = Selection:Get()
Selection:Set({ screen })
local native = PluginManager():CreatePlugin()
local action
local monitors={}
local plugin = {}
function plugin:CreateDockWidgetPluginGuiAsync(id, info)
	return native:CreateDockWidgetPluginGuiAsync(
		id .. "QA_Docked",
		DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Left, false, true, 460, 440, 360, 280)
	)
end
function plugin:CreatePluginAction(id, ...)
	action = native:CreatePluginAction(id .. "QA", ...)
	return action
end
local api = require(script.CommandPalette).mount(plugin, {
	selection = Selection,
	starterGui = starter,
	history = game:GetService("ChangeHistoryService"),
	tools = require(script.SelectionTools),
	running = function()
		return game:GetService("RunService"):IsRunning()
	end,
	busy = function()
		return qa:GetAttribute("Busy") == true
	end,
	tell = function(message, failed)
		qa:SetAttribute("Message", message)
		qa:SetAttribute("Failed", failed)
	end,
})
local command = Instance.new("BindableFunction")
command.Name = "Command"
command.Parent = qa
command.OnInvoke = function(operation, value)
	assert(game.PlaceId == 0, "Blank QA only")
	if operation == "open" then
		api.open()
		return "Opened commands"
	end
	if operation == "select-screen" then
		Selection:Set({ screen })
		return "Selected QA screen"
	end
	if operation == "busy" then
		qa:SetAttribute("Busy", value == true)
		api.refresh()
		return "Busy state updated"
	end
	if operation == "cleanup" then
		for _,connection in ipairs(monitors)do connection:Disconnect()end
		table.clear(monitors)
		api.destroy()
		local restore = {}
		for _, item in ipairs(previous) do
			if item.Parent then
				table.insert(restore, item)
			end
		end
		Selection:Set(restore)
		screen:Destroy()
		native:Destroy()
		qa:Destroy()
		return "Command UI QA cleaned"
	end
	if operation == "monitor" then
		local search = api.widget:FindFirstChild("CommandSearch", true)
		assert(search)
		assert(#monitors==0,"Input monitor already connected")
		table.insert(monitors,search.InputBegan:Connect(function(input) qa:SetAttribute("InputKey", tostring(input.KeyCode)); qa:SetAttribute("InputType", tostring(input.UserInputType)) end))
		table.insert(monitors,search.FocusLost:Connect(function(enter, input) qa:SetAttribute("LostEnter", tostring(enter)); qa:SetAttribute("LostKey", input and tostring(input.KeyCode)) end))
		return "Monitoring native search input"
	end
	assert(operation == "status")
	local items = {}
	for _, item in ipairs(api.widget:GetDescendants()) do
		if item:IsA("TextBox") or item:IsA("TextButton") or item.Name == "CommandTarget" then
			table.insert(items, {
				name = item.Name,
				text = item.Text,
				active = item.Active,
				position = { item.AbsolutePosition.X, item.AbsolutePosition.Y },
				size = { item.AbsoluteSize.X, item.AbsoluteSize.Y },
			})
		end
	end
	local selected = Selection:Get()[1]
	local mouse = api.widget:GetRelativeMousePosition()
	local focused = game:GetService("UserInputService"):GetFocusedTextBox()
	local search = api.widget:FindFirstChild("CommandSearch",true)
	return game:GetService("HttpService"):JSONEncode({
		enabled = api.widget.Enabled,
		items = items,
		selected = selected and selected.ClassName,
		children = #screen:GetChildren(),
		message = qa:GetAttribute("Message"),
		action = action.Name,
		mouse = { mouse.X, mouse.Y }, focused = focused and focused.Name,
		searchFocused = search and search:IsFocused(), events = qa:GetAttributes(),
	})
end
api.open()
return "Actual command palette ready in blank place; shortcut action registered"
