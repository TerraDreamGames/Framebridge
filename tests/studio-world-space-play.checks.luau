assert(game.PlaceId==0 and game:GetService('RunService'):IsRunning(),'Blank Play QA only')
local player=game:GetService('Players').LocalPlayer
local gui=player:WaitForChild('PlayerGui')
local checks={}
local function test(name,fn) local ok,why=pcall(fn);table.insert(checks,{name=name,passed=ok,error=not ok and tostring(why) or nil}) end
test('all three world runtimes mount under PlayerGui',function()
    for _,kind in ipairs({'surface','billboard','prompt'}) do
        local root=gui:FindFirstChild('FramebridgeWorld_'..kind);assert(root,'Missing '..kind)
        assert(root.FramebridgeInteractions:GetAttribute('FramebridgeRuntimeStatus')=='Ready','Runtime is not ready: '..kind)
        assert(root.Adornee and root.Adornee:IsDescendantOf(workspace))
    end
end)
test('world canvas has exactly one distance scale',function()
    for _,kind in ipairs({'billboard','prompt'}) do
        local root=gui['FramebridgeWorld_'..kind]
        local canvas=root.WorldCanvas
        assert(canvas.Size==UDim2.fromOffset(280,140),'Authored canvas was converted to viewport scale')
        local count=0;for _,child in ipairs(canvas:GetChildren()) do if child:IsA('UIScale') and child:GetAttribute('FramebridgeWorldHelper') then count+=1 end end
        assert(count==1,'World canvas has duplicated scaling')
        assert(math.abs(canvas.FramebridgeWorldScale.Scale-root.AbsoluteSize.X/280)<0.01,'World scale does not match the billboard bounds')
    end
end)
test('prompt has native action, object and keyboard labels',function()
    local root=gui.FramebridgeWorld_prompt
    assert(root.Enabled,'Prompt did not appear in range')
    local values={};for _,child in ipairs(root:GetDescendants()) do local id=child:GetAttribute('FramebridgeId');if id then values[id]=child end end
    assert(values.action.Text=='Open chest' and values.object.Text=='Supply chest' and values.key.Text=='E','Prompt labels do not match the native prompt')
    assert(values.progress.Size.X.Scale==0 and values.progress.Size.X.Offset==0,'Hold progress was not reset')
end)
return checks
