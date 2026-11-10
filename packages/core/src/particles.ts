import { flatten, type RbxNode } from "./types";

/** Data only. External engines are attached by the game author, never downloaded or required. */
export type ParticleSettings = {
  version: 1;
  kind: "confetti" | "emitter2d";
  engine: "framebridge-v1" | "dogwarrior24-template-v1";
  trigger: "manual" | "mount" | "activate";
  enabled: boolean;
  count: number;
  rate: number;
  capacity: number;
  lifetime: [number, number];
  speed: [number, number];
  size: [number, number];
  rotationSpeed: [number, number];
  direction: number;
  spread: number;
  acceleration: [number, number];
  drag: number;
  colors: [number, number, number][];
  texture: string;
  shape: "point" | "rectangle";
  clip: boolean;
  respectReducedMotion: boolean;
  seed: number;
  dependency?: {
    template: string;
    configVersion: string;
    clientRevision: string;
  };
};
export type CompiledParticles = ParticleSettings & { owner?: string };
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number) =>
  finite(v, lo, hi) && Number.isInteger(v);
const pair = (v: unknown, lo: number, hi: number, ordered = true) =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((n) => finite(n, lo, hi)) &&
  (!ordered || v[0] <= v[1]);
export function validParticles(
  v: unknown,
  compiled = false,
): v is CompiledParticles {
  if (
    !record(v) ||
    !Object.keys(v).every((k) =>
      [
        "version",
        "kind",
        "engine",
        "trigger",
        "enabled",
        "count",
        "rate",
        "capacity",
        "lifetime",
        "speed",
        "size",
        "rotationSpeed",
        "direction",
        "spread",
        "acceleration",
        "drag",
        "colors",
        "texture",
        "shape",
        "clip",
        "respectReducedMotion",
        "seed",
        "dependency",
        ...(compiled ? ["owner"] : []),
      ].includes(k),
    )
  )
    return false;
  if (!(
    v.version === 1 &&
    ["confetti", "emitter2d"].includes(v.kind) &&
    ["framebridge-v1", "dogwarrior24-template-v1"].includes(v.engine) &&
    ["manual", "mount", "activate"].includes(v.trigger) &&
    typeof v.enabled === "boolean" &&
    int(v.capacity, 1, 128) &&
    int(v.count, 1, v.capacity) &&
    finite(v.rate, 0, 32) &&
    pair(v.lifetime, 0.05, 5) &&
    pair(v.speed, 0, 1000) &&
    pair(v.size, 1, 64) &&
    pair(v.rotationSpeed, -720, 720) &&
    finite(v.direction, -360, 360) &&
    finite(v.spread, 0, 360) &&
    pair(v.acceleration, -1000, 1000, false) &&
    finite(v.drag, 0, 20) &&
    Array.isArray(v.colors) &&
    v.colors.length >= 1 &&
    v.colors.length <= 8 &&
    v.colors.every(
      (c: unknown) =>
        Array.isArray(c) && c.length === 3 && c.every((n) => finite(n, 0, 1)),
    ) &&
    typeof v.texture === "string" &&
    (v.texture === "" || /^rbxassetid:\/\/[1-9]\d{0,19}$/.test(v.texture)) &&
    ["point", "rectangle"].includes(v.shape) &&
    typeof v.clip === "boolean" &&
    typeof v.respectReducedMotion === "boolean" &&
    int(v.seed, 0, 2147483647)
  ))
    return false;
  if (
    v.owner !== undefined &&
    (!compiled ||
      typeof v.owner !== "string" ||
      !v.owner.trim() ||
      v.owner.length > 256)
  )
    return false;
  if (v.engine === "framebridge-v1") return v.dependency === undefined;
  const d = v.dependency;
  // External templates use the documented attribute/BindableEvent contract; confetti is bundled.
  return (
    v.kind === "emitter2d" &&
    v.texture !== "" &&
    v.acceleration[0] === 0 &&
    v.acceleration[1] === 0 &&
    v.drag === 0 &&
    record(d) &&
    Object.keys(d).every((k) =>
      ["template", "configVersion", "clientRevision"].includes(k),
    ) &&
    /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(d.template) &&
    typeof d.configVersion === "string" &&
    /^[A-Za-z0-9_.-]{1,64}$/.test(d.configVersion) &&
    typeof d.clientRevision === "string" &&
    /^[A-Za-z0-9_.-]{1,64}$/.test(d.clientRevision)
  );
}
export function validateParticles(roots: RbxNode[]) {
  for (const root of roots) {
    const nodes = flatten([root]),
      parents = new Map(
        nodes.flatMap((n) => n.children.map((c) => [c.id, n] as const)),
      );
    let count = 0;
    for (const node of nodes) {
      const p = node.behavior?.particles;
      if (p === undefined) continue;
      if (
        !validParticles(p, true) ||
        !node.properties.Size ||
        node.className.startsWith("UI") ||
        ["ScreenGui", "SurfaceGui", "BillboardGui"].includes(node.className)
      )
        throw new Error(
          `${node.name}: invalid particle settings or container.`,
        );
      if (
        p.engine === "dogwarrior24-template-v1" &&
        ["SurfaceGui", "BillboardGui"].includes(root.className)
      )
        throw new Error(
          "The installed Emitter2D template contract supports ScreenGui only. Choose the built-in engine for world UI.",
        );
      if (++count > 16)
        throw new Error("Use at most 16 particle emitters per root.");
      if (p.trigger === "activate") {
        let owner: RbxNode | undefined = node;
        while (
          owner &&
          !["TextButton", "ImageButton"].includes(owner.className)
        )
          owner = parents.get(owner.id);
        if (!owner || owner.id !== p.owner)
          throw new Error(
            `${node.name}: particles need this button or its nearest ancestor for activation.`,
          );
      } else if (p.owner !== undefined)
        throw new Error("Only activated particles reference a button owner.");
    }
  }
}
export const hasParticles = (roots: RbxNode[]) =>
  flatten(roots).some((n) => !!n.behavior?.particles);
export const PARTICLE_DEFAULTS: ParticleSettings = {
  version: 1,
  kind: "confetti",
  engine: "framebridge-v1",
  trigger: "activate",
  enabled: true,
  count: 24,
  rate: 0,
  capacity: 64,
  lifetime: [0.8, 1.5],
  speed: [80, 180],
  size: [4, 8],
  rotationSpeed: [-180, 180],
  direction: 0,
  spread: 120,
  acceleration: [0, 180],
  drag: 0,
  colors: [
    [0.9, 0.2, 0.4],
    [0.2, 0.6, 1],
    [1, 0.85, 0.2],
  ],
  texture: "",
  shape: "point",
  clip: true,
  respectReducedMotion: true,
  seed: 1,
};
