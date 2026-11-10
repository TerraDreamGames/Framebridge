/** Resolve fully before changing native selection. A stale/missing target leaves it intact. */
export async function selectRuleLayers(
  api: Pick<PluginAPI, "currentPage" | "getNodeByIdAsync" | "viewport">,
  ids: unknown,
  isCancelled: () => boolean = () => false,
): Promise<number> {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 1000 ||
    ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 256) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Select 1–1,000 distinct Figma source layers.");
  const page = api.currentPage;
  const nodes: SceneNode[] = [];
  for (let start = 0; start < ids.length; start += 32) {
    if (isCancelled() || api.currentPage !== page)
      throw new Error("Layer selection was cancelled or the page changed.");
    const batch = await Promise.all(
      ids.slice(start, start + 32).map((id) => api.getNodeByIdAsync(id)),
    );
    for (const node of batch) {
      let ancestor: BaseNode | null = node;
      while (ancestor && ancestor !== page) ancestor = ancestor.parent;
      if (!node || !("width" in node) || ancestor !== page)
        throw new Error(
          "A matched source layer is missing or belongs to another page. Analyze again.",
        );
      nodes.push(node as SceneNode);
    }
  }
  if (isCancelled() || api.currentPage !== page)
    throw new Error("Layer selection was cancelled or the page changed.");
  page.selection = nodes;
  api.viewport.scrollAndZoomIntoView(nodes);
  return nodes.length;
}
