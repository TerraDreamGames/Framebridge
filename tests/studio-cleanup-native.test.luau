-- Run only in the separate Framebridge private QA place, outside the MCP recording.
return function(modules,job,expectedPlaceId)
    assert(type(expectedPlaceId)=="number" and game.PlaceId==expectedPlaceId and game:GetService("RunService"):IsEdit(),"Run only in the explicitly selected QA place")
    local Importer=require(modules.Importer)
    local Cleanup=require(modules.Cleanup)
    local Runtime=require(modules.BehaviorRuntime)
    local history=game:GetService("ChangeHistoryService")
    local selection=game:GetService("Selection")
    local before=selection:Get()
    local roots,views,widgets,controllers={},{},{},{}
    local function fixture()
        return {sourceId="cleanup-native-qa",name="Cleanup QA",instanceCount=3,assets={},issues={},roots={{
            id="screen",className="ScreenGui",name="__FramebridgeCleanupQA",properties={Enabled=false},children={
                {id="button",className="TextButton",name="Button",properties={},children={},behavior={action={kind="toggle",target="panel"}}},
                {id="panel",className="Frame",name="Panel",properties={},children={},behavior={role="panel"}},
            },
        }}}
    end
    local passed,failures=0,{}
    local function check(name,body)
        local ok,why=pcall(body)
        if ok then passed+=1 else table.insert(failures,name..": "..tostring(why)) end
    end
    local runtime={version="11",source="-- Native QA generated runtime"}
    check("native detach, Undo and Redo preserve object identity and user scripts",function()
        local baseline=assert(history:TryBeginRecording("FramebridgeCleanupQASetup","Prepare cleanup QA"))
        local pkg=fixture()
        local stage=Importer.stage(pkg,{},false,runtime,{scripts=true})
        local root=stage.roots[1];table.insert(roots,root);root.Parent=game:GetService("StarterGui")
        local button=stage.byId.button.instance
        local generated=stage.byId["screen/behavior-runtime"].instance
        table.insert(roots,generated)
        local custom=Instance.new("LocalScript");custom.Name="UserLogic";custom.Source="-- application code";custom.Parent=button
        button:SetAttribute("MyGameKey","preserved")
        local old=button:GetAttribute("FramebridgeBehavior")
        history:FinishRecording(baseline,Enum.FinishRecordingOperation.Commit)
        task.wait(.1)
        local result=Cleanup.run({button},"detach",history)
        assert(result.roots==1 and #result.scripts==1 and generated.Parent==nil)
        assert(button:GetAttribute("FramebridgeBehavior")==nil and custom.Parent==button)
        history:Undo();task.wait()
        local restored=assert(root:FindFirstChild("FramebridgeInteractions"),"Undo must restore generated code")
        assert(restored.Source==generated.Source and button:GetAttribute("FramebridgeBehavior")==old and custom.Parent==button,
            string.format("Undo: code=%s attributes=%s custom=%s",tostring(restored.Source==generated.Source),tostring(button:GetAttribute("FramebridgeBehavior")==old),tostring(custom.Parent==button)))
        history:Redo();task.wait()
        assert(not root:FindFirstChild("FramebridgeInteractions") and button:GetAttribute("FramebridgeId")==nil and button:GetAttribute("MyGameKey")=="preserved")
        assert(custom.Parent==button and custom.Source=="-- application code")
    end)
    check("native update with script consent off removes prior code and state attributes",function()
        local pkg=fixture()
        local stage=Importer.stage(pkg,{},false,runtime)
        local host=Instance.new("Folder");host.Name="__FramebridgeCleanupImportQA";host.Parent=game:GetService("ServerStorage");table.insert(roots,host)
        Importer.apply(stage,pkg,host,false)
        local button=stage.byId.button.instance
        button:SetAttribute("FramebridgeState","hover")
        local client=stage.byId["screen/behavior-runtime"].instance;table.insert(roots,client)
        local nextStage=Importer.stage(pkg,{},false,runtime,{scripts=false})
        Importer.apply(nextStage,pkg,host,true)
        assert(client.Parent==nil and button:GetAttribute("FramebridgeState")==nil and button:GetAttribute("FramebridgeBehavior")==nil)
    end)
    check("plain native buttons add no state subscriptions or state attributes",function()
        local counts={}
        for _,class in ipairs({"TextLabel","TextButton"}) do
            local pkg=fixture()
            for index=1,100 do table.insert(pkg.roots[1].children,{id="plain"..index,className=class,name="Plain "..index,properties={},children={}}) end
            local stage=Importer.stage(pkg,{},false,runtime)
            table.insert(roots,stage.roots[1])
            local controller=Runtime.mount(stage.roots[1]);table.insert(controllers,controller)
            counts[class]=controller.connectionCount()
            for index=1,100 do assert(stage.byId["plain"..index].instance:GetAttribute("FramebridgeState")==nil) end
            controller.destroy()
        end
        assert(counts.TextLabel==counts.TextButton,string.format("Button listeners: %d vs label listeners %d",counts.TextButton,counts.TextLabel))
        job:SetAttribute("PlainButtonConnections",counts.TextButton)
    end)
    check("native React view exposes script consent and cleanup without clipped controls",function()
        local View=require(modules.View)
        local native=PluginManager():CreatePlugin()
        local widget=native:CreateDockWidgetPluginGuiAsync("FramebridgeCleanupNativeQA",DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float,false,true,440,700,360,480))
        table.insert(widgets,widget)
        widget.ZIndexBehavior=Enum.ZIndexBehavior.Sibling
        local pkg=fixture()
        local state={package=pkg,scriptFeatures=Importer.scriptFeatures(pkg),bindings={},editor={mode="source",layers={}},editorNotices={},
            status="Cleanup QA",busy=false,addScripts=false,recent={},selection={count=0,descendants=0,total=0},classPreview={count=0,losses={}},
            cleanup={roots=1,attributes=8,scripts=1,bytes=400,skipped={}},cleanupMode="unused",worldSelection={}}
        local actions=setmetatable({missing=function() return 0 end,resolved=function() return true end},{__index=function() return function() end end})
        local view=View.mount(widget,Importer,actions);table.insert(views,view)
        widget.Enabled=true;view.render(state);task.wait(.3)
        local toggle=assert(widget:FindFirstChild("AddGeneratedScripts",true))
        assert(toggle.AbsoluteSize.X>250 and toggle.AbsoluteSize.Y>20)
        view.selectTab("Tools");task.wait(.3)
        local clean=assert(widget:FindFirstChild("CleanFramebridgeData",true))
        assert(clean.AbsoluteSize.X>250 and clean.TextFits)
        state.cleanupMode="detach";view.render(state);task.wait(.3)
        assert(clean.Text=="Detach UI from Framebridge" and clean.TextFits)
    end)
    for _,controller in ipairs(controllers) do pcall(controller.destroy) end
    for _,view in ipairs(views) do pcall(view.destroy) end
    for _,widget in ipairs(widgets) do widget:Destroy() end
    for _,root in ipairs(roots) do root:Destroy() end
    local restored={};for _,instance in ipairs(before) do if instance.Parent then table.insert(restored,instance) end end
    selection:Set(restored)
    job:SetAttribute("Report",game:GetService("HttpService"):JSONEncode({passed=passed,failed=#failures,failures=failures}))
    job:SetAttribute("Status",#failures==0 and "Passed" or "Failed")
end
