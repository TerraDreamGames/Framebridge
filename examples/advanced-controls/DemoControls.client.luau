-- Optional local example only. Insert inside the imported ScreenGui.
local root=script.Parent
local player=game:GetService("Players").LocalPlayer
local connections={}
local nodes={}
for _,instance in ipairs(root:GetDescendants()) do
    local id=instance:GetAttribute("FramebridgeId")
    if id then nodes[id]=instance end
end
local function connect(signal,fn) table.insert(connections,signal:Connect(fn)) end
local function label(owner,key,target,format)
    local i,text=nodes[owner],nodes[target]
    if not i or not text then return end
    local function refresh() text.Text=format(i:GetAttribute(key)) end
    connect(i:GetAttributeChangedSignal(key),refresh);refresh()
end
player:SetAttribute("Health",75)
label("toggle","FramebridgeValue","toggle-label",function(value) return value and "Toggle: on" or "Toggle: off" end)
label("slider","FramebridgeValue","slider-caption",function(value) return "Slider value: "..tostring(value or 25) end)
label("cooldown","FramebridgeCooldownRemaining","cooldown-label",function(value) return value and value>0 and string.format("Cooldown: %.1fs",value) or "Toggle window" end)
label("skill-one","FramebridgeSkillStatus","skill-one-text",function(value) return "Base: "..tostring(value or "Available") end)
label("skill-two","FramebridgeSkillStatus","skill-two-text",function(value) return "Skill: "..tostring(value or "Locked") end)
label("roulette","FramebridgeRoulettePreview","roulette-text",function(value) return value and "Spin: "..value or "Spin visual roulette" end)
connect(script.Destroying,function() for _,c in ipairs(connections) do c:Disconnect() end;table.clear(connections) end)
