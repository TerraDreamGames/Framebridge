import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { DEMO_SCENES, demoRoute } from "../plugins/figma/demo/scenes";

describe("website demo isolation and capture routes", () => {
  it("accepts only known scene and theme values", () => {
    expect(demoRoute("?view=properties&theme=dark&capture=1")).toEqual({
      scene: "properties",
      theme: "dark",
      capture: true,
    });
    expect(
      demoRoute("?view=https://external.invalid&theme=system&capture=true"),
    ).toEqual({ scene: "workspace", theme: "light", capture: false });
  });
  it("gives every capture a deterministic, bounded viewport", () => {
    expect(new Set(DEMO_SCENES.map((scene) => scene.id)).size).toBe(
      DEMO_SCENES.length,
    );
    for (const scene of DEMO_SCENES) {
      expect(scene.width).toBeGreaterThanOrEqual(320);
      expect(scene.width * scene.height).toBeLessThan(2_000_000);
    }
  });
  it("does not import live account or transfer managers into the demo entry", async () => {
    const source = await readFile("plugins/figma/demo/main.tsx", "utf8");
    expect(source).not.toMatch(
      /import.*(?:useRobloxAccount|useOnboarding|handoff-transfer|studio-connection|cloud-artwork-api)/,
    );
    expect(source).toContain(
      "event.origin !== location.origin || event.source !== parent",
    );
    const build = await readFile("scripts/build-website-demo.mjs", "utf8");
    expect(build).toContain("connect-src 'self'");
    expect(build).toContain("form-action 'none'");
  });
});

import {featureOverrides} from "../plugins/figma/demo/feature-data";
import {advancedControlDesign} from "../packages/core/src/advanced-control-examples";
import {compile} from "../packages/core/src/compiler";
it("compiles every feature preset before a capture batch starts",()=>{
 for(const scene of DEMO_SCENES) expect(()=>compile(advancedControlDesign(),"demo",{layerOverrides:featureOverrides(scene.id)},"fixed")).not.toThrow();
});
