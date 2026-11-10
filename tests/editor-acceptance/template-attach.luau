assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
local qa=assert(_G.FramebridgeFinalTemplateQA)
assert(qa.source==expectedSource and qa.root and qa.root.Parent==game:GetService("StarterGui") and not qa.script,"Read first imported template before attaching owned QA script")
local app=Instance.new("LocalScript");app.Name="Framebridge template QA custom application"
app.Source="-- Owned acceptance attachment; this source must survive reimport and Undo."
app:SetAttribute("FramebridgeFinalEditorQA",true);app.Parent=qa.widget
qa.script,qa.scriptSource=app,app.Source
return {attached=true,scope="Owned custom-script preservation setup; no generated source changes"}
