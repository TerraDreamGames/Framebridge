-- Actual generated source constructors and pinned renderers in native Client Play.
-- Use Activate(format), real pointer/keyboard input, Inspect() and Finish(format).
-- Cleanup() releases only this harness. Stop Play and remove its marked scene in Edit.
assert(game.PlaceId==0 and game:GetService("RunService"):IsClient(),"Blank Client Play QA only")
local Players=game:GetService("Players")
local Http=game:GetService("HttpService")
local player=Players.LocalPlayer
local gui=player:WaitForChild("PlayerGui")
assert(not gui:FindFirstChild("FramebridgeWorldSourcePlayQA"),"Inspect the live source Play harness before restarting")
local scene=workspace:WaitForChild("FramebridgeWorldSourcePlayScene")
assert(scene:GetAttribute("FramebridgeWorldSourcePlayQA"),"The source Play scene is not owned by this harness")
local React=require(script.ReactLua.React)
local ReactRoblox=require(script.ReactLua.ReactRoblox)
local Fusion=require(script.Fusion)
local TsReact=script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"].react)
local TsReactRoblox=script.RbxTsRuntime and require(script.RbxTsRuntime["@rbxts"]["react-roblox"])
assert(TsReact and sourceCases.worldPrompt.tsx,"Generate and compile the JSX fixtures before running Play acceptance")
local folder=Instance.new("Folder")
folder.Name="FramebridgeWorldSourcePlayQA"
folder:SetAttribute("FramebridgeWorldSourcePlayQA",true)
folder.Parent=gui
local camera=workspace.CurrentCamera
local originalCameraType,originalCameraFrame=camera.CameraType,camera.CFrame
camera.CameraType=Enum.CameraType.Scriptable
camera.CFrame=CFrame.lookAt(Vector3.new(0,8,15),Vector3.new(0,6,-7))
local character=player.Character or player.CharacterAdded:Wait()
character:PivotTo(CFrame.new(7,3,0))
local formats={luau=true,fusion=true,react=true,tsx=true}
local kinds={surface="worldSurface",billboard="worldBillboard",prompt="worldPrompt"}
local mounted={}
local report={}
local prompt=scene.prompt.Prompt
local triggerBaseline=0
local active
local function clear()
    prompt.Enabled=false
    for _,value in pairs(mounted) do
        if value.renderer then value.renderer:unmount()
        elseif value.scope then Fusion.doCleanup(value.scope)
        else for _,root in ipairs(value.host:GetChildren()) do root:Destroy() end end
    end
    task.wait(0.05)
    for _,value in pairs(mounted) do
        assert(not value.root or value.root.Parent==nil,"Source teardown retained a GUI root")
        value.host:Destroy()
    end
    table.clear(mounted)
    active=nil
    folder:SetAttribute("Active",nil)
end
local function find(root,id)
    for _,instance in ipairs(root:GetDescendants()) do
        if instance:GetAttribute("FramebridgeId")==id then return instance end
    end
    error("Missing exported layer: "..id)
end
local function activate(format)
    assert(formats[format],"Unknown source format")
    clear()
    for _,kind in ipairs({"surface","billboard","prompt"}) do
        local source=sourceCases[kinds[kind]]
        local host=Instance.new("Folder")
        host.Name=kind
        host.Parent=folder
        local target=kind=="prompt" and prompt or scene[kind]
        local targets={[source.package.roots[1].id]=target}
        local value={host=host,target=target}
        mounted[kind]=value
        if format=="luau" then source.luau()(host,{},targets)
        elseif format=="fusion" then
            value.scope=Fusion.scoped(Fusion)
            for _,root in ipairs(source.fusion()(value.scope,{},targets)) do root.Parent=host end
        else
            local renderer=format=="tsx" and TsReactRoblox or ReactRoblox
            local react=format=="tsx" and TsReact or React
            value.renderer=renderer.createRoot(host)
            value.renderer:render(react.createElement(format=="tsx" and source.tsx().default or source.react(),{Assets={},WorldTargets=targets}))
        end
        task.wait(0.15)
        value.root=assert(host:GetChildren()[1],"Source constructor did not create "..kind)
        assert(value.root.Adornee==scene[kind],"Source constructor did not bind the actual target")
        value.ids={}
        for _,id in ipairs({"action","object","key","progress"}) do value.ids[id]=find(value.root,id) end
        if kind~="prompt" then assert(value.ids.action:IsA("TextButton") and value.ids.object.Visible,"Exported button/action target missing") end
    end
    triggerBaseline=prompt:GetAttribute("QATriggers") or 0
    active=format
    folder:SetAttribute("Active",format)
    prompt.Enabled=true -- Mount external game-prompt UI before enabling it.
    task.wait(0.3)
    assert(mounted.prompt.root.Enabled,"Generated custom UI missed the native PromptShown signal")
    return {format=format,ready=true,triggers=triggerBaseline}
end
local function inspect()
    assert(active,"Activate a renderer first")
    local state={format=active,triggers=(prompt:GetAttribute("QATriggers") or 0)-triggerBaseline,hosts={}}
    for kind,value in pairs(mounted) do
        local root=value.root
        local record={enabled=root.Enabled,objectVisible=value.ids.object.Visible,actionText=value.ids.action.Text,keyText=value.ids.key.Text,progress=value.ids.progress.Size.X.Offset}
        if kind~="surface" then
            record.distanceScale=root.WorldCanvas.FramebridgeWorldScale.Scale
            record.expectedScale=root.AbsoluteSize.X/280
        end
        if kind~="prompt" then
            local worldPoint
            if kind=="surface" then
                worldPoint=scene.surface.CFrame:PointToWorldSpace(Vector3.new(-3+132/280*6,1.5-27/140*3,-0.25))
            else worldPoint=scene.billboard.Position+root.StudsOffsetWorldSpace end
            local point=camera:WorldToViewportPoint(worldPoint)
            if kind=="billboard" then
                point+=Vector3.new((132/280-0.5)*root.AbsoluteSize.X,(27/140-0.5)*root.AbsoluteSize.Y,0)
            end
            record.buttonX=point.X;record.buttonY=point.Y
        end
        state.hosts[kind]=record
    end
    return state
end
local function finish(format)
    assert(active==format,"Finish the currently active renderer")
    local state=inspect()
    for _,kind in ipairs({"surface","billboard"}) do
        assert(not state.hosts[kind].objectVisible,"Real pointer input did not toggle the exported "..kind.." action")
    end
    assert(state.triggers>=1,"Real hold input did not reach the server prompt")
    assert(state.hosts.prompt.progress==0,"Prompt progress did not reset after input ended")
    assert(state.hosts.prompt.actionText==prompt.ActionText and state.hosts.prompt.keyText=="E","Native prompt labels are incorrect")
    for _,kind in ipairs({"billboard","prompt"}) do
        assert(math.abs(state.hosts[kind].distanceScale-state.hosts[kind].expectedScale)<0.01,"World canvas distance scale is incorrect")
    end
    clear()
    state.cleanup=true
    table.insert(report,state)
    folder:SetAttribute("Report",Http:JSONEncode(report))
    folder:SetAttribute("Passed",#report)
    return state
end
local function callable(name,callback)
    local fn=Instance.new("BindableFunction")
    fn.Name=name
    fn.OnInvoke=callback
    fn.Parent=folder
end
callable("Activate",activate)
callable("Inspect",inspect)
callable("Finish",finish)
callable("Cleanup",function()
    clear()
    camera.CameraType=originalCameraType;camera.CFrame=originalCameraFrame
    folder:Destroy()
    return {passed=#report,report=report}
end)
return {installed=true,formats={"luau","fusion","react","tsx"},folder=folder:GetFullName()}
