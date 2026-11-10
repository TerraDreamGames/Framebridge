import { createButtonDetector } from "./button-detection";
import { axisAligned, measureLayout as geometry } from "./measured-layout";
import {
  flatten,
  type DesignNode,
  type LayerOverride,
  type RbxNode,
  type TransferPackage,
  type Value,
} from "./types";
import type { OverrideChange } from "./bulk-editor";

export const REVIEW_CLASSES = [
  "auto",
  "Frame",
  "CanvasGroup",
  "ScrollingFrame",
  "TextLabel",
  "TextButton",
  "TextBox",
  "ImageLabel",
  "ImageButton",
] as const;
export type ReviewDecision =
  | { kind: "class"; value: (typeof REVIEW_CLASSES)[number] }
  | { kind: "scroll"; value: "X" | "Y" | "XY" }
  | { kind: "layout"; value: "source" | "free" | "list-y" | "list-x" | "grid" }
  | { kind: "role"; value: "source" | "panel" | "tabGroup" }
  | { kind: "name"; value: string };
export type ReviewRule = {
  name: string;
  sourceType: string;
  family: string;
  decision: Exclude<ReviewDecision, { kind: "name" }>;
};
export type ReviewPreferences = {
  version: 1;
  enabled: boolean;
  rules: ReviewRule[];
  naming?: { style: "source" | "pascal" | "camel" | "snake"; prefix: string };
  hints?: {
    phrase: string;
    sourceType: string;
    decision: Exclude<ReviewDecision, { kind: "name" }>;
  }[];
};
export const REVIEW_PREFERENCES_KEY = "framebridge-review-preferences-v1";
export const EMPTY_REVIEW_PREFERENCES: ReviewPreferences = {
  version: 1,
  enabled: true,
  rules: [],
};
export type ReviewSuggestion = {
  category: ReviewDecision["kind"];
  label: string;
  confidence: "Possible" | "Likely" | "Saved choice";
  reasons: string[];
  effect: string;
  decision: ReviewDecision;
};
export type ReviewLayer = {
  source: DesignNode;
  node?: RbxNode;
  parent?: DesignNode;
  blocked?: string;
  reasons: string[];
  suggestions: ReviewSuggestion[];
  choices: string[];
};
export type StructureReport = {
  layers: ReviewLayer[];
  truncated: boolean;
  suggestions: number;
};
const enumValue = (type: string, name: string): Value => ({
  type: "Enum",
  value: [type, name],
});
const dim = (x: number, y?: number): Value =>
  y === undefined
    ? { type: "UDim", value: [0, x] }
    : { type: "UDim2", value: [0, x, 0, y] };
const generic = (name: string) =>
  /^(?:frame|group|rectangle|vector|image|text|component|instance|layer)(?:\s*\d+)?$/i.test(
    name.trim(),
  );
export const reviewName = (name: string) =>
  name
    .replace(/\[.*?\]/g, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const family = (node: DesignNode) =>
  node.text
    ? "text"
    : [
          "VECTOR",
          "BOOLEAN_OPERATION",
          "STAR",
          "POLYGON",
          "ARC",
          "LINE",
        ].includes(node.type)
      ? "vector"
      : node.fills.some((p) => p.visible !== false && p.type === "IMAGE")
        ? node.children.length
          ? "image-with-content"
          : "image"
        : node.layout
          ? "layout"
          : node.children.length
            ? "container"
            : "shape";
export function canRememberReview(source: DesignNode) {
  const name = reviewName(source.name);
  return !!name && name.length <= 100 && !generic(name);
}
export function validDecision(value: unknown): value is ReviewDecision {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !["kind", "value"].includes(k))) return false;
  if (typeof v.kind !== "string" || typeof v.value !== "string") return false;
  return v.kind === "class"
    ? REVIEW_CLASSES.includes(v.value as any)
    : v.kind === "scroll"
      ? ["X", "Y", "XY"].includes(String(v.value))
      : v.kind === "layout"
        ? ["source", "free", "list-y", "list-x", "grid"].includes(
            String(v.value),
          )
        : v.kind === "role"
          ? ["source", "panel", "tabGroup"].includes(String(v.value))
          : v.kind === "name" &&
            typeof v.value === "string" &&
            !!v.value.trim() &&
            v.value.length <= 100;
}
export function readReviewPreferences(raw: unknown): ReviewPreferences {
  if (!raw || typeof raw !== "object") return structuredEmpty();
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.rules))
    return structuredEmpty();
  const rules: ReviewRule[] = [];
  for (const candidate of value.rules.slice(0, 200)) {
    if (!candidate || typeof candidate !== "object") continue;
    const r = candidate as Record<string, unknown>;
    if (
      typeof r.name !== "string" ||
      !r.name.trim() ||
      r.name.length > 100 ||
      generic(reviewName(r.name)) ||
      typeof r.sourceType !== "string" ||
      !/^[A-Z_]{1,32}$/.test(r.sourceType) ||
      ![
        "text",
        "vector",
        "image",
        "image-with-content",
        "layout",
        "container",
        "shape",
      ].includes(String(r.family)) ||
      !validDecision(r.decision) ||
      r.decision.kind === "name"
    )
      continue;
    const rule = {
      name: reviewName(r.name),
      sourceType: r.sourceType,
      family: String(r.family),
      decision: { kind: r.decision.kind, value: r.decision.value },
    } as ReviewRule;
    const duplicate = rules.findIndex(
      (existing) => ruleKey(existing) === ruleKey(rule),
    );
    if (duplicate >= 0) rules.splice(duplicate, 1);
    rules.push(rule);
  }
  const naming = value.naming as ReviewPreferences["naming"];
  const validNaming =
    naming &&
    ["source", "pascal", "camel", "snake"].includes(naming.style) &&
    typeof naming.prefix === "string" &&
    /^(?:[A-Za-z_][A-Za-z0-9_]{0,23})?$/.test(naming.prefix);
  const hints: NonNullable<ReviewPreferences["hints"]> = [];
  if (Array.isArray(value.hints))
    for (const candidate of value.hints.slice(0, 32)) {
      const hint = candidate as {
        phrase: string;
        sourceType: string;
        decision: ReviewDecision;
      };
      if (
        hint &&
        typeof hint.phrase === "string" &&
        /^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(hint.phrase) &&
        (hint.sourceType === "*" || /^[A-Z_]{1,32}$/.test(hint.sourceType)) &&
        validDecision(hint.decision) &&
        hint.decision.kind !== "name"
      )
        hints.push({
          phrase: reviewName(hint.phrase),
          sourceType: hint.sourceType,
          decision: { ...hint.decision },
        });
    }
  return {
    version: 1,
    enabled: value.enabled !== false,
    rules,
    ...(validNaming
      ? { naming: { style: naming.style, prefix: naming.prefix } }
      : {}),
    ...(Array.isArray(value.hints) ? { hints } : {}),
  };
}
function structuredEmpty(): ReviewPreferences {
  return { ...EMPTY_REVIEW_PREFERENCES, rules: [] };
}
export function ruleKey(rule: ReviewRule) {
  return JSON.stringify([
    rule.name,
    rule.sourceType,
    rule.family,
    rule.decision.kind === "scroll" ? "class" : rule.decision.kind,
  ]);
}
export function rememberReview(
  preferences: ReviewPreferences,
  source: DesignNode,
  decision: ReviewDecision,
): ReviewPreferences {
  if (!validDecision(decision) || decision.kind === "name")
    throw new Error("Remember a class, scrolling, layout or role choice.");
  const name = reviewName(source.name);
  if (!name || name.length > 100 || generic(name))
    throw new Error(
      "Give the source layer a meaningful name before remembering its choice.",
    );
  const rule: ReviewRule = {
    name,
    sourceType: source.type,
    family: family(source),
    decision: { ...decision },
  };
  const clean = readReviewPreferences(preferences),
    rules = clean.rules.filter((r) => ruleKey(r) !== ruleKey(rule));
  if (rules.length >= 200)
    throw new Error(
      "Saved choices are full. Remove a choice before adding another.",
    );
  return { ...clean, rules: [...rules, rule] };
}
const flow = (source: DesignNode) =>
  source.children.filter((c) => c.visible && !c.absolute);
const nativeContainer = (node?: RbxNode) =>
  !!node && ["Frame", "CanvasGroup", "ScrollingFrame"].includes(node.className);
export function reviewChoiceLabel(decision: ReviewDecision) {
  if (decision.kind === "scroll")
    return `${decision.value === "Y" ? "vertical" : decision.value === "X" ? "horizontal" : "both-axis"} scrolling`;
  if (decision.kind === "layout")
    return decision.value === "list-y"
      ? "vertical list"
      : decision.value === "list-x"
        ? "horizontal list"
        : decision.value === "grid"
          ? "grid layout"
          : decision.value === "free"
            ? "free positioning"
            : "source layout";
  if (decision.kind === "role")
    return decision.value === "panel"
      ? "panel target"
      : decision.value === "tabGroup"
        ? "tab group"
        : "source role";
  return decision.value === "auto" ? "automatic class" : decision.value;
}
const categoryPinned = (
  edit: LayerOverride | undefined,
  kind: ReviewDecision["kind"],
) =>
  kind === "class" || kind === "scroll"
    ? !!edit?.className || (!!edit?.renderMode && edit.renderMode !== "auto")
    : kind === "layout"
      ? edit?.components?.layout !== undefined ||
        edit?.components?.grid !== undefined
      : kind === "role"
        ? edit?.behavior !== undefined
        : edit?.name !== undefined;
export function structureReview(
  designs: DesignNode[],
  pkg: TransferPackage,
  overrides: Record<string, LayerOverride> = {},
  preferences: ReviewPreferences = EMPTY_REVIEW_PREFERENCES,
): StructureReport {
  const detectButton = createButtonDetector();
  const exported = new Map(flatten(pkg.roots).map((n) => [n.id, n])),
    assets = new Map(pkg.assets.map((a) => [a.nodeId, a])),
    layers: ReviewLayer[] = [];
  const stack = designs
    .map((source) => ({
      source,
      parent: undefined as DesignNode | undefined,
      baked: undefined as string | undefined,
    }))
    .reverse();
  const prefs = readReviewPreferences(preferences);
  const remembered = new Map<string, ReviewRule[]>();
  for (const rule of prefs.rules) {
    const key = JSON.stringify([rule.name, rule.sourceType, rule.family]);
    remembered.set(key, [...(remembered.get(key) || []), rule]);
  }
  while (stack.length && layers.length < 10000) {
    const { source, parent, baked } = stack.pop()!,
      node = exported.get(source.id),
      edit = overrides[source.id];
    const blocked = baked
      ? `Included in the ${baked} image. Keep that parent editable to review its children.`
      : !node
        ? "Not exported. Check visibility and the parent's rendering choice."
        : undefined;
    const detection = detectButton(
        source,
        parent,
        edit,
        true,
        parent ? overrides[parent.id] : undefined,
      ),
      asset = assets.get(source.id);
    const reasons = asset
      ? [`Image export: ${asset.reason}.`]
      : source.text
        ? ["Editable Figma text."]
        : source.scrolling
          ? [`Figma requests ${source.scrolling.toLowerCase()} scrolling.`]
          : detection.button && node?.className.endsWith("Button")
            ? [`Button choice: ${detection.reason || "explicit override"}.`]
            : source.children.length
              ? ["Editable container with child layers."]
              : ["Supported native shape."];
    if (edit?.className || (edit?.renderMode && edit.renderMode !== "auto"))
      reasons.unshift("Your explicit export choice takes priority.");
    const choices = source.text
      ? [
          "auto",
          "TextLabel",
          "TextButton",
          "TextBox",
          "ImageLabel",
          "ImageButton",
        ]
      : [
          "auto",
          "Frame",
          "CanvasGroup",
          "ScrollingFrame",
          "TextButton",
          "ImageLabel",
          "ImageButton",
        ];
    const layer: ReviewLayer = {
      source,
      node,
      parent,
      blocked,
      reasons,
      suggestions: [],
      choices,
    };
    const suggest = (
      decision: ReviewDecision,
      label: string,
      confidence: ReviewSuggestion["confidence"],
      why: string[],
      effect: string,
    ) =>
      layer.suggestions.push({
        category: decision.kind,
        decision,
        label,
        confidence,
        reasons: why,
        effect,
      });
    if (!blocked && node) {
      if (
        !categoryPinned(edit, "class") &&
        nativeContainer(node) &&
        !source.layout &&
        source.children.length &&
        /^(?:buy|play|equip|claim|close|confirm|continue)$/i.test(
          source.children
            .find((c) => c.visible && c.text)
            ?.text?.characters.trim() || "",
        ) &&
        source.height <= 80 &&
        source.width <= 480 &&
        source.children.filter((c) => c.visible).length <= 3
      )
        suggest(
          { kind: "class", value: "TextButton" },
          "Make this a button",
          "Possible",
          [
            "Compact container with an action label.",
            "The layer name does not identify it as a control.",
          ],
          "Keeps the label and artwork editable and adds one native input target. Configure its action separately.",
        );
      if (
        !categoryPinned(edit, "class") &&
        nativeContainer(node) &&
        node.className !== "ScrollingFrame" &&
        source.clipsContent
      ) {
        const children = flow(source).filter(axisAligned),
          x = children.some(
            (c) => c.transform[0][2] + c.width > source.width + 1,
          ),
          y = children.some(
            (c) => c.transform[1][2] + c.height > source.height + 1,
          );
        if (x || y)
          suggest(
            { kind: "scroll", value: x && y ? "XY" : x ? "X" : "Y" },
            "Make clipped content scroll",
            "Possible",
            [
              "The frame clips children extending past its bounds.",
              "Clipping can also be deliberate decoration.",
            ],
            "Adds native scrolling and automatic canvas sizing. Review the intended direction before export.",
          );
      }
      if (
        !categoryPinned(edit, "layout") &&
        nativeContainer(node) &&
        !source.layout &&
        !node.children.some((c) =>
          ["UIListLayout", "UIGridLayout"].includes(c.className),
        )
      ) {
        const g = geometry(source);
        if (g.grid)
          suggest(
            { kind: "layout", value: "grid" },
            "Arrange as a grid",
            "Likely",
            ["Repeated equal-size items align to regular rows and columns."],
            "A native UIGridLayout owns child positions, cell sizes and gaps. Item order follows the measured rows.",
          );
        else if (g.vertical || g.horizontal)
          suggest(
            { kind: "layout", value: g.vertical ? "list-y" : "list-x" },
            "Arrange as a list",
            "Likely",
            ["Three or more items share an alignment and consistent spacing."],
            "A native UIListLayout owns child positions and uses the measured gap. Items start at the container's padding.",
          );
      }
      if (
        !categoryPinned(edit, "role") &&
        nativeContainer(node) &&
        !node.behavior?.role &&
        /\b(?:panel|modal|dialog)\b/i.test(source.name)
      )
        suggest(
          { kind: "role", value: "panel" },
          "Use as an action target",
          "Possible",
          ["The container name describes a panel or dialog."],
          "Marks it as a panel that configured open/close/toggle actions can target. It does not add gameplay.",
        );
      if (!categoryPinned(edit, "name") && generic(source.name)) {
        const label = (
          source.text?.characters ||
          source.children.find((c) => c.visible && c.text)?.text?.characters ||
          ""
        )
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 70);
        if (label)
          suggest(
            {
              kind: "name",
              value:
                label +
                (source.text
                  ? "Label"
                  : node.className.endsWith("Button")
                    ? "Button"
                    : "Panel"),
            },
            "Give the export a useful name",
            "Possible",
            ["A generic source name hides the visible text's purpose."],
            "Changes only the Roblox export name. The Figma layer name stays unchanged.",
          );
      }
      if (prefs.enabled && prefs.naming && !categoryPinned(edit, "name")) {
        const words = source.name
          .replace(/\[.*?\]/g, "")
          .trim()
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean);
        const upper = (word: string) =>
          word[0].toUpperCase() + word.slice(1).toLowerCase();
        const named =
          prefs.naming.style === "source"
            ? source.name.replace(/\[.*?\]/g, "").trim()
            : prefs.naming.style === "snake"
              ? words.join("_").toLowerCase()
              : words
                  .map((w, i) =>
                    prefs.naming!.style === "camel" && i === 0
                      ? w.toLowerCase()
                      : upper(w),
                  )
                  .join("");
        const value = prefs.naming.prefix + named;
        if (value && value.length <= 100 && value !== node.name) {
          layer.suggestions = layer.suggestions.filter(
            (s) => s.category !== "name",
          );
          suggest(
            { kind: "name", value },
            "Use your naming convention",
            "Saved choice",
            ["Your enabled naming preference proposes this export name."],
            "Review before applying. Figma names and explicit export names stay unchanged.",
          );
        }
      }
      if (prefs.enabled)
        for (const rule of [
          ...(prefs.hints ?? [])
            .filter(
              (h) =>
                (h.sourceType === "*" || h.sourceType === source.type) &&
                reviewName(source.name).includes(h.phrase),
            )
            .map((h) => ({
              name: reviewName(source.name),
              sourceType: source.type,
              family: family(source),
              decision: h.decision,
              hintPhrase: h.phrase,
            })),
          ...(remembered.get(
            JSON.stringify([
              reviewName(source.name),
              source.type,
              family(source),
            ]),
          ) || []),
        ]) {
          if (
            rule.decision.kind === "class" &&
            !choices.includes(rule.decision.value)
          )
            continue;
          if (
            rule.name !== reviewName(source.name) ||
            rule.sourceType !== source.type ||
            rule.family !== family(source) ||
            categoryPinned(edit, rule.decision.kind)
          )
            continue;
          if (
            (rule.decision.kind === "class" &&
              (rule.decision.value === "auto" ||
                rule.decision.value === node.className)) ||
            (rule.decision.kind === "scroll" &&
              node.className === "ScrollingFrame") ||
            (rule.decision.kind === "role" &&
              (rule.decision.value === "source" ||
                rule.decision.value === node.behavior?.role))
          )
            continue;
          if (rule.decision.kind === "layout" && !nativeContainer(node))
            continue;
          if (
            (rule.decision.kind === "scroll" ||
              rule.decision.kind === "role") &&
            !nativeContainer(node)
          )
            continue;
          layer.suggestions = layer.suggestions.filter(
            (s) =>
              (s.category === "scroll" ? "class" : s.category) !==
              (rule.decision.kind === "scroll" ? "class" : rule.decision.kind),
          );
          suggest(
            rule.decision,
            `${"hintPhrase" in rule ? "Review hint" : "Saved choice"}: ${reviewChoiceLabel(rule.decision)}`,
            "Saved choice",
            [
              "hintPhrase" in rule
                ? `Your authored hint matches the literal phrase “${rule.hintPhrase}” in this layer name.`
                : `You saved this choice for “${rule.name}” with the same source type and content kind.`,
            ],
            "Apply after reviewing this layer. Saved choices never override your explicit settings.",
          );
        }
    }
    layers.push(layer);
    const parentImage = node?.assetRef ? source.name : baked;
    for (let i = source.children.length - 1; i >= 0; i--)
      stack.push({
        source: source.children[i],
        parent: source,
        baked: parentImage,
      });
  }
  return {
    layers,
    truncated: stack.length > 0,
    suggestions: layers.reduce((sum, l) => sum + l.suggestions.length, 0),
  };
}
export function reviewChanges(
  layer: ReviewLayer,
  decision: ReviewDecision,
  overrides: Record<string, LayerOverride>,
): OverrideChange[] {
  if (layer.blocked || !layer.node || !validDecision(decision))
    throw new Error("Review an exported editable source layer first.");
  const id = layer.source.id,
    edit: LayerOverride = JSON.parse(JSON.stringify(overrides[id] || {})),
    changes: OverrideChange[] = [];
  if (decision.kind === "class") {
    if (!layer.choices.includes(decision.value))
      throw new Error("Choose a class compatible with this source.");
    if (decision.value === "auto") {
      delete edit.className;
      delete edit.renderMode;
    } else {
      edit.className = decision.value;
      edit.renderMode = decision.value.startsWith("Image") ? "image" : "native";
    }
  } else if (decision.kind === "scroll") {
    if (!nativeContainer(layer.node))
      throw new Error("Scrolling needs an editable container.");
    edit.className = "ScrollingFrame";
    edit.renderMode = "native";
    edit.properties = {
      ...edit.properties,
      CanvasSize: dim(0, 0),
      AutomaticCanvasSize: enumValue("AutomaticSize", decision.value),
      ScrollingDirection: enumValue("ScrollingDirection", decision.value),
      ScrollingEnabled: true,
    };
  } else if (decision.kind === "name") edit.name = decision.value.trim();
  else if (decision.kind === "role") {
    if (!nativeContainer(layer.node))
      throw new Error("Panel roles need an editable container.");
    const behavior =
      edit.behavior && typeof edit.behavior === "object"
        ? { ...edit.behavior }
        : {};
    if (decision.value === "source") delete behavior.role;
    else behavior.role = decision.value;
    edit.behavior = Object.keys(behavior).length ? behavior : undefined;
  } else {
    if (!nativeContainer(layer.node))
      throw new Error("Native layouts need an editable container.");
    const components = { ...edit.components },
      g = geometry(layer.source);
    if (decision.value === "source") {
      delete components.layout;
      delete components.grid;
      // Removing a generated modifier can leave a skip override on its ID.
      // Restoring the source layout must restore its generated objects too.
      for (const suffix of ["layout", "grid"])
        if (overrides[`${id}/${suffix}`])
          changes.push({ id: `${id}/${suffix}`, value: undefined });
    } else if (decision.value === "free") {
      components.layout = false;
      components.grid = false;
    } else {
      let sorted: DesignNode[];
      if (decision.value === "grid") {
        if (!g.grid)
          throw new Error(
            "Grid inference needs repeated equal-size cells in regular rows and columns. Configure custom cells in Properties instead.",
          );
        const grid = g.grid;
        sorted = grid.sorted;
        components.layout = false;
        components.grid = {
          CellSize: dim(grid.width, grid.height),
          CellPadding: dim(grid.gapX, grid.gapY),
          FillDirectionMaxCells: grid.columns,
          SortOrder: enumValue("SortOrder", "LayoutOrder"),
          FillDirection: enumValue("FillDirection", "Horizontal"),
        };
      } else {
        const line = decision.value === "list-y" ? g.vertical : g.horizontal;
        if (!line)
          throw new Error(
            "List inference needs aligned items with consistent spacing. Configure a custom layout in Properties instead.",
          );
        sorted = line.sorted;
        components.grid = false;
        components.layout = {
          Padding: dim(line.spacing),
          FillDirection: enumValue(
            "FillDirection",
            decision.value === "list-y" ? "Vertical" : "Horizontal",
          ),
          SortOrder: enumValue("SortOrder", "LayoutOrder"),
        };
      }
      sorted.forEach((child, index) =>
        changes.push({
          id: child.id,
          value: {
            ...overrides[child.id],
            properties: {
              ...overrides[child.id]?.properties,
              LayoutOrder: index + 1,
            },
          },
        }),
      );
    }
    edit.components = Object.keys(components).length ? components : undefined;
  }
  changes.unshift({ id, value: edit });
  return changes;
}
