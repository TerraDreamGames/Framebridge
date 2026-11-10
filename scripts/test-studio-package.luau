-- Independently read Rojo's exported model and compare every instance/source
-- with the shipped projects. Test-only compilation; no loader ships in Studio.
local fs = require("@lune/fs")
local serde = require("@lune/serde")
local roblox = require("@lune/roblox")
local directory = "dist/studio"
local roots = roblox.deserializeModel(fs.readFile(directory .. "/Framebridge.rbxmx"))
assert(#roots == 1 and roots[1].Name == "Framebridge" and roots[1].ClassName == "Script", "Plugin entry must be one native Script")
local sources, folders, largest = 0, 0, 0
local function parent(path) return path:match("^(.*)/") or "." end
local function check(actual, expected, base)
    if expected["$path"] then
        local path = base .. "/" .. expected["$path"]
        if path:match("%.project%.json$") then
            local project = serde.decode("json", fs.readFile(path))
            check(actual, project.tree, parent(path))
            return
        end
        assert(path:match("%.luau$"), "Expected an explicit Luau source path: " .. path)
        local class = path:match("%.server%.luau$") and "Script" or "ModuleScript"
        assert(actual.ClassName == class, "Wrong source class: " .. path)
        local source = fs.readFile(path)
        assert(actual.Source == source, "Rojo changed source: " .. path)
        local compiled, why = loadstring(source)
        assert(compiled, path .. ": " .. tostring(why))
        sources += 1
        largest = math.max(largest, #source)
    else
        assert(actual.ClassName == expected["$className"], "Wrong folder class: " .. actual.Name)
        folders += 1
    end
    local count = 0
    for name, child in expected do
        if name:sub(1, 1) ~= "$" then
            count += 1
            local instance = actual:FindFirstChild(name)
            assert(instance, "Missing module: " .. actual.Name .. "/" .. name)
            check(instance, child, base)
        end
    end
    assert(#actual:GetChildren() == count, "Unexpected children: " .. actual.Name)
end
local project = serde.decode("json", fs.readFile(directory .. "/default.project.json"))
check(roots[1], project.tree, directory)
assert(sources > 300, "React Lua modules must remain separate")
assert(not roots[1].Source:find("local __nodes =", 1, true), "Monolithic loader must not ship")
assert(not fs.isFile(directory .. "/Framebridge.plugin.luau"), "Stale single-file artifact must be removed")
print(serde.encode("json", {studioPackage = "passed", sources = sources, folders = folders,
    entryBytes = #roots[1].Source, largestSourceBytes = largest}))
