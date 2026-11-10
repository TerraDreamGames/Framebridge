import type { RbxNode, TransferPackage } from "./types";
import { screenshotPng } from "./image-processing";
import { pngPixelSize } from "./image-scaling";

export const FEEDBACK_LIMITS = {
  reportBytes: 800000,
  screenshotBytes: 512 * 1024,
  nodes: 300,
  issues: 100,
};
export const FEEDBACK_CATEGORIES = [
  "conversion",
  "images",
  "connection",
  "interface",
  "other",
] as const;
type Category = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackNode = {
  path: string;
  className: string;
  properties: Record<string, number | boolean | number[] | [string, string]>;
  image: boolean;
  interactions: boolean;
};
export type FeedbackDiagnostics = {
  options: {
    layout: "exact" | "responsive";
    appearance: "faithful" | "editable";
    imageScale: number;
  };
  stats: { layers: number; instances: number; native: number; raster: number };
  nodes: FeedbackNode[];
  issues: {
    severity: "info" | "warning" | "error";
    code: string;
    path?: string;
  }[];
  truncated: boolean;
};
export type FeedbackScreenshot = {
  mime: "image/png";
  data: string;
  width: number;
  height: number;
};
export type FeedbackReport = {
  format: "framebridge-feedback";
  version: 1;
  clientVersion: string;
  category: Category;
  title: string;
  steps: string;
  expected: string;
  actual: string;
  diagnostics?: FeedbackDiagnostics;
  screenshot?: FeedbackScreenshot;
};
export type FeedbackReceipt = {
  id: string;
  title: string;
  category: FeedbackReport["category"];
  receivedAt: number;
  expiresAt: number;
};
export function feedbackBytes(report: FeedbackReport) {
  let bytes = 0;
  for (const character of JSON.stringify(report)) {
    const code = character.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
const GEOMETRY = new Set([
  "Position",
  "Size",
  "AnchorPoint",
  "Rotation",
  "CanvasSize",
  "AutomaticSize",
  "AutomaticCanvasSize",
  "ClipsDescendants",
  "ScrollingDirection",
  "ScrollBarThickness",
  "PaddingTop",
  "PaddingBottom",
  "PaddingLeft",
  "PaddingRight",
  "Padding",
  "CellSize",
  "CellPadding",
  "FillDirection",
  "FillDirectionMaxCells",
  "HorizontalAlignment",
  "VerticalAlignment",
  "SortOrder",
  "AspectRatio",
  "MinSize",
  "MaxSize",
  "SizeConstraint",
  "LayoutOrder",
  "Visible",
]);
const record = (value: unknown, fields: string[]) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error("Invalid report fields.");
  return value as Record<string, any>;
};
const bounded = (value: unknown, max: number, minimum = 0): string => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.trim().length < minimum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error("Report text is missing or too long.");
  return value;
};
export function feedbackText(
  value: string,
  knownSecrets: readonly string[] = [],
) {
  let clean = value;
  for (const secret of knownSecrets)
    if (secret.length >= 8) clean = clean.split(secret).join("[removed]");
  return clean
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [removed]")
    .replace(
      /\b(?:api[_ -]?key|(?:access|refresh|account|sender|receiver|owner|receipt|login)[_ -]?token|client[_ -]?secret|private[_ -]?beta(?:[_ -]?access)?|sealing[_ -]?key)\s*[=:]\s*["']?[^\s"',;}]+/gi,
      "[credential removed]",
    )
    .replace(/\b[a-f0-9]{64}\b/gi, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[removed]")
    .replace(
      /([?&](?:code|state|token|api_key|key|invite|access_token|refresh_token|client_secret)=)[^\s&#]*/gi,
      "$1[removed]",
    );
}
function property(value: unknown) {
  if (typeof value === "boolean") return value;
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 1e7
  )
    return value;
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 4 &&
    value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e7,
    )
  )
    return value as number[];
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (n) => typeof n === "string" && /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(n),
    )
  )
    return value as [string, string];
  throw new Error("Invalid layout diagnostic value.");
}
/** Fixed fields only. Names, original IDs, text, image links, scripts and bindings never enter the snapshot. */
export function feedbackDiagnostics(pkg: TransferPackage): FeedbackDiagnostics {
  const nodes: FeedbackNode[] = [],
    paths = new Map<string, string>();
  const visit = (items: RbxNode[], parent = "", depth = 0) => {
    if (depth > 90) return;
    for (const [index, node] of items.entries()) {
      if (nodes.length >= FEEDBACK_LIMITS.nodes) return;
      const path = parent ? parent + "/" + (index + 1) : String(index + 1);
      paths.set(node.id, path);
      const properties: FeedbackNode["properties"] = {};
      for (const key of GEOMETRY) {
        const v = node.properties[key];
        if (v === undefined) continue;
        try {
          properties[key] = property(
            typeof v === "object" ? (v as { value?: unknown }).value : v,
          );
        } catch {
          /* Unsupported values are omitted rather than copied. */
        }
      }
      nodes.push({
        path,
        className: node.className,
        properties,
        image: !!node.assetRef || !!node.assetBindings,
        interactions: !!node.behavior,
      });
      visit(node.children, path, depth + 1);
    }
  };
  visit(pkg.roots);
  return {
    options: {
      layout: pkg.options.layout,
      appearance: pkg.options.appearance,
      imageScale: pkg.options.imageScale,
    },
    stats: {
      layers: pkg.stats.layers,
      instances: pkg.stats.instances,
      native: pkg.stats.native,
      raster: pkg.stats.raster,
    },
    nodes,
    issues: pkg.issues.slice(0, FEEDBACK_LIMITS.issues).map((i) => ({
      severity: i.severity,
      code: i.code,
      ...(paths.has(i.nodeId) ? { path: paths.get(i.nodeId)! } : {}),
    })),
    truncated:
      nodes.length < pkg.stats.instances ||
      pkg.issues.length > FEEDBACK_LIMITS.issues,
  };
}
function diagnostics(value: unknown): FeedbackDiagnostics {
  const v = record(value, ["options", "stats", "nodes", "issues", "truncated"]),
    options = record(v.options, ["layout", "appearance", "imageScale"]),
    stats = record(v.stats, ["layers", "instances", "native", "raster"]);
  if (
    !["exact", "responsive"].includes(options.layout) ||
    !["faithful", "editable"].includes(options.appearance) ||
    ![1, 2, 3].includes(options.imageScale) ||
    typeof v.truncated !== "boolean" ||
    Object.keys(stats).length !== 4 ||
    Object.values(stats).some(
      (n) => !Number.isSafeInteger(n) || n < 0 || n > 1e7,
    ) ||
    !Array.isArray(v.nodes) ||
    v.nodes.length > FEEDBACK_LIMITS.nodes ||
    !Array.isArray(v.issues) ||
    v.issues.length > FEEDBACK_LIMITS.issues
  )
    throw new Error("Invalid layout diagnostics.");
  const paths = new Set<string>();
  const path = (p: unknown) =>
    typeof p === "string" &&
    p.length <= 500 &&
    /^[1-9]\d*(\/[1-9]\d*)*$/.test(p);
  const nodes = v.nodes.map((value: unknown) => {
    const n = record(value, [
      "path",
      "className",
      "properties",
      "image",
      "interactions",
    ]);
    if (
      !path(n.path) ||
      paths.has(n.path) ||
      typeof n.className !== "string" ||
      !/^[A-Za-z][A-Za-z0-9]{0,49}$/.test(n.className) ||
      typeof n.image !== "boolean" ||
      typeof n.interactions !== "boolean"
    )
      throw new Error("Invalid structure diagnostic.");
    paths.add(n.path);
    const p = record(n.properties, [...GEOMETRY]),
      properties: FeedbackNode["properties"] = {};
    for (const key of GEOMETRY)
      if (key in p) properties[key] = property(p[key]);
    return {
      path: n.path,
      className: n.className,
      properties,
      image: n.image,
      interactions: n.interactions,
    };
  });
  const issues = v.issues.map((value: unknown) => {
    const issue = record(value, ["severity", "code", "path"]);
    if (
      !["info", "warning", "error"].includes(issue.severity) ||
      typeof issue.code !== "string" ||
      !/^[a-z][a-z0-9-]{0,79}$/.test(issue.code) ||
      (issue.path !== undefined &&
        (!path(issue.path) || !paths.has(issue.path)))
    )
      throw new Error("Invalid conversion diagnostic.");
    return {
      severity: issue.severity,
      code: issue.code,
      ...(issue.path ? { path: issue.path } : {}),
    };
  });
  return {
    options: options as FeedbackDiagnostics["options"],
    stats: stats as FeedbackDiagnostics["stats"],
    nodes,
    issues,
    truncated: v.truncated,
  };
}
export function feedbackScreenshot(bytes: Uint8Array): FeedbackScreenshot {
  const clean = screenshotPng(bytes),
    size = pngPixelSize(clean)!;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += 3) {
    const a = clean[i],
      b = clean[i + 1] ?? 0,
      c = clean[i + 2] ?? 0;
    parts.push(
      alphabet[a >> 2] +
        alphabet[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < clean.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
        (i + 2 < clean.length ? alphabet[c & 63] : "="),
    );
  }
  return {
    mime: "image/png",
    data: parts.join(""),
    width: size[0],
    height: size[1],
  };
}
export function normalizeFeedback(
  value: unknown,
  knownSecrets: readonly string[] = [],
): FeedbackReport {
  const v = record(value, [
    "format",
    "version",
    "clientVersion",
    "category",
    "title",
    "steps",
    "expected",
    "actual",
    "diagnostics",
    "screenshot",
  ]);
  if (
    v.format !== "framebridge-feedback" ||
    v.version !== 1 ||
    typeof v.clientVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(v.clientVersion) ||
    v.clientVersion.length > 50 ||
    !FEEDBACK_CATEGORIES.includes(v.category)
  )
    throw new Error("Invalid report format.");
  const output: FeedbackReport = {
    format: "framebridge-feedback",
    version: 1,
    clientVersion: v.clientVersion,
    category: v.category,
    title: feedbackText(bounded(v.title, 120, 3).trim(), knownSecrets),
    steps: feedbackText(bounded(v.steps, 4000), knownSecrets),
    expected: feedbackText(bounded(v.expected, 4000), knownSecrets),
    actual: feedbackText(bounded(v.actual, 4000, 3), knownSecrets),
    ...(v.diagnostics !== undefined
      ? { diagnostics: diagnostics(v.diagnostics) }
      : {}),
  };
  if (v.screenshot !== undefined) {
    const shot = record(v.screenshot, ["mime", "data", "width", "height"]);
    if (
      shot.mime !== "image/png" ||
      typeof shot.data !== "string" ||
      shot.data.length > Math.ceil(FEEDBACK_LIMITS.screenshotBytes / 3) * 4 ||
      shot.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(shot.data)
    )
      throw new Error("Invalid screenshot.");
    // Figma's controller sandbox has neither atob nor btoa.
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const padding = shot.data.endsWith("==")
      ? 2
      : shot.data.endsWith("=")
        ? 1
        : 0;
    const bytes = new Uint8Array((shot.data.length / 4) * 3 - padding);
    for (let i = 0, j = 0; i < shot.data.length; i += 4) {
      const word =
        (alphabet.indexOf(shot.data[i]) << 18) |
        (alphabet.indexOf(shot.data[i + 1]) << 12) |
        (Math.max(0, alphabet.indexOf(shot.data[i + 2])) << 6) |
        Math.max(0, alphabet.indexOf(shot.data[i + 3]));
      bytes[j++] = word >> 16;
      if (j < bytes.length) bytes[j++] = word >> 8;
      if (j < bytes.length) bytes[j++] = word;
    }
    const clean = feedbackScreenshot(bytes);
    if (shot.width !== clean.width || shot.height !== clean.height)
      throw new Error("Screenshot dimensions do not match.");
    output.screenshot = clean;
  }
  if (feedbackBytes(output) > FEEDBACK_LIMITS.reportBytes)
    throw new Error("Report exceeds the 800 KB limit.");
  return output;
}
