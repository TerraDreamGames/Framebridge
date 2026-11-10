import type {
  AnalysisResult,
  DesignNode,
  RbxNode,
  Value,
} from "../../../packages/core/src/types";
import { previewFlow, previewSize } from "./preview-layout";
import {
  nativeFontEmSize,
  richFontEmSize,
} from "../../../packages/core/src/font-size-metrics";

export const CHECK_LABELS = {
  names: "Names",
  contrast: "Text contrast",
  targets: "Touch targets",
  text: "Text fit",
  cues: "Color cues",
};
export type CheckCategory = keyof typeof CHECK_LABELS;
export type CheckSettings = Record<CheckCategory, boolean> & {
  targetSize: 24 | 44;
};
export const DEFAULT_CHECKS: CheckSettings = {
  names: true,
  contrast: true,
  targets: true,
  text: true,
  cues: true,
  targetSize: 44,
};
export type Finding = {
  id: string;
  category: CheckCategory;
  code: string;
  severity: "warning" | "info";
  nodeId: string;
  nodeName: string;
  related?: { id: string; name: string }[];
  message: string;
  suggestion: string;
  measurements?: Record<string, number | string>;
};
export type UsabilityReport = {
  settings: CheckSettings;
  findings: Finding[];
  omitted: number;
  checkedLayers: number;
  coverage: Record<CheckCategory, { examined: number; unverified: number }>;
  scope: string;
};
type RGB = [number, number, number];
type Box = { x: number; y: number; w: number; h: number };
type Entry = {
  node: RbxNode;
  source: DesignNode;
  parent?: Entry;
  box: Box;
  visible: boolean;
  scale: number;
  rotated: boolean;
  composited: boolean;
  background?: RGB;
  siblings: Entry[];
};
const array = (v: Value | undefined): number[] =>
  v && typeof v === "object" && "value" in v ? (v.value as number[]) : [];
const enumName = (v: Value | undefined) =>
  v && typeof v === "object" && v.type === "Enum" ? v.value[1] : "None";
const number = (v: Value | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const rgb = (v: Value | undefined): RGB | undefined => {
  const a = array(v);
  return a.length === 3 && a.every(Number.isFinite) ? (a as RGB) : undefined;
};
const composite = (front: RGB, alpha: number, back: RGB): RGB =>
  front.map((c, i) => c * alpha + back[i] * (1 - alpha)) as RGB;
export function contrastRatio(a: RGB, b: RGB) {
  const luminance = (c: RGB) =>
    c.reduce(
      (sum, v, i) =>
        sum +
        [0.2126, 0.7152, 0.0722][i] *
          (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
      0,
    );
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w + 0.01 &&
  inner.y + inner.h <= outer.y + outer.h + 0.01;
const paintsUnknown = (s: DesignNode) =>
  s.fills
    .filter((p) => p.visible !== false && p.opacity !== 0)
    .some(
      (p) =>
        p.type !== "SOLID" ||
        ![undefined, "NORMAL", "PASS_THROUGH"].includes(p.blendMode),
    ) ||
  s.fills.filter((p) => p.visible !== false && p.opacity !== 0).length > 1 ||
  ![undefined, "NORMAL", "PASS_THROUGH"].includes(s.blendMode);
function background(entry: Entry, inherited?: RGB): RGB | undefined {
  const { node, source } = entry,
    p = node.properties;
  if (
    (paintsUnknown(source) && !source.text) ||
    node.className === "ViewportFrame" ||
    node.className.startsWith("Image") ||
    number(p.GroupTransparency, 0) > 0 ||
    source.effects?.some((e) => e.includes("BLUR"))
  )
    return undefined;
  const color = rgb(p.BackgroundColor3),
    alpha = 1 - number(p.BackgroundTransparency, 1);
  if (color && alpha >= 1) return color;
  if (color && alpha > 0)
    return inherited ? composite(color, alpha, inherited) : undefined;
  return inherited;
}
function entriesFor(result: AnalysisResult) {
  const sources = new Map<string, DesignNode>();
  const index = (nodes: DesignNode[]) =>
    nodes.forEach((n) => {
      sources.set(n.id, n);
      index(n.children);
    });
  index(result.designs ?? []);
  const entries: Entry[] = [];
  function visit(
    node: RbxNode,
    width: number,
    height: number,
    parent?: Entry,
    forced?: Partial<Box>,
    ownsPosition = false,
  ) {
    if (node.className.startsWith("UI")) return;
    const source =
      sources.get(node.id) ?? sources.get(node.id.replace(/^screen:/, ""));
    if (!source) return;
    const screen = node.className === "ScreenGui";
    let [w, h] = screen
      ? (node.referenceSize ?? [source.width, source.height])
      : previewSize(node, width, height);
    const aspect = node.children.find(
      (c) => c.className === "UIAspectRatioConstraint",
    );
    if (aspect) {
      const ratio = number(aspect.properties.AspectRatio, 1);
      if (enumName(aspect.properties.DominantAxis) === "Height") w = h * ratio;
      else h = w / ratio;
    }
    w = forced?.w ?? w;
    h = forced?.h ?? h;
    const limits = node.children.find(
        (c) => c.className === "UISizeConstraint",
      ),
      min = array(limits?.properties.MinSize),
      max = array(limits?.properties.MaxSize);
    w = Math.max(min[0] ?? 0, Math.min(max[0] ?? Infinity, w));
    h = Math.max(min[1] ?? 0, Math.min(max[1] ?? Infinity, h));
    const scale =
      (parent?.scale ?? 1) *
      number(
        node.children.find((c) => c.className === "UIScale")?.properties.Scale,
        1,
      );
    const pos = array(node.properties.Position),
      anchor = array(node.properties.AnchorPoint);
    const entry: Entry = {
      node,
      source,
      parent,
      scale,
      siblings: [],
      box: {
        x:
          (parent?.box.x ?? 0) +
          ((forced?.x ?? (pos[0] ?? 0) * width + (pos[1] ?? 0)) -
            (ownsPosition ? 0 : (anchor[0] ?? 0)) * w) *
            (parent?.scale ?? 1),
        y:
          (parent?.box.y ?? 0) +
          ((forced?.y ?? (pos[2] ?? 0) * height + (pos[3] ?? 0)) -
            (ownsPosition ? 0 : (anchor[1] ?? 0)) * h) *
            (parent?.scale ?? 1),
        w: w * scale,
        h: h * scale,
      },
      visible:
        (parent?.visible ?? true) &&
        source.visible &&
        source.opacity > 0 &&
        node.properties.Visible !== false &&
        node.properties.Enabled !== false,
      rotated:
        (parent?.rotated ?? false) ||
        Math.abs(number(node.properties.Rotation, 0)) > 0.001,
      composited:
        (parent?.composited ?? false) ||
        number(node.properties.GroupTransparency, 0) > 0 ||
        ![undefined, "NORMAL", "PASS_THROUGH"].includes(source.blendMode),
    };
    entry.background = background(entry, parent?.background);
    entries.push(entry);
    const flow = previewFlow(node, w, h),
      children: Entry[] = [];
    for (const child of flow.children) {
      const start = entries.length,
        box = flow.boxes.get(child.id);
      visit(
        child,
        flow.width,
        flow.height,
        entry,
        box && {
          x: box.x,
          y: box.y,
          ...(flow.ownsPosition ? { w: box.w, h: box.h } : {}),
        },
        flow.ownsPosition,
      );
      if (entries.length > start) children.push(entries[start]);
    }
    children.forEach((child) => {
      child.siblings = children;
    });
  }
  result.package.roots.forEach((root) =>
    visit(root, root.referenceSize?.[0] ?? 0, root.referenceSize?.[1] ?? 0),
  );
  return entries;
}
function textRuns(entry: Entry) {
  const p = entry.node.properties,
    source = entry.source.text;
  if (
    !entry.node.className.startsWith("Text") ||
    !String(p.Text || p.PlaceholderText || "").trim()
  )
    return [];
  const face = p.FontFace;
  if (p.RichText && source && String(p.Text).includes("<font")) {
    // Hand-edited RichText can change its colors/sizes; it must be inspected, not guessed.
    const text = String(p.Text);
    const runs = [
      ...text.matchAll(
        /<font\s+[^>]*size="([\d.]+)"\s+color="rgb\((\d+),(\d+),(\d+)\)"\s+transparency="([\d.]+)"[^>]*>([\s\S]*?)<\/font>/g,
      ),
    ];
    if (!runs.length)
      return [
        {
          size: number(p.TextSize, 16),
          emSize: undefined,
          color: undefined,
          alpha: 1,
          bold: false,
        },
      ];
    return runs
      .filter((r) => r[6].replace(/<[^>]+>/g, "").trim())
      .map((r) => {
        const family = /family="([^"]+)"/.exec(r[0])?.[1];
        const weight = /weight="([^"]+)"/.exec(r[0])?.[1];
        const font: Value | undefined =
          family && weight
            ? {
                type: "Font",
                family,
                weight,
                style: /^<i>/.test(r[6]) ? "Italic" : "Normal",
              }
            : undefined;
        return {
          size: Number(r[1]),
          emSize: richFontEmSize(Number(r[1]), font),
          color: [
            Number(r[2]) / 255,
            Number(r[3]) / 255,
            Number(r[4]) / 255,
          ] as RGB,
          alpha: (1 - number(p.TextTransparency, 0)) * (1 - Number(r[5])),
          bold: /weight="(?:Bold|ExtraBold|Heavy)"/.test(r[0]),
        };
      });
  }
  return [
    {
      size: number(p.TextSize, 16),
      emSize: nativeFontEmSize(number(p.TextSize, 16), face),
      color: p.RichText ? undefined : rgb(p.TextColor3),
      alpha: 1 - number(p.TextTransparency, 0),
      bold: !!(
        face &&
        typeof face === "object" &&
        face.type === "Font" &&
        ["Bold", "ExtraBold", "Heavy"].includes(face.weight)
      ),
    },
  ];
}
function hue(color?: RGB) {
  if (!color) return "";
  const [r, g, b] = color;
  return r > g * 1.3 && r > b * 1.3 && r > 0.2
    ? "red"
    : g > r * 1.3 && g > b * 1.3 && g > 0.2
      ? "green"
      : "";
}
function cueSignature(node: RbxNode, root = true): string | undefined {
  if (node.properties.Visible === false) return "hidden";
  if (node.assetRef && !node.properties.Image) return;
  const children = node.children
    .filter((c) => !["UIShadow", "UIGradient"].includes(c.className))
    .map((c) => cueSignature(c, false));
  if (children.some((c) => c === undefined)) return;
  const properties = Object.fromEntries(
    Object.entries(node.properties)
      .filter(
        ([key]) =>
          !key.endsWith("Color3") &&
          !key.endsWith("Transparency") &&
          !["ZIndex", "LayoutOrder", "DisplayOrder", "ImageColor3"].includes(
            key,
          ) &&
          !(root && ["Position", "AnchorPoint"].includes(key)),
      )
      .map(([key, value]) => [
        key,
        key === "Text" && typeof value === "string"
          ? value.replace(/\s(?:color|transparency)="[^"]*"/g, "")
          : value,
      ])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  return JSON.stringify([node.className, properties, children]);
}
/** Advisory local checks on configured output at the authored canvas; never mutates conversion data. */
export function checkUsability(
  result: AnalysisResult,
  settings: CheckSettings = DEFAULT_CHECKS,
): UsabilityReport {
  const report: UsabilityReport = {
    settings: { ...settings },
    findings: [],
    omitted: 0,
    checkedLayers: 0,
    coverage: Object.fromEntries(
      Object.keys(CHECK_LABELS).map((k) => [k, { examined: 0, unverified: 0 }]),
    ) as UsabilityReport["coverage"],
    scope:
      "Configured output at the authored canvas. Native flow is estimated. Check final fonts, hit areas and device sizes in Studio; this is not an accessibility certification.",
  };
  const entries = entriesFor(result),
    seen = new Set<string>();
  const add = (
    entry: Entry,
    category: CheckCategory,
    code: string,
    message: string,
    suggestion: string,
    severity: Finding["severity"] = "warning",
    measurements?: Finding["measurements"],
    related?: Finding["related"],
  ) => {
    const id = `${category}:${code}:${entry.source.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    if (report.findings.length >= 500) {
      report.omitted++;
      return;
    }
    report.findings.push({
      id,
      category,
      code,
      severity,
      nodeId: entry.source.id,
      nodeName: entry.node.name,
      message,
      suggestion,
      measurements,
      related,
    });
  };
  let overlapBudget = 200_000;
  const textContent = new Map<DesignNode, boolean>();
  const containsText = (source: DesignNode): boolean => {
    const cached = textContent.get(source);
    if (cached !== undefined) return cached;
    const found =
      !!source.text?.characters.trim() ||
      source.children.some((c) => c.visible && containsText(c));
    textContent.set(source, found);
    return found;
  };
  const siblingGroups = new Map<Entry | undefined, Entry[]>();
  for (const entry of entries) {
    const p = entry.node.properties;
    if (settings.names) {
      report.coverage.names.examined++;
      if (
        /^(?:frame|group|rectangle|vector|text|image|ellipse|component|instance)(?:\s*\d+)?$/i.test(
          entry.node.name.trim(),
        )
      )
        add(
          entry,
          "names",
          "generated-name",
          "This exported name describes a drawing tool rather than the UI's purpose.",
          "Use a role such as ShopPanel, CloseButton or ItemName. Rename here or in Figma.",
        );
      if (/[./\\]/.test(entry.node.name))
        add(
          entry,
          "names",
          "awkward-name",
          "This name contains path-like punctuation that can make script references confusing.",
          "Prefer a short descriptive name; Roblox names can contain punctuation, so this is a suggestion.",
          "info",
        );
    }
    const siblings = siblingGroups.get(entry.parent) ?? [];
    siblings.push(entry);
    siblingGroups.set(entry.parent, siblings);
    if (!entry.visible || entry.node.className === "ScreenGui") continue;
    if (
      settings.targets &&
      ["TextButton", "ImageButton", "TextBox"].includes(entry.node.className) &&
      p.Interactable !== false
    ) {
      report.coverage.targets.examined++;
      if (Math.min(entry.box.w, entry.box.h) < settings.targetSize)
        add(
          entry,
          "targets",
          "small-target",
          `${Math.round(entry.box.w)} × ${Math.round(entry.box.h)} on the authored canvas is below the selected ${settings.targetSize} × ${settings.targetSize} target size.`,
          "Enlarge the interactive element or provide a larger hit area. Check spacing and the smallest supported device; design units are not guaranteed screen pixels.",
          "warning",
          {
            width: entry.box.w,
            height: entry.box.h,
            target: settings.targetSize,
          },
        );
    }
    if (
      settings.contrast &&
      entry.node.assetRef &&
      containsText(entry.source)
    ) {
      report.coverage.contrast.examined++;
      report.coverage.contrast.unverified++;
      add(
        entry,
        "contrast",
        "baked-text-review",
        "This artwork contains baked text, whose contrast cannot be measured from native text properties.",
        "Inspect the exported image at its final display size against the actual game background.",
        "info",
      );
    }
    const runs = textRuns(entry);
    if (!runs.length) continue;
    if (settings.contrast) {
      report.coverage.contrast.examined++;
      let known =
        entry.background &&
        !entry.rotated &&
        !entry.composited &&
        !paintsUnknown(entry.source);
      for (
        let current: Entry | undefined = entry;
        known && current;
        current = current.parent
      ) {
        if (current.parent && !contains(current.parent.box, entry.box)) {
          known = false;
          break;
        }
        for (const sibling of current.siblings) {
          if (sibling === current || !sibling.visible) continue;
          if (--overlapBudget < 0) {
            known = false;
            break;
          }
          if (overlaps(entry.box, sibling.box)) {
            known = false;
            break;
          }
        }
      }
      if (!known || runs.some((r) => !r.color || !Number.isFinite(r.size))) {
        report.coverage.contrast.unverified++;
        add(
          entry,
          "contrast",
          "contrast-unverified",
          "Contrast could not be measured reliably over this background or text styling.",
          "Inspect the rendered text over its actual background in Studio. Images, gradients, overlaps, blending and rotated content need visual review.",
          "info",
        );
      } else {
        if (p.TextScaled || runs.some((run) => run.emSize === undefined)) {
          report.coverage.contrast.unverified++;
          add(
            entry,
            "contrast",
            "contrast-unverified",
            p.TextScaled
              ? "Scaled text needs a measured rendered size; contrast uses the conservative normal-text 4.5:1 reference."
              : "Native font metrics are unverified; contrast uses the conservative normal-text 4.5:1 reference.",
            "Check the rendered size and font in Studio. An unknown line height cannot establish a large-text exemption.",
            "info",
          );
        }
        let worst = Infinity,
          required = 4.5;
        for (const run of runs) {
          const ratio = contrastRatio(
            composite(run.color!, run.alpha, entry.background!),
            entry.background!,
          );
          const threshold =
            !p.TextScaled &&
            run.emSize !== undefined &&
            (run.emSize * entry.scale >= 24 ||
              (run.bold && run.emSize * entry.scale >= 18.6666666667))
              ? 3
              : 4.5;
          if (ratio / threshold < worst / required) {
            worst = ratio;
            required = threshold;
          }
        }
        if (worst < required)
          add(
            entry,
            "contrast",
            "low-contrast",
            `Text contrast is approximately ${(Math.floor(worst * 1000) / 1000).toFixed(3)}:1; the selected text size/style uses a ${required}:1 reference.`,
            "Increase the text/background difference. Large-text thresholds use verified em sizes, including native truncation, and must be checked at the final display size.",
            "warning",
            { ratio: worst, reference: required },
          );
      }
    }
    if (settings.text) {
      report.coverage.text.examined++;
      const smallest = Math.min(
        ...runs.map((r) => (r.emSize ?? r.size) * entry.scale),
      );
      if (smallest < 12)
        add(
          entry,
          "text",
          "small-text",
          `Text is ${smallest}px at the authored canvas.`,
          "Check readability on phones and choose a larger size when needed. 12px is a review heuristic, not a universal minimum.",
          "warning",
          { fontSize: smallest },
        );
      if (p.TextScaled) {
        const constraint = entry.node.children.find(
          (c) => c.className === "UITextSizeConstraint",
        );
        const minimum = number(constraint?.properties.MinTextSize, 1);
        const minimumEm = nativeFontEmSize(minimum, p.FontFace);
        if (constraint && minimumEm === undefined) {
          report.coverage.text.unverified++;
          add(
            entry,
            "text",
            "scaled-text-size-unverified",
            "The native minimum text size cannot establish an em-size readability bound for this font.",
            "Check the scaled text at its smallest supported display size in Studio.",
            "info",
          );
        }
        if (
          !constraint ||
          (minimumEm !== undefined && minimumEm * entry.scale < 12)
        )
          add(
            entry,
            "text",
            "unbounded-text-scaling",
            "Scaled text can shrink below a readable size.",
            "Add or adjust UITextSizeConstraint, then check the smallest supported screen.",
            "warning",
          );
      } else if (!["Y", "XY"].includes(enumName(p.AutomaticSize))) {
        const raw = String(p.Text || p.PlaceholderText || "")
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<[^>]+>/g, "");
        const lines = raw.split("\n").length,
          font = Math.max(...runs.map((r) => r.size)),
          lineHeight = number(p.LineHeight, 1);
        const requiredHeight =
          font * (1 + (lines - 1) * lineHeight) * entry.scale;
        if (entry.box.h + 0.01 < requiredHeight)
          add(
            entry,
            "text",
            "text-height-risk",
            `The ${entry.box.h.toFixed(1)}px box is smaller than the ${requiredHeight.toFixed(1)}px estimate for its explicit lines.`,
            "Increase height or use automatic sizing. Font metrics and wrapping can require more room in Studio.",
            "warning",
            {
              height: entry.box.h,
              estimatedMinimum: requiredHeight,
              explicitLines: lines,
            },
          );
        else if (p.TextWrapped) {
          report.coverage.text.unverified++;
          add(
            entry,
            "text",
            "wrapped-text-review",
            "This fixed-height text wraps; final line count depends on the Roblox font and available width.",
            "Check TextBounds against the box at phone, tablet and desktop sizes, or use automatic height.",
            "info",
          );
        }
      }
    }
  }
  for (const siblings of siblingGroups.values()) {
    if (settings.names) {
      const names = new Map<string, Entry[]>();
      siblings.forEach((e) => {
        const group = names.get(e.node.name) ?? [];
        group.push(e);
        names.set(e.node.name, group);
      });
      for (const group of names.values())
        if (group.length > 1)
          for (const entry of group)
            add(
              entry,
              "names",
              "duplicate-sibling",
              "Multiple exported siblings have this exact name.",
              "Give siblings distinct names so script lookup and Explorer selection are predictable.",
              "warning",
              undefined,
              group
                .slice(0, 9)
                .filter((e) => e !== entry)
                .slice(0, 8)
                .map((e) => ({ id: e.source.id, name: e.node.name })),
            );
    }
    if (settings.cues) {
      const groups = new Map<string, Entry[]>();
      for (const entry of siblings.filter((e) => e.visible)) {
        const base = entry.node.name
          .replace(
            /(?:^|[ _-])(success|error|selected|unselected|enabled|disabled|active|inactive|on|off)(?=$|[ _-])/gi,
            " ",
          )
          .trim()
          .toLowerCase();
        if (base === entry.node.name.toLowerCase()) continue;
        const group = groups.get(base) ?? [];
        group.push(entry);
        groups.set(base, group);
      }
      for (const group of groups.values()) {
        const red = group.filter(
            (e) => hue(rgb(e.node.properties.BackgroundColor3)) === "red",
          ),
          green = group.filter(
            (e) => hue(rgb(e.node.properties.BackgroundColor3)) === "green",
          );
        if (!red.length || !green.length) continue;
        const greenBySignature = new Map<string, Entry>();
        let unknownGreen = false;
        for (const entry of green) {
          const signature = cueSignature(entry.node);
          if (signature === undefined) unknownGreen = true;
          else if (!greenBySignature.has(signature))
            greenBySignature.set(signature, entry);
        }
        for (const a of red) {
          report.coverage.cues.examined++;
          const signature = cueSignature(a.node),
            b =
              signature === undefined
                ? undefined
                : greenBySignature.get(signature);
          if (b)
            add(
              a,
              "cues",
              "color-only-state",
              "These red/green state candidates share the same text and measured non-color structure.",
              "Add a distinct label, icon or shape so state remains understandable without color. Confirm these layers represent alternative states.",
              "warning",
              undefined,
              [{ id: b.source.id, name: b.node.name }],
            );
          else if (signature === undefined || unknownGreen) {
            report.coverage.cues.unverified++;
            add(
              a,
              "cues",
              "state-artwork-review",
              "These red/green state candidates contain artwork whose meaning could not be compared.",
              "Confirm that labels, icons or shapes communicate each state without relying on color alone.",
              "info",
              undefined,
              green
                .slice(0, 8)
                .map((e) => ({ id: e.source.id, name: e.node.name })),
            );
          }
        }
      }
    }
  }
  report.checkedLayers = new Set(entries.map((e) => e.source.id)).size;
  return report;
}
