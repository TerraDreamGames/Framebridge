assert(game.PlaceId==0,"Theme Play QA requires approved blank Place1")
local StarterGui=game:GetService("StarterGui")
assert(not StarterGui:FindFirstChild("FramebridgeThemeQA"),"Theme QA fixture already exists")
local pkg=Importer.decode(fixture)
local stage=Importer.stage(pkg,{},false,runtimeSource)
local roots=Importer.apply(stage,pkg,StarterGui,false)
local root=roots[1];root.Name="FramebridgeThemeQA";root:SetAttribute("FramebridgeThemeQA",true)
local canvas=stage.byId["theme-screen"].instance;canvas.Name="Canvas";canvas.Position=UDim2.new(0.5,-210,0.5,-120)
local dark,light=stage.byId.buy.instance,stage.byId.sell.instance;dark.Name="DarkButton";light.Name="LightButton"
stage.byId["buy-label"].instance.Text="Dark theme";stage.byId["sell-label"].instance.Text="Light theme"
stage.byId.heading.instance.Text="Click to switch themes";stage.byId.heading.instance.Size=UDim2.fromOffset(420,40)
local user=Instance.new("LocalScript");user.Name="ThemeSwitchQA";user:SetAttribute("FramebridgeThemeQA",true)
user.Source=string.format([[
local root=script.Parent
local dark=root:WaitForChild("Canvas"):WaitForChild("DarkButton")
local light=root.Canvas:WaitForChild("LightButton")
dark.Activated:Connect(function() root:SetAttribute("FramebridgeTheme","Dark");root:SetAttribute("FramebridgeThemeQAClicks",(root:GetAttribute("FramebridgeThemeQAClicks") or 0)+1) end)
light.Activated:Connect(function() root:SetAttribute("FramebridgeTheme","Light");root:SetAttribute("FramebridgeThemeQAClicks",(root:GetAttribute("FramebridgeThemeQAClicks") or 0)+1) end)
]])
user.Parent=root
return {created=root.Name,instances=#root:GetDescendants()+1,http=game:GetService("HttpService").HttpEnabled}
