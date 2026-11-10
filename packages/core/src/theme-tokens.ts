import { PROPERTY_SCHEMAS, validProperty } from "./editor";
import {
  flatten,
  type ExportOptions,
  type LayerOverride,
  type RbxNode,
  type TransferPackage,
  type Value,
} from "./types";

export type ThemeKind = "color" | "background" | "font" | "shadow" | "hover";
export type ThemeToken =
  { kind: ThemeKind; values: Record<string, Value> } | { ref: string };
/** Versioned settings: aliases resolve within each named theme. */
export type ThemeSettings = {
  version: 1;
  initial: string;
  modes: Record<string, Record<string, ThemeToken>>;
};
export type ThemeLayer = Partial<Record<ThemeKind, string>>;
export type CompiledThemes = {
  version: 1;
  initial: string;
  modes: Record<string, Record<string, Record<string, Value>>>;
};
export type ThemeBinding = Record<string, [string, string]>;
export type CompiledThemeLayer = {
  base: ThemeBinding;
  hover?: ThemeBinding;
  owner?: string;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const name = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(v);
function fail(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const shapes: Record<ThemeKind, [string, string[]]> = {
  color: ["UIStroke", ["Color", "Transparency"]],
  background: ["UIStroke", ["Color", "Transparency"]],
  font: ["TextLabel", ["FontFace", "TextSize"]],
  shadow: [
    "UIShadow",
    ["Color", "Transparency", "BlurRadius", "Offset", "Spread"],
  ],
  hover: [
    "TextButton",
    [
      "BackgroundColor3",
      "BackgroundTransparency",
      "TextColor3",
      "TextTransparency",
      "ImageColor3",
      "ImageTransparency",
    ],
  ],
};
function closedValue(v: unknown) {
  return (
    typeof v === "number" ||
    (record(v) &&
      fields(
        v,
        v.type === "Font"
          ? ["type", "family", "weight", "style"]
          : ["type", "value"],
      ))
  );
}
function tokenValid(token: unknown): token is ThemeToken {
  if (!record(token)) return false;
  if ("ref" in token) return fields(token, ["ref"]) && name(token.ref);
  if (
    !fields(token, ["kind", "values"]) ||
    !Object.prototype.hasOwnProperty.call(shapes, String(token.kind)) ||
    !record(token.values)
  )
    return false;
  const kind = token.kind as ThemeKind,
    [cls, allowed] = shapes[kind];
  const values = token.values;
  const keys = Object.keys(values);
  if (
    !keys.length ||
    !fields(values, allowed) ||
    (kind !== "hover" && !allowed.every((k) => k in values))
  )
    return false;
  return keys.every(
    (key) =>
      closedValue(values[key]) &&
      validProperty(
        key.startsWith("Image") ? "ImageButton" : cls,
        key,
        values[key] as Value,
      ),
  );
}
/** Read the established version only; future/unknown formats fail without discarding settings. */
export function resolveThemes(value: unknown): {
  settings: ThemeSettings;
  resolved: Record<
    string,
    Record<string, Exclude<ThemeToken, { ref: string }>>
  >;
} {
  fail(
    record(value) &&
      fields(value, ["version", "initial", "modes"]) &&
      value.version === 1 &&
      name(value.initial) &&
      record(value.modes),
    "Invalid theme settings. Use version 1 and named modes.",
  );
  const settings = value as unknown as ThemeSettings;
  const modeNames = Object.keys(settings.modes);
  fail(
    modeNames.length >= 1 &&
      modeNames.length <= 8 &&
      modeNames.every(name) &&
      modeNames.includes(settings.initial),
    "Choose 1–8 named themes and a valid initial theme.",
  );
  const resolved: Record<
    string,
    Record<string, Exclude<ThemeToken, { ref: string }>>
  > = {};
  let canonical: string[] | undefined;
  for (const mode of modeNames) {
    const entries = settings.modes[mode];
    fail(record(entries), "Invalid theme token dictionary.");
    const ids = Object.keys(entries).sort();
    fail(
      ids.length >= 1 && ids.length <= 128 && ids.every(name),
      "Each theme needs 1–128 named tokens.",
    );
    fail(
      !canonical || JSON.stringify(canonical) === JSON.stringify(ids),
      "Every theme must define the same token names.",
    );
    canonical = ids;
    const out: Record<string, Exclude<ThemeToken, { ref: string }>> = {};
    const visiting = new Set<string>();
    function resolve(id: string): Exclude<ThemeToken, { ref: string }> {
      if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];
      fail(!visiting.has(id), `Theme alias cycle at ${mode}.${id}.`);
      fail(
        Object.prototype.hasOwnProperty.call(entries, id) &&
          tokenValid(entries[id]),
        `Invalid or missing theme token ${mode}.${id}.`,
      );
      visiting.add(id);
      const token = entries[id];
      const result = "ref" in token ? resolve(token.ref) : token;
      visiting.delete(id);
      out[id] = result;
      return result;
    }
    ids.forEach(resolve);
    resolved[mode] = out;
  }
  for (const id of canonical!) {
    const first = resolved[settings.initial][id];
    fail(
      modeNames.every(
        (mode) =>
          resolved[mode][id].kind === first.kind &&
          JSON.stringify(Object.keys(resolved[mode][id].values).sort()) ===
            JSON.stringify(Object.keys(first.values).sort()),
      ),
      `Theme token ${id} must keep its kind and fields across themes.`,
    );
  }
  fail(
    JSON.stringify(settings).length <= 60000,
    "Theme settings exceed 60 KB. Reduce the token library.",
  );
  return { settings, resolved };
}
export function validThemeLayer(value: unknown): value is ThemeLayer {
  return (
    record(value) &&
    fields(value, Object.keys(shapes)) &&
    Object.values(value).every(name)
  );
}
export function themeProperties(
  node: RbxNode,
  themes: CompiledThemes,
  mode: string,
  hover = false,
): Record<string, Value> {
  const values = themes.modes[mode];
  if (!values) return {};
  const bindings = { ...node.theme?.base, ...(hover ? node.theme?.hover : {}) };
  return Object.fromEntries(
    Object.entries(bindings).map(([property, [id, field]]) => [
      property,
      values[id][field],
    ]),
  );
}
/** Bind only unoverridden properties; explicit native edits remain authoritative in every mode. */
export function applyThemes(
  pkg: TransferPackage,
  options: ExportOptions,
): TransferPackage {
  fail(
    options.themeEnabled === undefined ||
      typeof options.themeEnabled === "boolean",
    "Invalid themed export preference.",
  );
  if (options.themeEnabled === false) return pkg;
  const overrides = options.layerOverrides;
  const requested = Object.values(overrides).some(
    (v) => v.theme && Object.keys(v.theme).length,
  );
  if (!options.themes) {
    fail(
      !requested,
      "Define theme tokens in Conversion settings before binding layers.",
    );
    return pkg;
  }
  const { settings, resolved } = resolveThemes(options.themes);
  for (const root of pkg.roots) {
    const used = new Set<string>();
    const nodes = flatten([root]);
    const parents = new Map(
      nodes.flatMap((n) => n.children.map((c) => [c.id, n] as const)),
    );
    function bind(
      node: RbxNode,
      id: string,
      kind: ThemeKind,
      edit?: LayerOverride,
    ) {
      const token = resolved[settings.initial][id];
      fail(
        token && token.kind === kind,
        `${node.name}: ${id} must be a ${kind} token.`,
      );
      const map: Record<string, string> =
        kind === "color"
          ? "TextColor3" in PROPERTY_SCHEMAS[node.className]
            ? { TextColor3: "Color", TextTransparency: "Transparency" }
            : "ImageColor3" in PROPERTY_SCHEMAS[node.className]
              ? { ImageColor3: "Color", ImageTransparency: "Transparency" }
              : { Color: "Color", Transparency: "Transparency" }
          : kind === "background"
            ? {
                BackgroundColor3: "Color",
                BackgroundTransparency: "Transparency",
              }
            : Object.fromEntries(Object.keys(token.values).map((k) => [k, k]));
      node.theme ??= { base: {} };
      const binding =
        kind === "hover" ? (node.theme.hover ??= {}) : node.theme.base;
      const modifier =
        node.className === "UIShadow"
          ? "shadow"
          : node.className === "UIStroke"
            ? "stroke"
            : undefined;
      const parentEdit = overrides[parents.get(node.id)?.id ?? ""];
      const modifierProperties = modifier
        ? parentEdit?.components?.[modifier]
        : undefined;
      for (const [property, field] of Object.entries(map)) {
        if (
          edit?.properties?.[property] !== undefined ||
          (modifierProperties && modifierProperties[property] !== undefined)
        )
          continue;
        fail(
          !["color", "font"].includes(kind) ||
            node.properties.RichText !== true,
          `${node.name}: color/font tokens require plain native text. Rich text carries its own font and color spans.`,
        );
        fail(
          validProperty(node.className, property, token.values[field]),
          `${node.name}: ${kind} token cannot bind ${property} on ${node.className}.`,
        );
        binding[property] = [id, field];
        if (kind !== "hover") node.properties[property] = token.values[field];
      }
      if (!Object.keys(binding).length) {
        if (kind === "hover") delete node.theme.hover;
      } else used.add(id);
      if (kind === "hover" && node.theme.hover) {
        let owner: RbxNode | undefined = node;
        while (
          owner &&
          !["TextButton", "ImageButton"].includes(owner.className)
        )
          owner = parents.get(owner.id);
        fail(
          owner,
          `${node.name}: a hover token needs this layer or an ancestor to be a button.`,
        );
        node.theme.owner = owner.id;
        // Hover must always have a resting property, including hover-only bindings.
        for (const key of Object.keys(binding))
          node.properties[key] ??=
            PROPERTY_SCHEMAS[node.className][key].default;
      }
      if (!Object.keys(node.theme.base).length && !node.theme.hover)
        delete node.theme;
    }
    for (const node of nodes) {
      const edit = overrides[node.id],
        layer = edit?.theme;
      if (layer === undefined || layer === false) continue;
      fail(
        validThemeLayer(layer),
        `${node.name}: invalid layer theme bindings.`,
      );
      for (const [kind, id] of Object.entries(layer) as [ThemeKind, string][]) {
        if (kind !== "shadow") bind(node, id, kind, edit);
        else {
          if (edit.components?.shadow === false) continue;
          let shadow =
            node.className === "UIShadow"
              ? node
              : node.children.find((c) => c.className === "UIShadow");
          if (!shadow) {
            fail(
              PROPERTY_SCHEMAS[node.className]?.BackgroundColor3,
              `${node.name}: shadow tokens need a GUI layer.`,
            );
            shadow = {
              id: node.id + "/theme-shadow",
              name: "Theme shadow",
              className: "UIShadow",
              properties: {},
              children: [],
            };
            fail(
              !nodes.some((n) => n.id === shadow!.id),
              "Reserved theme shadow identity.",
            );
            node.children.push(shadow);
          }
          bind(shadow, id, kind, {
            properties: {
              ...edit.components?.shadow,
              ...(shadow === node ? edit.properties : {}),
              ...overrides[shadow.id]?.properties,
            },
          });
        }
      }
    }
    if (used.size)
      root.themes = {
        version: 1,
        initial: settings.initial,
        modes: Object.fromEntries(
          Object.entries(resolved).map(([mode, entries]) => [
            mode,
            Object.fromEntries(
              [...used].sort().map((id) => [id, entries[id].values]),
            ),
          ]),
        ),
      };
  }
  pkg.stats.instances = flatten(pkg.roots).length;
  validateThemes(pkg.roots);
  return pkg;
}
/** Validate resolved transfer data independently from trusted author settings. */
export function validateThemes(roots: RbxNode[]) {
  for (const root of roots) {
    const nodes = flatten([root]),
      themes = root.themes;
    fail(
      nodes.slice(1).every((n) => n.themes === undefined),
      "Theme definitions belong on the UI root.",
    );
    if (themes === undefined) {
      fail(
        nodes.every((n) => n.theme === undefined),
        "Theme bindings need root definitions.",
      );
      continue;
    }
    fail(
      record(themes) &&
        fields(themes, ["version", "initial", "modes"]) &&
        themes.version === 1 &&
        name(themes.initial) &&
        record(themes.modes),
      "Invalid compiled themes.",
    );
    const modes = Object.keys(themes.modes);
    fail(
      modes.length >= 1 &&
        modes.length <= 8 &&
        modes.every(name) &&
        modes.includes(themes.initial) &&
        JSON.stringify(themes).length <= 60000,
      "Invalid compiled theme modes.",
    );
    const canonical = Object.keys(themes.modes[themes.initial]).sort();
    fail(
      canonical.length >= 1 && canonical.length <= 128 && canonical.every(name),
      "Invalid compiled theme tokens.",
    );
    const used = new Set<string>();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parents = new Map(
      nodes.flatMap((n) => n.children.map((c) => [c.id, n.id] as const)),
    );
    const canonicalClasses: Record<string, string> = {
      Color: "UIStroke",
      Transparency: "UIStroke",
      FontFace: "TextLabel",
      TextSize: "TextLabel",
      BlurRadius: "UIShadow",
      Spread: "UIShadow",
      Offset: "UIShadow",
      BackgroundColor3: "Frame",
      BackgroundTransparency: "Frame",
      TextColor3: "TextLabel",
      TextTransparency: "TextLabel",
      ImageColor3: "ImageLabel",
      ImageTransparency: "ImageLabel",
    };
    for (const mode of modes) {
      fail(
        record(themes.modes[mode]) &&
          JSON.stringify(Object.keys(themes.modes[mode]).sort()) ===
            JSON.stringify(canonical),
        "Compiled theme token sets differ.",
      );
      for (const id of canonical) {
        const values = themes.modes[mode][id];
        fail(
          record(values) &&
            Object.keys(values).length >= 1 &&
            Object.keys(values).length <= 6 &&
            JSON.stringify(Object.keys(values).sort()) ===
              JSON.stringify(
                Object.keys(themes.modes[themes.initial][id]).sort(),
              ),
          "Invalid compiled token fields.",
        );
        for (const [field, value] of Object.entries(values))
          fail(
            canonicalClasses[field] &&
              closedValue(value) &&
              validProperty(canonicalClasses[field], field, value),
            "Invalid compiled token value.",
          );
      }
    }
    for (const node of nodes) {
      const value = node.theme;
      if (value === undefined) continue;
      fail(
        record(value) &&
          fields(value, ["base", "hover", "owner"]) &&
          record(value.base) &&
          (value.hover === undefined || record(value.hover)),
        "Invalid theme binding.",
      );
      fail(
        Object.keys(value.base).length + Object.keys(value.hover ?? {}).length >
          0,
        "Empty theme binding.",
      );
      const allowed = [
        "BackgroundColor3",
        "BackgroundTransparency",
        "TextColor3",
        "TextTransparency",
        "ImageColor3",
        "ImageTransparency",
        "Color",
        "Transparency",
        "FontFace",
        "TextSize",
        "BlurRadius",
        "Spread",
        "Offset",
      ];
      for (const [property, ref] of [
        ...Object.entries(value.base),
        ...Object.entries(value.hover ?? {}),
      ]) {
        fail(
          allowed.includes(property) &&
            Array.isArray(ref) &&
            ref.length === 2 &&
            ref.every(name) &&
            canonical.includes(ref[0]) &&
            node.properties[property] !== undefined,
          "Invalid theme property reference.",
        );
        const tintProperty = node.className.startsWith("Text")
          ? "TextColor3"
          : node.className.startsWith("Image")
            ? "ImageColor3"
            : "BackgroundColor3";
        fail(
          !node.behavior?.motion?.hover?.tint || property !== tintProperty,
          `${node.name}: theme color and motion hover tint cannot own the same property.`,
        );
        if (property.includes("Transparency")) {
          fail(
            !(property === "ImageTransparency" && node.behavior?.motion?.drift),
            `${node.name}: theme transparency and texture drift cannot own the same property.`,
          );
          let ancestor: RbxNode | undefined = node;
          while (ancestor && ancestor.className !== "CanvasGroup") {
            fail(
              !ancestor.behavior?.motion?.blink &&
                !ancestor.behavior?.motion?.enter &&
                !ancestor.behavior?.keyframes,
              `${node.name}: theme transparency and ancestor fade/blink motion cannot own the same property. Set an explicit transparency override to retain motion ownership.`,
            );
            ancestor = byId.get(parents.get(ancestor.id)!);
          }
        }
        for (const mode of modes)
          fail(
            record(themes.modes[mode][ref[0]]) &&
              Object.keys(themes.modes[mode][ref[0]]).length <= 6 &&
              validProperty(
                node.className,
                property,
                themes.modes[mode][ref[0]][ref[1]],
              ),
            "Invalid resolved theme value.",
          );
        used.add(ref[0]);
      }
      if (value.hover) {
        let owner: string | undefined = node.id;
        while (owner && owner !== value.owner) owner = parents.get(owner);
        fail(
          owner &&
            ["TextButton", "ImageButton"].includes(byId.get(owner)!.className),
          "Theme hover owner must be this button or an ancestor.",
        );
        fail(
          Object.keys(value.hover).every((p) =>
            [
              "BackgroundColor3",
              "BackgroundTransparency",
              "TextColor3",
              "TextTransparency",
              "ImageColor3",
              "ImageTransparency",
            ].includes(p),
          ),
          "Invalid hover theme property.",
        );
      } else
        fail(value.owner === undefined, "Theme owner needs hover bindings.");
    }
    fail(
      canonical.every((id) => used.has(id)),
      "Unused theme tokens must not be transferred.",
    );
    const reserved = root.id + "/behavior-runtime";
    fail(
      !byId.has(reserved) && !byId.has(reserved + "/module"),
      "Reserved interaction runtime identity.",
    );
  }
}
export const hasThemes = (pkg: TransferPackage) =>
  pkg.roots.some((n) => !!n.themes);

export const DEFAULT_THEMES: ThemeSettings = {
  version: 1,
  initial: "Light",
  modes: {
    Light: {
      accent: {
        kind: "color",
        values: {
          Color: { type: "Color3", value: [0.2, 0.35, 0.9] },
          Transparency: 0,
        },
      },
      surface: {
        kind: "background",
        values: {
          Color: { type: "Color3", value: [0.94, 0.96, 1] },
          Transparency: 0,
        },
      },
      body: {
        kind: "font",
        values: {
          FontFace: {
            type: "Font",
            family: "rbxasset://fonts/families/SourceSansPro.json",
            weight: "Regular",
            style: "Normal",
          },
          TextSize: 18,
        },
      },
      elevated: {
        kind: "shadow",
        values: {
          Color: { type: "Color3", value: [0, 0, 0] },
          Transparency: 0.7,
          BlurRadius: { type: "UDim", value: [0, 10] },
          Offset: { type: "UDim2", value: [0, 0, 0, 4] },
          Spread: { type: "UDim2", value: [0, 0, 0, 0] },
        },
      },
      interactive: {
        kind: "hover",
        values: {
          BackgroundColor3: { type: "Color3", value: [0.8, 0.85, 1] },
          BackgroundTransparency: 0,
        },
      },
    },
    Dark: {
      accent: {
        kind: "color",
        values: {
          Color: { type: "Color3", value: [0.65, 0.75, 1] },
          Transparency: 0,
        },
      },
      surface: {
        kind: "background",
        values: {
          Color: { type: "Color3", value: [0.1, 0.12, 0.2] },
          Transparency: 0,
        },
      },
      body: {
        kind: "font",
        values: {
          FontFace: {
            type: "Font",
            family: "rbxasset://fonts/families/SourceSansPro.json",
            weight: "Regular",
            style: "Normal",
          },
          TextSize: 18,
        },
      },
      elevated: {
        kind: "shadow",
        values: {
          Color: { type: "Color3", value: [0, 0, 0] },
          Transparency: 0.4,
          BlurRadius: { type: "UDim", value: [0, 12] },
          Offset: { type: "UDim2", value: [0, 0, 0, 4] },
          Spread: { type: "UDim2", value: [0, 0, 0, 0] },
        },
      },
      interactive: {
        kind: "hover",
        values: {
          BackgroundColor3: { type: "Color3", value: [0.2, 0.25, 0.4] },
          BackgroundTransparency: 0,
        },
      },
    },
  },
};
