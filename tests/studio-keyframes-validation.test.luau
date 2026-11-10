-- Data-only validation through the actual importer; no Instances or place changes.
local pkg=Importer.decode(fixture)
assert(#pkg.roots==1,"Valid recorded chains rejected")
local prompt=Importer.decode(promptFixture)
local function find(node,id)
    if node.id==id then return node end
    for _,child in ipairs(node.children) do
        local found=find(child,id);if found then return found end
    end
end
local progress=find(prompt.roots[1],"progress")
assert(progress,"Prompt fixture has no progress layer")
progress.behavior={keyframes={trigger="mount",interruption="restart",finish="hold",repeats=0,yoyo=false,frames={
    {time=0,x=0,y=0,scale=1,rotation=0,opacity=1,easing="linear",direction="out"},
    {time=1,x=0,y=0,scale=1,rotation=0,opacity=0.5,easing="quad",direction="inOut"},
}}}
local ok,why=pcall(Importer.decode,Http:JSONEncode(prompt))
assert(not ok and tostring(why):find("Hold progress cannot have motion or keyframes",1,true),tostring(why))
print("Three data-only importer checks passed: chains, prompt, and hold-progress keyframe writer rejection")
