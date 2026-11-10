return await (async () => {
  const section = figma.currentPage.children.find(n => n.getSharedPluginData("FramebridgeEditorQA", "owner") === "final-editor-checks-20261003");
  if (!section) throw new Error("Owned editor source section missing");
  const ids = JSON.parse(section.getSharedPluginData("FramebridgeEditorQA", "ids"));
  const nodes = {};
  for (const [name, id] of Object.entries(ids)) {
    if (Array.isArray(id)) continue;
    const n = await figma.getNodeByIdAsync(id);
    let ancestor = n;
    while (ancestor && ancestor !== section) ancestor = ancestor.parent;
    if (!n || !ancestor) throw new Error(`Owned source ${name} missing`);
    nodes[name] = { id: n.id, type: n.type, name: n.name, parent: n.parent.id, width: n.width, height: n.height,
      x: n.x, y: n.y, rotation: n.rotation, characters: n.type === "TEXT" ? n.characters : undefined };
  }
  const family = await figma.getNodeByIdAsync(ids.family);
  return { scope: "Actual native source hierarchy only; UI override/reopen acceptance comes from actual downloaded package comparison", nodes,
    states: family.children.map(n => ({ id: n.id, name: n.name, width: n.width, height: n.height })), selected: figma.currentPage.selection.map(n => n.id) };
})();
