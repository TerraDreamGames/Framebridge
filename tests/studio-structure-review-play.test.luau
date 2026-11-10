-- Run on the Client after play-setup.luau in the separate blank QA place.
assert(game.PlaceId==0,"Blank QA only")
local host=game:GetService("Players").LocalPlayer.PlayerGui:WaitForChild("FramebridgeStructureReviewQA",5)
local ids={}
for _,v in ipairs(host:GetDescendants()) do
    local id=v:GetAttribute("FramebridgeId")
    if id then ids[id]=v end
end
local checks={}
local function check(name,callback)
    local ok,why=pcall(callback)
    table.insert(checks,{name=name,passed=ok,error=not ok and tostring(why) or nil})
end
local list=ids["manual-list"]
check("reviewed list renders its measured gap and overflowing canvas",function()
    assert(list:IsA("ScrollingFrame") and list.AbsoluteCanvasSize.Y>=168)
    assert(math.abs(ids["card-1"].AbsolutePosition.Y-ids["card-0"].AbsolutePosition.Y-60)<1)
end)
check("reviewed final row remains reachable with native scrolling",function()
    list.CanvasPosition=Vector2.new(0,math.max(0,list.AbsoluteCanvasSize.Y-list.AbsoluteWindowSize.Y))
    game:GetService("RunService").Heartbeat:Wait()
    local last=ids["card-2"]
    assert(last.AbsolutePosition.Y+last.AbsoluteSize.Y<=list.AbsolutePosition.Y+list.AbsoluteWindowSize.Y+1)
end)
check("reviewed grid renders row order, cell size and gap",function()
    local a,b,c,d=ids["slot-0"],ids["slot-1"],ids["slot-2"],ids["slot-3"]
    assert(a.AbsoluteSize==Vector2.new(80,80))
    assert(math.abs(b.AbsolutePosition.X-a.AbsolutePosition.X-92)<1 and math.abs(b.AbsolutePosition.Y-a.AbsolutePosition.Y)<1)
    assert(math.abs(c.AbsolutePosition.Y-a.AbsolutePosition.Y-92)<1 and math.abs(c.AbsolutePosition.X-a.AbsolutePosition.X)<1)
    assert(math.abs(d.AbsolutePosition.X-b.AbsolutePosition.X)<1)
end)
check("reviewed button renders one input target and native label",function()
    local button=ids["ambiguous-button"]
    assert(button:IsA("TextButton") and ids["button-label"]:IsA("TextLabel"))
    local count=0
    for _,v in ipairs(button:GetDescendants()) do if v:IsA("GuiButton") then count+=1 end end
    assert(count==0 and ids["button-label"].Text=="Claim")
end)
return {checks=checks,canvas={list.AbsoluteCanvasSize.X,list.AbsoluteCanvasSize.Y},window={list.AbsoluteWindowSize.X,list.AbsoluteWindowSize.Y}}
