-- Exercise the real pure importer validator without a place or engine instances.
local fs = require("@lune/fs")
local source = fs.readFile("plugins/studio/src/Importer.luau")
local functions = {}
for _, name in ipairs({"set", "check", "finite", "numbers", "validateDecorationAsset"}) do
    local single = name == "check" or name == "finite"
    local pattern = single and ("(local function " .. name .. "[^\n]*)")
        or ("(local function " .. name .. "%b().-\nend)")
    local definition = assert(source:match(pattern), "Missing importer validator helper: " .. name)
    table.insert(functions, definition)
end
local chunk, why = loadstring(table.concat(functions, "\n") .. "\nreturn validateDecorationAsset")
assert(chunk, why)
local validate = chunk()
local passed = 0
for _, mode in ipairs({"fills", "shadow", "blend"}) do
    local base = {renderMode = mode, backdrop = mode == "blend" and {.1, .2, .3} or nil}
    for _, settings in ipairs({false, {edgeCleanup = true}, {edgeCleanup = false}, {whiteMask = false, edgeCleanup = true}}) do
        local asset = table.clone(base)
        asset.processing = settings or nil
        assert(pcall(validate, asset), "Rejected supported cleanup for " .. mode)
        passed += 1
    end
    for _, settings in ipairs({false, true, {whiteMask = true}, {edgeCleanup = 1}, {unexpected = true}}) do
        local asset = table.clone(base)
        asset.processing = settings
        assert(not pcall(validate, asset), "Accepted invalid decoration preparation for " .. mode)
        passed += 1
    end
    local sliced = table.clone(base)
    sliced.scrollbarSlice = {axis = "Y", start = 0, ["end"] = 1}
    assert(not pcall(validate, sliced), "Accepted a sliced decoration")
    passed += 1
end
print("Studio decoration asset validator: " .. passed .. " checks passed.")
return {passed = passed, failed = 0}
