assert(game.PlaceId==0,"Only the approved blank QA place")
local state=assert(_G.FramebridgeMaskQA,"Run mask Play setup first")
local Run=game:GetService("RunService")
local passed,failures=0,{}
local function test(name,body)
 local ok,why=pcall(body);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end
end
for name,byId in pairs(state.cases)do
 test("rendered geometry: "..name,function()
  local prefix=string.lower(string.sub(name,5))
  local clip,content,outside=byId[prefix..":mask"].instance,byId[prefix..":content"].instance,byId[prefix..":outside"].instance
  assert(clip.AbsoluteSize.X>0 and clip.AbsoluteSize.Y>0)
  local original=content.AbsolutePosition-outside.AbsolutePosition
  assert(math.abs(original.X)<0.1 and math.abs(original.Y)<0.1,"Reparenting changed global content position")
  assert(clip.AbsolutePosition.X>outside.AbsolutePosition.X or prefix=="scroll")
  assert(clip:FindFirstChildOfClass("UICorner") and clip.ClipsDescendants)
 end)
end
test("native masked scrolling list reaches its last item",function()
 local byId=state.cases.maskScroll
 local view=byId["scroll:viewport"].instance;local row=byId["scroll:row-11"].instance
 for _=1,4 do Run.RenderStepped:Wait()end
 local bottom=view.AbsoluteCanvasSize.Y-view.AbsoluteWindowSize.Y
 assert(bottom>100,"Expected overflow")
 view.CanvasPosition=Vector2.new(0,bottom)
 for _=1,3 do Run.RenderStepped:Wait()end
 assert(row.AbsolutePosition.Y>=view.AbsolutePosition.Y-0.5 and row.AbsolutePosition.Y+row.AbsoluteSize.Y<=view.AbsolutePosition.Y+view.AbsoluteWindowSize.Y+0.5,"Last item is not reachable")
 local initial=view.AbsoluteCanvasSize.Y
 local extra=Instance.new("Frame");extra.Name="RuntimeRow";extra.Size=UDim2.new(1,0,0,28);extra.LayoutOrder=100;extra.Parent=byId["scroll:items"].instance
 for _=1,4 do Run.RenderStepped:Wait()end
 assert(view.AbsoluteCanvasSize.Y>initial,"Canvas did not grow after runtime insertion")
 extra:Destroy();for _=1,4 do Run.RenderStepped:Wait()end
 assert(math.abs(view.AbsoluteCanvasSize.Y-initial)<0.5,"Canvas did not shrink after removal")
 view.CanvasPosition=Vector2.zero
end)
return {passed=passed,failed=#failures,failures=failures,scope="Actual Roblox layout and scrolling under CanvasGroup; rendered mask pixels still require visual acceptance"}
