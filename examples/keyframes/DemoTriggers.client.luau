-- Optional sample logic. Keep application scripts separate from FramebridgeRuntime.
local root=script.Parent
local function id(wanted)
    for _,i in ipairs(root:GetDescendants()) do if i:GetAttribute("FramebridgeId")==wanted then return i end end
end
local selected,attribute=id("selected"),id("attribute")
if selected and selected:IsA("GuiButton") then
    selected.Activated:Connect(function() selected:SetAttribute("FramebridgeSelected",not selected:GetAttribute("FramebridgeSelected")) end)
end
if attribute then
    for pulse=1,3 do
        task.wait(3)
        if not root.Parent or not attribute.Parent then break end
        attribute:SetAttribute("FramebridgeAnimate",pulse)
    end
end
