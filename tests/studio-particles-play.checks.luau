assert(game.PlaceId==0,"Particle Play QA requires the approved blank Place1")
local root=game:GetService("Players").LocalPlayer.PlayerGui:WaitForChild("FramebridgeParticleQA")
local button,ambient,external=root.Canvas.CelebrateButton,root.Canvas.Ambient,root.Canvas.External
local function count(node)return node:GetAttribute("FramebridgeParticleCount") or 0 end
return {
    ready=button:GetAttribute("FramebridgeParticlesStatus")=="Ready" and ambient:GetAttribute("FramebridgeParticlesStatus")=="Ready",
    clicked=root:GetAttribute("FramebridgeParticleQAClicks") or 0,
    confetti=count(button),ambient=count(ambient),
    missingDependency=external:GetAttribute("FramebridgeParticlesStatus")=="Missing or mismatched Emitter2D template",
    confettiBound=count(button)<=24,ambientBound=count(ambient)<=12,
    input=button.Active and button.Interactable,
}
