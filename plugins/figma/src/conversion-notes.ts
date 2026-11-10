import type { Issue } from "../../../packages/core/src/types";

export type NoteView = "attention" | "info" | "all";
export type NoteGroup = {
  key: string;
  code: string;
  title: string;
  message: string;
  severity: Issue["severity"];
  layers: { id: string; name: string }[];
  count: number;
  action: "images" | "fonts" | "layer";
};

const titles: Record<string, string> = {
  "asset-required": "Images need linking",
  "raster-fallback": "Exported as images",
  "font-substitution": "Font substituted",
  "appearance-approximation": "Appearance may differ",
  "button-detected": "Buttons detected",
  "behavior-invalid": "Interaction needs fixing",
  "behavior-raster": "Interaction would be flattened",
  "image-slice-bounds": "Nine-slice bounds need fixing",
  "gradient-stops": "Too many gradient stops",
  "mask-fallback": "Mask needs review",
  "repeat-fallback": "Repeat pattern needs review",
  "canvas-group": "Group opacity clips children",
  "native-mask": "Editable mask created",
  "live-text-decoration": "Text shadow may differ",
  "frozen-drop-effect": "Shadow exported as artwork",
  "clipped-drop-effect": "Shadow may be clipped",
  "symbol-glyphs": "Check symbols and emoji",
};
const rank: Record<Issue["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function noteTitle(code: string) {
  if (titles[code]) return titles[code];
  const label = code.replace(/[-_]+/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Combine identical findings, retaining distinct reasons and affected layers. */
export function groupConversionNotes(
  issues: readonly Issue[],
  view: NoteView = "all",
  search = "",
): NoteGroup[] {
  const query = search.trim().toLocaleLowerCase();
  const groups = new Map<string, NoteGroup>();
  const layerIds = new Map<string, Set<string>>();
  for (const issue of issues) {
    if (view === "attention" && issue.severity === "info") continue;
    if (view === "info" && issue.severity !== "info") continue;
    const title = noteTitle(issue.code);
    if (
      query &&
      !`${issue.nodeName} ${title} ${issue.code} ${issue.message}`
        .toLocaleLowerCase()
        .includes(query)
    )
      continue;
    const key = JSON.stringify([issue.severity, issue.code, issue.message]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        code: issue.code,
        title,
        message: issue.message,
        severity: issue.severity,
        layers: [],
        count: 0,
        action:
          issue.code === "asset-required"
            ? "images"
            : issue.code === "font-substitution"
              ? "fonts"
              : "layer",
      };
      groups.set(key, group);
      layerIds.set(key, new Set());
    }
    group.count++;
    if (!layerIds.get(key)!.has(issue.nodeId)) {
      group.layers.push({ id: issue.nodeId, name: issue.nodeName });
      layerIds.get(key)!.add(issue.nodeId);
    }
  }
  return [...groups.values()].sort(
    (a, b) => rank[a.severity] - rank[b.severity],
  );
}
