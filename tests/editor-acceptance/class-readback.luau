assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local qa=assert(_G.FramebridgeFinalClassQA,"Run class setup first")
assert(not qa.captureError,qa.captureError)
local target=assert(qa.root:FindFirstChild("QA image"),"Actual selected class object missing")
assert(target.ClassName==(qaExpectedClass or "ImageLabel"),"Wrong native class")
assert(qa.corner.Parent==target and qa.caption.Parent==target and qa.script.Parent==target and qa.script.Source==qa.scriptSource,"Conversion lost custom children/script identity")
assert(qa.reference.Parent==qa.caption and qa.reference.Value==target,"Selected-subtree ObjectValue reference not rebound")
assert(qa.externalReference.Parent==qa.root and qa.externalReference.Value==qa.original,"External reference changed outside the selected subtree")
assert(target.Image=="rbxassetid://123456789" and target.ImageColor3==Color3.fromRGB(70,130,220) and target.ScaleType==Enum.ScaleType.Slice and target.SliceCenter==Rect.new(16,16,48,48) and target.SliceScale==.5,"Image appearance/slicing changed")
assert(target.Size==UDim2.fromOffset(80,80) and target.Position==UDim2.fromOffset(20,30) and target:GetAttribute("ApplicationValue")==42 and target:HasTag("FramebridgeFinalClassQA"),"Geometry/attributes/tags changed")
if target:IsA("GuiButton") then assert(target.Active and target.Selectable and not target.AutoButtonColor,"Button input defaults missing")end
if qaExpectedOriginal then assert(target==qa.original,"Native Undo must restore original instance")end
if qaCheckpointKey then local old=qa.checkpoints[qaCheckpointKey];assert(not old or old==target,"Native Redo changed recorded replacement identity");qa.checkpoints[qaCheckpointKey]=target end
qa.targets[target]=true
assert(game:GetService("HttpService").HttpEnabled==qa.http,"HTTP changed")
local selection=game:GetService("Selection"):Get()
local history
if qaExpectedHistory then
 local events=qa.historyEvents;local undo,redo=events[#events-1],events[#events]
 assert(undo and redo and undo.kind=="undo" and redo.kind=="redo" and undo.ok and redo.ok,"Actual UI Undo/Redo observers missing/failed")
 local a,b=undo.result,redo.result
 local undoTarget=qaExpectedHistory=="forward" and qa.original or qa.checkpoints.forward
 local redoTarget=assert(qa.checkpoints[qaExpectedHistory],"Read converted class before history pair")
 assert(a.target==undoTarget and b.target==redoTarget,"Native Undo/Redo changed original/replacement identity")
 for _,r in ipairs({a,b})do assert(r.present and r.children and r.script and r.reference and r.externalReference and r.image and r.geometry and r.attributes,"Native history changed children/scripts/selected refs/external refs/properties")end
 history={undoObserved=true,redoObserved=true,undoName=undo.waypoint,redoName=redo.waypoint}
 if qaExpectedHistory=="forward" then qa.nextCheckpoint="reverse"end
end
return {class=target.ClassName,childrenPreserved=true,scriptPreserved=true,referenceRebound=true,referenceScope="Selected subtree only",externalReferenceUnchanged=true,externalReferenceTargetsCurrent=qa.externalReference.Value==target,imagePropertiesPreserved=true,original=target==qa.original,selected=#selection==1 and selection[1]==target,nativeHistory=history,scope="Read-only actual installed-plugin conversion/Undo/Redo; no ClassTools.run substitution"}
