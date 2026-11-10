assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local qa=assert(_G.FramebridgeFinalTemplateQA,"Run preflight before native UI import")
assert(qa.source==expectedSource,"Unexpected template source")
assert(not qa.captureError,qa.captureError)
local root
for _,n in ipairs(game:GetService("StarterGui"):GetChildren())do
 if n:GetAttribute("FramebridgeSource")==expectedSource and n:GetAttribute("FramebridgeId")==expectedRoot then assert(not root,"Duplicate template roots");root=n end
end
if qaExpectedAbsent then
 assert(not root,"Native Undo must remove imported root")
 return {absent=true,scope="Actual native UI Undo import readback"}
end
assert(root and root:IsA("ScreenGui"),"Actual imported template root missing")
local function byId(id)
 for _,n in ipairs(root:GetDescendants())do if n:GetAttribute("FramebridgeSource")==expectedSource and n:GetAttribute("FramebridgeId")==id then return n end end
end
local widget,caption=assert(byId(expectedWidget)),assert(byId(expectedCaption))
assert(widget:IsA("TextButton") and caption:IsA("TextLabel"),"Editable native widget/caption required")
assert(caption.Text==(qaExpectedUpdated and updatedText or originalText),"Native caption differs from selected original/update checkpoint")
assert(widget:GetAttribute("FramebridgeBehavior") and root:FindFirstChildWhichIsA("LocalScript"),"Trusted generated runtime missing")
if qa.root then
 assert(qa.root==root and qa.widget==widget and qa.caption==caption,"Reimport/Undo changed authored instance identities")
 if qa.script then assert(qa.script.Parent==widget and qa.script.Source==qa.scriptSource,"Custom application script changed")end
else
 qa.root,qa.widget,qa.caption=root,widget,caption;table.insert(qa.roots,root)
end
local generated={}
for _,n in ipairs(root:GetDescendants())do if n:IsA("LuaSourceContainer") and n:GetAttribute("FramebridgeRuntime") then
 assert(n.Source==n:GetAttribute("FramebridgeGeneratedSource"),"Generated script edited")
 generated[n:GetAttribute("FramebridgeId")]=n.Source
end end
assert(next(generated),"No trusted generated source metadata")
if qa.generated then for id,source in pairs(qa.generated)do assert(generated[id]==source,"Reimport/Undo changed generated source")end else qa.generated=generated end
assert(game:GetService("HttpService").HttpEnabled==qa.http,"HTTP changed")
local history
if qaExpectedHistory then
 local events=qa.historyEvents;local undo,redo=events[#events-1],events[#events]
 assert(undo and redo and undo.kind=="undo" and redo.kind=="redo" and undo.ok and redo.ok,"Actual UI Undo/Redo observers missing/failed")
 local a,b=undo.result,redo.result
 if qaExpectedHistory=="import" then assert(not a.present and b.present,"Import Undo/Redo did not remove/restore root")
 elseif qaExpectedHistory=="update" then assert(a.present and a.text==originalText and b.present and b.text==updatedText,"Update Undo/Redo did not restore captions")
 else error("Unknown native history checkpoint")end
 for _,r in ipairs({a,b})do if r.present then assert(r.root==qa.root and r.widget==qa.widget and r.caption==qa.caption and r.sourceExact and r.customScriptPreserved,"Native history lost identities/source/custom script")end end
 history={undoObserved=true,redoObserved=true,undoName=undo.waypoint,redoName=redo.waypoint}
end
return {present=true,updated=qaExpectedUpdated==true,source=expectedSource,caption=caption.Text,root=root.Name,widget=widget.Name,customScriptPreserved=qa.script~=nil,generatedSourceExact=true,nativeHistory=history,scope="Read-only actual native import/reimport/Undo/Redo result; no Importer.apply substitution"}
