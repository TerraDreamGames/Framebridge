local results={}
local function test(name,fn) local ok,err=pcall(fn);table.insert(results,{name=name,passed=ok,error=not ok and tostring(err) or nil}) end
for name,fixture in pairs(fixtures) do
    test(name.." initializer source and stable reimport",function()
        local pkg=Importer.decode(Http:JSONEncode(fixture))
        local destination=Instance.new("Folder")
        local stage=Importer.stage(pkg,{},false,runtime)
        local ok,err=pcall(function()
            local root=stage.roots[1];local id=pkg.roots[1].id.."/behavior-runtime"
            local script=stage.byId[id].instance;local module=stage.byId[id.."/module"].instance
            assert(script.Source==bootstrap and module.Parent==script and module:IsA("ModuleScript"))
            assert(module.Source==moduleSources[name],"Incorrect trusted initializer for "..name)
            assert(module:GetAttribute("FramebridgeGeneratedSource")==module.Source)
            local roots=Importer.apply(stage,pkg,destination,false)
            local app=Instance.new("LocalScript");app.Name="ApplicationLogic";app.Source="-- custom app";app.Parent=root
            local again=Importer.stage(pkg,{},false,runtime)
            local updated,stats=Importer.apply(again,pkg,destination,true)
            assert(updated[1]==root and stats.created==0 and stats.removed==0)
            assert(root.FramebridgeInteractions==script and script.FramebridgeRuntime==module and app.Parent==root)
            local original=module.Source;module.Source..="\n-- authored edit"
            local edited=Importer.stage(pkg,{},false,runtime)
            assert(not pcall(Importer.apply,edited,pkg,destination,true),"Edited initializer overwritten")
            Importer.destroy(edited);module.Source=original
            original=script.Source;script.Source..="\n-- authored bootstrap edit"
            edited=Importer.stage(pkg,{},false,runtime)
            assert(not pcall(Importer.apply,edited,pkg,destination,true),"Edited bootstrap overwritten")
            Importer.destroy(edited);script.Source=original
        end)
        destination:Destroy();Importer.destroy(stage);assert(ok,err)
    end)
end
test("old generated bootstrap migrates with stable identity",function()
    local pkg=Importer.decode(Http:JSONEncode(fixtures.rules));local destination=Instance.new("Folder")
    local stage=Importer.stage(pkg,{},false,runtime);local root=Importer.apply(stage,pkg,destination,false)[1]
    local script=root.FramebridgeInteractions;script.FramebridgeRuntime:Destroy()
    script.Source=runtime.source;script:SetAttribute("FramebridgeGeneratedSource",runtime.source);script:SetAttribute("FramebridgeRuntime","9")
    local again=Importer.stage(pkg,{},false,runtime)
    local ok,result,stats=pcall(Importer.apply,again,pkg,destination,true)
    local stable=ok and result[1]==root and root.FramebridgeInteractions==script and script.Source==bootstrap and script:FindFirstChild("FramebridgeRuntime") and stats.created==1
    destination:Destroy();Importer.destroy(again);assert(stable,"Version9 migration changed generated script identity")
end)
local passed=0;for _,result in ipairs(results)do if result.passed then passed+=1 end end
return Http:JSONEncode({passed=passed,total=#results,results=results})
