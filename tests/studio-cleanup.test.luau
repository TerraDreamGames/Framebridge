-- Real Roblox instance data under Lune; no game or user selection is modified.
local fs=require("@lune/fs")
local roblox=require("@lune/roblox")
local serde=require("@lune/serde")
local Http={}
function Http:JSONEncode(value) return serde.encode("json",value) end
function Http:JSONDecode(value) return serde.decode("json",value) end
local running=false
local env=setmetatable({Instance=roblox.Instance,Enum=roblox.Enum,
    game={GetService=function(_,name)
        if name=="HttpService" then return Http end
        if name=="RunService" then return {IsRunning=function() return running end} end
        error(name)
    end},
},{__index=getfenv()})
local function loadModule(path)
    local chunk=assert(loadstring(fs.readFile(path)))
    setfenv(chunk,env)
    return chunk()
end
local Importer=loadModule("plugins/studio/src/Importer.luau")
local Cleanup=loadModule("plugins/studio/src/Cleanup.luau")
local passed=0
local function check(name,body)
    local ok,why=pcall(body)
    assert(ok,name..": "..tostring(why))
    passed+=1
end
local function fixture()
    return {sourceId="cleanup-qa",assets={},roots={{
        id="screen",className="ScreenGui",name="Cleanup QA",properties={},children={
            {id="plain",className="TextButton",name="Plain button",properties={},children={}},
            {id="panel",className="Frame",name="Panel",properties={},children={},behavior={role="panel"}},
        },
    }}}
end
local runtime={version="11",source="-- trusted test runtime"}
local function interactive()
    local pkg=fixture()
    pkg.roots[1].children[1].behavior={action={kind="toggle",target="panel"}}
    return pkg
end
local function history(fail)
    local result={began=0,finished={}}
    function result:TryBeginRecording() self.began+=1;return "recording" end
    function result:FinishRecording(_,operation)
        if fail and operation==roblox.Enum.FinishRecordingOperation.Commit then error("commit failure") end
        table.insert(self.finished,operation)
    end
    return result
end
check("plain buttons and panel roles do not emit scripts",function()
    local pkg=fixture()
    assert(Importer.scriptFeatures(pkg).total==0)
    local stage=Importer.stage(pkg,{},false,runtime,{scripts=true})
    assert(not stage.byId["screen/behavior-runtime"])
    assert(stage.byId.panel.instance:GetAttribute("FramebridgeBehavior")==nil)
    Importer.destroy(stage)
end)
check("script opt-out omits code and interaction attributes, retaining sync",function()
    local pkg=interactive()
    assert(Importer.scriptFeatures(pkg).interactions==1)
    local stage=Importer.stage(pkg,{},false,nil,{scripts=false})
    assert(not stage.byId["screen/behavior-runtime"])
    assert(stage.byId.plain.instance:GetAttribute("FramebridgeBehavior")==nil)
    assert(stage.byId.plain.instance:GetAttribute("FramebridgeId")=="plain")
    Importer.destroy(stage)
end)
check("script opt-in emits only the trusted runtime",function()
    local stage=Importer.stage(interactive(),{},false,runtime,{scripts=true})
    assert(stage.byId["screen/behavior-runtime"].instance.Source:find("require",1,true))
    assert(stage.byId["screen/behavior-runtime/module"].instance.Source:find(runtime.source,1,true))
    Importer.destroy(stage)
end)
check("cleanup deduplicates selections and preserves custom attributes and scripts",function()
    local stage=Importer.stage(fixture(),{},false,nil,{scripts=false})
    local root=stage.roots[1]
    local plain=stage.byId.plain.instance
    plain:SetAttribute("FramebridgeState","hover")
    plain:SetAttribute("FramebridgeRule_old_rule","IF 1")
    plain:SetAttribute("FramebridgeCustomAppData","keep")
    plain:SetAttribute("MyGameId",123)
    local user=roblox.Instance.new("LocalScript");user.Name="FramebridgeInteractions";user.Source="-- custom";user.Parent=plain
    local result=Cleanup.run({root,plain},"unused",history())
    assert(result.roots==1 and result.attributes==2 and #result.scripts==0, string.format("roots=%d attributes=%d scripts=%d",result.roots,result.attributes,#result.scripts))
    assert(plain:GetAttribute("FramebridgeState")==nil and plain:GetAttribute("MyGameId")==123)
    assert(plain:GetAttribute("FramebridgeRule_old_rule")==nil)
    assert(plain:GetAttribute("FramebridgeCustomAppData")=="keep" and user.Parent==plain)
    assert(plain:GetAttribute("FramebridgeId")=="plain")
    Importer.destroy(stage)
end)
check("detach removes all known metadata and generated code without deleting UI",function()
    local stage=Importer.stage(interactive(),{},false,runtime)
    local root=stage.roots[1]
    local script=stage.byId["screen/behavior-runtime"].instance
    local user=roblox.Instance.new("LocalScript");user.Name="GameLogic";user.Parent=stage.byId.plain.instance
    local h=history()
    local result=Cleanup.run({stage.byId.plain.instance},"detach",h)
    assert(result.roots==1 and result.attributes>10 and #result.scripts==1)
    assert(script.Parent==nil and user.Parent==stage.byId.plain.instance)
    for _,v in ipairs({root,stage.byId.plain.instance,stage.byId.panel.instance}) do assert(next(v:GetAttributes())==nil) end
    assert(h.began==1 and h.finished[1]==roblox.Enum.FinishRecordingOperation.Commit)
    script:Destroy();Importer.destroy(stage)
end)
check("active visual features and sync survive unused-data cleanup",function()
    local pkg=fixture()
    pkg.roots[1].children[1].layoutCanvas=true
    pkg.roots[1].children[1].className="ScrollingFrame"
    local stage=Importer.stage(pkg,{},false,runtime)
    local root=stage.roots[1]
    local plan=Cleanup.plan({root},"unused")
    assert(#plan.scripts==0 and plan.attributes==0)
    assert(root:GetAttribute("FramebridgeSource")=="cleanup-qa")
    Importer.destroy(stage)
end)
check("unused scripts with no configured features are removed without detaching sync",function()
    local stage=Importer.stage(fixture(),{},false,nil,{scripts=false})
    local client=roblox.Instance.new("LocalScript")
    client.Name="FramebridgeInteractions";client.Source="-- old unnecessary runtime"
    client:SetAttribute("FramebridgeRuntime","11");client:SetAttribute("FramebridgeGeneratedSource",client.Source)
    client.Parent=stage.roots[1]
    local result=Cleanup.run(stage.roots,"unused",history())
    assert(#result.scripts==1 and client.Parent==nil)
    assert(stage.byId.plain.instance:GetAttribute("FramebridgeId")=="plain")
    client:Destroy();Importer.destroy(stage)
end)
check("edited generated code or custom children protect the entire screen",function()
    for _,kind in ipairs({"source","child"}) do
        local stage=Importer.stage(interactive(),{},false,runtime)
        local script=stage.byId["screen/behavior-runtime"].instance
        if kind=="source" then script.Source..="-- my edit"
        else local user=roblox.Instance.new("ModuleScript");user.Name="MyModule";user.Parent=script end
        local plan=Cleanup.plan(stage.roots,"detach")
        assert(plan.roots==0 and #plan.skipped==1 and #plan.changes==0 and #plan.scripts==0)
        assert(script.Parent==stage.roots[1])
        Importer.destroy(stage)
    end
end)
check("failed history commit rolls back metadata and script parents",function()
    local stage=Importer.stage(interactive(),{},false,runtime)
    local root=stage.roots[1]
    local script=stage.byId["screen/behavior-runtime"].instance
    assert(not pcall(Cleanup.run,{root},"detach",history(true)))
    assert(script.Parent==root and root:GetAttribute("FramebridgeId")=="screen")
    assert(stage.byId.plain.instance:GetAttribute("FramebridgeBehavior"))
    Importer.destroy(stage)
end)
check("turning scripts off during update clears prior runtime and state data",function()
    local pkg=interactive()
    local host=roblox.Instance.new("Folder")
    local stage=Importer.stage(pkg,{},false,runtime)
    local roots=Importer.apply(stage,pkg,host,false)
    local plain=stage.byId.plain.instance
    plain:SetAttribute("FramebridgeState","hover")
    local oldScript=stage.byId["screen/behavior-runtime"].instance
    local nextStage=Importer.stage(pkg,{},false,runtime,{scripts=false})
    Importer.apply(nextStage,pkg,host,true)
    assert(oldScript.Parent==nil and plain:GetAttribute("FramebridgeState")==nil)
    assert(plain:GetAttribute("FramebridgeBehavior")==nil and plain.Parent==roots[1])
    oldScript:Destroy();host:Destroy()
end)
check("cleanup refuses Play mode",function()
    running=true
    assert(not pcall(Cleanup.run,{},"detach",history()))
    running=false
end)
print(serde.encode("json",{cleanup="passed",passed=passed}))
