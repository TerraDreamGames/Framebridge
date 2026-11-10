import { describe, expect, it, vi } from "vitest";
import { compile } from "../packages/core/src/compiler";
import { buildExport } from "../packages/core/src/export";
import { layoutExamples } from "../packages/core/src/layout-examples";
import { DEFAULT_OPTIONS, flatten } from "../packages/core/src/types";
import { createLayoutExamples } from "../plugins/figma/src/create-layout-examples";

describe("functional layout examples", () => {
  for (const example of layoutExamples()) {
    it(`${example.key} exports native, script-free UI with matching canvas axes`, () => {
      const pkg = compile(
        example.designs,
        `example:${example.key}`,
        example.options,
        "fixed",
      );
      expect(pkg.assets).toEqual([]);
      expect(pkg.issues).toEqual([]);
      const nodes = flatten(pkg.roots);
      const scrolls = nodes.filter((n) => n.className === "ScrollingFrame");
      expect(scrolls).toHaveLength(example.key === "nested-panels" ? 2 : 1);
      for (const scroll of scrolls) {
        const axis = example.key === "horizontal-carousel" ? "X" : "Y";
        expect(scroll.properties.AutomaticCanvasSize).toEqual({
          type: "Enum",
          value: ["AutomaticSize", axis],
        });
        expect(scroll.properties.ScrollingDirection).toEqual({
          type: "Enum",
          value: ["ScrollingDirection", axis],
        });
        expect(scroll.properties.CanvasSize).toEqual({
          type: "UDim2",
          value: [0, 0, 0, 0],
        });
        const layouts = scroll.children.filter((n) =>
          ["UIListLayout", "UIGridLayout"].includes(n.className),
        );
        expect(layouts).toHaveLength(1);
        expect(layouts[0].className).toBe(
          example.key === "inventory-grid" ? "UIGridLayout" : "UIListLayout",
        );
        expect(scroll.children.some((n) => n.className === "UIPadding")).toBe(
          true,
        );
      }
      const exported = buildExport({
        package: pkg,
        assets: {},
        previews: {},
        revision: 0,
      });
      expect(exported.mime).toBe("application/json");
      expect(JSON.parse(new TextDecoder().decode(exported.data))).toEqual(pkg);
      expect(nodes.every((n) => !n.className.endsWith("Script"))).toBe(true);
    });
  }
  it("examples are reproducible and overrides do not leak between copies", () => {
    const first = layoutExamples();
    expect(layoutExamples()).toEqual(first);
    first[0].options.layerOverrides = {};
    expect(
      Object.keys(layoutExamples()[0].options.layerOverrides).length,
    ).toBeGreaterThan(0);
  });
  it.each(["faithful", "editable"] as const)(
    "creating demos preserves %s appearance and existing configuration",
    async (appearance) => {
      let serial = 0;
      const make = (type: string): any => ({
        id: `demo:${++serial}`,
        type,
        children: [],
        selection: [],
        appendChild(child: any) {
          this.children.push(child);
        },
        resize: vi.fn(),
        remove: vi.fn(),
      });
      const host: any = {
        currentPage: make("PAGE"),
        loadFontAsync: vi.fn(async () => {}),
        createPage: () => make("PAGE"),
        createFrame: () => make("FRAME"),
        createText: () => make("TEXT"),
        async setCurrentPageAsync(page: any) {
          host.currentPage = page;
        },
        root: { getPluginData: vi.fn(() => ""), setPluginData: vi.fn() },
        viewport: { scrollAndZoomIntoView: vi.fn() },
        commitUndo: vi.fn(),
      };
      vi.stubGlobal("figma", host);
      try {
        const current = {
          ...DEFAULT_OPTIONS,
          appearance,
          layerOverrides: { existing: { renderMode: "image" as const } },
        };
        const result = await createLayoutExamples(current);
        expect(result.options.appearance).toBe(appearance);
        expect(result.options.layerOverrides.existing).toEqual(
          current.layerOverrides.existing,
        );
        expect(current.layerOverrides).toEqual({
          existing: { renderMode: "image" },
        });
        expect(result.roots).toHaveLength(4);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
