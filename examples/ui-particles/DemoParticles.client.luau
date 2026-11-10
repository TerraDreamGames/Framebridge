-- Optional application example. Attach under the imported ScreenGui in PlayerGui.
local root=script.Parent
local celebrate,external
for _,node in ipairs(root:GetDescendants())do
    if node:GetAttribute("FramebridgeId")=="celebrate" then celebrate=node end
    if node:GetAttribute("FramebridgeId")=="external" then external=node end
end
assert(celebrate,"Example Celebrate node missing")
local function signal(node,attribute)
    node:SetAttribute(attribute,(node:GetAttribute(attribute) or 0)+1)
end
-- An application event can call these; native Activated bursts already work.
local function burst()signal(celebrate,"FramebridgeParticleBurst")end
local function cancel()signal(celebrate,"FramebridgeParticlesClear")end
local function retryInstalledEngine()
    if external then signal(external,"FramebridgeParticlesRetry") end
end
-- Brief application-driven demonstration; cancellation stops live particles.
task.wait(1);burst();task.wait(.2);cancel()
-- After your reviewed Emitter2D client/template becomes available:
-- retryInstalledEngine()
