import { cloneSettings } from "./clone-settings";
import { hasKeyframeSpatial } from "./keyframes";
import { flatten, type DesignNode, type RbxNode } from "./types";

/** Bounded author settings. No expressions, object paths or executable callbacks. */
export type MotionSettings = {
  input?: "auto" | "parent";
  hover?: {
    scale: number;
    rotation: number;
    lift: number;
    duration: number;
    tint?: [number, number, number];
  };
  press?: { scale: number; duration: number };
  float?: { distance: number; period: number; direction: number };
  spin?: { speed: number };
  pulse?: { scale: number; period: number };
  blink?: { visible: number; hidden: number; fade: number; delay: number };
  enter?: {
    kind: "fade" | "slide" | "pop";
    duration: number;
    delay: number;
    distance: number;
    direction: number;
  };
  shine?: {
    trigger: "loop" | "hover";
    period: number;
    width: number;
    opacity: number;
    direction: number;
    color: [number, number, number];
  };
  magnet?: { radius: number; pull: number; duration: number };
  drift?: { speed: number; direction: number };
  sounds?: { hover?: string; press?: string; volume: number };
};
export type CompiledMotion = MotionSettings & { owner?: string; slot?: string };

export const MOTION_DEFAULTS = {
  hover: { scale: 1.05, rotation: 0, lift: 0, duration: 0.15 },
  press: { scale: 0.94, duration: 0.08 },
  float: { distance: 12, period: 3, direction: 0 },
  spin: { speed: 90 },
  pulse: { scale: 1.04, period: 2 },
  blink: { visible: 1, hidden: 0.5, fade: 0.2, delay: 0 },
  enter: { kind: "fade", duration: 0.3, delay: 0, distance: 24, direction: 0 },
  shine: {
    trigger: "loop",
    period: 2,
    width: 0.2,
    opacity: 0.45,
    direction: 20,
    color: [1, 1, 1],
  },
  magnet: { radius: 160, pull: 12, duration: 0.15 },
  drift: { speed: 24, direction: 270 },
  sounds: { volume: 0.5 },
} satisfies Required<Omit<MotionSettings, "input">>;

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((key) => allowed.includes(key));
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const rgb = (v: unknown) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => number(n, 0, 1));
const sound = (v: unknown) =>
  typeof v === "string" && /^(?:rbxassetid:\/\/)?[1-9]\d{0,19}$/.test(v);
const ranges = {
  hover: {
    scale: [0.5, 2],
    rotation: [-90, 90],
    lift: [-200, 200],
    duration: [0, 5],
  },
  press: { scale: [0.5, 2], duration: [0, 5] },
  float: { distance: [0, 500], period: [0.1, 60], direction: [-360, 360] },
  spin: { speed: [-1440, 1440] },
  pulse: { scale: [0.5, 2], period: [0.1, 60] },
  blink: {
    visible: [0.1, 60],
    hidden: [0.1, 60],
    fade: [0, 10],
    delay: [0, 60],
  },
  enter: {
    duration: [0, 10],
    delay: [0, 60],
    distance: [0, 500],
    direction: [-360, 360],
  },
  shine: {
    period: [0.1, 60],
    width: [0.01, 0.8],
    opacity: [0, 1],
    direction: [-360, 360],
  },
  magnet: { radius: [1, 1000], pull: [0, 200], duration: [0, 5] },
  drift: { speed: [-500, 500], direction: [-360, 360] },
  sounds: { volume: [0, 1] },
} as const;
export const MOTION_FIELDS = ranges;

export function validMotion(
  value: unknown,
  compiled = false,
): value is MotionSettings {
  if (
    !record(value) ||
    !fields(value, [
      ...Object.keys(ranges),
      "input",
      ...(compiled ? ["owner", "slot"] : []),
    ])
  )
    return false;
  if (
    value.input !== undefined &&
    !["auto", "parent"].includes(String(value.input))
  )
    return false;
  for (const identity of ["owner", "slot"])
    if (
      value[identity] !== undefined &&
      (!compiled ||
        typeof value[identity] !== "string" ||
        !(value[identity] as string).trim() ||
        (value[identity] as string).length > 256)
    )
      return false;
  for (const [kind, bounds] of Object.entries(ranges)) {
    const setting = value[kind];
    if (setting === undefined) continue;
    const extras =
      kind === "hover"
        ? ["tint"]
        : kind === "shine"
          ? ["color", "trigger"]
          : kind === "enter"
            ? ["kind"]
            : kind === "sounds"
              ? ["hover", "press"]
              : [];
    if (
      !record(setting) ||
      !fields(setting, [...Object.keys(bounds), ...extras])
    )
      return false;
    for (const [key, [min, max]] of Object.entries(bounds))
      if (!number(setting[key], min, max)) return false;
    if (kind === "hover" && setting.tint !== undefined && !rgb(setting.tint))
      return false;
    if (
      kind === "shine" &&
      (!rgb(setting.color) ||
        !["loop", "hover"].includes(String(setting.trigger)))
    )
      return false;
    if (
      kind === "enter" &&
      !["fade", "slide", "pop"].includes(String(setting.kind))
    )
      return false;
    if (
      kind === "sounds" &&
      ["hover", "press"].some(
        (key) => setting[key] !== undefined && !sound(setting[key]),
      )
    )
      return false;
    // Keep blinking slower than three flashes per second, and fades within their phase.
    if (
      kind === "blink" &&
      ((setting.visible as number) + (setting.hidden as number) < 1 / 3 ||
        (setting.fade as number) >
          Math.min(setting.visible as number, setting.hidden as number))
    )
      return false;
  }
  return Object.keys(ranges).some((key) => value[key] !== undefined);
}

export function needsMotionInput(value?: MotionSettings) {
  return !!(
    value?.hover ||
    value?.press ||
    value?.magnet ||
    value?.shine?.trigger === "hover" ||
    value?.sounds?.hover ||
    value?.sounds?.press
  );
}
export function hasSpatialMotion(value?: MotionSettings) {
  return !!(
    value?.hover ||
    value?.press ||
    value?.float ||
    value?.spin ||
    value?.pulse ||
    value?.magnet ||
    (value?.enter && value.enter.kind !== "fade")
  );
}
export function motionFromTags(node: DesignNode): MotionSettings | undefined {
  const value: MotionSettings = {};
  const tag = (name: string) =>
    new RegExp(`\\[${name}\\]|_${name}(?=$|_|\\[|\\s)`, "i").test(node.name);
  if (tag("smooth")) {
    value.hover = cloneSettings(MOTION_DEFAULTS.hover);
    value.press = cloneSettings(MOTION_DEFAULTS.press);
  }
  if (tag("up")) value.hover = { ...MOTION_DEFAULTS.hover, scale: 1, lift: 8 };
  if (tag("turn") || tag("lean"))
    value.hover = {
      ...(value.hover ?? MOTION_DEFAULTS.hover),
      scale: value.hover?.scale ?? 1,
      rotation: -5,
    };
  if (tag("lean")) value.input = "parent";
  for (const key of [
    "float",
    "spin",
    "pulse",
    "blink",
    "magnet",
    "drift",
  ] as const)
    if (tag(key)) value[key] = cloneSettings(MOTION_DEFAULTS[key]) as never;
  if (tag("fadein")) value.enter = cloneSettings(MOTION_DEFAULTS.enter);
  if (tag("shiny") || tag("glint"))
    value.shine = cloneSettings(MOTION_DEFAULTS.shine);
  if (tag("glint")) value.shine!.trigger = "hover";
  return Object.keys(value).length ? value : undefined;
}
export function stripMotionTags(name: string) {
  return (
    name
      .replace(
        /\[(?:smooth|up|turn|lean|float|spin|pulse|blink|magnet|drift|fadein|shiny|glint)\]/gi,
        "",
      )
      .replace(
        /_(?:smooth|up|turn|lean|float|spin|pulse|blink|magnet|drift|fadein|shiny|glint)(?=$|_|\[|\s)/gi,
        "",
      )
      .trim() || "Layer"
  );
}

/** Logical ownership remains stable across the generated layout slot. */
export function motionParent(
  node: RbxNode,
  parents: Map<string, RbxNode>,
): RbxNode | undefined {
  const parent = parents.get(node.id);
  return parent &&
    (node.behavior?.motion?.slot === parent.id ||
      node.behavior?.keyframes?.slot === parent.id)
    ? parents.get(parent.id)
    : parent;
}

/** Reserve a native layout slot so animation cannot change sibling placement. */
export function addMotionSlots(roots: RbxNode[]): void {
  const ids = new Set(flatten(roots).map((n) => n.id));
  function visit(parent: RbxNode) {
    parent.children = parent.children.map((node) => {
      visit(node);
      const motion = node.behavior?.motion;
      if (
        !hasSpatialMotion(motion) &&
        !hasKeyframeSpatial(node.behavior?.keyframes)
      )
        return node;
      const id = `${node.id}/motion-slot`;
      if (ids.has(id) || id.length > 256)
        throw new Error(
          `${node.name}: invalid or reserved motion slot identity.`,
        );
      ids.add(id);
      const p = node.properties;
      const sizing = p.AutomaticSize;
      const automatic =
        sizing && typeof sizing === "object" && sizing.type === "Enum"
          ? sizing.value[1]
          : "None";
      const slot: RbxNode = {
        id,
        name: `${node.name} Motion slot`,
        className: "Frame",
        sourceType: "MOTION_SLOT",
        referenceSize: node.referenceSize,
        layoutSizing: node.layoutSizing,
        properties: {
          BackgroundTransparency: 1,
          BorderSizePixel: 0,
          ClipsDescendants: false,
        },
        children: [node],
      };
      for (const key of [
        "Position",
        "Size",
        "AnchorPoint",
        "LayoutOrder",
        "ZIndex",
        "Visible",
      ])
        if (p[key] !== undefined) slot.properties[key] = p[key];
      if (automatic.includes("X") || automatic.includes("Y")) {
        const size = p.Size as { type: "UDim2"; value: number[] };
        const next = [...size.value];
        if (automatic.includes("X")) {
          next[0] = 0;
          next[1] = node.referenceSize?.[0] ?? next[1];
        }
        if (automatic.includes("Y")) {
          next[2] = 0;
          next[3] = node.referenceSize?.[1] ?? next[3];
        }
        slot.properties.Size = { type: "UDim2", value: next };
      }
      // Hug remains on the real content; the runtime measures it into its reserved slot.
      // Keeping the slot itself non-Hug avoids a fill/automatic-size feedback cycle.
      node.properties.Position = { type: "UDim2", value: [0.5, 0, 0.5, 0] };
      node.properties.AnchorPoint = { type: "Vector2", value: [0.5, 0.5] };
      node.properties.Size = {
        type: "UDim2",
        value: [
          automatic.includes("X") ? 0 : 1,
          0,
          automatic.includes("Y") ? 0 : 1,
          0,
        ],
      };
      slot.children.push(
        ...node.children.filter(
          (n) =>
            n.className === "UIFlexItem" ||
            n.className === "UISizeConstraint" ||
            n.className === "UIAspectRatioConstraint",
        ),
      );
      node.children = node.children.filter(
        (n) =>
          ![
            "UIFlexItem",
            "UISizeConstraint",
            "UIAspectRatioConstraint",
          ].includes(n.className),
      );
      if (motion) motion.slot = id;
      else node.behavior!.keyframes!.slot = id;
      return slot;
    });
  }
  roots.forEach(visit);
}

export type MotionState =
  "default" | "hover" | "pressed" | "disabled" | "selected";
export type MotionSample = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  shine: number;
  driftX: number;
  driftY: number;
};
/** Deterministic preview sample. Roblox uses the same phase rules with native properties. */
export function sampleMotion(
  config: MotionSettings,
  seconds: number,
  state: MotionState = "default",
  reduced = false,
): MotionSample {
  const out: MotionSample = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
    shine: -2,
    driftX: 0,
    driftY: 0,
  };
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (reduced) return out;
  const direction = (angle: number) => [
    Math.sin((angle * Math.PI) / 180),
    -Math.cos((angle * Math.PI) / 180),
  ];
  if (state === "hover" || state === "selected") {
    if (config.hover) {
      out.scale *= config.hover.scale;
      out.rotation += config.hover.rotation;
      out.y -= config.hover.lift;
    }
  } else if (state === "pressed" && config.press)
    out.scale *= config.press.scale;
  if (config.float) {
    const d = direction(config.float.direction);
    const phase =
      (Math.sin((time / config.float.period) * 2 * Math.PI) *
        config.float.distance) /
      2;
    out.x += d[0] * phase;
    out.y += d[1] * phase;
  }
  if (config.spin) out.rotation += (time * config.spin.speed) % 360;
  if (config.pulse)
    out.scale *=
      1 +
      ((config.pulse.scale - 1) *
        (1 - Math.cos((time / config.pulse.period) * 2 * Math.PI))) /
        2;
  if (config.blink && time >= config.blink.delay) {
    const b = config.blink;
    const phase = (time - b.delay) % (b.visible + b.hidden);
    out.opacity *=
      phase < b.visible
        ? b.fade
          ? Math.min(1, phase / b.fade)
          : 1
        : b.fade
          ? Math.max(0, 1 - (phase - b.visible) / b.fade)
          : 0;
  }
  if (config.enter) {
    const e = config.enter;
    const p =
      e.duration === 0
        ? time >= e.delay
          ? 1
          : 0
        : Math.min(1, Math.max(0, (time - e.delay) / e.duration));
    const eased = 1 - (1 - p) ** 3;
    out.opacity *= eased;
    if (e.kind === "pop") out.scale *= 0.75 + 0.25 * eased;
    if (e.kind === "slide") {
      const d = direction(e.direction);
      out.x += d[0] * e.distance * (1 - eased);
      out.y += d[1] * e.distance * (1 - eased);
    }
  }
  if (config.shine) out.shine = ((time / config.shine.period) % 1) * 4 - 2;
  if (config.drift) {
    const d = direction(config.drift.direction);
    out.driftX = d[0] * config.drift.speed * time;
    out.driftY = d[1] * config.drift.speed * time;
  }
  return out;
}
