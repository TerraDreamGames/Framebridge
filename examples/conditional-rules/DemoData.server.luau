-- Demonstration game data. Review and replace with your application's own logic.
local Players=game:GetService("Players")
local function configure(player)
    local stats=player:FindFirstChild("leaderstats")
    if not stats then stats=Instance.new("Folder");stats.Name="leaderstats";stats.Parent=player end
    if not stats:FindFirstChild("Coins") then local coins=Instance.new("IntValue");coins.Name="Coins";coins.Value=150;coins.Parent=stats end
    if player:GetAttribute("Ready")==nil then player:SetAttribute("Ready",true) end
    if player:GetAttribute("VIP")==nil then player:SetAttribute("VIP",false) end
end
Players.PlayerAdded:Connect(configure)
for _,player in ipairs(Players:GetPlayers())do configure(player)end
