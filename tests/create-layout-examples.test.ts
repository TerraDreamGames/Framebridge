import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createControlExamples,
  createArtworkExamples,
  createLayoutExamples,
} from "../plugins/figma/src/create-layout-examples";
import { DEFAULT_OPTIONS, flatten } from "../packages/core/src/types";
import { advancedControlOverrides } from "../packages/core/src/advanced-control-examples";
import { controlReferences } from "../packages/core/src/advanced-controls";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { validatePackage } from "../packages/relay/src/protocol";
import {
  artworkExamples,
  ARTWORK_VECTOR_PATH,
} from "../plugins/figma/src/artwork-examples";
import { decode } from "fast-png";

function host(pageFailure?: string) {
  let next = 0;
  const all: NativeNode[] = [];
  let failTextResize = false;
  class NativeNode {
    id = `qa:${++next}`;
    name = "Existing";
    children: NativeNode[] = [];
    selection: NativeNode[] = [];
    parent?: NativeNode;
    removed = false;
    x = 0;
    y = 0;
    width = 100;
    height = 100;
    strokes = [];
    effects = [];
    isMask = false;
    constructor(public type: string) {
      all.push(this);
    }
    appendChild(child: NativeNode) {
      if (child.parent)
        child.parent.children = child.parent.children.filter(
          (n) => n !== child,
        );
      child.parent = this;
      this.children.push(child);
    }
    resize(width: number, height: number) {
      if (this.type === "TEXT" && failTextResize)
        throw new Error("Render source failed");
      this.width = width;
      this.height = height;
    }
    resizeWithoutConstraints(width: number, height: number) {
      this.resize(width, height);
    }
    remove() {
      for (const child of [...this.children]) child.remove();
      if (this.parent)
        this.parent.children = this.parent.children.filter((n) => n !== this);
      this.removed = true;
    }
  }
  const originalPage = new NativeNode("PAGE");
  const existing = new NativeNode("FRAME");
  existing.x = 500;
  existing.width = 400;
  originalPage.appendChild(existing);
  originalPage.selection = [existing];
  let stored = '{"existing":{"name":"Keep me"}}';
  const api = {
    currentPage: originalPage,
    root: {
      getPluginData: vi.fn(() => stored),
      setPluginData: vi.fn((_key: string, value: string) => {
        stored = value;
      }),
    },
    loadFontAsync: vi.fn(async () => undefined),
    createPage: vi.fn(() => {
      if (pageFailure) throw new Error(pageFailure);
      return new NativeNode("PAGE");
    }),
    createSection: vi.fn(() => {
      const node = new NativeNode("SECTION");
      api.currentPage.appendChild(node);
      return node;
    }),
    createFrame: () => {
      const node = new NativeNode("FRAME");
      api.currentPage.appendChild(node);
      return node;
    },
    createText: () => {
      const node = new NativeNode("TEXT");
      api.currentPage.appendChild(node);
      return node;
    },
    createRectangle: () => {
      const node = new NativeNode("RECTANGLE");
      api.currentPage.appendChild(node);
      return node;
    },
    createEllipse: () => {
      const node = new NativeNode("ELLIPSE");
      api.currentPage.appendChild(node);
      return node;
    },
    createVector: () => {
      const node = new NativeNode("VECTOR");
      api.currentPage.appendChild(node);
      return node;
    },
    base64Decode: (s: string) => new Uint8Array(Buffer.from(s, "base64")),
    createImage: vi.fn((bytes: Uint8Array) => {
      const decoded = decode(bytes);
      expect([decoded.width, decoded.height]).toEqual([16, 16]);
      expect(new Set(decoded.data).size).toBeGreaterThan(10);
      return { hash: "native-owned-gradient" };
    }),
    setCurrentPageAsync: vi.fn(async (page: NativeNode) => {
      api.currentPage = page;
    }),
    viewport: { scrollAndZoomIntoView: vi.fn() },
    commitUndo: vi.fn(),
  };
  vi.stubGlobal("figma", api);
  return {
    api,
    originalPage,
    existing,
    all,
    stored: () => stored,
    failText: () => {
      failTextResize = true;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("native layout example placement", () => {
  const current = {
    ...DEFAULT_OPTIONS,
    layerOverrides: { existing: { name: "Keep me" } },
  };
  it("keeps the normal new-page workflow and existing content", async () => {
    const h = host();
    const result = await createLayoutExamples(current);
    expect(result.placement).toBe("page");
    expect(result.roots).toHaveLength(4);
    expect(h.api.currentPage.children).toHaveLength(4);
    expect(h.originalPage.children).toEqual([h.existing]);
    expect(h.originalPage.selection).toEqual([h.existing]);
    expect(JSON.parse(h.stored()).existing).toEqual({ name: "Keep me" });
    expect(h.api.createSection).not.toHaveBeenCalled();
    expect(h.api.commitUndo).toHaveBeenCalledOnce();
  });
  it("places all four editable examples outside existing content at the Starter page limit", async () => {
    const h = host(
      "in createPage: The Starter plan only comes with 3 pages. Upgrade to Professional",
    );
    const result = await createLayoutExamples(current);
    const section = h.all.find((n) => n.type === "SECTION")!;
    expect(result.placement).toBe("section");
    expect(result.containerId).toBe(section.id);
    expect(h.api.currentPage).toBe(h.originalPage);
    expect(h.originalPage.children).toEqual([h.existing, section]);
    expect(section.x).toBeGreaterThan(h.existing.x + h.existing.width);
    expect(section.children.map((n) => n.id)).toEqual(result.roots);
    expect(section.children).toHaveLength(4);
    for (const root of section.children) {
      expect(root.x + root.width).toBeLessThanOrEqual(section.width);
      expect(root.y + root.height).toBeLessThanOrEqual(section.height);
      expect(root.children.length).toBeGreaterThan(0);
    }
    const overrides = JSON.parse(h.stored());
    expect(overrides.existing).toEqual({ name: "Keep me" });
    expect(
      Object.values(overrides).some(
        (o: any) => o.className === "ScrollingFrame",
      ),
    ).toBe(true);
    expect(h.originalPage.selection.map((n) => n.id)).toEqual(result.roots);
    expect(new Set(result.createdNodeIds).size).toBe(
      result.createdNodeIds.length,
    );
    expect(result.createdNodeIds).toEqual(
      expect.arrayContaining(h.all.slice(2).map((n) => n.id)),
    );
  });
  it("does not hide a permission failure behind another canvas mutation", async () => {
    const h = host("Permission denied creating pages");
    await expect(createLayoutExamples(current)).rejects.toThrow(
      "Permission denied",
    );
    expect(h.api.createSection).not.toHaveBeenCalled();
    expect(h.originalPage.children).toEqual([h.existing]);
    expect(h.stored()).toBe('{"existing":{"name":"Keep me"}}');
  });
  it.each([false, true])(
    "rolls back partial frames, settings and selection after creation failure (limited=%s)",
    async (limited) => {
      const h = host(
        limited ? "The Starter plan only comes with 3 pages" : undefined,
      );
      h.failText();
      await expect(createLayoutExamples(current)).rejects.toThrow(
        "Render source failed",
      );
      expect(h.api.currentPage).toBe(h.originalPage);
      expect(h.originalPage.children).toEqual([h.existing]);
      expect(h.originalPage.selection).toEqual([h.existing]);
      expect(h.stored()).toBe('{"existing":{"name":"Keep me"}}');
      expect(h.all.slice(2).every((n) => n.removed)).toBe(true);
      expect(h.api.commitUndo).not.toHaveBeenCalled();
    },
  );
});

describe("native artwork example creation", () => {
  it.each([false, true])(
    "creates native masks, paths, paints and independent preparation settings (limited=%s)",
    async (limited) => {
      const h = host(
        limited ? "The Starter plan only comes with 3 pages" : undefined,
      );
      const current = {
        ...DEFAULT_OPTIONS,
        layerOverrides: { existing: { name: "Keep me" } },
      };
      const result = await createArtworkExamples(current);
      expect(result.roots).toHaveLength(3);
      expect(result.placement).toBe(limited ? "section" : "page");
      expect(result.options.appearance).toBe(current.appearance);
      expect(result.options.layerOverrides.existing).toEqual({
        name: "Keep me",
      });
      const active = h.all.filter((n) =>
        result.createdNodeIds.includes(n.id),
      ) as any[];
      const masks = active.filter((n) => n.isMask);
      expect(masks.map((n) => n.type).sort()).toEqual(["ELLIPSE", "RECTANGLE"]);
      for (const mask of masks) expect(mask.maskType).toBe("VECTOR");
      const vectors = active.filter((n) => n.type === "VECTOR");
      expect(vectors).toHaveLength(4);
      for (const vector of vectors) {
        expect(vector.vectorPaths[0].data).toBe(ARTWORK_VECTOR_PATH);
        expect(vector.strokes[0].type).toBe("SOLID");
      }
      expect(
        active.find((n) => n.name === "Editable glowing title"),
      ).toMatchObject({
        type: "TEXT",
        opacity: 0.75,
        effects: [{ type: "DROP_SHADOW", color: { a: 0.8 }, visible: true }],
      });
      expect(
        active.find((n) => n.name === "Image background").fills[0],
      ).toMatchObject({
        type: "IMAGE",
        imageHash: "native-owned-gradient",
        scaleMode: "FILL",
      });
      expect(
        active
          .find((n) => n.name === "Radial background")
          .fills[0].gradientStops.every((s: any) => s.color.a === 1),
      ).toBe(true);
      expect(
        active.find((n) => n.name === "Native corners, stroke and shadow"),
      ).toMatchObject({
        topLeftRadius: 4,
        topRightRadius: 16,
        bottomRightRadius: 24,
        bottomLeftRadius: 8,
        strokeWeight: 2,
      });
      const tint = active.find((n) => n.name === "Tintable vector icon");
      const clean = active.find((n) => n.name === "Clean edge vector icon");
      expect(result.options.layerOverrides[tint.id]).toEqual({
        imageProcessing: { whiteMask: true },
      });
      expect(result.options.layerOverrides[clean.id]).toEqual({
        imageProcessing: { whiteMask: true, edgeCleanup: true },
      });
      expect(current.layerOverrides).toEqual({ existing: { name: "Keep me" } });
      expect(h.api.commitUndo).toHaveBeenCalledOnce();
      const again = await createArtworkExamples(result.options);
      expect(again.options.layerOverrides[tint.id]).toEqual(
        result.options.layerOverrides[tint.id],
      );
      expect(
        again.createdNodeIds.some((id) => result.createdNodeIds.includes(id)),
      ).toBe(false);
    },
  );
  it.each([false, true])(
    "rolls back artwork, masks, preparation settings and selection after partial creation (limited=%s)",
    async (limited) => {
      const h = host(
        limited ? "The Starter plan only comes with 3 pages" : undefined,
      );
      h.api.viewport.scrollAndZoomIntoView.mockImplementation(() => {
        throw new Error("Artwork viewport failed");
      });
      await expect(createArtworkExamples()).rejects.toThrow(
        "Artwork viewport failed",
      );
      // Fail after all artwork and preparation overrides have been persisted.
      expect(h.all.filter((n) => n.isMask)).toHaveLength(2);
      expect(h.all.filter((n) => n.type === "VECTOR")).toHaveLength(4);
      expect(h.api.root.setPluginData).toHaveBeenCalledTimes(2);
      const staged = JSON.parse(h.api.root.setPluginData.mock.calls[0][1]);
      expect(Object.values(staged)).toEqual(
        expect.arrayContaining([
          { imageProcessing: { whiteMask: true } },
          { imageProcessing: { whiteMask: true, edgeCleanup: true } },
        ]),
      );
      expect(h.api.currentPage).toBe(h.originalPage);
      expect(h.originalPage.children).toEqual([h.existing]);
      expect(h.originalPage.selection).toEqual([h.existing]);
      expect(h.all.slice(2).every((n) => n.removed)).toBe(true);
      expect(h.stored()).toBe('{"existing":{"name":"Keep me"}}');
      expect(h.api.commitUndo).not.toHaveBeenCalled();
    },
  );
  it("keeps functional content native while allocating real image and effect exports", () => {
    const examples = artworkExamples("owned-gradient", DEFAULT_OPTIONS);
    const pkg = compile(
      examples.flatMap((e) => e.designs),
      "owned-artwork",
      {
        ...DEFAULT_OPTIONS,
        appearance: "editable",
        layerOverrides: examples[0].options.layerOverrides,
      },
      "fixed",
    );
    expect(() => validatePackage(pkg)).toThrow("Upload or link every image");
    const linked = compile(
      examples.flatMap((e) => e.designs),
      "owned-artwork",
      {
        ...DEFAULT_OPTIONS,
        appearance: "editable",
        layerOverrides: examples[0].options.layerOverrides,
        assetIds: Object.fromEntries(pkg.assets.map((a) => [a.id, "123"])),
      },
      "fixed",
    );
    expect(() => validatePackage(linked)).not.toThrow();
    const nodes = flatten(pkg.roots);
    expect(nodes.filter((n) => n.className === "CanvasGroup")).toHaveLength(2);
    expect(
      nodes.find((n) => n.name === "Editable glowing title")?.className,
    ).toBe("TextLabel");
    expect(nodes.find((n) => n.id === "art:image-child")?.className).toBe(
      "TextButton",
    );
    for (const id of [
      "art:image-child:label",
      "art:radial-child:label",
      "art:masked-button:label",
    ])
      expect(nodes.find((n) => n.id === id)?.className).toBe("TextLabel");
    for (const name of [
      "Original vector icon",
      "Tintable vector icon",
      "Clean edge vector icon",
      "Image fill stays an image",
    ])
      expect(nodes.find((n) => n.name === name)?.className).toBe("ImageLabel");
    expect(pkg.assets.some((a) => a.renderMode === "shadow")).toBe(true);
    expect(pkg.assets.some((a) => a.renderMode === "blend")).toBe(true);
    expect(pkg.assets.some((a) => a.renderMode === "fills")).toBe(true);
    expect(pkg.assets.filter((a) => a.processing?.whiteMask)).toHaveLength(2);
    expect(pkg.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("native control example creation", () => {
  it.each([false, true])(
    "creates all controls with native references and readable source text (limited=%s)",
    async (limited) => {
      const h = host(
        limited ? "The Starter plan only comes with 3 pages" : undefined,
      );
      const current = {
        ...DEFAULT_OPTIONS,
        appearance: "editable" as const,
        layerOverrides: { existing: { name: "Keep me" } },
      };
      const created = await createControlExamples(current);
      expect(created.roots).toHaveLength(1);
      expect(created.placement).toBe(limited ? "section" : "page");
      const root = h.all.find((n) => n.id === created.roots[0])!;
      const source = (n: typeof root): ReturnType<typeof node> => {
        const native = n as any;
        return node(n.name, {
          id: n.id,
          type: n.type,
          width: n.width,
          height: n.height,
          transform: [
            [1, 0, n.x],
            [0, 1, n.y],
          ],
          fills: native.fills,
          children: n.children.map(source),
          ...(n.type === "TEXT"
            ? {
                text: {
                  characters: native.characters,
                  align: native.textAlignHorizontal,
                  verticalAlign: native.textAlignVertical,
                  runs: [
                    {
                      text: native.characters,
                      fontFamily: "Roboto",
                      fontStyle: "Regular",
                      fontSize: native.fontSize,
                      color: native.fills[0].color,
                    },
                  ],
                },
              }
            : {}),
        });
      };
      const pkg = compile([source(root)], "native controls", created.options);
      expect(pkg.issues.filter((i) => i.severity !== "info")).toEqual([]);
      expect(pkg.assets).toEqual([]);
      expect(() => validatePackage(pkg)).not.toThrow();
      const controls = flatten(pkg.roots).filter((n) => n.behavior?.control);
      expect(controls).toHaveLength(9);
      expect(new Set(controls.map((n) => n.behavior!.control!.kind)).size).toBe(
        8,
      );
      const ids = new Set(h.all.map((n) => n.id));
      for (const n of controls)
        for (const ref of controlReferences(n.behavior!.control!))
          expect(ids.has(ref)).toBe(true);
      const coins = flatten(pkg.roots).find((n) => n.name === "Live coins")!;
      expect(coins.behavior!.binding!.key).toBe("Coins");
      expect(coins.properties.TextColor3).toEqual({
        type: "Color3",
        value: [1, 1, 1],
      });
      const fill = flatten(pkg.roots).find((n) => n.name === "Health fill")!;
      expect(fill.properties.BackgroundColor3).not.toEqual(
        controls.find((n) => n.name === "Health progress")!.properties
          .BackgroundColor3,
      );
      expect(created.options.layerOverrides.existing).toEqual({
        name: "Keep me",
      });
      expect(h.existing.removed).toBe(false);
      expect(h.api.commitUndo).toHaveBeenCalledOnce();
    },
  );
  it("creates independent linked controls on each run without mutating shared defaults", async () => {
    const h = host("The Starter plan only comes with 3 pages");
    const first = await createControlExamples();
    const firstIds = new Set(first.createdNodeIds);
    const second = await createControlExamples(first.options);
    const secondControls = Object.entries(second.options.layerOverrides).filter(
      ([id]) => second.createdNodeIds.includes(id),
    );
    for (const [, edit] of secondControls)
      if (edit.behavior) {
        if (edit.behavior.control)
          for (const ref of controlReferences(edit.behavior.control))
            expect(firstIds.has(ref)).toBe(false);
        if (edit.behavior.action?.target)
          expect(firstIds.has(edit.behavior.action.target)).toBe(false);
      }
    const slider = secondControls.find(
      ([, edit]) => edit.behavior && edit.behavior.control?.kind === "slider",
    )![1];
    if (slider.behavior && slider.behavior.control?.kind === "slider")
      slider.behavior.control.step = 10;
    expect(
      advancedControlOverrides.slider.behavior &&
        advancedControlOverrides.slider.behavior.control,
    ).toMatchObject({ step: 5 });
    expect(h.all.filter((n) => n.type === "SECTION")).toHaveLength(2);
  });
  it.each([false, true])(
    "rolls back native control artwork, overrides and selection on failure (limited=%s)",
    async (limited) => {
      const h = host(
        limited ? "The Starter plan only comes with 3 pages" : undefined,
      );
      h.failText();
      await expect(createControlExamples()).rejects.toThrow(
        "Render source failed",
      );
      expect(h.originalPage.children).toEqual([h.existing]);
      expect(h.originalPage.selection).toEqual([h.existing]);
      expect(h.stored()).toBe('{"existing":{"name":"Keep me"}}');
      expect(h.all.slice(2).every((n) => n.removed)).toBe(true);
      expect(h.api.commitUndo).not.toHaveBeenCalled();
    },
  );
});
