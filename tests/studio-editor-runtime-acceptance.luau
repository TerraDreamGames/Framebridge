-- Generated wrapper supplies Importer, Editor, Runtime, packageJson and runtimeSource.
-- Root explicitly chooses setup/check/cleanup. No existing QA root is imported or updated.
local phase=qaPhase or "check"
local Run=game:GetService("RunService")
local Http=game:GetService("HttpService")
local Selection=game:GetService("Selection")
local SOURCE="Framebridge-editor-runtime-QA-20261005"
local NAME="FramebridgeEditorRuntimeQA"
local KEY="FramebridgeEditorRuntimeQA20261005"
assert(game.PlaceId==79318715690547,"Only the authorized private QA place may execute this harness")
local pkg=Importer.decode(packageJson)
assert(pkg.sourceId==SOURCE,"Unexpected fixture source")
local function equal(a,b)
    if typeof(a)~=typeof(b) then return false end
    if typeof(a)~="table" then return a==b end
    for k,v in pairs(a) do if not equal(v,b[k]) then return false end end
    for k in pairs(b) do if a[k]==nil then return false end end
    return true
end
local function capture(roots)
    local result={}
    for _,root in ipairs(roots) do
        local objects={root};for _,i in ipairs(root:GetDescendants()) do table.insert(objects,i) end
        for _,i in ipairs(objects) do
            result[i]={parent=i.Parent,name=i.Name,class=i.ClassName,attributes=i:GetAttributes(),source=i:IsA("LuaSourceContainer") and i.Source or nil,baseScript=i:IsA("BaseScript"),disabled=i:IsA("BaseScript") and i.Disabled}
        end
    end
    return result
end
local function preserved(snapshot)
    local count=0
    for i,v in pairs(snapshot) do
        assert(i.Parent==v.parent and i.Name==v.name and i.ClassName==v.class and equal(i:GetAttributes(),v.attributes),"An existing QA object changed")
        if v.source~=nil then assert(i.Source==v.source,"Existing application/generated source changed") end
        if v.baseScript then assert(i.Disabled==v.disabled,"Existing script Disabled changed") end
        count+=1
    end
    return count
end
if phase=="setup" then
    assert(not Run:IsRunning() and Run:IsEdit(),"Stop Play before setup")
    assert(_G[KEY]==nil,"Owned harness already active; cleanup first")
    local destination=game:GetService("StarterGui")
    assert(not destination:FindFirstChild(NAME),"QA name collision")
    for _,a in ipairs(pkg.assets) do assert(a.robloxId and Importer.assetId(a.robloxId),"Provide real seven-asset IDs before native setup") end
    local roots=destination:GetChildren();local baseline=capture(roots)
    local previousSelection=Selection:Get()
    local stage
    local ok,why=pcall(function()
        local prepared=Editor.prepare(pkg,{mode="scale",layers={}})
        stage=Importer.stage(prepared,{},false,runtimeSource)
        local created=Importer.apply(stage,prepared,destination,false)
        assert(#created==1 and created[1]:IsA("ScreenGui"))
        local root=created[1];root.Name=NAME;root.DisplayOrder=10000
        root:SetAttribute("FramebridgeEditorRuntimeQA",true)
        for _,i in ipairs(root:GetDescendants()) do if i:IsA("BaseScript") then i.Disabled=true end end
        _G[KEY]={root=root,roots=roots,baseline=baseline,selection=previousSelection,http=Http.HttpEnabled}
        assert(equal(Selection:Get(),previousSelection),"Setup changed Selection")
        preserved(baseline)
    end)
    if not ok then if stage then Importer.destroy(stage) end;error(why,0) end
    return {phase=phase,source=SOURCE,assets=#pkg.assets,existingObjects=preserved(baseline),scope="Current importer/Scale setup only; native installed controls and pixels require separate execution"}
elseif phase=="cleanup" then
    assert(not Run:IsRunning() and Run:IsEdit(),"Stop Play before cleanup")
    local saved=assert(_G[KEY],"No owned setup receipt in this Edit process")
    assert(saved.root:GetAttribute("FramebridgeSource")==SOURCE and saved.root:GetAttribute("FramebridgeEditorRuntimeQA")==true,"Owned root identity changed")
    local before=preserved(saved.baseline)
    local selected=Selection:Get();local owned=true
    for _,i in ipairs(selected) do if i~=saved.root and not i:IsDescendantOf(saved.root) then owned=false end end
    saved.root:Destroy()
    if owned then Selection:Set(saved.selection) end
    local now=game:GetService("StarterGui"):GetChildren()
    assert(#now==#saved.roots,"Unexpected StarterGui roots after cleanup")
    for _,root in ipairs(saved.roots) do assert(table.find(now,root),"Original root identity lost") end
    assert(Http.HttpEnabled==saved.http,"HTTP setting changed")
    preserved(saved.baseline);_G[KEY]=nil
    return {phase=phase,preservedObjects=before,ownedRootRemoved=true,httpPreserved=true,scope="Original hierarchy/name/attributes/script Source/Disabled and exact StarterGui root references; unrelated property writers not audited"}
end
assert(phase=="check" and Run:IsRunning() and Run:IsClient(),"Run check only on the ordinary Play client")
local player=assert(game:GetService("Players").LocalPlayer)
local root=assert(player:WaitForChild("PlayerGui"):WaitForChild(NAME,10),"Owned GUI not cloned into client")
assert(root:GetAttribute("FramebridgeSource")==SOURCE)
local byId={};for _,i in ipairs(root:GetDescendants()) do local id=i:GetAttribute("FramebridgeId");if id then byId[id]=i end end
local report={phase=phase,passed=0,failed=0,checks={},assets={},samples={},scope="Actual engine layout and trusted manual controller; no physical input, installed-plugin UI, published-player or pixel-readback claim"}
local function check(name,body)
    local ok,detail=pcall(body)
    table.insert(report.checks,{name=name,passed=ok,detail=not ok and tostring(detail) or nil})
    if ok then report.passed+=1 else report.failed+=1 end
end
local ownedFrame=assert(byId["editor-runtime"])
local oldSize=ownedFrame.Size;ownedFrame.Size=UDim2.fromOffset(640,520)
local function settle() for _=1,4 do Run.RenderStepped:Wait() end end
local loadedProbes={}
check("seven genuine linked texture loads",function()
    local preload={}
    assert(root.AbsoluteSize.X>=40 and root.AbsoluteSize.Y>=40,"A visible viewport is required for texture evidence")
    local columns=math.max(1,math.min(7,math.floor(root.AbsoluteSize.X/40)))
    for index,a in ipairs(pkg.assets) do
        local probe=Instance.new("ImageLabel");probe.Size=UDim2.fromOffset(32,32)
        probe.Position=UDim2.fromOffset(4+((index-1)%columns)*40,4+math.floor((index-1)/columns)*40)
        probe.BackgroundTransparency=1;probe.BorderSizePixel=0;probe.ZIndex=10000;probe.Visible=true
        probe.Image=Importer.assetId(a.robloxId);probe.Parent=root
        table.insert(loadedProbes,probe);table.insert(preload,probe)
    end
    settle()
    local statuses={}
    game:GetService("ContentProvider"):PreloadAsync(preload,function(id,status) statuses[id]=status.Name end)
    local deadline=os.clock()+8
    repeat
        settle()
        local ready=true;for _,probe in ipairs(loadedProbes) do if not probe.IsLoaded then ready=false end end
        if ready then break end
    until os.clock()>=deadline
    for index,a in ipairs(pkg.assets) do
        local probe=loadedProbes[index]
        table.insert(report.assets,{id=a.id,content=probe.Image,loaded=probe.IsLoaded,status=statuses[probe.Image],expectedPixels=a.pixelSize})
        assert(probe.IsLoaded,"Image did not load: "..a.id)
    end
end)
for _,case in ipairs({{"vertical","item-4","Y"},{"horizontal","card-3","X"},{"grid","cell-11","Y"}}) do
    local scroll,last,axis=assert(byId[case[1]]),assert(byId[case[2]]),case[3]
    local originalSize,originalPosition=scroll.Size,scroll.CanvasPosition
    check(case[1].." initial/shrink/grow last-item reachability",function()
        assert(scroll:IsA("ScrollingFrame") and scroll.ScrollingEnabled and scroll.ClipsDescendants)
        for _,factor in ipairs({1,.75,1.15,1}) do
            scroll.Size=UDim2.new(originalSize.X.Scale*factor,originalSize.X.Offset*factor,originalSize.Y.Scale*factor,originalSize.Y.Offset*factor)
            scroll.CanvasPosition=Vector2.zero;settle()
            local before=last.AbsolutePosition[axis]
            assert(scroll.AbsoluteCanvasSize[axis]>scroll.AbsoluteWindowSize[axis],"Expected overflowing content")
            scroll.CanvasPosition=axis=="Y" and Vector2.new(0,scroll.AbsoluteCanvasSize.Y) or Vector2.new(scroll.AbsoluteCanvasSize.X,0)
            settle()
            local start=scroll.AbsolutePosition[axis];local finish=start+scroll.AbsoluteWindowSize[axis]
            assert(last.AbsolutePosition[axis]<before,"Content did not scroll")
            assert(last.AbsolutePosition[axis]>=start-1 and last.AbsolutePosition[axis]+last.AbsoluteSize[axis]<=finish+1,"Last item not entirely reachable")
            table.insert(report.samples,{id=case[1],factor=factor,axis=axis,canvas=scroll.AbsoluteCanvasSize[axis],window=scroll.AbsoluteWindowSize[axis],position=scroll.CanvasPosition[axis],lastStart=last.AbsolutePosition[axis],lastEnd=last.AbsolutePosition[axis]+last.AbsoluteSize[axis],viewportStart=start,viewportEnd=finish})
        end
    end)
    scroll.Size=originalSize;scroll.CanvasPosition=originalPosition
    if case[1]~="grid" then check(case[1].." custom native image bindings",function()
        for _,key in ipairs({"TopImage","MidImage","BottomImage"}) do
            local ref=scroll:GetAttribute("FramebridgeAsset_"..key);local expected
            for _,a in ipairs(pkg.assets) do if a.id==ref then expected=Importer.assetId(a.robloxId) end end
            assert(expected and scroll[key]==expected,"Native custom scrollbar image binding lost")
        end
        assert(scroll.ScrollBarThickness==8 and scroll.ScrollBarImageTransparency==0)
    end) end
end
local slice=assert(byId["slice-art"]);local originalSliceSize=slice.Size
check("native Slice guides/border scale survive two rendered sizes",function()
    assert(slice.ScaleType==Enum.ScaleType.Slice and slice.SliceCenter==Rect.new(16,16,48,48) and slice.SliceScale==.5)
    for _,dimensions in ipairs({{300,96},{320,120}}) do
        slice.Size=UDim2.fromOffset(dimensions[1],dimensions[2]);settle()
        assert(slice.IsLoaded and slice.AbsoluteSize==Vector2.new(dimensions[1],dimensions[2]))
        assert(slice.SliceCenter==Rect.new(16,16,48,48) and slice.SliceScale==.5)
    end
end)
slice.Size=originalSliceSize;settle()
local runtime
check("fractional slider bounds and window clamp under resized parent",function()
    runtime=Runtime.mount(root,{player=player,manualControls=true})
    local slider=assert(byId.slider)
    assert(runtime.setSliderRatio("slider",.83) and math.abs(slider:GetAttribute("FramebridgeValue")-.2)<.000001)
    assert(runtime.setSliderRatio("slider",2) and math.abs(slider:GetAttribute("FramebridgeValue")-.3)<.000001)
    assert(runtime.setSliderRatio("slider",-1) and math.abs(slider:GetAttribute("FramebridgeValue")+.3)<.000001)
    local window=assert(byId.window);local original=window.Position
    for _,width in ipairs({640,560}) do
        ownedFrame.Size=UDim2.fromOffset(width,520);settle()
        assert(runtime.moveWindow("window",10000,10000));settle()
        assert(window.AbsolutePosition.X>=ownedFrame.AbsolutePosition.X-1 and window.AbsolutePosition.Y>=ownedFrame.AbsolutePosition.Y-1)
        assert(window.AbsolutePosition.X+window.AbsoluteSize.X<=ownedFrame.AbsolutePosition.X+ownedFrame.AbsoluteSize.X+1)
        assert(window.AbsolutePosition.Y+window.AbsoluteSize.Y<=ownedFrame.AbsolutePosition.Y+ownedFrame.AbsoluteSize.Y+1)
        assert(runtime.moveWindow("window",-10000,-10000));settle()
        assert(window.AbsolutePosition.X>=ownedFrame.AbsolutePosition.X-1 and window.AbsolutePosition.Y>=ownedFrame.AbsolutePosition.Y-1)
    end
    runtime.destroy();assert(runtime.connectionCount()==0 and window.Position==original,"Teardown failed to restore owned Position")
end)
if runtime then runtime.destroy() end
for _,probe in ipairs(loadedProbes) do probe:Destroy() end
ownedFrame.Size=UDim2.fromOffset(640,520);slice.Size=UDim2.fromOffset(300,96);settle()
-- Deterministic screenshot oracle; sampling pixels is performed by root separately.
local colors={{236,86,102},{244,167,72},{245,213,78},{74,189,146},{67,115,219},{180,102,213},{64,191,207},{122,142,158},{219,117,174}}
report.pixelOracle={id="slice-art",position={slice.AbsolutePosition.X,slice.AbsolutePosition.Y},size={slice.AbsoluteSize.X,slice.AbsoluteSize.Y},borderPixels=8,points={}}
for row=0,2 do for col=0,2 do
    local x=({4,150,296})[col+1];local y=({4,48,92})[row+1]
    table.insert(report.pixelOracle.points,{x=slice.AbsolutePosition.X+x,y=slice.AbsolutePosition.Y+y,rgb=colors[row*3+col+1]})
end end
report.originalFrameSize={oldSize.X.Scale,oldSize.X.Offset,oldSize.Y.Scale,oldSize.Y.Offset}
report.cleanup="Stop Play, then run the same harness with qaPhase='cleanup'; keep this client visible only for root pixel capture"
return report
