export type LayerSelection = {
  primary: string;
  ids: string[];
  anchor: string;
  sourceId?: string;
};

/** Keep selection scoped to the analyzed source, including while Layers is hidden. */
export function reconcileLayerSelection(
  previous: LayerSelection,
  sourceId: string | undefined,
  available: string[],
): LayerSelection {
  const valid = new Set(available);
  const ids =
    previous.sourceId === sourceId
      ? previous.ids.filter((id) => valid.has(id))
      : [];
  if (!ids.length && available[0]) ids.push(available[0]);
  const primary = ids.includes(previous.primary)
    ? previous.primary
    : (ids[0] ?? "");
  const anchor =
    previous.sourceId === sourceId && valid.has(previous.anchor)
      ? previous.anchor
      : primary;
  if (
    previous.sourceId === sourceId &&
    previous.primary === primary &&
    previous.anchor === anchor &&
    previous.ids.length === ids.length &&
    previous.ids.every((id, index) => id === ids[index])
  )
    return previous;
  return { primary, ids, anchor, sourceId };
}

export function selectLayers(
  current: string[],
  visible: string[],
  id: string,
  anchor: string,
  gesture: { toggle?: boolean; range?: boolean } = {},
): string[] {
  if (!visible.includes(id)) return current;
  if (gesture.range) {
    const from = visible.indexOf(anchor),
      to = visible.indexOf(id);
    const range =
      from < 0
        ? [id]
        : visible.slice(Math.min(from, to), Math.max(from, to) + 1);
    return gesture.toggle ? [...new Set([...current, ...range])] : range;
  }
  if (gesture.toggle)
    return current.includes(id)
      ? current.length === 1
        ? current
        : current.filter((key) => key !== id)
      : [...current, id];
  return [id];
}
export const CLASS_SHORTCUTS: Record<string, string> = {
  "0": "auto",
  "1": "Frame",
  "2": "TextLabel",
  "3": "ImageLabel",
  "4": "TextButton",
  "5": "ImageButton",
  "6": "ScrollingFrame",
};
export function classShortcut(event: {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): string | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  // macOS Option changes event.key to symbols; the physical digit stays stable.
  const digit = /^Digit[0-6]$/.test(event.code ?? "")
    ? event.code!.slice(-1)
    : event.key;
  return CLASS_SHORTCUTS[digit];
}
