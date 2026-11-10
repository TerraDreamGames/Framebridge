-- Scans inserted image references, never uploads or changes the data model.
local Gallery = {}
function Gallery.scan(roots, assetId)
    local images, byId, stack, count = {}, {}, {}, 0
    for _, root in ipairs(roots) do table.insert(stack, root) end
    while #stack > 0 and count < 10000 do
        local node = table.remove(stack); count += 1
        local ok, children = pcall(function() return node:GetChildren() end)
        if ok then for _, child in ipairs(children) do if #stack + count < 10000 then table.insert(stack, child) end end end
        local references={}
        if node:IsA("ImageLabel") or node:IsA("ImageButton") then references.Image=assetId(node.Image)
        elseif node:IsA("Decal") or node:IsA("Texture") then references.Texture=assetId(node.Texture)
        elseif node:IsA("ScrollingFrame") then
            for _, property in ipairs({"TopImage","MidImage","BottomImage"}) do references[property]=assetId(node[property]) end
        end
        for property, id in pairs(references) do
            local entry = byId[id]
            if not entry and #images < 200 then
                entry = { id = id, name = node.Name .. ((property=="Image" or property=="Texture") and "" or " "..property), names = {}, identities = {} }
                byId[id] = entry; table.insert(images, entry)
            end
            if entry then
                entry.names[node.Name] = true
                local source = node:GetAttribute("FramebridgeSource")
                local ref=node:GetAttribute((property=="Image" or property=="Texture") and "FramebridgeAsset" or "FramebridgeAsset_"..property)
                if type(source) == "string" and type(ref) == "string" then entry.identities[source .. "\0" .. ref] = true end
            end
        end
    end
    table.sort(images, function(a,b) return a.name < b.name end)
    return images, count >= 10000
end
function Gallery.matches(package, images, bindings, assetId)
    local matches, ambiguous = {}, 0
    for _, asset in ipairs(package.assets) do
        -- Explicit cleared/linked rows are authoritative; only absent links are scanned.
        if bindings[asset.id] == nil and not assetId(asset.robloxId) then
            local exact, named = {}, {}
            for _, image in ipairs(images) do
                if image.identities[package.sourceId .. "\0" .. asset.id] then table.insert(exact,image)
                elseif type(asset.filename) == "string" and (image.names[asset.filename] or image.names[(asset.filename:gsub("%.png$", ""))]) then table.insert(named,image) end
            end
            local candidates = #exact > 0 and exact or named
            if #candidates == 1 then table.insert(matches,{ asset = asset.id, image = candidates[1].id })
            elseif #candidates > 1 then ambiguous += 1 end
        end
    end
    return matches, ambiguous
end
function Gallery.uses(package, binding, roots)
    local refs, result = {}, {}
    for _, asset in ipairs(package.assets) do if binding[asset.id] then refs[asset.id] = true end end
    for _, root in ipairs(roots) do
        for _, node in ipairs({root,table.unpack(root:GetDescendants())}) do
            local used=refs[node:GetAttribute("FramebridgeAsset")]
            for _,property in ipairs({"TopImage","MidImage","BottomImage"}) do used=used or refs[node:GetAttribute("FramebridgeAsset_"..property)] end
            if node:GetAttribute("FramebridgeSource") == package.sourceId and used then table.insert(result,node) end
        end
    end
    return result
end
return Gallery
