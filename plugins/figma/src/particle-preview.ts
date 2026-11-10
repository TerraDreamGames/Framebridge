import type { RbxNode } from "../../../packages/core/src/types";
/** Deliberately approximates both engines with colored rectangles; no remote textures/client code. */
export function createParticlePreview(
  nodes: RbxNode[],
  elements: Map<string, HTMLElement>,
  visible: (id: string) => boolean,
  reduced: () => boolean,
) {
  type Dot = {
    el: HTMLDivElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    rotation: number;
    spin: number;
  };
  const records = nodes.flatMap((node) => {
    const config = node.behavior?.particles,
      element = elements.get(node.id);
    if (!config || !element) return [];
    const container = document.createElement("div");
    container.dataset.previewParticles = node.id;
    Object.assign(container.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: config.clip ? "hidden" : "visible",
      zIndex: "100",
    });
    element.append(container);
    let seed = config.seed || 1;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    return [
      {
        node,
        config,
        element,
        container,
        dots: [] as Dot[],
        random,
        mounted: false,
        accumulator: 0,
      },
    ];
  });
  const total = () => records.reduce((sum, r) => sum + r.dots.length, 0);
  const clear = (r: (typeof records)[number]) => {
    for (const p of r.dots) p.el.remove();
    r.dots = [];
    r.accumulator = 0;
  };
  const emit = (r: (typeof records)[number], requested = r.config.count) => {
    if (
      !visible(r.node.id) ||
      !r.config.enabled ||
      (r.config.respectReducedMotion && reduced())
    )
      return;
    const count = Math.min(
        requested,
        r.config.capacity - r.dots.length,
        512 - total(),
      ),
      range = (v: number[]) => v[0] + r.random() * (v[1] - v[0]);
    for (let i = 0; i < count; i++) {
      const angle =
          ((r.config.direction + (r.random() - 0.5) * r.config.spread) *
            Math.PI) /
          180,
        speed = range(r.config.speed),
        size = range(r.config.size),
        rgb = r.config.colors[Math.floor(r.random() * r.config.colors.length)];
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        width: `${size}px`,
        height: `${r.config.kind === "confetti" ? size * 0.5 : size}px`,
        backgroundColor: `rgb(${rgb.map((c) => c * 255).join(",")})`,
        pointerEvents: "none",
      });
      r.container.append(el);
      r.dots.push({
        el,
        x:
          r.config.shape === "point"
            ? r.element.offsetWidth / 2
            : r.random() * r.element.offsetWidth,
        y:
          r.config.shape === "point"
            ? r.element.offsetHeight / 2
            : r.random() * r.element.offsetHeight,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        age: 0,
        life: range(r.config.lifetime),
        rotation: r.random() * 360,
        spin: range(r.config.rotationSpeed),
      });
    }
  };
  return {
    activate(owner: string) {
      for (const r of records)
        if (r.config.trigger === "activate" && r.config.owner === owner)
          emit(r);
    },
    burst() {
      for (const r of records) emit(r);
    },
    step(dt: number) {
      dt = Math.max(0, Math.min(dt, 0.1));
      for (const r of records) {
        if (
          !visible(r.node.id) ||
          !r.config.enabled ||
          (r.config.respectReducedMotion && reduced())
        ) {
          clear(r);
          continue;
        }
        if (!r.mounted && r.config.trigger === "mount") {
          r.mounted = true;
          emit(r);
        }
        r.accumulator += dt * r.config.rate;
        if (r.accumulator >= 1) {
          emit(r, Math.floor(r.accumulator));
          r.accumulator %= 1;
        }
        r.dots = r.dots.filter((p) => {
          p.age += dt;
          if (p.age >= p.life) {
            p.el.remove();
            return false;
          }
          p.vx =
            (p.vx + r.config.acceleration[0] * dt) *
            Math.exp(-r.config.drag * dt);
          p.vy =
            (p.vy + r.config.acceleration[1] * dt) *
            Math.exp(-r.config.drag * dt);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rotation += p.spin * dt;
          Object.assign(p.el.style, {
            transform: `translate(${p.x}px,${p.y}px) rotate(${p.rotation}deg)`,
            opacity: String(1 - p.age / p.life),
          });
          return true;
        });
      }
    },
    destroy() {
      for (const r of records) {
        clear(r);
        r.container.remove();
      }
    },
  };
}
