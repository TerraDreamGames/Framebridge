local passed, failures = 0, {}
local function test(name, run)
    local ok, why = pcall(run)
    if ok then passed+=1 else table.insert(failures,name .. ": " .. tostring(why)) end
end
local folder=Instance.new("Folder")
local function image(name,id,ref)
    local decal=Instance.new("Decal");decal.Name=name;decal.Texture=id;decal.Parent=folder
    if ref then decal:SetAttribute("FramebridgeSource","gallery-test");decal:SetAttribute("FramebridgeAsset",ref) end
    return decal
end
local p={sourceId="gallery-test",assets={{id="exact",name="Exact",filename="exact.png"},{id="name",name="Name",filename="named.png"},{id="ambiguous",name="Ambiguous",filename="duplicate.png"},{id="clear",name="Clear",filename="clear.png"},{id="linked",name="Linked",filename="linked.png",robloxId="777"}}}
image("irrelevant","rbxassetid://123","exact");image("named","rbxassetid://456")
image("duplicate","rbxassetid://100");image("duplicate","rbxassetid://200")
image("clear","rbxassetid://300");image("linked","rbxassetid://400")
test("scan reads native image references without changing objects",function()
    local before=#folder:GetDescendants();local images,limited=AssetGallery.scan({folder},Importer.assetId)
    assert(#images==6 and not limited and #folder:GetDescendants()==before)
end)
test("only unique identities and filenames fill empty links",function()
    local images=AssetGallery.scan({folder},Importer.assetId)
    local matches,ambiguous=AssetGallery.matches(p,images,{clear=""},Importer.assetId)
    local result={};for _,match in ipairs(matches) do result[match.asset]=match.image end
    assert(result.exact=="rbxassetid://123" and result.name=="rbxassetid://456" and #matches==2 and ambiguous==1)
    assert(not result.clear and not result.linked and not result.ambiguous)
end)
test("usage lookup isolates the package source and asset reference",function()
    local a=Instance.new("ImageLabel");a.Parent=folder;a:SetAttribute("FramebridgeSource","gallery-test");a:SetAttribute("FramebridgeAsset","exact")
    local b=a:Clone();b:SetAttribute("FramebridgeSource","another-design");b.Parent=folder
    local uses=AssetGallery.uses(p,{exact=true},{a,b})
    assert(#uses==1 and uses[1]==a)
    a:Destroy();b:Destroy()
end)
test("duplicate instances using one asset remain one reusable gallery entry",function()
    image("another-copy","rbxassetid://123")
    local images=AssetGallery.scan({folder},Importer.assetId)
    assert(#images==6)
    for _,entry in ipairs(images) do if entry.id=="rbxassetid://123" then assert(entry.names["irrelevant"] and entry.names["another-copy"]) end end
end)
folder:Destroy()
return {passed=passed,failed=#failures,failures=failures,scope="Detached native image gallery, ambiguity and usage lookup"}
