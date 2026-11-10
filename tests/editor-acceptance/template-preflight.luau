assert(game.PlaceId==0 and game:GetService("RunService"):IsEdit(),"Approved blank Place1 Edit only")
assert(not _G.FramebridgeFinalTemplateQA,"Inspect/clean previous template QA first")
local starter,storage=game:GetService("StarterGui"),game:GetService("ServerStorage")
assert(#starter:GetChildren()==0 and #storage:GetChildren()==0,"Blank QA containers required")
local qa={source=expectedSource,selection=game:GetService("Selection"):Get(),http=game:GetService("HttpService").HttpEnabled,roots={}}
_G.FramebridgeFinalTemplateQA=qa
local function snapshot()
 local root
 for _,n in ipairs(starter:GetChildren())do if n:GetAttribute("FramebridgeSource")==expectedSource and n:GetAttribute("FramebridgeId")==expectedRoot then assert(not root,"Duplicate imported roots");root=n end end
 if not root then return {present=false}end
 local widget,caption;local exact=true;local generated={}
 for _,n in ipairs(root:GetDescendants())do
  if n:GetAttribute("FramebridgeSource")==expectedSource then
   local id=n:GetAttribute("FramebridgeId")
   if id==expectedWidget then widget=n elseif id==expectedCaption then caption=n end
   if n:IsA("LuaSourceContainer") and n:GetAttribute("FramebridgeRuntime") then
    generated[id]=n.Source
    exact=exact and n.Source==n:GetAttribute("FramebridgeGeneratedSource") and (not qa.generated or qa.generated[id]==n.Source)
   end
  end
 end
 if qa.generated then for id,source in pairs(qa.generated)do exact=exact and generated[id]==source end end
 assert(widget and caption,"Native history lost authored layers")
 return {present=true,root=root,widget=widget,caption=caption,text=caption.Text,sourceExact=exact,generated=generated,
  customScriptPreserved=not qa.script or qa.script.Parent==widget and qa.script.Source==qa.scriptSource}
end
observeNativeHistory(qa,snapshot)
table.insert(qa.historyConnections,starter.ChildAdded:Connect(function(root)
 if root:GetAttribute("FramebridgeSource")~=expectedSource or root:GetAttribute("FramebridgeId")~=expectedRoot then return end
 if not table.find(qa.roots,root)then table.insert(qa.roots,root)end
 task.defer(function()
  if qa.historyDisposed or qa.root then return end
  local ok,result=pcall(snapshot)
  if not ok or not result.present then qa.captureError=tostring(result);return end
  qa.root,qa.widget,qa.caption,qa.generated=result.root,result.widget,result.caption,result.generated
 end)
end))
return {prepared=true,source=expectedSource,scope="Next import must use actual Studio plugin Open package/Import controls"}
