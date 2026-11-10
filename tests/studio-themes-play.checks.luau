-- Return a phase checker for the approved blank Place1 Client datamodel.
-- Drive actual pointer input between phases; these assertions do not simulate clicks.
assert(game.PlaceId==0,"Theme Play QA requires approved blank Place1")
local Players=game:GetService("Players")
local root=Players.LocalPlayer.PlayerGui:WaitForChild("FramebridgeThemeQA")
local dark,light=root.Canvas.DarkButton,root.Canvas.LightButton
return function(phase)
    assert(root:GetAttribute("FramebridgeThemeQA")==true)
    assert(root.FramebridgeInteractions:GetAttribute("FramebridgeRuntimeStatus")=="Ready")
    if phase=="hover" then
        assert(root:GetAttribute("FramebridgeTheme")=="Light")
        assert(dark.GuiState==Enum.GuiState.Hover)
        assert(dark.BackgroundColor3==Color3.new(0.8,0.85,1))
    elseif phase=="dark" then
        assert(root:GetAttribute("FramebridgeTheme")=="Dark")
        assert(root:GetAttribute("FramebridgeThemeQAClicks")==1)
        assert(dark.BackgroundColor3==Color3.new(0.2,0.25,0.4))
        assert(light.BackgroundColor3==Color3.new(0.1,0.12,0.2))
        assert(dark:FindFirstChildWhichIsA("UIShadow").BlurRadius==UDim.new(0,12))
    elseif phase=="light" then
        assert(root:GetAttribute("FramebridgeTheme")=="Light")
        assert(root:GetAttribute("FramebridgeThemeQAClicks")==2)
        assert(dark.BackgroundColor3==Color3.new(0.94,0.96,1))
        assert(light.BackgroundColor3==Color3.new(0.8,0.85,1))
        assert(dark:FindFirstChildWhichIsA("UIShadow").BlurRadius==UDim.new(0,10))
    elseif phase=="override" then
        dark.BackgroundColor3=Color3.new(1,0,0)
        root:SetAttribute("FramebridgeTheme","Dark");task.wait()
        assert(dark.BackgroundColor3==Color3.new(1,0,0))
        assert(light.BackgroundColor3==Color3.new(0.2,0.25,0.4))
        root:SetAttribute("FramebridgeTheme","Missing");task.wait()
        assert(root:GetAttribute("FramebridgeThemeStatus")=="Unknown theme")
        assert(light.BackgroundColor3==Color3.new(0.2,0.25,0.4))
    else error("Unknown Play QA phase") end
    return {phase=phase,passed=true,theme=root:GetAttribute("FramebridgeTheme")}
end
