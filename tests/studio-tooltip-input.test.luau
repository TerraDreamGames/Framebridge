assert(game.PlaceId==0,"Approved blank Place1 only")
local Http=game:GetService("HttpService")
local passed,failures=0,{}
local function withFixture(body)
    local root=Instance.new("ScreenGui");root:SetAttribute("FramebridgeSource","FramebridgeTooltipInputQA")
    local parent=Instance.new("Frame");parent.Parent=root
    local owner=Instance.new("TextButton");owner.Active=true;owner.Interactable=true;owner.Parent=parent
    local panel=Instance.new("Frame");panel.Visible=true;panel.Parent=parent
    owner:SetAttribute("FramebridgeId","tip");owner:SetAttribute("FramebridgeSource","FramebridgeTooltipInputQA")
    owner:SetAttribute("FramebridgeBehavior",Http:JSONEncode({control={kind="tooltip",target="tooltip",delay=.2}}))
    panel:SetAttribute("FramebridgeId","tooltip");panel:SetAttribute("FramebridgeSource","FramebridgeTooltipInputQA")
    panel:SetAttribute("FramebridgeBehavior",Http:JSONEncode({role="panel"}))
    local c
    local ok,why=xpcall(function()c=Runtime.mount(root,{manualControls=true});body(c,owner,panel,parent,root)end,debug.traceback)
    local disposed,disposeWhy=pcall(function()if c then c.destroy();assert(c.connectionCount()==0,"Runtime subscriptions leaked")end end)
    root:Destroy();assert(disposed,disposeWhy);assert(ok,why)
end
local touch={UserInputType=Enum.UserInputType.Touch}
local function test(name,fn)local ok,why=xpcall(fn,debug.traceback);if ok then passed+=1 else table.insert(failures,name..": "..tostring(why))end end
test("primed focus then first Touch opens at deadline and second Touch dismisses",function()withFixture(function(c,o,p)
    assert(c.focusTooltip("tip",true));c.stepControls(.05);assert(not p.Visible)
    assert(c.activate("tip",touch));c.stepControls(.19);assert(not p.Visible);c.stepControls(.01);assert(p.Visible,"First touch canceled primed focus")
    assert(c.activate("tip",touch));assert(not p.Visible);c.stepControls(.2);assert(not p.Visible)
    assert(c.activate("tip",touch));c.stepControls(.2);assert(p.Visible)
end)end)
for _,gate in ipairs({"Active","Interactable","Visible","ancestor","root"})do
    test(gate.." clears touch intent before re-enable",function()withFixture(function(c,o,p,parent,root)
        assert(c.activate("tip",touch));c.stepControls(.2);assert(p.Visible)
        if gate=="ancestor"then parent.Visible=false elseif gate=="root"then root.Enabled=false else o[gate]=false end
        c.stepControls(.1);assert(not p.Visible and not c.activate("tip",touch))
        o.Active=true;o.Interactable=true;o.Visible=true;parent.Visible=true;root.Enabled=true
        assert(c.activate("tip",touch));c.stepControls(.2);assert(p.Visible)
    end)end)
end
test("explicit focus cancellation and nil activation remain supported",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));c.stepControls(.2);assert(p.Visible)
    assert(c.focusTooltip("tip",false));assert(not p.Visible)
    assert(c.activate("tip"));c.stepControls(.2);assert(p.Visible)
    assert(c.activate("tip"));assert(not p.Visible)
end)end)
test("destroy preserves an external target edit and disconnects",function()withFixture(function(c,o,p)
    assert(c.activate("tip",touch));c.stepControls(.2);assert(p.Visible)
    p.Visible=false;task.wait();c.destroy();assert(c.connectionCount()==0 and not p.Visible)
    assert(o:GetAttribute("FramebridgeTooltipVisible")==nil and not c.activate("tip",touch))
end)end)
return {passed=passed,failed=#failures,failures=failures,scope="Actual generated runtime on detached native GuiObjects with controller calls and typed Touch stub",nativeTouchPresentationAccepted=false,ownedRootsDestroyed=true}
