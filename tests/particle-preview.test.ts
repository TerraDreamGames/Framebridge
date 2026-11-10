import { afterEach, expect, it, vi } from "vitest";
import { createParticlePreview } from "../plugins/figma/src/particle-preview";
import { flatten } from "../packages/core/src/types";
import { particlePackage } from "./particle-fixtures";

// Exercise the real approximation's state/physics/cleanup without browser or image requests.
class Div {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: Div[] = [];
  parent?: Div;
  offsetWidth = 180;
  offsetHeight = 60;
  append(child: Div) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = undefined;
  }
}
afterEach(() => vi.unstubAllGlobals());
function setup(pkg = particlePackage()) {
  vi.stubGlobal("document", { createElement: () => new Div() });
  const nodes = flatten(pkg.roots);
  const elements = new Map(nodes.map((n) => [n.id, new Div()]));
  let visible = true,
    reduced = false;
  const engine = createParticlePreview(
    nodes,
    elements as unknown as Map<string, HTMLElement>,
    () => visible,
    () => reduced,
  );
  const dots = (id: string) => elements.get(id)!.children[0].children;
  return {
    engine,
    dots,
    elements,
    setVisible: (v: boolean) => (visible = v),
    setReduced: (v: boolean) => (reduced = v),
  };
}
it("activates only the configured owner and enforces the live per-emitter capacity", () => {
  const s = setup();
  s.engine.activate("ambient");
  expect(s.dots("celebrate")).toHaveLength(0);
  for (let i = 0; i < 100; i++) s.engine.activate("celebrate");
  expect(s.dots("celebrate")).toHaveLength(24);
  s.engine.step(0.1);
  expect(s.dots("celebrate")[0].style.opacity).toBe("0.8");
  expect(s.dots("celebrate")[0].style.transform).toContain("translate(");
  s.engine.destroy();
});
it("mount emission and continuous rate resume after ancestor visibility clears live work", () => {
  const s = setup();
  s.engine.step(0);
  expect(s.dots("ambient")).toHaveLength(4);
  s.setVisible(false);
  s.engine.burst();
  s.engine.step(0.1);
  expect(s.dots("ambient")).toHaveLength(0);
  s.setVisible(true);
  s.engine.step(0.1);
  expect(s.dots("ambient")).toHaveLength(0);
  s.engine.step(0.1);
  s.engine.step(0.1);
  expect(s.dots("ambient")).toHaveLength(1);
  s.engine.destroy();
});
it("reduced motion clears and suppresses both burst and continuous emission", () => {
  const s = setup();
  s.engine.burst();
  expect(s.dots("celebrate")).toHaveLength(12);
  s.setReduced(true);
  s.engine.step(0.1);
  s.engine.burst();
  expect(s.dots("celebrate")).toHaveLength(0);
  expect(s.dots("ambient")).toHaveLength(0);
  s.engine.destroy();
});
it("approximates the external engine without loading its texture or requiring a dependency", () => {
  const s = setup();
  s.engine.burst();
  expect(s.dots("external")).toHaveLength(3);
  expect(s.dots("external")[0].style.backgroundColor).toMatch(/^rgb/);
  expect(s.dots("external")[0].style.backgroundImage).toBeUndefined();
  s.engine.destroy();
});
it("expiry and teardown remove all owned DOM while preserving the authored settings", () => {
  const pkg = particlePackage(),
    before = JSON.stringify(pkg);
  const s = setup(pkg);
  s.engine.activate("celebrate");
  for (let i = 0; i < 6; i++) s.engine.step(0.1);
  expect(s.dots("celebrate")).toHaveLength(0);
  s.engine.destroy();
  for (const el of s.elements.values()) expect(el.children).toHaveLength(0);
  expect(JSON.stringify(pkg)).toBe(before);
});
