-- Execute the actual data-only Importer with real Lune Instance/datatype staging.
-- Lune reflection is not native Roblox drawing/physical input acceptance.
local fs=require("@lune/fs")
local serde=require("@lune/serde")
local roblox=require("@lune/roblox")
local env={game={GetService=function(_,k)assert(k=="HttpService");return {JSONDecode=function(_,v)return serde.decode("json",v)end,JSONEncode=function(_,v)return serde.encode("json",v)end}end},Instance=roblox.Instance,Enum=roblox.Enum,Font=roblox.Font,Color3=roblox.Color3,Vector2=roblox.Vector2,Vector3=roblox.Vector3,UDim=roblox.UDim,UDim2=roblox.UDim2,Rect=roblox.Rect,ColorSequence=roblox.ColorSequence,ColorSequenceKeypoint=roblox.ColorSequenceKeypoint,NumberSequence=roblox.NumberSequence,NumberSequenceKeypoint=roblox.NumberSequenceKeypoint}
setmetatable(env,{__index=getfenv()})
local fn=assert(loadstring(fs.readFile("plugins/studio/src/Importer.luau")));setfenv(fn,env);local Importer=fn()
local passed=0
local function test(name,body)body();passed+=1;print(name)end
local function read(name)return Importer.decode(fs.readFile(".artifacts/live-text-decoration/final/"..name..".framebridge.json"))end
local function owner(p)return p.roots[1].children[1].children[1]end
local runtime={version="11",source="-- test-only trusted bootstrap content",themeSource="-- test-only trusted theme bootstrap content"}
test("actual Importer decodes source, binding and theme traversal without undefined counters",function()
 for _,name in ipairs({"design","binding","theme"})do local p=read(name);assert(p.instanceCount>2 and owner(p).textDecoration)end
end)
test("actual Importer stages metadata and trusted client when decoration is the only runtime feature",function()
 local p=read("design");local s=Importer.stage(p,{},false,runtime)
 local o=s.byId["effect:text"].instance;assert(serde.decode("json",o:GetAttribute("FramebridgeTextDecoration")).captured=="effect:text/effect")
 assert(s.byId["screen:effect:root/behavior-runtime"].instance:IsA("LocalScript"));Importer.destroy(s)
end)
test("actual Importer rejects executable metadata, mismatched capture and unbounded values",function()
 for _,kind in ipairs({"source","capture","radius","alpha","baseline","count"})do
  local p=read("design");local d=owner(p).textDecoration
  if kind=="source"then d.source="print('untrusted')" elseif kind=="capture"then d.captured="foreign/effect" elseif kind=="radius"then d.shadows[1].radius=1001 elseif kind=="alpha"then d.capturedAlpha=2 elseif kind=="baseline"then d.baseline.text=string.rep("a",8193) else for _=1,8 do table.insert(d.shadows,table.clone(d.shadows[1]))end end
  assert(not pcall(Importer.decode,serde.encode("json",p)),"decode accepted "..kind)
  assert(not pcall(Importer.stage,p,{},false,runtime),"stage accepted "..kind)
 end
end)
test("actual Importer enforces aggregate glyph budget before staging",function()
 local p=read("design");local original=owner(p);local list={};p.assets={};p.roots[1].children[1].children=list
 for i=1,1025 do
  local n=serde.decode("json",serde.encode("json",original));n.id="copy-"..i;n.children={};n.textDecoration.captured=nil;n.textDecoration.capturedAlpha=nil;n.textDecoration.baseline=nil;table.insert(list,n)
 end
 assert(not pcall(Importer.decode,serde.encode("json",p)),"decode accepted 4,100 glyph labels")
 assert(not pcall(Importer.stage,p,{},false,runtime),"stage accepted 4,100 glyph labels")
end)
test("actual Importer reserves sibling host overhead at the inclusive instance limit",function()
 local p=read("design");local decorated=owner(p);decorated.children={};decorated.textDecoration.captured=nil;decorated.textDecoration.capturedAlpha=nil;decorated.textDecoration.baseline=nil;p.assets={}
 local children={decorated};p.roots[1].children=children
 -- One shadow reserves four glyphs × four instances, five host instances,
 -- and two trusted-runtime nodes: 14,977 authored nodes reach 15,000 exactly.
 for i=1,14975 do table.insert(children,{id="budget-"..i,name="Budget filler",className="Frame",properties={},children={}})end
 local accepted=Importer.decode(serde.encode("json",p));assert(accepted.instanceCount==14977)
 local staged=Importer.stage(accepted,{},false,runtime);Importer.destroy(staged)
 table.insert(children,{id="budget-overflow",name="One node over",className="Frame",properties={},children={}})
 assert(not pcall(Importer.decode,serde.encode("json",p)),"decode omitted five-instance sibling host overhead")
 assert(not pcall(Importer.stage,p,{},false,runtime),"stage omitted five-instance sibling host overhead")
end)
print(serde.encode("json",{passed=passed,failed=0,scope="Actual importer validation and Lune Instance staging; native rendered acceptance separate"}))
