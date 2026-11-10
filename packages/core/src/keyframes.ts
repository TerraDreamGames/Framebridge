import { cloneSettings } from "./clone-settings";
import type { RbxNode, Value } from "./types";
export const KEYFRAME_EASINGS = [
  "linear",
  "quad",
  "cubic",
  "sine",
  "back",
] as const;
export const KEYFRAME_TRIGGERS = [
  "mount",
  "visible",
  "activate",
  "hover",
  "pressed",
  "selected",
  "attribute",
] as const;
export type KeyframePose = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};
export type Keyframe = KeyframePose & {
  time: number;
  easing: (typeof KEYFRAME_EASINGS)[number];
  direction: "in" | "out" | "inOut";
};
export type RecordingBasis = {
  parent: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};
export type KeyframeSettings = {
  trigger: (typeof KEYFRAME_TRIGGERS)[number];
  input?: "auto" | "parent";
  attribute?: string;
  interruption: "restart" | "ignore";
  finish: "hold" | "restore";
  repeats: number;
  yoyo: boolean;
  frames: Keyframe[];
  recording?: RecordingBasis;
};
export type CompiledKeyframes = Omit<KeyframeSettings, "recording"> & {
  owner?: string;
  slot?: string;
};
export const REST_POSE: KeyframePose = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};
export const KEYFRAME_DEFAULTS: KeyframeSettings = {
  trigger: "activate",
  interruption: "restart",
  finish: "restore",
  repeats: 0,
  yoyo: false,
  frames: [
    { ...REST_POSE, time: 0, easing: "linear", direction: "out" },
    { ...REST_POSE, scale: 1.15, time: 0.3, easing: "cubic", direction: "out" },
    { ...REST_POSE, time: 0.6, easing: "cubic", direction: "out" },
  ],
};
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: Record<string, any>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const identity = (v: unknown) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 256;
export function validPose(v: unknown): boolean {
  return (
    record(v) &&
    finite(v.x, -2000, 2000) &&
    finite(v.y, -2000, 2000) &&
    finite(v.scale, 0.1, 4) &&
    finite(v.rotation, -3600, 3600) &&
    finite(v.opacity, 0, 4)
  );
}
export function validKeyframes(
  v: unknown,
  compiled = false,
): v is KeyframeSettings {
  if (
    !record(v) ||
    !fields(v, [
      "trigger",
      "input",
      "attribute",
      "interruption",
      "finish",
      "repeats",
      "yoyo",
      "frames",
      ...(compiled ? ["owner", "slot"] : ["recording"]),
    ]) ||
    !KEYFRAME_TRIGGERS.includes(v.trigger) ||
    (v.input !== undefined && !["auto", "parent"].includes(v.input)) ||
    !["restart", "ignore"].includes(v.interruption) ||
    !["hold", "restore"].includes(v.finish) ||
    !finite(v.repeats, 0, 20) ||
    v.repeats % 1 !== 0 ||
    typeof v.yoyo !== "boolean"
  )
    return false;
  if (
    v.trigger === "attribute"
      ? typeof v.attribute !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(v.attribute)
      : v.attribute !== undefined
  )
    return false;
  if (
    compiled &&
    ["owner", "slot"].some((k) => v[k] !== undefined && !identity(v[k]))
  )
    return false;
  if (!Array.isArray(v.frames) || v.frames.length < 2 || v.frames.length > 32)
    return false;
  let last = -1;
  for (const f of v.frames) {
    if (
      !record(f) ||
      !fields(f, [
        "time",
        "easing",
        "direction",
        "x",
        "y",
        "scale",
        "rotation",
        "opacity",
      ]) ||
      !validPose(f) ||
      !finite(f.time, 0, 120) ||
      (last < 0 ? f.time !== 0 : f.time - last < 0.00999999) ||
      !KEYFRAME_EASINGS.includes(f.easing) ||
      !["in", "out", "inOut"].includes(f.direction)
    )
      return false;
    last = f.time;
  }
  if (v.recording !== undefined) {
    const b = v.recording;
    if (
      !record(b) ||
      !fields(b, [
        "parent",
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "opacity",
      ]) ||
      !identity(b.parent) ||
      !finite(b.x, -1e6, 1e6) ||
      !finite(b.y, -1e6, 1e6) ||
      !finite(b.width, 0.001, 1e6) ||
      !finite(b.height, 0.001, 1e6) ||
      !finite(b.rotation, -3600, 3600) ||
      !finite(b.opacity, 0.000001, 1)
    )
      return false;
  }
  return true;
}
export const needsKeyframeInput = (k?: KeyframeSettings | CompiledKeyframes) =>
  !!k && ["activate", "hover", "pressed", "selected"].includes(k.trigger);
export const hasKeyframeSpatial = (k?: KeyframeSettings | CompiledKeyframes) =>
  !!k &&
  k.frames.some(
    (f) => f.x !== 0 || f.y !== 0 || f.scale !== 1 || f.rotation !== 0,
  );
export function easeKeyframe(
  t: number,
  easing: Keyframe["easing"],
  direction: Keyframe["direction"],
) {
  t = Math.max(0, Math.min(1, t));
  if (t === 0 || t === 1) return t;
  const inward = (x: number) =>
    easing === "linear"
      ? x
      : easing === "quad"
        ? x * x
        : easing === "cubic"
          ? x * x * x
          : easing === "sine"
            ? 1 - Math.cos((x * Math.PI) / 2)
            : x * x * (2.70158 * x - 1.70158);
  return direction === "in"
    ? inward(t)
    : direction === "out"
      ? 1 - inward(1 - t)
      : t < 0.5
        ? inward(t * 2) / 2
        : 1 - inward((1 - t) * 2) / 2;
}
export const keyframeDuration = (k: KeyframeSettings | CompiledKeyframes) =>
  k.frames[k.frames.length - 1].time;
export const keyframeTotalDuration = (
  k: KeyframeSettings | CompiledKeyframes,
) => keyframeDuration(k) * (k.repeats + 1) * (k.yoyo ? 2 : 1);
export function sampleKeyframes(
  k: KeyframeSettings | CompiledKeyframes,
  seconds: number,
): { pose: KeyframePose; time: number; iteration: number; complete: boolean } {
  const duration = keyframeDuration(k),
    total = keyframeTotalDuration(k);
  const elapsed = Math.max(
    0,
    Math.min(total, Number.isFinite(seconds) ? seconds : 0),
  );
  const leg = Math.min(
    Math.floor(elapsed / duration),
    (k.repeats + 1) * (k.yoyo ? 2 : 1) - 1,
  );
  let time = elapsed - leg * duration;
  if (k.yoyo && leg % 2) time = duration - time;
  let a = k.frames[0],
    b = k.frames[k.frames.length - 1];
  for (let i = 1; i < k.frames.length; i++)
    if (time <= k.frames[i].time) {
      a = k.frames[i - 1];
      b = k.frames[i];
      break;
    }
  const t = easeKeyframe(
    (time - a.time) / (b.time - a.time),
    b.easing,
    b.direction,
  );
  const pose = Object.fromEntries(
    ["x", "y", "scale", "rotation", "opacity"].map((key) => [
      key,
      a[key as keyof KeyframePose] +
        (b[key as keyof KeyframePose] - a[key as keyof KeyframePose]) * t,
    ]),
  ) as KeyframePose;
  return {
    pose,
    time,
    iteration: Math.floor(leg / (k.yoyo ? 2 : 1)) + 1,
    complete: elapsed >= total,
  };
}
export function captureRecordingBasis(
  node: RbxNode,
  nodes: RbxNode[],
  opacity = 1,
): RecordingBasis {
  const slot = node.behavior?.keyframes?.slot;
  const box = slot ? nodes.find((n) => n.id === slot)! : node;
  const parent = nodes.find((n) => n.children.includes(box));
  if (!parent) throw new Error("Record a GUI layer inside a screen.");
  const dimensions = parent.referenceSize ?? [0, 0];
  const quad = (v: Value | undefined) =>
    v && typeof v === "object" && v.type === "UDim2" ? v.value : [0, 0, 0, 0];
  const position = quad(box.properties.Position),
    size = quad(box.properties.Size);
  const width = size[0] * dimensions[0] + size[1],
    height = size[2] * dimensions[1] + size[3];
  const anchor = box.properties.AnchorPoint;
  const point =
    anchor && typeof anchor === "object" && anchor.type === "Vector2"
      ? anchor.value
      : [0, 0];
  const basis = {
    parent: parent.id,
    x: position[0] * dimensions[0] + position[1] + (0.5 - point[0]) * width,
    y: position[2] * dimensions[1] + position[3] + (0.5 - point[1]) * height,
    width,
    height,
    rotation: Number(node.properties.Rotation ?? 0),
    opacity,
  };
  if (!validKeyframes({ ...KEYFRAME_DEFAULTS, recording: basis }))
    throw new Error(
      "Recording needs positive authored bounds and opacity. Use manual poses for fully transparent layers.",
    );
  return basis;
}
export function captureLayerPose(
  reference: RecordingBasis,
  current: RecordingBasis,
): KeyframePose {
  if (reference.parent !== current.parent)
    throw new Error("Layer parent changed. Set a new recording reference.");
  const sx = current.width / reference.width,
    sy = current.height / reference.height;
  if (Math.abs(sx - sy) > 0.01)
    throw new Error(
      "Record uniform scaling. Width and height changed by different ratios.",
    );
  const pose = {
    x: current.x - reference.x,
    y: current.y - reference.y,
    scale: sx,
    rotation: current.rotation - reference.rotation,
    opacity: current.opacity / reference.opacity,
  };
  if (!validPose(pose))
    throw new Error("Recorded pose exceeds the supported transform range.");
  return pose;
}
export function compileKeyframes(
  input: KeyframeSettings,
  node: RbxNode,
  nodes: RbxNode[],
  opacity: number,
): CompiledKeyframes {
  const value = cloneSettings(input);
  delete value.recording;
  if (input.recording) {
    const current = captureRecordingBasis(node, nodes, opacity),
      reference = input.recording;
    captureLayerPose(reference, current);
    value.frames = value.frames.map((f) => ({
      ...f,
      x: f.x + reference.x - current.x,
      y: f.y + reference.y - current.y,
      scale: (f.scale * reference.width) / current.width,
      rotation: f.rotation + reference.rotation - current.rotation,
      opacity: (f.opacity * reference.opacity) / current.opacity,
    }));
  }
  if (!validKeyframes(value, true))
    throw new Error(
      "Rebased recording exceeds supported keyframe bounds. Reset the recording reference or use manual poses.",
    );
  return value;
}
export function validateKeyframeOwnership(
  nodes: RbxNode[],
  byId: Map<string, RbxNode>,
  parents: Map<string, RbxNode>,
) {
  const chains = nodes.filter((n) => n.behavior?.keyframes);
  if (chains.length > 256)
    throw new Error("Use at most 256 keyframe chains in one screen.");
  const related = (child: RbxNode, ancestor: RbxNode) => {
    let p: RbxNode | undefined = child;
    while (p) {
      if (p === ancestor) return true;
      p = parents.get(p.id);
    }
    return false;
  };
  for (const n of chains) {
    const k = n.behavior!.keyframes!;
    const fail = (v: unknown, message: string) => {
      if (!v) throw new Error(`${n.name}: ${message}`);
    };
    fail(validKeyframes(k, true), "Invalid keyframe chain.");
    fail(
      !n.behavior!.motion && !n.behavior!.control && !n.behavior!.state,
      "Keyframe chains cannot share a motion preset, control or state-visual writer.",
    );
    for (const other of nodes)
      if (other !== n && (related(other, n) || related(n, other)))
        fail(
          !other.behavior?.motion && !other.behavior?.keyframes,
          "Nested keyframes/motion would share opacity writers. Animate their common container instead.",
        );
    if (needsKeyframeInput(k)) {
      let owner =
        k.input !== "parent" && n.className.endsWith("Button")
          ? n
          : parents.get(n.id);
      while (owner && !owner.className.endsWith("Button"))
        owner = parents.get(owner.id);
      fail(
        owner?.id === k.owner && owner,
        "Keyframe trigger needs this button or the nearest parent button.",
      );
    } else
      fail(
        k.owner === undefined,
        "This keyframe trigger cannot reference a button owner.",
      );
    if (hasKeyframeSpatial(k)) {
      const slot = parents.get(n.id);
      fail(
        slot &&
          slot.id === `${n.id}/motion-slot` &&
          slot.id === k.slot &&
          slot.className === "Frame" &&
          slot.children.filter((c) => !c.className.startsWith("UI")).length ===
            1,
        "Spatial keyframes need their generated layout slot.",
      );
    } else
      fail(
        k.slot === undefined,
        "Opacity-only keyframes cannot reference a layout slot.",
      );
  }
}
