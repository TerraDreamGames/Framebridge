import { loadStudioTree } from "./studio-tree.mjs";

// Test-fixture adapter only: Lune fixtures emulate Roblox's script hierarchy.
// Public plugins are built as real Script/ModuleScript instances by Rojo.
export async function bundleStudio(entrySource, extraModules = []) {
  const tree = await loadStudioTree(entrySource, extraModules);
  const nodes = [];
  function visit(node, parent) {
    const index = nodes.length + 1;
    nodes.push({ ...node, parent, index });
    node.children.forEach((child) => visit(child, index));
  }
  visit(tree);
  const quoted = (s) => JSON.stringify(s);
  const hierarchy = nodes
    .map(
      ({ name, parent, index }) =>
        `__nodes[${index}] = setmetatable({Name=${quoted(name)}, Parent=${parent ? `__nodes[${parent}]` : "nil"}}, __nodeMeta)` +
        (parent
          ? `\n__nodes[${parent}][${quoted(name)}] = __nodes[${index}]`
          : ""),
    )
    .join("\n");
  const factories = nodes
    .filter((node) => node.source)
    .map(
      ({ index, source }) =>
        // Keep script/require as upvalues: adding arguments can exceed Roblox's
        // 200-register limit in the upstream reconciler's largest modules.
        `do\nlocal script = __nodes[${index}]\nlocal require = __require\n__nodes[${index}].__factory = function()\n${source}\nend\nend`,
    )
    .join("\n");
  return `-- Framebridge; includes upstream React Lua 17.2.1 (MIT).
-- Generated from plugins/studio/src and the pinned vendor runtime.
local __nodes = {}
local __nodeMeta = {__index = {FindFirstAncestor = function(self, name)
    local parent = self.Parent
    while parent do
        if parent.Name == name then return parent end
        parent = parent.Parent
    end
    return nil
end, WaitForChild = function(self, name)
    local child = rawget(self, name)
    assert(child, "Missing bundled module: " .. self.Name .. "/" .. name)
    return child
end}}
local function __require(node)
    assert(type(node) == "table" and node.__factory, "Invalid bundled module: " .. tostring(type(node) == "table" and node.Name or node))
    if node.__loaded then return node.__result end
    assert(not node.__loading, "Circular bundled require: " .. node.Name)
    node.__loading = true
    local ok, result = pcall(node.__factory)
    node.__loading = false
    if not ok then error("Bundled module " .. node.Name .. ": " .. tostring(result), 0) end
    node.__result = result
    node.__loaded = true
    return result
end
${hierarchy}
${factories}
return __nodes[1].__factory()
`;
}
