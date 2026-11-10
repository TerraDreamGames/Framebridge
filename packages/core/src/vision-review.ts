import { pngPixelSize } from "./image-scaling";
import {
  reviewChanges,
  structureReview,
  validDecision,
  type ReviewDecision,
} from "./structure-review";
import {
  flatten,
  type AnalysisResult,
  type ButtonState,
  type DesignNode,
  type LayerOverride,
} from "./types";
import type { OverrideChange } from "./bulk-editor";

export const VISION_LIMITS = {
  layers: 128,
  metadataBytes: 24000,
  imageBytes: 524288,
  imageEdge: 512,
  requestBytes: 740000,
  responseBytes: 65536,
  suggestions: 24,
  timeoutMs: 25000,
  dailyUser: 10,
  dailyInvite: 50,
  dailyGlobal: 200,
  concurrent: 3,
  allowanceMicros: 1000000,
} as const;
export type VisionRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export const FULL_VISION_REGION: VisionRegion = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};
export type VisionLayer = {
  token: string;
  parent: string;
  type: string;
  name: string;
  className: string;
  bounds: [number, number, number, number];
  choices: string[];
  editable: boolean;
  text?: string;
};
export type VisionRequest = {
  version: 1;
  id: string;
  consent: { screenshot: true; metadata: true; text: boolean };
  maxCostMicros: number;
  image: string;
  layers: VisionLayer[];
};
export type VisionSuggestion = {
  layer: string;
  kind: ReviewDecision["kind"] | "state" | "component";
  value: string;
  confidence: number;
  reasons: string[];
  related: string[];
};
export type VisionResult = { summary: string; suggestions: VisionSuggestion[] };
export type VisionConfig = {
  available: boolean;
  simulation?: boolean;
  provider?: "OpenAI";
  model?: string;
  maxCostMicros?: number;
  maxOutputTokens?: number;
  remainingRequests?: number;
  remainingCostMicros?: number;
  resetsAt?: number;
};
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const only = (v: Record<string, any>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown, maximum: number, empty = false): v is string =>
  typeof v === "string" &&
  (empty || !!v.trim()) &&
  v.length <= maximum &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const token = (v: unknown) =>
  typeof v === "string" && /^L(?:[1-9]\d{0,2})$/.test(v);
const states = ["default", "hover", "pressed", "disabled", "selected"];
export function validVisionRegion(r: VisionRegion): boolean {
  return (
    object(r) &&
    only(r, ["x", "y", "width", "height"]) &&
    [r.x, r.y, r.width, r.height].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    ) &&
    r.width >= 0.01 &&
    r.height >= 0.01 &&
    r.x + r.width <= 1.000001 &&
    r.y + r.height <= 1.000001
  );
}
/** A closed metadata projection. Provider labels map to source IDs only in memory. */
export function prepareVisionMetadata(
  result: AnalysisResult,
  rootId: string,
  region: VisionRegion,
  includeText: boolean,
) {
  const root = result.designs?.find((n) => n.id === rootId);
  if (
    !root ||
    !validVisionRegion(region) ||
    root.width <= 0 ||
    root.height <= 0
  )
    throw new Error("Choose an analyzed screen and a valid review region.");
  const report = structureReview([root], result.package);
  const byId = new Map(report.layers.map((l) => [l.source.id, l]));
  const map: Record<string, string> = {},
    layers: VisionLayer[] = [];
  const labels = new Map<string, string>();
  let truncated = false,
    metadataBytes = 2;
  type Matrix = [number, number, number, number, number, number];
  const multiply = (a: Matrix, b: Matrix): Matrix => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const visit = (
    source: DesignNode,
    parent: Matrix,
    parentId: string,
    isRoot = false,
  ) => {
    if (!source.visible) return;
    const t = source.transform;
    const matrix: Matrix = isRoot
      ? [1, 0, 0, 1, 0, 0]
      : multiply(parent, [
          t[0][0],
          t[1][0],
          t[0][1],
          t[1][1],
          t[0][2],
          t[1][2],
        ]);
    const corners = [
      [0, 0],
      [source.width, 0],
      [0, source.height],
      [source.width, source.height],
    ].map(([x, y]) => [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5],
    ]);
    const x = Math.min(...corners.map((p) => p[0])) / root.width,
      y = Math.min(...corners.map((p) => p[1])) / root.height;
    const w = Math.max(...corners.map((p) => p[0])) / root.width - x,
      h = Math.max(...corners.map((p) => p[1])) / root.height - y;
    if (
      [x, y, w, h].every(Number.isFinite) &&
      x < region.x + region.width &&
      y < region.y + region.height &&
      x + w > region.x &&
      y + h > region.y
    ) {
      if (!truncated && layers.length < VISION_LIMITS.layers) {
        const label = "L" + (layers.length + 1),
          review = byId.get(source.id);
        const candidate: VisionLayer = {
          token: label,
          parent: labels.get(parentId) ?? "",
          type: source.type.slice(0, 32),
          name: source.name.slice(0, 80),
          className: review?.node?.className ?? "Not exported",
          bounds: [
            (x - region.x) / region.width,
            (y - region.y) / region.height,
            w / region.width,
            h / region.height,
          ].map((n) => Math.round(n * 10000) / 10000) as VisionLayer["bounds"],
          choices: review?.choices ?? [],
          editable: !!review?.node && !review.blocked,
          ...(includeText && source.text
            ? { text: source.text.characters.slice(0, 120) }
            : {}),
        };
        const bytes =
          new TextEncoder().encode(JSON.stringify(candidate)).length + 1;
        if (metadataBytes + bytes <= VISION_LIMITS.metadataBytes) {
          labels.set(source.id, label);
          map[label] = source.id;
          layers.push(candidate);
          metadataBytes += bytes;
        } else truncated = true;
      } else truncated = true;
    }
    for (const child of source.children) visit(child, matrix, source.id);
  };
  visit(root, [1, 0, 0, 1, 0, 0], "", true);
  if (!layers.length)
    throw new Error("No visible layers intersect this review region.");
  if (
    new TextEncoder().encode(JSON.stringify(layers)).length >
    VISION_LIMITS.metadataBytes
  )
    throw new Error("Layer metadata is too large. Review a smaller region.");
  return { layers, map, truncated };
}
export function validateVisionRequest(raw: unknown): VisionRequest {
  if (
    !object(raw) ||
    !only(raw, [
      "version",
      "id",
      "consent",
      "maxCostMicros",
      "image",
      "layers",
    ]) ||
    raw.version !== 1 ||
    !text(raw.id, 36) ||
    !/^[a-f0-9-]{36}$/.test(raw.id) ||
    !object(raw.consent) ||
    !only(raw.consent, ["screenshot", "metadata", "text"]) ||
    raw.consent.screenshot !== true ||
    raw.consent.metadata !== true ||
    typeof raw.consent.text !== "boolean" ||
    !Number.isSafeInteger(raw.maxCostMicros) ||
    raw.maxCostMicros < 1 ||
    raw.maxCostMicros > VISION_LIMITS.allowanceMicros ||
    !Array.isArray(raw.layers) ||
    !raw.layers.length ||
    raw.layers.length > VISION_LIMITS.layers ||
    new TextEncoder().encode(JSON.stringify(raw.layers)).length >
      VISION_LIMITS.metadataBytes
  )
    throw new Error("Review consent, allowance or metadata is invalid.");
  if (
    typeof raw.image !== "string" ||
    raw.image.length > Math.ceil(VISION_LIMITS.imageBytes / 3) * 4 + 22 ||
    !/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      raw.image,
    )
  )
    throw new Error(
      "Review needs one bounded PNG screenshot, not a URL or file.",
    );
  const bytes = Uint8Array.from(atob(raw.image.slice(22)), (c) =>
      c.charCodeAt(0),
    ),
    size = pngPixelSize(bytes);
  if (
    bytes.length > VISION_LIMITS.imageBytes ||
    !size ||
    size.some((n) => n > VISION_LIMITS.imageEdge)
  )
    throw new Error("Screenshot exceeds the 512-pixel/512-KiB limit.");
  const seen = new Set<string>();
  for (const layer of raw.layers) {
    if (
      !object(layer) ||
      !only(layer, [
        "token",
        "parent",
        "type",
        "name",
        "className",
        "bounds",
        "choices",
        "editable",
        "text",
      ]) ||
      !token(layer.token) ||
      seen.has(layer.token) ||
      !(layer.parent === "" || seen.has(layer.parent)) ||
      !text(layer.type, 32) ||
      !/^[A-Z_]+$/.test(layer.type) ||
      !text(layer.name, 80, true) ||
      !text(layer.className, 32) ||
      !Array.isArray(layer.bounds) ||
      layer.bounds.length !== 4 ||
      layer.bounds.some(
        (n: unknown) =>
          typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 10000,
      ) ||
      layer.bounds[2] < 0 ||
      layer.bounds[3] < 0 ||
      typeof layer.editable !== "boolean" ||
      !Array.isArray(layer.choices) ||
      layer.choices.length > 10 ||
      layer.choices.some(
        (v: unknown) => !validDecision({ kind: "class", value: v }),
      ) ||
      (layer.text !== undefined &&
        (!raw.consent.text || !text(layer.text, 120, true)))
    )
      throw new Error("Only bounded, typed layer metadata may be shared.");
    seen.add(layer.token);
  }
  return raw as VisionRequest;
}
export function readVisionResult(
  raw: unknown,
  layers: VisionLayer[],
): VisionResult {
  if (
    !object(raw) ||
    !only(raw, ["summary", "suggestions"]) ||
    !text(raw.summary, 300, true) ||
    !Array.isArray(raw.suggestions) ||
    raw.suggestions.length > VISION_LIMITS.suggestions
  )
    throw new Error(
      "Provider returned an invalid review. Local review remains available.",
    );
  const known = new Map(layers.map((l) => [l.token, l]));
  const seen = new Set<string>();
  for (const s of raw.suggestions) {
    if (
      !object(s) ||
      !only(s, [
        "layer",
        "kind",
        "value",
        "confidence",
        "reasons",
        "related",
      ]) ||
      !known.has(s.layer) ||
      !text(s.value, 100) ||
      typeof s.confidence !== "number" ||
      !Number.isFinite(s.confidence) ||
      s.confidence < 0 ||
      s.confidence > 1 ||
      !Array.isArray(s.reasons) ||
      !s.reasons.length ||
      s.reasons.length > 3 ||
      s.reasons.some((r: unknown) => !text(r, 180)) ||
      !Array.isArray(s.related) ||
      s.related.length > 8 ||
      s.related.some(
        (id: unknown) => typeof id !== "string" || !known.has(id),
      ) ||
      new Set(s.related).size !== s.related.length ||
      (s.kind === "component"
        ? s.value !== "review" || s.related.length < 2
        : s.related.length > 0 ||
          (s.kind === "state"
            ? !states.includes(s.value)
            : !validDecision({ kind: s.kind, value: s.value }))) ||
      (s.kind === "class" && !known.get(s.layer)!.choices.includes(s.value)) ||
      (!known.get(s.layer)!.editable && s.kind !== "component") ||
      seen.has(s.layer + ":" + s.kind)
    )
      throw new Error(
        "Provider returned an incompatible or unsupported correction.",
      );
    seen.add(s.layer + ":" + s.kind);
  }
  return {
    summary: raw.summary,
    suggestions: raw.suggestions.map((s) => ({
      ...s,
      reasons: [...s.reasons],
      related: [...s.related],
    })),
  };
}
/** The provider never supplies overrides, scripts, IDs or properties. Acceptance rechecks current native ownership. */
export function visionChanges(
  result: AnalysisResult,
  map: Record<string, string>,
  suggestion: VisionSuggestion,
  overrides: Record<string, LayerOverride>,
): OverrideChange[] {
  const id = map[suggestion.layer];
  const layer = structureReview(
    result.designs ?? [],
    result.package,
    overrides,
  ).layers.find((l) => l.source.id === id);
  if (!id || !layer || layer.blocked || !layer.node)
    throw new Error("Analyze and review this editable layer again.");
  if (suggestion.kind === "component")
    throw new Error(
      "Review component candidates in the component exporter before extracting.",
    );
  if (suggestion.kind !== "state")
    return reviewChanges(
      layer,
      { kind: suggestion.kind, value: suggestion.value } as ReviewDecision,
      overrides,
    );
  if (
    !states.includes(suggestion.value) ||
    layer.node.className.endsWith("Button") ||
    layer.node.behavior?.control ||
    layer.node.behavior?.motion ||
    (layer.node.behavior && "keyframes" in layer.node.behavior)
  )
    throw new Error(
      "State artwork needs a separate editable layer without a competing behavior.",
    );
  const nodes = flatten(result.package.roots);
  let parent = nodes.find((n) => n.children.includes(layer.node!));
  while (parent && !parent.className.endsWith("Button"))
    parent = nodes.find((n) => n.children.includes(parent!));
  if (
    !parent ||
    nodes.some(
      (n) =>
        n.id !== id &&
        n.behavior?.state?.owner === parent!.id &&
        n.behavior.state.kind === suggestion.value,
    )
  )
    throw new Error(
      "Choose one artwork layer per state under a native button.",
    );
  return [
    {
      id,
      value: {
        ...overrides[id],
        behavior: {
          ...overrides[id]?.behavior,
          state: suggestion.value as ButtonState,
        },
      },
    },
  ];
}
