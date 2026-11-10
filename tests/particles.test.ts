import { describe, it, expect } from "vitest";
import {
  validParticles,
  validateParticles,
  hasParticles,
} from "../packages/core/src/particles";
import { flatten } from "../packages/core/src/types";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { validatePackage } from "../packages/relay/src/protocol";
import { validateExportPackage } from "../packages/core/src/export-package";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { extractComponent } from "../packages/core/src/reusable-components";
import { buildSourceExport } from "../packages/core/src/source-export";
import {
  THEMED_PARTICLE_BEHAVIOR_RUNTIME,
  THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
} from "../packages/core/src/behavior-runtime.mjs";
import { unzipSync, strFromU8 } from "fflate";
import {
  particlePackage,
  particleOptions,
  particleDesign,
  particleSettings,
} from "./particle-fixtures";
const byId = (pkg: ReturnType<typeof particlePackage>, id: string) =>
  flatten(pkg.roots).find((n) => n.id === id)!;
describe("bounded optional particles", () => {
  it("compiles confetti and native/installed 2D emitters as bounded data", () => {
    const options = particleOptions(),
      before = JSON.stringify(options),
      pkg = particlePackage(options);
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(byId(pkg, "celebrate").className).toBe("TextButton");
    expect(byId(pkg, "celebrate").behavior!.particles!.owner).toBe("celebrate");
    expect(
      byId(pkg, "external").behavior!.particles!.dependency!.template,
    ).toBe("FramebridgeParticleQA");
    expect(JSON.stringify(options)).toBe(before);
    expect(() => validatePackage(pkg)).not.toThrow();
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
  it.each([
    "version",
    "engine",
    "count",
    "capacity",
    "rate",
    "range",
    "nan",
    "texture",
    "colors",
    "shape",
    "trigger",
    "seed",
    "clip",
    "extra",
    "dependency",
  ])("rejects malformed %s author settings and transfer data", (kind) => {
    const value: any = particleSettings();
    if (kind === "version") value.version = 2;
    if (kind === "engine") value.engine = "require-asset";
    if (kind === "count") value.count = 2.5;
    if (kind === "capacity") value.capacity = 129;
    if (kind === "rate") value.rate = 1000;
    if (kind === "range") value.lifetime = [5, 0.1];
    if (kind === "nan") value.speed[0] = NaN;
    if (kind === "texture") value.texture = "https://example.com/code";
    if (kind === "colors") value.colors[0][0] = 2;
    if (kind === "shape") value.shape = "arbitrary";
    if (kind === "trigger") value.trigger = "serverEvent";
    if (kind === "seed") value.seed = Infinity;
    if (kind === "clip") value.clip = "false";
    if (kind === "extra") value.Source = "print('bad')";
    if (kind === "dependency") value.dependency = { template: "Game.Path" };
    expect(validParticles(value)).toBe(false);
    const pkg = particlePackage();
    byId(pkg, "celebrate").behavior!.particles = value;
    expect(() => validatePackage(pkg)).toThrow();
    expect(() => validateExportPackage(pkg)).toThrow();
  });
  it.each([
    "template",
    "configVersion",
    "clientRevision",
    "extra",
    "texture",
    "acceleration",
    "drag",
  ])("rejects invalid installed dependency %s", (kind) => {
    const p: any = structuredClone(
      byId(particlePackage(), "external").behavior!.particles!,
    );
    delete p.owner;
    if (kind === "template") p.dependency.template = "game.ServerStorage";
    if (kind === "configVersion") p.dependency.configVersion = "";
    if (kind === "clientRevision") p.dependency.clientRevision = "latest\n";
    if (kind === "extra") p.dependency.moduleId = 123;
    if (kind === "texture") p.texture = "";
    if (kind === "acceleration") p.acceleration = [0, 10];
    if (kind === "drag") p.drag = 1;
    expect(validParticles(p)).toBe(false);
  });
  it("resolves nearest parent button activation without borrowing source identities", () => {
    const design = particleDesign();
    design[0].children[0].children = [
      node("Particle child", { id: "child", width: 40, height: 40 }),
    ];
    const pkg = compile(
      design,
      "qa",
      particleOptions({
        layerOverrides: {
          celebrate: { className: "TextButton" },
          child: { behavior: { particles: particleSettings() } },
        },
      }),
    );
    expect(byId(pkg, "child").className).toBe("Frame");
    expect(byId(pkg, "child").behavior!.particles!.owner).toBe("celebrate");
    byId(pkg, "child").behavior!.particles!.owner = "ambient";
    expect(() => validateParticles(pkg.roots)).toThrow();
  });
  it("does not silently turn an explicitly selected Frame into a button", () => {
    const pkg = particlePackage({
      layerOverrides: {
        celebrate: {
          className: "Frame",
          behavior: { particles: particleSettings() },
        },
      },
    });
    expect(pkg.issues.some((i) => i.severity === "error")).toBe(true);
    expect(() => validateExportPackage(pkg)).toThrow();
  });
  it("limits emitter count per root and rejects installed Emitter2D on world UI", () => {
    const pkg = particlePackage();
    const n = byId(pkg, "ambient");
    for (let i = 0; i < 17; i++)
      pkg.roots[0].children.push({ ...structuredClone(n), id: `more${i}` });
    expect(() => validateParticles(pkg.roots)).toThrow("16 particle emitters");
    const world = particlePackage();
    world.roots[0].className = "SurfaceGui";
    expect(() => validateParticles(world.roots)).toThrow("ScreenGui only");
  });
  it("emits no particle runtime for unconfigured outputs", () => {
    const pkg = particlePackage({ layerOverrides: {} });
    expect(hasParticles(pkg.roots)).toBe(false);
    expect(generateSource(pkg, "luau")).not.toContain("mountParticles");
    expect(generateModel(pkg)).not.toContain("FramebridgeParticleHelper");
  });
  it.each(SOURCE_FORMATS)(
    "exports trusted particles and theme combination in $label",
    (format) => {
      const pkg = particlePackage(),
        r = {
          package: pkg,
          designs: particleDesign(),
          assets: {},
          previews: {},
          revision: 1,
        };
      const files = unzipSync(buildSourceExport(r, format.id).data),
        source = strFromU8(files[`Design.${format.extension}`]);
      expect(source).toContain("FramebridgeParticles");
      if (format.id === "tsx")
        expect(strFromU8(files["FramebridgeInteractions.luau"])).toBe(
          THEMED_PARTICLE_BEHAVIOR_RUNTIME + "\n",
        );
      else {
        expect(source).toContain("mountParticles");
        expect(source).toContain("mountTheme");
      }
      expect(generateModel(pkg)).toContain(
        THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE.replace(/&/g, "&amp;").slice(
          0,
          30,
        ),
      );
      expect(THEMED_PARTICLE_BEHAVIOR_RUNTIME).not.toContain("Http:GetAsync");
      expect(THEMED_PARTICLE_BEHAVIOR_RUNTIME).not.toContain("require(123");
    },
  );
  it("extracts self-contained widgets with local activation and a model runtime", () => {
    const result = {
      package: particlePackage(),
      designs: particleDesign(),
      assets: {},
      previews: {},
      revision: 1,
    };
    const widget = extractComponent(
      result,
      "layer:celebrate",
      "Particle button",
    );
    expect(() => validateExportPackage(widget.package)).not.toThrow();
    expect(widget.package.roots[0].children[0].behavior!.particles!.owner).toBe(
      widget.package.roots[0].children[0].id,
    );
    expect(generateModel(widget.package)).toContain('class="LocalScript"');
  });
  it("remaps each repeated particle owner", () => {
    const design = particleDesign();
    design[0].children = [
      node("Repeat", {
        id: "repeat",
        type: "TRANSFORM_GROUP",
        width: 600,
        height: 80,
        transformModifiers: [
          {
            type: "REPEAT",
            repeatType: "LINEAR",
            count: 3,
            offset: 200,
            unitType: "PIXELS",
            axis: "HORIZONTAL",
          },
        ],
        children: [design[0].children[0]],
      }),
    ];
    const pkg = compile(
      design,
      "qa",
      particleOptions({
        layerOverrides: {
          celebrate: { behavior: { particles: particleSettings() } },
        },
      }),
    );
    const buttons = flatten(pkg.roots).filter((n) => n.behavior?.particles);
    expect(buttons.length).toBe(3);
    expect(buttons.every((n) => n.behavior!.particles!.owner === n.id)).toBe(
      true,
    );
    expect(() => validateExportPackage(pkg)).not.toThrow();
  });
});
