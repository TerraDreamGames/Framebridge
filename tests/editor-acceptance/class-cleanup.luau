assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local qa=_G.FramebridgeFinalClassQA;if not qa then return {cleaned=false}end
assert(qa.root:GetAttribute("FramebridgeFinalEditorQA")==true,"QA ownership changed")
qa.historyDisposed=true;for _,c in ipairs(qa.historyConnections)do c:Disconnect()end
local restore=true
for _,n in ipairs(game:GetService("Selection"):Get())do
 local owned=n==qa.root or n:IsDescendantOf(qa.root)
 for target in pairs(qa.targets)do if n==target or n:IsDescendantOf(target)then owned=true end end
 if not owned then restore=false end
end
qa.root:Destroy();for target in pairs(qa.targets)do target:Destroy()end
if restore then local kept={};for _,n in ipairs(qa.selection)do if n.Parent then table.insert(kept,n)end end;game:GetService("Selection"):Set(kept)end
assert(game:GetService("HttpService").HttpEnabled==qa.http,"HTTP changed; inspect before restoring")
_G.FramebridgeFinalClassQA=nil
return {cleaned=true,starterGui=#game:GetService("StarterGui"):GetChildren(),serverStorage=#game:GetService("ServerStorage"):GetChildren(),http=game:GetService("HttpService").HttpEnabled,selectionRestored=restore,scope="Owned current and detached replacement refs removed; native history retained"}
