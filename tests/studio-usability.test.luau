local Http=game:GetService("HttpService")
local raw=Http:JSONDecode(fixtures)
local report={passed=0,failed=0,failures={},scope="Detached native instances and font measurement; no place, settings or Selection changed"}
local function test(name,fn)
 local ok,err=pcall(fn)
 if ok then report.passed+=1 else report.failed+=1; table.insert(report.failures,{name=name,error=tostring(err)}) end
end
local stages={}
local function stage(i)
 local p=Importer.decode(Http:JSONEncode(raw[i])); local s=Importer.stage(p,{},false); table.insert(stages,s); return s
end
test("review warnings do not block a data-only native import",function()
 local s=stage(1)
 assert(s.byId["small-control"].instance:IsA("TextButton"))
 assert(s.byId["panel-a"].instance.Name=="Frame 1" and s.byId["panel-b"].instance.Name=="Frame 1")
 assert(s.byId["weak-label"].instance.TextColor3.R>0.79)
 assert(s.roots[1].Parent==nil)
end)
test("target measurements match authored native bounds and manual correction",function()
 local bad,good=stage(1),stage(2)
 assert(bad.byId["small-control"].instance.Size.X.Offset==20)
 assert(good.byId["small-control"].instance.Size.X.Offset==48)
 assert(good.byId["small-control"].instance.Size.Y.Offset==48)
end)
test("the short multiline fixture requires more vertical room in the native font",function()
 local bad,good=stage(1),stage(2)
 local a,b=bad.byId["short-text"].instance,good.byId["short-text"].instance
 local bounds=game:GetService("TextService"):GetTextSize(a.Text,a.TextSize,Enum.Font.Roboto,Vector2.new(a.Size.X.Offset,10000))
 assert(bounds.Y>a.Size.Y.Offset,"Expected native font to exceed the short box")
 assert(bounds.Y<=b.Size.Y.Offset,"The corrected box must fit these explicit lines")
end)
test("manual name, color and state cues remain editable native properties",function()
 local s=stage(2)
 assert(s.byId["panel-a"].instance.Name=="LeftCard")
 assert(s.byId["panel-b"].instance.Name=="RightCard")
 assert(math.abs(s.byId["weak-label"].instance.TextColor3.R-0.1)<0.001)
 assert(s.byId["state-text-success"].instance.Text=="Success")
end)
for _,s in ipairs(stages) do Importer.destroy(s) end
return report
