-- Independent rbx-dom model deserializer, not the product serializer.
local fs=require("@lune/fs")
local serde=require("@lune/serde")
local r=require("@lune/roblox")
local pkg=serde.decode("json",fs.readFile(qaOutput.."/editor.framebridge.json"))
local roots=r.deserializeModel(fs.readFile(qaOutput.."/Editor.rbxmx"))
local nodes={}
for _,root in ipairs(roots) do for _,i in ipairs(root:GetDescendants()) do local id=i:GetAttribute("FramebridgeId");if id then nodes[id]=i end end end
local count=0
local function check(ok,why) assert(ok,why);count+=1 end
check(#roots==1 and roots[1].ClassName=="ScreenGui","Independent model root")
for _,case in ipairs({{"vertical","Y"},{"horizontal","X"},{"grid","Y"}}) do
    local i=nodes[case[1]];check(i.ClassName=="ScrollingFrame","Scrollbar class")
    check(i.AutomaticCanvasSize==r.Enum.AutomaticSize[case[2]],"Automatic axis")
    check(i.CanvasSize==r.UDim2.new(0,0,0,0),"No authored canvas min masks overflow")
end
for _,id in ipairs({"vertical","horizontal"}) do
    local i=nodes[id]
    check(i.ScrollBarThickness==8,"Native scrollbar thickness")
    for _,key in ipairs({"TopImage","MidImage","BottomImage"}) do
        local ref=i:GetAttribute("FramebridgeAsset_"..key);local asset
        for _,a in ipairs(pkg.assets) do if a.id==ref then asset=a end end
        check(asset~=nil and asset.scrollbarSlice~=nil,"Independent piece identity")
        check((i[key.."Content"].Uri or "")==((asset.robloxId and "rbxassetid://"..asset.robloxId) or ""),"Native image XML content alias")
    end
end
local slice=nodes["slice-art"]
check(slice.ClassName=="ImageLabel" and slice.ScaleType==r.Enum.ScaleType.Slice,"Native sliced image class/mode")
check(slice.SliceCenter==r.Rect.new(16,16,48,48) and slice.SliceScale==.5,"Exact native slice geometry")
local slider=serde.decode("json",nodes.slider:GetAttribute("FramebridgeBehavior")).control
check(slider.min==-.3 and slider.max==.3 and slider.step==.1 and slider.fill=="slider-fill" and slider.thumb=="slider-thumb","Fractional slider metadata/targets")
local grid=false
for _,i in ipairs(nodes.grid:GetChildren()) do if i.ClassName=="UIGridLayout" then grid=true end end
check(grid,"Independent model grid layout")
print(serde.encode("json",{passed=count,failed=0,scope="Independent static native model readback; engine scrolling, loading and rendered pixels require root execution"}))
