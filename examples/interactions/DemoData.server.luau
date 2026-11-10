-- Optional demo data for a blank test place. Your game normally owns its data.
local Players = game:GetService("Players")
local function setup(player)
    local stats = player:FindFirstChild("leaderstats")
    if not stats then stats = Instance.new("Folder"); stats.Name = "leaderstats"; stats.Parent = player end
    if not stats:FindFirstChild("Coins") then
        local coins = Instance.new("IntValue")
        coins.Name = "Coins"
        coins.Value = 1250
        coins.Parent = stats
    end
end
Players.PlayerAdded:Connect(setup)
for _, player in ipairs(Players:GetPlayers()) do setup(player) end
