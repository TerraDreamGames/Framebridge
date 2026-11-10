local fs=require('@lune/fs')
local luau=require('@lune/luau')
local roblox=require('@lune/roblox')
local serde=require('@lune/serde')
local directory='.artifacts/world-space/'
local counts={syntax=0,models=0,metadata=0}
local function equal(a,b)
    if type(a)~=type(b) then return false end
    if type(a)~='table' then return a==b end
    for key,value in pairs(a) do if not equal(value,b[key]) then return false end end
    for key in pairs(b) do if a[key]==nil then return false end end
    return true
end
for _,kind in ipairs({'surface','billboard','prompt'}) do
    for _,format in ipairs({'react','fusion','luau'}) do luau.load(fs.readFile(directory..kind..'.'..format..'.luau'));counts.syntax+=1 end
    local pkg=serde.decode('json',fs.readFile(directory..kind..'.json'))
    local roots=roblox.deserializeModel(fs.readFile(directory..kind..'.rbxmx'))
    assert(#roots==1 and roots[1].ClassName==pkg.roots[1].className)
    local root=roots[1]
    assert(equal(serde.decode('json',root:GetAttribute('FramebridgeWorld')),pkg.roots[1].worldUI),'World configuration changed during model serialization')
    local canvas=serde.decode('json',root:GetAttribute('FramebridgeWorldCanvas'))
    assert(canvas[1]==280 and canvas[2]==140)
    assert(root:FindFirstChild('WorldCanvas').Size==roblox.UDim2.new(0,280,0,140))
    assert(root:FindFirstChild('FramebridgeWorldTarget').Value==nil)
    assert(root:FindFirstChild('FramebridgeInteractions').Source==fs.readFile(directory..'client.luau'))
    if kind=='surface' then
        assert(root.Face==roblox.Enum.NormalId.Front and root.SizingMode==roblox.Enum.SurfaceGuiSizingMode.FixedSize)
        assert(root.CanvasSize==roblox.Vector2.new(280,140))
    else assert(root.Size==roblox.UDim2.new(4,0,2,0)) end
    counts.models+=1;counts.metadata+=5
end
luau.load(fs.readFile(directory..'client.luau'));counts.syntax+=1
fs.writeFile(directory..'exports-report.json',serde.encode('json',counts,true))
print(serde.encode('json',counts))
