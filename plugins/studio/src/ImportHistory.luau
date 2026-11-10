-- Local references and authored geometry only. Restoring never imports automatically.
local History = {}
History.LIMIT, History.BYTES, History.ITEM_BYTES = 12, 2000000, 600000
local function pick(value, keys)
    local result = {}
    if type(value) == "table" then for _, key in ipairs(keys) do result[key] = value[key] end end
    return result
end
local function valueCopy(value)
    if type(value) ~= "table" then return value end
    local result = pick(value, {"type", "family", "weight", "style"})
    if type(value.value) == "table" then
        result.value = {}
        for i, item in ipairs(value.value) do
            if type(item) == "table" then result.value[i] = table.clone(item) else result.value[i] = item end
        end
    end
    return result
end
function History.snapshot(package, bindings)
    local result = pick(package, {"format", "version", "sourceId", "name", "createdAt"})
    result.options = pick(package.options, {"layout", "appearance", "imageScale", "preserveText"})
    result.stats = pick(package.stats, {"layers", "instances", "native", "raster"})
    result.assets, result.issues = {}, {}
    local links = {}
    for _, asset in ipairs(package.assets) do
        local copy = pick(asset, {"id", "nodeId", "name", "filename", "width", "height", "scale", "reason"})
        copy.pixelSize = asset.pixelSize and table.clone(asset.pixelSize) or nil
        copy.scrollbarSlice = asset.scrollbarSlice and pick(asset.scrollbarSlice, {"axis","start","end"}) or nil
        copy.processing = asset.processing and pick(asset.processing, {"whiteMask", "edgeCleanup"}) or nil
        if bindings[asset.id] ~= "" then copy.robloxId = bindings[asset.id] or asset.robloxId end
        links[asset.id] = copy.robloxId
        table.insert(result.assets, copy)
    end
    for _, issue in ipairs(package.issues) do table.insert(result.issues, pick(issue, {"severity", "code", "nodeId", "nodeName", "message"})) end
    local function visit(node)
        local copy = pick(node, {"id", "name", "className", "sourceType", "assetRef"})
        copy.referenceSize = node.referenceSize and table.clone(node.referenceSize) or nil
        copy.layoutSizing = node.layoutSizing and table.clone(node.layoutSizing) or nil
        copy.properties, copy.children = {}, {}
        for key, value in pairs(node.properties) do copy.properties[key] = valueCopy(value) end
        if node.assetRef then copy.properties.Image = links[node.assetRef] or "" end
        if node.assetBindings then
            copy.assetBindings=pick(node.assetBindings,{"TopImage","MidImage","BottomImage"})
            for property, ref in pairs(copy.assetBindings) do copy.properties[property]=links[ref] or "" end
        end
        for _, child in ipairs(node.children) do table.insert(copy.children, visit(child)) end
        return copy
    end
    result.roots = {}
    for _, root in ipairs(package.roots) do table.insert(result.roots, visit(root)) end
    return result
end
function History.new(deps)
    local self = { entries = {}, error = nil }
    local function normalize(records)
        local output, bytes, seen = {}, 0, {}
        for index, record in ipairs(type(records) == "table" and records or {}) do
            if index > 100 then break end
            if type(record) == "table" and type(record.raw) == "string" and #record.raw <= History.ITEM_BYTES and type(record.savedAt) == "number" and record.savedAt == record.savedAt then
                local ok, package = pcall(deps.decode, record.raw)
                if ok and type(package) == "table" then
                    local cleanOk, clean = pcall(deps.encode, History.snapshot(package, {}))
                    local restored, config = pcall(function() return deps.editor and deps.editor(package, record.editor or {mode=record.mode}) or {mode=record.mode,layers={}} end)
                    if not restored then continue end
                    local configOk, configRaw = pcall(deps.encode, config)
                    if not cleanOk or not configOk then continue end
                    local size = #clean + #configRaw
                    local key = package.sourceId .. "\0" .. tostring(package.createdAt)
                    if not seen[key] and #output < History.LIMIT and size <= History.ITEM_BYTES and bytes + size <= History.BYTES then
                        seen[key] = true; bytes += size
                        table.insert(output, { raw = clean, editor = config, name = type(package.name) == "string" and package.name or "Untitled", sourceId = package.sourceId, createdAt = package.createdAt, savedAt = record.savedAt, mode = (record.mode == "offset" or record.mode == "source") and record.mode or "scale" })
                    end
                end
            end
        end
        return output
    end
    function self:reload()
        local ok, records = pcall(deps.load)
        self.error = not ok and "Recent imports could not be read." or nil
        if ok then
            local valid, entries = pcall(normalize, records)
            if valid then self.entries = entries; self.loaded = true
            else self.error = "Recent imports could not be read."; return false end
        end
        return ok
    end
    function self:record(package, bindings, editor)
        if not self.loaded and not self:reload() then return false, "Imported successfully, but unread history was left unchanged. Retry recent imports." end
        local ok, raw = pcall(deps.encode, History.snapshot(package, bindings))
        local configOk, configRaw = pcall(deps.encode, editor)
        if not ok or not configOk or #raw + #configRaw > History.ITEM_BYTES then return false, "Imported successfully. This design is too large for local history; keep its exported package." end
        local nextEntries = {{ raw = raw, savedAt = deps.now(), mode = editor.mode, editor = editor }}
        for _, entry in ipairs(self.entries) do table.insert(nextEntries, entry) end
        nextEntries = normalize(nextEntries)
        local saved = pcall(deps.save, nextEntries)
        self.entries = nextEntries
        self.error = not saved and "Recent imports work for this session, but could not be saved." or nil
        return saved, self.error
    end
    function self:clear()
        local ok = pcall(deps.save, {})
        if ok then self.entries = {}; self.error = nil else self.error = "Recent imports could not be cleared." end
        return ok
    end
    self:reload()
    return self
end
return History
