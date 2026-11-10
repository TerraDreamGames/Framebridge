assert(game.PlaceId == 0, "Blank QA only")
assert(
	not game:GetService("ServerStorage"):FindFirstChild("FramebridgeClassToolsUIQA"),
	"Inspect the existing UI QA before creating another"
)
local previousSelection = game:GetService("Selection"):Get()
local qa = Instance.new("Folder")
qa.Name = "FramebridgeClassToolsUIQA"
qa:SetAttribute("FramebridgeClassQA", true)
qa.Parent = game:GetService("ServerStorage")
local screen = Instance.new("ScreenGui")
screen.Name = "FramebridgeClassToolsUIQA"
screen.Parent = game:GetService("StarterGui")
local artwork = Instance.new("ImageLabel")
artwork.Name = "Inventory icon"
artwork.Size = UDim2.fromOffset(80, 80)
artwork.Image = "rbxassetid://123456789"
artwork.ImageColor3 = Color3.fromRGB(70, 130, 220)
artwork.ScaleType = Enum.ScaleType.Slice
artwork.SliceCenter = Rect.new(4, 4, 60, 60)
artwork:SetAttribute("GameValue", 42)
artwork:AddTag("ClassToolsQA")
artwork.Parent = screen
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0.1, 0)
corner.Parent = artwork
local app = Instance.new("LocalScript")
app.Name = "Application"
app.Source = "-- QA application logic"
app.Parent = artwork
game:GetService("Selection"):Set({ artwork })
local native = PluginManager():CreatePlugin()
local unloading = Instance.new("BindableEvent")
local settings = {}
local plugin = { Unloading = unloading.Event }
function plugin:GetSetting(key)
	return settings[key]
end
function plugin:SetSetting(key, value)
	settings[key] = value
end
function plugin:CreateToolbar(...)
	return native:CreateToolbar(...)
end
function plugin:CreatePluginAction(...)
	return native:CreatePluginAction(...)
end
function plugin:CreateDockWidgetPluginGuiAsync(name, info)
	return native:CreateDockWidgetPluginGuiAsync(name .. "ClassToolsQA", info)
end
