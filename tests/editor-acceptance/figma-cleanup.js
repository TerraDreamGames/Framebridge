return await (async () => {
  const section = figma.currentPage.children.find(n => n.getSharedPluginData("FramebridgeEditorQA", "owner") === "final-editor-checks-20261003");
  if (!section) return { removed: false, scope: "No owned editor source" };
  const previous = JSON.parse(section.getSharedPluginData("FramebridgeEditorQA", "previous"));
  const restore = figma.currentPage.selection.every(n => {
    let ancestor = n;
    while (ancestor && ancestor !== section) ancestor = ancestor.parent;
    return ancestor === section;
  });
  section.remove();
  if (restore) {
    const selection = [];
    for (const id of previous.selection) { const n = await figma.getNodeByIdAsync(id); if (n && "visible" in n) selection.push(n); }
    figma.currentPage.selection = selection; figma.viewport.center = previous.viewport.center; figma.viewport.zoom = previous.viewport.zoom;
  }
  return { removed: true, restoredSelectionAndViewport: restore, remainingOwnedSections: figma.currentPage.children.filter(n => n.getSharedPluginData("FramebridgeEditorQA", "owner") === "final-editor-checks-20261003").length };
})();
