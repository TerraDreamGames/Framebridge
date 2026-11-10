import { afterEach, describe, expect, it, vi } from "vitest";
import { startCodegenController } from "../plugins/figma/src/codegen";
import { DEFAULT_THEMES } from "../packages/core/src/theme-tokens";
import { PARTICLE_DEFAULTS } from "../packages/core/src/particles";

function setup(saved: unknown = {}) {
  const source: any = {
    id: "frame",
    type: "FRAME",
    name: "Design",
    width: 640,
    height: 360,
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    visible: true,
    opacity: 1,
    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
    strokes: [],
    effects: [],
    strokeWeight: 0,
    cornerRadius: 0,
    children: [],
    constraints: { horizontal: "MIN", vertical: "MIN" },
    layoutMode: "NONE",
    blendMode: "PASS_THROUGH",
    exportAsync: vi.fn(),
    clone: vi.fn(),
  };
  let generate: (event: CodegenEvent) => Promise<CodegenResult[]>;
  const api: any = {
    editorType: "dev",
    mode: "codegen",
    mixed: Symbol("mixed"),
    codegen: {
      on: vi.fn((_: string, callback: any) => {
        generate = callback;
      }),
      preferences: { customSettings: {} },
    },
    clientStorage: { getAsync: vi.fn(async () => saved), setAsync: vi.fn() },
    root: { getPluginData: vi.fn(() => ""), setPluginData: vi.fn() },
    showUI: vi.fn(),
    createFrame: vi.fn(),
    on: vi.fn(),
  };
  vi.stubGlobal("figma", api);
  startCodegenController(api);
  return {
    source,
    api,
    generate: (language = "react") => generate!({ node: source, language }),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("Figma Dev Mode provider", () => {
  it.each([
    { themes: false, particles: false },
    { themes: true, particles: false },
    { themes: false, particles: true },
    { themes: true, particles: true },
  ])(
    "TSX companion supports used features $themes/$particles without dropping them",
    async ({ themes, particles }) => {
      const { api, generate, source } = setup({ themes: DEFAULT_THEMES });
      api.root.getPluginData.mockImplementation((key: string) =>
        key === "framebridge-layer-overrides"
          ? JSON.stringify({
              frame: {
                ...(themes ? { theme: { background: "surface" } } : {}),
                behavior: {
                  role: "panel",
                  initialVisible: true,
                  ...(particles
                    ? { particles: { ...PARTICLE_DEFAULTS, trigger: "manual" } }
                    : {}),
                },
              },
            })
          : "source",
      );
      const result = await generate("tsx");
      const runtime = result.find(
        (item) => item.title === "FramebridgeInteractions.luau",
      );
      expect(runtime).toBeDefined();
      expect(runtime?.code.includes("function controller.setTheme(mode)")).toBe(
        themes,
      );
      expect(
        runtime?.code.includes("function controller.emitParticles(id,count)"),
      ).toBe(particles);
      expect(source.exportAsync).not.toHaveBeenCalled();
      expect(api.root.setPluginData).not.toHaveBeenCalled();
      expect(api.clientStorage.setAsync).not.toHaveBeenCalled();
    },
  );
  it.each(["react", "fusion", "tsx", "luau"])(
    "generates %s without mutation, PNG rendering, UI, or credentials",
    async (language) => {
      const { source, api, generate } = setup({
        apiKey: "private-key",
        senderToken: "private-token",
      });
      const result = await generate(language);
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe(
        language === "tsx" ? "Design.tsx" : "Design.luau",
      );
      expect(result[0].code).toContain(
        language === "tsx" ? "new UDim2(1, 0, 1, 0)" : "UDim2.new(1, 0, 1, 0)",
      );
      expect(JSON.stringify(result)).not.toMatch(/private-key|private-token/);
      for (const method of [
        source.clone,
        source.exportAsync,
        api.createFrame,
        api.showUI,
        api.root.setPluginData,
        api.clientStorage.setAsync,
      ])
        expect(method).not.toHaveBeenCalled();
    },
  );
  it("applies saved document overrides and explicit measured-layout preferences", async () => {
    const { api, generate } = setup();
    api.codegen.preferences.customSettings.layout = "exact";
    api.root.getPluginData.mockImplementation((key: string) =>
      key === "framebridge-layer-overrides"
        ? JSON.stringify({
            frame: { name: "Renamed", className: "TextButton" },
          })
        : "existing-source",
    );
    const result = await generate();
    expect(result[0].code).toContain('Name = "Renamed"');
    expect(result[0].code).toContain('React.createElement("TextButton"');
    expect(result[0].code).toContain("UDim2.new(0, 640, 0, 360)");
  });
  it("includes the asset manifest and an explicit warning for unlinked artwork", async () => {
    const { source, generate } = setup();
    source.children.push({
      ...source,
      id: "vector",
      name: "Logo",
      type: "VECTOR",
      children: [],
      width: 24,
      height: 24,
    });
    const result = await generate("tsx");
    expect(JSON.parse(result[1].code).assets[0].robloxId).toBeNull();
    expect(result[2].code).toContain("does not render or upload");
    expect(source.children[0].exportAsync).not.toHaveBeenCalled();
  });
  it("dispatches Dev Mode without initializing the classic controller", async () => {
    const { api } = setup();
    api.codegen.on.mockClear();
    await import("../plugins/figma/src/controller");
    expect(api.codegen.on).toHaveBeenCalledTimes(1);
    expect(api.showUI).not.toHaveBeenCalled();
    expect(api.on).not.toHaveBeenCalled();
  });
  it("explains estimated raster bounds even when all artwork is linked", async () => {
    const { source, generate } = setup({
      assetIds: { "image:vector:bleed-v2": "123456789" },
    });
    source.children.push({
      ...source,
      id: "vector",
      name: "Logo",
      type: "VECTOR",
      children: [],
      width: 24,
      height: 24,
    });
    const result = await generate();
    expect(JSON.parse(result[1].code).assets[0].robloxId).toBe(
      "rbxassetid://123456789",
    );
    expect(result[2].code).toContain("raster bounds are estimated");
    expect(result[2].code).not.toContain("need Roblox asset IDs");
  });
  it("returns readable errors for excluded roots and oversized/deep selections", async () => {
    const { source, generate } = setup();
    source.name = "Design [skip]";
    expect((await generate())[0].code).toContain("screens");
    source.name = "Design";
    let child = source;
    for (let i = 0; i < 130; i++) {
      const next = { ...source, id: `nested${i}`, children: [] };
      child.children.push(next);
      child = next;
    }
    expect((await generate())[0].code).toContain("shallower");
    expect((await generate("unknown"))[0].code).toContain("source language");
  });
});
