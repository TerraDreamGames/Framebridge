import type {
  DesignNode,
  ExportOptions,
  LayerOverride,
  TransferPackage,
} from "./types";
import { flatten } from "./types";
import { validAssetId } from "./geometry";
import { artworkAssetId, exportImageProcessing } from "./image-processing";
import { needsBehaviorHierarchy } from "./behaviors";

/** Cap fractions refer to the entire rendered PNG, including its effect bounds. */
export type ScrollbarSettings = {
  artworkId: string;
  contentId?: string;
  axis: "X" | "Y";
  startCap: number;
  endCap: number;
  thickness: number;
};
export type ScrollbarSlice = { axis: "X" | "Y"; start: number; end: number };
export function scrollbarSettings(v: ScrollbarSettings): ScrollbarSettings {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) =>
        ![
          "artworkId",
          "contentId",
          "axis",
          "startCap",
          "endCap",
          "thickness",
        ].includes(k),
    ) ||
    typeof v.artworkId !== "string" ||
    !v.artworkId ||
    v.artworkId.length > 256 ||
    (v.contentId !== undefined &&
      (typeof v.contentId !== "string" ||
        !v.contentId ||
        v.contentId.length > 256)) ||
    !["X", "Y"].includes(v.axis) ||
    ![v.startCap, v.endCap, v.thickness].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) ||
    v.startCap <= 0 ||
    v.endCap <= 0 ||
    v.startCap + v.endCap >= 1 ||
    v.thickness < 1 ||
    v.thickness > 100
  )
    throw new Error(
      "Choose two positive cap lengths totaling less than 100%, and a scrollbar thickness from 1 to 100.",
    );
  return { ...v };
}
export function scrollbarSlice(v: ScrollbarSlice) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !["axis", "start", "end"].includes(k)) ||
    !["X", "Y"].includes(v.axis) ||
    ![v.start, v.end].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) ||
    v.start < 0 ||
    v.end > 1 ||
    v.end <= v.start
  )
    throw new Error("Invalid scrollbar image slice.");
  return v;
}
/** Use the same rounded boundaries for form validation and PNG preparation. */
export function scrollbarSlicePixels(v: ScrollbarSlice, length: number) {
  scrollbarSlice(v);
  const start = Math.round(v.start * length),
    end = Math.round(v.end * length);
  if (!Number.isSafeInteger(length) || length < 1 || end <= start)
    throw new Error(
      "A scrollbar cap is smaller than one rendered pixel. Increase the cap or image resolution.",
    );
  return [start, end] as const;
}
export function designIndex(designs: DesignNode[]) {
  const nodes = new Map<string, DesignNode>(),
    parents = new Map<string, string>(),
    roots = new Map<string, string>();
  function visit(n: DesignNode, root: string, parent?: string) {
    nodes.set(n.id, n);
    roots.set(n.id, root);
    if (parent) parents.set(n.id, parent);
    n.children.forEach((c) => visit(c, root, n.id));
  }
  designs.forEach((n) => visit(n, n.id));
  return { nodes, parents, roots };
}
function descendants(node: DesignNode): string[] {
  return [node.id, ...node.children.flatMap(descendants)];
}
function axisAligned(n: DesignNode) {
  const t = n.transform;
  return (
    Math.abs(t[0][1]) < 1e-6 &&
    Math.abs(t[1][0]) < 1e-6 &&
    t[0][0] > 0 &&
    t[1][1] > 0
  );
}
export function consumedScrollbarArtwork(
  overrides: Record<string, LayerOverride>,
) {
  return new Set(
    Object.values(overrides).flatMap((o) =>
      o.scrollbar ? [scrollbarSettings(o.scrollbar).artworkId] : [],
    ),
  );
}

/** A temporary export snapshot only. Source layers and stored class choices stay intact. */
export function prepareScrollbars(
  designs: DesignNode[],
  settings: ExportOptions,
  validateOnly = false,
) {
  const accepted: {
    viewport: string;
    artwork: DesignNode;
    settings: ScrollbarSettings;
  }[] = [];
  if (!Object.values(settings.layerOverrides).some((edit) => edit.scrollbar))
    return { designs, settings, accepted };
  const index = designIndex(designs);
  const consumed = new Set<string>(),
    overrides: Record<string, LayerOverride> = Object.assign(
      Object.create(null),
      settings.layerOverrides,
    );
  for (const [id, override] of Object.entries(settings.layerOverrides)) {
    if (!override.scrollbar) continue;
    const viewport = index.nodes.get(id);
    // Document overrides also contain configurations for unselected screens.
    if (!viewport) continue;
    const v = scrollbarSettings(override.scrollbar),
      artwork = index.nodes.get(v.artworkId);
    if (
      !viewport ||
      !artwork ||
      id === artwork.id ||
      index.roots.get(id) !== index.roots.get(artwork.id) ||
      !viewport.visible ||
      !artwork.visible ||
      viewport.text ||
      (!viewport.children.length && !v.contentId) ||
      !axisAligned(artwork) ||
      artwork.width <= 0 ||
      artwork.height <= 0 ||
      descendants(artwork).includes(id) ||
      consumed.has(artwork.id)
    )
      throw new Error(
        "Scrollbar artwork needs a visible, unrotated source in the same selected screen and a separate container viewport.",
      );
    if (
      override.renderMode === "skip" ||
      override.renderMode === "image" ||
      (override.className &&
        override.className !== "ScrollingFrame" &&
        override.className !== "Frame")
    )
      throw new Error(
        "Keep the scrollbar viewport as an editable Frame or ScrollingFrame.",
      );
    if (needsBehaviorHierarchy(artwork, settings.layerOverrides))
      throw new Error(
        "Keep interactive artwork separate from the scrollbar image source.",
      );
    for (const child of descendants(artwork)) {
      if (
        settings.layerOverrides[child]?.behavior ||
        settings.layerOverrides[child]?.scrollbar
      )
        throw new Error(
          "Scrollbar artwork cannot contain configured interactions or another scrolling relationship.",
        );
    }
    if (v.contentId) {
      const content = index.nodes.get(v.contentId);
      if (
        !content ||
        content.text ||
        !content.visible ||
        v.contentId === id ||
        descendants(content).includes(id) ||
        descendants(artwork).includes(v.contentId) ||
        index.roots.get(v.contentId) !== index.roots.get(id)
      )
        throw new Error(
          "Choose a separate content container in the same screen.",
        );
      if (!axisAligned(viewport) || !axisAligned(content))
        throw new Error(
          "Reparenting scroll content needs unrotated viewport and content containers.",
        );
    }
    for (const target of [id, ...(v.contentId ? [v.contentId] : [])]) {
      let cursor: string | undefined = target;
      while (cursor) {
        const o = overrides[cursor];
        if (
          o?.renderMode === "image" ||
          o?.renderMode === "skip" ||
          o?.className?.startsWith("Image") ||
          /\[raster\]/i.test(index.nodes.get(cursor)!.name)
        )
          throw new Error(
            "Keep the scrolling hierarchy editable before configuring its scrollbar.",
          );
        overrides[cursor] = { ...o, renderMode: "native" };
        cursor = index.parents.get(cursor);
      }
    }
    overrides[id] = { ...overrides[id], className: "ScrollingFrame" };
    consumed.add(artwork.id);
    accepted.push({ viewport: id, artwork, settings: v });
  }
  if (!accepted.length) return { designs, settings, accepted };
  const plannedParents = new Map(index.parents),
    owners = new Set<string>();
  for (const { viewport, settings: v } of accepted) {
    if (v.contentId) {
      if (owners.has(v.contentId))
        throw new Error(
          "A content holder can belong to only one scrolling viewport.",
        );
      owners.add(v.contentId);
      plannedParents.set(v.contentId, viewport);
    }
  }
  for (const target of owners) {
    const visited = new Set<string>();
    let cursor: string | undefined = target;
    while (cursor) {
      if (visited.has(cursor))
        throw new Error(
          "Scrolling relationships cannot create a hierarchy cycle.",
        );
      visited.add(cursor);
      cursor = plannedParents.get(cursor);
    }
  }
  function absolute(id: string): [number, number, number, number] {
    const n = index.nodes.get(id)!,
      p = index.parents.get(id),
      t = n.transform;
    if (!axisAligned(n))
      throw new Error(
        "Scroll content cannot be moved through a rotated ancestor.",
      );
    if (!p) return [t[0][2], t[1][2], t[0][0], t[1][1]];
    const [x, y, sx, sy] = absolute(p);
    return [x + t[0][2] * sx, y + t[1][2] * sy, sx * t[0][0], sy * t[1][1]];
  }
  const relationshipNodes = new Set(
    accepted.flatMap(({ viewport, artwork, settings: v }) => [
      viewport,
      artwork.id,
      ...(v.contentId ? [v.contentId] : []),
    ]),
  );
  for (const { artwork } of accepted) {
    if (
      descendants(artwork).some(
        (id) => id !== artwork.id && relationshipNodes.has(id),
      )
    )
      throw new Error(
        "Scrollbar artwork cannot consume another scrolling relationship.",
      );
  }
  for (const { viewport, settings: v } of accepted)
    if (v.contentId && index.parents.get(v.contentId) !== viewport) {
      if (!index.parents.has(v.contentId))
        throw new Error(
          "Select a screen containing both the viewport and its content.",
        );
      absolute(v.contentId);
      absolute(viewport);
    }
  if (validateOnly)
    return {
      designs,
      settings: { ...settings, layerOverrides: overrides },
      accepted,
    };
  const copy: DesignNode[] = JSON.parse(JSON.stringify(designs)),
    copied = designIndex(copy);
  for (const { viewport, settings: v } of accepted)
    if (v.contentId && copied.parents.get(v.contentId) !== viewport) {
      const content = copied.nodes.get(v.contentId)!,
        prior = copied.parents.get(v.contentId)!;
      const [x, y, sx, sy] = absolute(v.contentId),
        [px, py, psx, psy] = absolute(viewport);
      copied.nodes.get(prior)!.children = copied.nodes
        .get(prior)!
        .children.filter((c) => c.id !== content.id);
      content.transform = [
        [sx / psx, 0, (x - px) / psx],
        [0, sy / psy, (y - py) / psy],
      ];
      content.absolute = true;
      copied.nodes.get(viewport)!.children.push(content);
      copied.parents.set(content.id, viewport);
    }
  function omit(nodes: DesignNode[]): DesignNode[] {
    return nodes
      .filter((n) => !consumed.has(n.id))
      .map((n) => ({ ...n, children: omit(n.children) }));
  }
  return {
    designs: omit(copy),
    settings: { ...settings, layerOverrides: overrides },
    accepted,
  };
}
export function scrollbarCandidates(
  designs: DesignNode[],
  viewportId: string,
  includeAll = false,
) {
  const index = designIndex(designs),
    viewport = index.nodes.get(viewportId);
  if (!viewport) return [];
  const nameMatch = (source: DesignNode) =>
    source.name
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .startsWith(viewport.name.replace(/[^a-z0-9]/gi, "").toLowerCase());
  const ancestors = new Set<string>();
  let parent = index.parents.get(viewportId);
  while (parent) {
    ancestors.add(parent);
    parent = index.parents.get(parent);
  }
  return [...index.nodes.values()]
    .filter(
      (n) =>
        n.id !== viewportId &&
        n.visible &&
        !n.text &&
        axisAligned(n) &&
        n.width > 0 &&
        n.height > 0 &&
        index.roots.get(n.id) === index.roots.get(viewportId) &&
        !ancestors.has(n.id) &&
        (includeAll ||
          /(?:scroll.?bar|scroll.?thumb)/i.test(n.name) ||
          Math.max(n.width / n.height, n.height / n.width) >= 3),
    )
    .map((source) => ({
      source,
      axis: (source.width > source.height ? "X" : "Y") as "X" | "Y",
      reason: /(?:scroll.?bar|scroll.?thumb)/i.test(source.name)
        ? "Scrollbar name"
        : Math.max(
              source.width / source.height,
              source.height / source.width,
            ) >= 3
          ? "Thin artwork; confirm its purpose"
          : "Artwork source",
    }))
    .sort(
      (a, b) =>
        Number(b.reason === "Scrollbar name") -
          Number(a.reason === "Scrollbar name") ||
        Number(nameMatch(b.source)) - Number(nameMatch(a.source)) ||
        Number(a.reason === "Artwork source") -
          Number(b.reason === "Artwork source") ||
        a.source.name.localeCompare(b.source.name),
    );
}
export function applyScrollbarImages(
  pkg: TransferPackage,
  accepted: ReturnType<typeof prepareScrollbars>["accepted"],
  options: ExportOptions,
) {
  const nodes = new Map(flatten(pkg.roots).map((n) => [n.id, n]));
  for (const { viewport, artwork, settings: v } of accepted) {
    const node = nodes.get(viewport);
    if (!node || node.className !== "ScrollingFrame")
      throw new Error("Scrollbar viewport was flattened or excluded.");
    const processing = exportImageProcessing(
      options.layerOverrides[artwork.id]?.imageProcessing,
    );
    node.assetBindings = {};
    const slices = [
      ["TopImage", 0, v.startCap],
      ["MidImage", v.startCap, 1 - v.endCap],
      ["BottomImage", 1 - v.endCap, 1],
    ] as const;
    for (const [property, start, end] of slices) {
      const id = `${artworkAssetId(artwork.id, processing)}:scroll-v1:${v.axis}:${start}:${end}`;
      const explicit = options.layerOverrides[viewport]?.properties?.[property];
      const robloxId = validAssetId(
        String(explicit ?? options.assetIds[id] ?? ""),
      );
      if (explicit !== undefined && explicit !== "" && !robloxId)
        throw new Error("Scrollbar images need a Roblox image asset ID.");
      node.assetBindings[property] = id;
      node.properties[property] = robloxId ?? "";
      const length =
        (v.axis === "Y"
          ? (artwork.rasterBounds?.height ?? artwork.height)
          : (artwork.rasterBounds?.width ?? artwork.width)) *
        (end - start);
      const cross =
        v.axis === "Y"
          ? (artwork.rasterBounds?.width ?? artwork.width)
          : (artwork.rasterBounds?.height ?? artwork.height);
      const name = `${node.name} ${property}`;
      pkg.assets.push({
        id,
        nodeId: artwork.id,
        name,
        filename: `${name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}_${artwork.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`,
        width: cross,
        height: length,
        scale: options.imageScale,
        robloxId,
        processing,
        scrollbarSlice: { axis: v.axis, start, end },
        reason: `Native scrollbar ${property}`,
      });
    }
    Object.assign(node.properties, {
      ClipsDescendants: true,
      ScrollingEnabled: true,
      Active: true,
      AutomaticCanvasSize: { type: "Enum", value: ["AutomaticSize", v.axis] },
      ScrollingDirection: {
        type: "Enum",
        value: ["ScrollingDirection", v.axis],
      },
      ScrollBarThickness: v.thickness,
    });
    node.properties.ScrollBarImageColor3 ??= {
      type: "Color3",
      value: [1, 1, 1],
    };
    node.properties.ScrollBarImageTransparency ??= 0;
    if (
      pkg.assets.some(
        (a) => Object.values(node.assetBindings!).includes(a.id) && !a.robloxId,
      )
    )
      pkg.issues.push({
        nodeId: artwork.id,
        nodeName: artwork.name,
        severity: "warning",
        code: "asset-required",
        message: "Upload or link all three scrollbar images before importing.",
      });
    pkg.issues.push({
      nodeId: viewport,
      nodeName: node.name,
      severity: "info",
      code: "scrollbar-artwork",
      message:
        "Confirmed artwork becomes three native scrollbar images. Its source layers remain in Figma; the exported decorative copy is omitted. Roblox stretches the middle and controls thumb placement.",
    });
  }
  pkg.stats.instances = flatten(pkg.roots).length;
  return pkg;
}
