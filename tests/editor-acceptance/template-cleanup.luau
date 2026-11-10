assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local qa=_G.FramebridgeFinalTemplateQA
if not qa then return {cleaned=false,scope="No owned template fixture"}end
assert(qa.source==expectedSource,"Unexpected QA owner")
qa.historyDisposed=true;for _,c in ipairs(qa.historyConnections)do c:Disconnect()end
local selection=game:GetService("Selection"):Get();local restore=true
for _,n in ipairs(selection)do
 local owned=false;for _,root in ipairs(qa.roots)do if n==root or n:IsDescendantOf(root) then owned=true end end
 if not owned then restore=false end
end
for _,root in ipairs(qa.roots)do assert(root:GetAttribute("FramebridgeSource")==expectedSource,"Owned root source changed");root:Destroy()end
if restore then local kept={};for _,n in ipairs(qa.selection)do if n.Parent then table.insert(kept,n)end end;game:GetService("Selection"):Set(kept)end
assert(game:GetService("HttpService").HttpEnabled==qa.http,"HTTP changed; inspect before restoring")
_G.FramebridgeFinalTemplateQA=nil
return {cleaned=true,starterGui=#game:GetService("StarterGui"):GetChildren(),serverStorage=#game:GetService("ServerStorage"):GetChildren(),http=game:GetService("HttpService").HttpEnabled,selectionRestored=restore,scope="Removed only exact owned root refs; native history retained"}
