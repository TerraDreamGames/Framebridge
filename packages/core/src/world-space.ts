import {
  flatten,
  type RbxNode,
  type TransferPackage,
  type Value,
} from "./types";

export type WorldSettings = {
  kind: "surface" | "billboard" | "prompt";
  alwaysOnTop: boolean;
  lightInfluence: number;
  maxDistance: number;
  face?: "Front" | "Back" | "Left" | "Right" | "Top" | "Bottom";
  widthStuds?: number;
  offset?: [number, number, number];
  prompt?: {
    actionText: string;
    objectText: string;
    keyboardKey: "E" | "F" | "Q" | "R" | "T";
    gamepadKey: "ButtonX" | "ButtonY" | "ButtonA" | "ButtonB";
    holdDuration: number;
    activationDistance: number;
    requiresLineOfSight: boolean;
    clickable: boolean;
    labels?: {
      action?: string;
      object?: string;
      input?: string;
      hold?: string;
    };
  };
};

export const isGuiRoot = (className: string) =>
  ["ScreenGui", "SurfaceGui", "BillboardGui"].includes(className);
export function defaultWorldSettings(
  kind: WorldSettings["kind"],
): WorldSettings {
  const base = { kind, alwaysOnTop: true, lightInfluence: 0, maxDistance: 100 };
  if (kind === "surface") return { ...base, face: "Front" };
  const billboard = {
    ...base,
    widthStuds: 4,
    offset: [0, 2, 0] as [number, number, number],
  };
  return kind === "billboard"
    ? billboard
    : {
        ...billboard,
        prompt: {
          actionText: "Interact",
          objectText: "",
          keyboardKey: "E",
          gamepadKey: "ButtonX",
          holdDuration: 0,
          activationDistance: 10,
          requiresLineOfSight: true,
          clickable: true,
        },
      };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validWorldSettings(v: unknown): v is WorldSettings {
  if (
    !object(v) ||
    !["surface", "billboard", "prompt"].includes(String(v.kind)) ||
    !fields(v, [
      "kind",
      "alwaysOnTop",
      "lightInfluence",
      "maxDistance",
      ...(v.kind === "surface"
        ? ["face"]
        : ["widthStuds", "offset", ...(v.kind === "prompt" ? ["prompt"] : [])]),
    ]) ||
    typeof v.alwaysOnTop !== "boolean" ||
    !number(v.lightInfluence, 0, 1) ||
    !number(v.maxDistance, 0, 10000)
  )
    return false;
  if (v.kind === "surface")
    return ["Front", "Back", "Left", "Right", "Top", "Bottom"].includes(
      String(v.face),
    );
  if (
    !number(v.widthStuds, 0.01, 1000) ||
    !Array.isArray(v.offset) ||
    v.offset.length !== 3 ||
    !v.offset.every((n) => number(n, -1000, 1000))
  )
    return false;
  if (v.kind === "billboard") return true;
  const p = v.prompt;
  if (
    !object(p) ||
    !fields(p, [
      "actionText",
      "objectText",
      "keyboardKey",
      "gamepadKey",
      "holdDuration",
      "activationDistance",
      "requiresLineOfSight",
      "clickable",
      "labels",
    ]) ||
    !["actionText", "objectText"].every(
      (k) => typeof p[k] === "string" && (p[k] as string).length <= 200,
    ) ||
    !["E", "F", "Q", "R", "T"].includes(String(p.keyboardKey)) ||
    !["ButtonX", "ButtonY", "ButtonA", "ButtonB"].includes(
      String(p.gamepadKey),
    ) ||
    !number(p.holdDuration, 0, 60) ||
    !number(p.activationDistance, 0.1, 1000) ||
    typeof p.requiresLineOfSight !== "boolean" ||
    typeof p.clickable !== "boolean"
  )
    return false;
  return (
    p.labels === undefined ||
    (object(p.labels) &&
      fields(p.labels, ["action", "object", "input", "hold"]) &&
      Object.values(p.labels).every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= 256,
      ))
  );
}

export function worldProperties(
  settings: WorldSettings,
  canvas: [number, number],
): Record<string, Value> {
  if (
    !validWorldSettings(settings) ||
    canvas.length !== 2 ||
    !canvas.every((n) => number(n, 1, 100000))
  )
    throw new Error("Invalid world UI settings or canvas.");
  const common: Record<string, Value> = {
    Enabled: true,
    ResetOnSpawn: false,
    ZIndexBehavior: { type: "Enum", value: ["ZIndexBehavior", "Sibling"] },
    AlwaysOnTop: settings.alwaysOnTop,
    LightInfluence: settings.lightInfluence,
    MaxDistance: settings.maxDistance,
    Active: true,
    ClipsDescendants: true,
  };
  if (settings.kind === "surface")
    return {
      ...common,
      Face: { type: "Enum", value: ["NormalId", settings.face!] },
      CanvasSize: { type: "Vector2", value: canvas },
      SizingMode: {
        type: "Enum",
        value: ["SurfaceGuiSizingMode", "FixedSize"],
      },
    };
  const heightStuds = (settings.widthStuds! * canvas[1]) / canvas[0];
  if (!number(heightStuds, 0, 1_000_000))
    throw new Error(
      "Billboard height exceeds the supported geometry bounds. Reduce its width in studs or canvas aspect ratio.",
    );
  return {
    ...common,
    Size: {
      type: "UDim2",
      value: [settings.widthStuds!, 0, heightStuds, 0],
    },
    StudsOffsetWorldSpace: { type: "Vector3", value: settings.offset! },
  };
}

export function applyWorldSettings(
  pkg: TransferPackage,
  overrides: Record<string, { worldUI?: WorldSettings | false }>,
): TransferPackage {
  for (const root of pkg.roots) {
    const sourceId = root.id.startsWith("screen:") ? root.id.slice(7) : root.id;
    const settings = overrides[sourceId]?.worldUI;
    if (!settings) continue;
    if (!validWorldSettings(settings))
      throw new Error("Invalid world UI configuration.");
    const canvas = root.referenceSize;
    if (!canvas) throw new Error("World UI needs its authored canvas size.");
    root.className =
      settings.kind === "surface" ? "SurfaceGui" : "BillboardGui";
    root.worldUI = JSON.parse(JSON.stringify(settings));
    root.properties = worldProperties(settings, canvas);
    // A world collector has its own canvas, rather than the screen's viewport.
    // Billboard canvases are scaled by the trusted runtime as camera distance changes.
    for (const child of root.children) {
      child.properties.Position = { type: "UDim2", value: [0, 0, 0, 0] };
      child.properties.AnchorPoint = { type: "Vector2", value: [0, 0] };
      child.properties.Size = {
        type: "UDim2",
        value: [0, canvas[0], 0, canvas[1]],
      };
      child.properties.AutomaticSize = {
        type: "Enum",
        value: ["AutomaticSize", "None"],
      };
    }
    root.children = [
      {
        id: root.id + "/world-canvas",
        name: "WorldCanvas",
        className: "Frame",
        sourceType: "WORLD_CANVAS",
        referenceSize: canvas,
        properties: {
          Size: { type: "UDim2", value: [0, canvas[0], 0, canvas[1]] },
          Position: { type: "UDim2", value: [0, 0, 0, 0] },
          AnchorPoint: { type: "Vector2", value: [0, 0] },
          BackgroundTransparency: 1,
          BorderSizePixel: 0,
          ClipsDescendants: true,
        },
        children: root.children,
      },
    ];
    for (const node of flatten([root])) {
      if (node.behavior?.motion?.magnet)
        pkg.issues.push({
          nodeId: node.id,
          nodeName: node.name,
          severity: "warning",
          code: "world-cursor",
          message:
            "Cursor magnet uses screen coordinates and is inactive on world UI. Other button responses remain available.",
        });
      if (node.className === "CanvasGroup" && settings.kind === "surface")
        pkg.issues.push({
          nodeId: node.id,
          nodeName: node.name,
          severity: "error",
          code: "world-canvas-group",
          message:
            "SurfaceGui cannot render CanvasGroup. Use a Frame and individual transparency, or keep this design on screen.",
        });
    }
  }
  validateWorldRoots(pkg.roots);
  pkg.stats.instances = flatten(pkg.roots).length;
  return pkg;
}

export function validateWorldRoots(roots: RbxNode[]) {
  for (const root of roots) {
    const nodes = flatten([root]);
    for (const node of nodes)
      if (node !== root && node.worldUI !== undefined)
        throw new Error("World configuration belongs on the root collector.");
    if (root.className === "ScreenGui") {
      if (root.worldUI !== undefined)
        throw new Error("ScreenGui cannot carry world UI configuration.");
      continue;
    }
    const settings = root.worldUI;
    if (
      !settings ||
      !validWorldSettings(settings) ||
      root.className !==
        (settings.kind === "surface" ? "SurfaceGui" : "BillboardGui")
    )
      throw new Error("World root class and settings must agree.");
    if (
      !root.referenceSize ||
      root.referenceSize.length !== 2 ||
      !root.referenceSize.every((n) => number(n, 1, 100000))
    )
      throw new Error("World UI requires a finite authored canvas.");
    if (
      root.children.length !== 1 ||
      root.children[0].id !== root.id + "/world-canvas" ||
      root.children[0].className !== "Frame"
    )
      throw new Error("World UI needs one authored canvas wrapper.");
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parents = new Map(
      nodes.flatMap((n) => n.children.map((child) => [child.id, n] as const)),
    );
    if (settings.prompt?.labels) {
      const chosen = new Set<string>();
      for (const [role, id] of Object.entries(settings.prompt.labels)) {
        const node = byId.get(id);
        if (
          !node ||
          node === root ||
          chosen.has(id) ||
          (role === "hold"
            ? !["Frame", "ImageLabel"].includes(node.className)
            : !["TextLabel", "TextButton", "TextBox"].includes(node.className))
        )
          throw new Error(
            "Prompt labels must reference distinct compatible layers in the same design.",
          );
        if (
          role === "hold" &&
          (node.sourceType === "WORLD_CANVAS" ||
            node.behavior?.motion ||
            node.behavior?.keyframes ||
            parents
              .get(node.id)
              ?.children.some((child) =>
                [
                  "UIListLayout",
                  "UIGridLayout",
                  "UITableLayout",
                  "UIPageLayout",
                ].includes(child.className),
              ) ||
            node.children.some((child) =>
              ["UIAspectRatioConstraint", "UISizeConstraint"].includes(
                child.className,
              ),
            ) ||
            (node.properties.AutomaticSize &&
              (node.properties.AutomaticSize as { value?: string[] })
                .value?.[1] !== "None"))
        )
          throw new Error(
            "Hold progress needs a fixed layer without motion, layout ownership or size constraints.",
          );
        chosen.add(id);
      }
    }
    if (
      settings.kind === "surface" &&
      nodes.some((n) => n.className === "CanvasGroup")
    )
      throw new Error("SurfaceGui cannot render CanvasGroup.");
    if (
      byId.has(root.id + "/world-target") ||
      byId.has(root.id + "/world-prompt")
    )
      throw new Error("Reserved world helper identity.");
  }
}

export function worldAttributes(root: RbxNode): Record<string, string> {
  return {
    ...(isGuiRoot(root.className) && root.referenceSize
      ? { FramebridgeCanvas: JSON.stringify(root.referenceSize) }
      : {}),
    ...(root.worldUI
      ? {
          FramebridgeWorld: JSON.stringify(root.worldUI),
          FramebridgeWorldCanvas: JSON.stringify(root.referenceSize),
        }
      : {}),
  };
}
