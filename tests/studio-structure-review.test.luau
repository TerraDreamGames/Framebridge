-- Actual configured packages through the importer. Detached UI, no place mutation.
assert(game.PlaceId==0,"Blank QA only")
local checks={}
local function check(name,callback)
    local ok,why=pcall(callback)
    table.insert(checks,{name=name,passed=ok,error=not ok and tostring(why) or nil})
end
local function instances(roots)
    local found={}
    for _,root in ipairs(roots) do
        for _,v in ipairs(root:GetDescendants()) do
            local id=v:GetAttribute("FramebridgeId")
            if id then found[id]=v end
        end
    end
    return found
end
local host=Instance.new("Folder")
local prepared=Editor.prepare(fixtures.corrected,{mode="offset",layers={}})
local stage=Importer.stage(prepared,{},false,runtimeSource)
local roots=Importer.apply(stage,prepared,host,false)
local ids=instances(roots)
check("accepted container button has one input target and editable label",function()
    assert(ids["ambiguous-button"]:IsA("TextButton"))
    assert(ids["ambiguous-button"].Name=="ClaimButton")
    assert(ids["button-label"]:IsA("TextLabel"))
end)
check("accepted list is native scrolling with a measured gap",function()
    local root=ids["manual-list"]
    assert(root:IsA("ScrollingFrame") and root.ScrollingDirection==Enum.ScrollingDirection.Y and root.AutomaticCanvasSize==Enum.AutomaticSize.Y)
    assert(ids["manual-list/layout"]:IsA("UIListLayout") and ids["manual-list/layout"].Padding==UDim.new(0,12))
    for i=0,2 do assert(ids["card-"..i].LayoutOrder==i+1) end
end)
check("accepted grid has native cells, gaps and row order",function()
    local grid=ids["manual-grid/grid"]
    assert(grid:IsA("UIGridLayout") and grid.CellSize==UDim2.fromOffset(80,80) and grid.CellPadding==UDim2.fromOffset(12,12) and grid.FillDirectionMaxCells==2)
    for i=0,3 do assert(ids["slot-"..i].LayoutOrder==i+1) end
end)
check("scale import retains the measured grid proportions",function()
    local scaled=Editor.prepare(fixtures.corrected,{mode="scale",layers={}})
    local scaledStage=Importer.stage(scaled,{},false,runtimeSource)
    local values=instances(scaledStage.roots)
    local grid=values["manual-grid/grid"]
    local ok=grid:IsA("UIGridLayout") and math.abs(grid.CellSize.X.Scale-0.4)<0.00001 and math.abs(grid.CellPadding.X.Scale-0.06)<0.00001 and grid.CellSize.X.Offset==0 and grid.CellPadding.X.Offset==0
    for _,root in ipairs(scaledStage.roots) do root:Destroy() end
    assert(ok,"Scale import must preserve authored cell and gap proportions")
end)
check("panel intent and vector artwork survive the transfer",function()
    local panel=game:GetService("HttpService"):JSONDecode(ids.panel:GetAttribute("FramebridgeBehavior"))
    assert(panel.role=="panel")
    assert(ids.logo:IsA("ImageLabel") and ids.logo.Image==fixtures.logoImage)
end)
check("matching reimport preserves existing editable children and application scripts",function()
    local label=ids["button-label"]
    local script=Instance.new("LocalScript");script.Name="ApplicationLogic";script.Parent=label
    local next=Importer.stage(prepared,{},false,runtimeSource)
    local updated=Importer.apply(next,prepared,host,true)
    local current=instances(updated)
    assert(current["button-label"]==label and script.Parent==label)
end)
host:Destroy()
check("unaccepted suggestions do not change the imported original",function()
    local original=Editor.prepare(fixtures.original,{mode="offset",layers={}})
    local originalStage=Importer.stage(original,{},false,runtimeSource)
    local values=instances(originalStage.roots)
    assert(values["ambiguous-button"]:IsA("Frame") and values["manual-list"]:IsA("Frame"))
    assert(not values["manual-list/layout"] and not values["manual-grid/grid"])
    for _,root in ipairs(originalStage.roots) do root:Destroy() end
end)
return checks
