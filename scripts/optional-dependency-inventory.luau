-- Read-only Studio dependency inspection. No require, source writes, or event firing.
-- Keep the output owner-only. Revision attributes are assertions, not source attestations.
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterPlayer = game:GetService("StarterPlayer")
assert(game.PlaceId == 0, "Run this acceptance inventory in the separate blank place.")
local result = {
	placeId = game.PlaceId,
	jobId = game.JobId,
	nativeExecution = true,
	thirdPartyExecuted = false,
	dependencyAccepted = false,
	templates = {},
	clientCandidates = {},
}
local root = ReplicatedStorage:FindFirstChild("FramebridgeParticleTemplates")
if root then
	for _, template in ipairs(root:GetChildren()) do
		local descendants = template:GetDescendants()
		local emitter = template:FindFirstChild("Emitter")
		local scripts = 0
		for _, child in ipairs(descendants) do
			if child:IsA("LuaSourceContainer") then scripts += 1 end
		end
		table.insert(result.templates, {
			name = template.Name,
			className = template.ClassName,
			contract = template:GetAttribute("FramebridgeEmitter2DContract"),
			clientRevisionAssertion = template:GetAttribute("FramebridgeEmitter2DClientRevision"),
			descendants = #descendants,
			scripts = scripts,
			emitterClass = emitter and emitter.ClassName or nil,
			emitterMarker = emitter and emitter:GetAttribute("ClassName") or nil,
			emitterVersion = emitter and emitter:GetAttribute("Version") or nil,
			withinRuntimeBounds = template:IsA("Folder") and #descendants <= 128 and scripts == 0,
		})
	end
end
for _, location in ipairs({ ReplicatedStorage, StarterPlayer }) do
	for _, candidate in ipairs(location:GetDescendants()) do
		if candidate:IsA("LuaSourceContainer") and string.find(string.lower(candidate.Name), "emitter2d", 1, true) then
			local readable, source = pcall(function() return candidate.Source end)
			table.insert(result.clientCandidates, {
				path = candidate:GetFullName(),
				className = candidate.ClassName,
				disabled = candidate:IsA("BaseScript") and candidate.Disabled or nil,
				sourceReadable = readable,
				sourceBytes = readable and #source or nil,
				exactSourceHashRequired = true,
			})
		end
	end
end
return HttpService:JSONEncode(result)
