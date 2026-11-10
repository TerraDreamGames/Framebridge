import { scrollbarPng } from "./scrollbar-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, flatten } from "../packages/core/src/types";
import { snapshot } from "../plugins/figma/src/snapshot";
import { isHostMessage } from "../plugins/figma/src/bridge";
import { ASSET_CATALOG_KEY } from "../plugins/figma/src/asset-catalog";
import { REVIEW_PREFERENCES_KEY } from "../packages/core/src/structure-review";
import { CLOUD_STORAGE_KEY } from "../plugins/figma/src/cloud-storage";
import { CONNECTION_STORAGE_KEY } from "../plugins/figma/src/studio-connection";
import { WINDOW_SIZE_KEY } from "../plugins/figma/src/window-size";
import { SIDEBAR_LAYOUT_KEY } from "../plugins/figma/src/sidebar-layout";
import { HANDOFF_STORAGE_KEY } from "../plugins/figma/src/handoff-storage";
import { iconPng, PNG } from "./image-tools-fixtures";
import { batchPng } from "./image-batch-fixtures";
import { vectorRenderKey } from "../plugins/figma/src/vector-render-key";
import { createImagePreparationClient } from "../plugins/figma/src/image-preparation-client";
import { groupedSettingsScene } from "./group-coordinate-fixtures";
import { compile } from "../packages/core/src/compiler";
const mixed = Symbol("mixed");
function vector(extra: Record<string, unknown> = {}) {
  return frame({
    type: "VECTOR",
    width: 8,
    height: 8,
    radius: 0,
    blendMode: "NORMAL",
    vectorPaths: [{ windingRule: "NONZERO", data: "M 0 0 L 8 0 L 8 8 Z" }],
    vectorNetwork: {
      vertices: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
      ],
      segments: [
        { start: 0, end: 1 },
        { start: 1, end: 2 },
        { start: 2, end: 0 },
      ],
      regions: [{ windingRule: "NONZERO", loops: [[0, 1, 2]] }],
    },
    strokeCap: "NONE",
    strokeJoin: "MITER",
    dashPattern: [],
    handleMirroring: "NONE",
    ...extra,
  });
}
describe("Figma iframe bridge", () => {
  const parent = {} as Window;
  const editor = {} as Window;
  it("accepts the editor top window through Figma's nested sandbox", () => {
    expect(isHostMessage(editor, parent, editor)).toBe(true);
  });
  it("accepts the direct parent in a single-frame harness", () => {
    expect(isHostMessage(parent, parent, editor)).toBe(true);
  });
  it("rejects unrelated windows and missing sources", () => {
    expect(isHostMessage({} as Window, parent, editor)).toBe(false);
    expect(isHostMessage(null, parent, null)).toBe(false);
  });
});
function frame(extra: Record<string, unknown> = {}) {
  return {
    id: "1:1",
    name: "Frame",
    type: "FRAME",
    width: 400,
    height: 300,
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    visible: true,
    opacity: 1,
    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 8,
    topLeftRadius: 8,
    topRightRadius: 8,
    bottomLeftRadius: 8,
    bottomRightRadius: 8,
    cornerSmoothing: 0,
    clipsContent: true,
    effects: [],
    blendMode: "PASS_THROUGH",
    isMask: false,
    constraints: { horizontal: "MIN", vertical: "MIN" },
    layoutMode: "NONE",
    children: [],
    parent: null,
    exportAsync: vi.fn(async () => iconPng()),
    ...extra,
  };
}
beforeEach(() => vi.stubGlobal("figma", { mixed }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("Figma adapter", () => {
  it.each(["FRAME", "GROUP"] as const)(
    "rebases nested groups within a selected %s far from the canvas origin",
    (kind) => {
      const source = groupedSettingsScene(48000, -32000, kind);
      const n = snapshot(source);
      const outer = n.children[0],
        inner = outer.children[0];
      expect(outer.transform).toEqual([
        [1, 0, 60],
        [0, 1, 60],
      ]);
      expect(inner.transform).toEqual([
        [1, 0, 20],
        [0, 1, 30],
      ]);
      expect(inner.children[0].transform).toEqual([
        [1, 0, 20],
        [0, 1, 10],
      ]);
      expect(inner.children[1].transform).toEqual([
        [1, 0, 240],
        [0, 1, 20],
      ]);
      expect(inner.children[2].transform).toEqual([
        [1, 0, 30],
        [0, 1, 120],
      ]);
      expect(inner.children[2].children[0].transform).toEqual([
        [1, 0, 12],
        [0, 1, 8],
      ]);
      const moved = snapshot(groupedSettingsScene(-75000, 91000, kind));
      expect(compile([n], "groups", {}, "fixed")).toEqual(
        compile([moved], "groups", {}, "fixed"),
      );
      // Snapshots don't change native Figma coordinates.
      const raw = (source as unknown as { children: any[] }).children[0]
        .children[0].children[0];
      expect(raw.relativeTransform[0][2]).toBe(kind === "GROUP" ? 48100 : 100);
    },
  );
  it.each(["GROUP", "BOOLEAN_OPERATION", "TRANSFORM_GROUP"])(
    "uses the actual %s parent basis for rotated children",
    (type) => {
      const child = frame({
        relativeTransform: [
          [0, -1, 47980],
          [1, 0, -31970],
        ],
        absoluteTransform: [
          [0, -1, 47980],
          [1, 0, -31970],
        ],
      });
      const parent = frame({
        type,
        relativeTransform: [
          [0, -1, 48000],
          [1, 0, -32000],
        ],
        absoluteTransform: [
          [0, -1, 48000],
          [1, 0, -32000],
        ],
        children: [child],
      });
      expect(
        snapshot(parent as unknown as SceneNode).children[0].transform,
      ).toEqual([
        [1, 0, 30],
        [0, 1, 20],
      ]);
    },
  );
  it("tracks vector paths, networks and vertex styling without changing the source", () => {
    const v = vector();
    const before = snapshot(v as unknown as VectorNode).vectorGeometry;
    (v as any).vectorNetwork.vertices[0].cornerRadius = 2;
    const after = snapshot(v as unknown as VectorNode).vectorGeometry;
    expect(after).not.toBe(before);
    expect(JSON.parse(after!)[1].vertices[0].cornerRadius).toBe(2);
    (v as any).vectorPaths[0].data += " M 2 2 L 3 3";
    expect(snapshot(v as unknown as VectorNode).vectorGeometry).not.toBe(after);
  });
  it("tracks blur settings even when their effect type stays the same", () => {
    const f = frame({
      effects: [{ type: "LAYER_BLUR", visible: true, radius: 4 }],
    });
    const first = snapshot(f as unknown as FrameNode);
    (f.effects[0] as any).radius = 20;
    const next = snapshot(f as unknown as FrameNode);
    expect(next.effects).toEqual(first.effects);
    expect(next.effectSettings).not.toBe(first.effectSettings);
  });
  it("shares only complete, context-free vector appearances", () => {
    const key = (v: ReturnType<typeof vector>, root = false, mode?: "fills") =>
      vectorRenderKey(
        v as unknown as VectorNode,
        snapshot(v as unknown as VectorNode),
        root,
        mode,
      );
    const original = key(vector());
    expect(original).toBeTruthy();
    expect(
      key(
        vector({
          id: "other",
          name: "Another glyph",
          relativeTransform: [
            [1, 0, 103.5],
            [0, 1, -20],
          ],
        }),
      ),
    ).toBe(original);
    for (const extra of [
      { vectorNetwork: undefined },
      { vectorPaths: undefined },
      {
        vectorPaths: [{ windingRule: "NONZERO", data: "M 0 0 L 8 8 L 0 8 Z" }],
      },
      { opacity: 0.5 },
      { fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
      {
        relativeTransform: [
          [0, -1, 0],
          [1, 0, 0],
        ],
      },
      { strokes: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
      { effects: [{ type: "LAYER_BLUR", visible: true }] },
      { isMask: true },
      { blendMode: "MULTIPLY" },
      {
        boundVariables: { opacity: { type: "VARIABLE_ALIAS", id: "variable" } },
      },
      {
        fills: [
          {
            type: "SOLID",
            color: { r: 1, g: 0, b: 0 },
            boundVariables: {
              color: { type: "VARIABLE_ALIAS", id: "variable" },
            },
          },
        ],
      },
      {
        vectorNetwork: {
          vertices: [],
          segments: [],
          regions: [{ fillStyleId: "style" }],
        },
      },
    ])
      expect(key(vector(extra))).not.toBe(original);
    expect(key(vector(), true)).toBeUndefined();
    expect(key(vector(), false, "fills")).toBeUndefined();
  });
  it("reads measured properties without mutating the source", () => {
    const f = frame();
    const before = JSON.stringify(f);
    const n = snapshot(f as unknown as FrameNode);
    expect(n.width).toBe(400);
    expect(n.radius).toBe(8);
    expect(n.fills[0].color).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(JSON.stringify(f)).toBe(before);
  });
  it("reports independent strokes rather than dropping them silently", () => {
    const n = snapshot(frame({ strokeWeight: mixed }) as unknown as FrameNode);
    expect(n.unsupported).toContain("independent stroke widths");
  });
  it.each([
    [0, Math.PI * 2, false],
    [0, Math.PI, true],
    [0.5, Math.PI * 2, true],
  ])(
    "detects ellipse arc artwork (inner radius %s, end %s)",
    (innerRadius, endingAngle, artwork) => {
      const n = snapshot(
        frame({
          type: "ELLIPSE",
          width: 80,
          height: 80,
          arcData: { startingAngle: 0, endingAngle, innerRadius },
        }) as unknown as EllipseNode,
      );
      expect(n.type).toBe(artwork ? "ARC" : "ELLIPSE");
    },
  );
  it("reads run typography and flags unsupported paragraph formatting", () => {
    const f = frame({
      type: "TEXT",
      characters: "A list",
      textAlignHorizontal: "LEFT",
      textAlignVertical: "TOP",
      textAutoResize: "HEIGHT",
      lineHeight: { unit: "PIXELS", value: 22 },
      letterSpacing: { value: 0 },
      textTruncation: "DISABLED",
      getStyledTextSegments: () => [
        {
          characters: "A list",
          fontName: { family: "Inter", style: "Regular" },
          fontSize: 16,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.5 }],
          textDecoration: "NONE",
          letterSpacing: { value: 0 },
          lineHeight: { unit: "PIXELS", value: 22 },
          textCase: "ORIGINAL",
          paragraphSpacing: 4,
          paragraphIndent: 0,
          listOptions: { type: "UNORDERED" },
        },
      ],
    });
    const n = snapshot(f as unknown as TextNode);
    expect(n.text!.runs[0].color?.a).toBe(0.5);
    expect(n.text!.unsupported).toContain("paragraph or list formatting");
  });
  it("accepts a uniform linear text gradient and ignores hidden paints", () => {
    const gradient = {
      type: "GRADIENT_LINEAR",
      visible: true,
      gradientTransform: [
        [0, 1, 0],
        [-22.2784, 0, 11.6392],
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 0.8, b: 0.8, a: 1 } },
        { position: 1, color: { r: 0.8, g: 0.7, b: 0.6, a: 1 } },
      ],
    };
    const run = {
      characters: "999",
      fontName: { family: "Rubik", style: "Bold" },
      fontSize: 48,
      fills: [{ type: "IMAGE", visible: false }, gradient],
      textDecoration: "NONE",
      letterSpacing: { value: 0 },
      textCase: "ORIGINAL",
      paragraphSpacing: 0,
      paragraphIndent: 0,
      listOptions: { type: "NONE" },
    };
    const n = snapshot(
      frame({
        type: "TEXT",
        characters: "999",
        fills: run.fills,
        textAlignHorizontal: "CENTER",
        textAlignVertical: "CENTER",
        getStyledTextSegments: () => [run],
      }) as unknown as TextNode,
    );
    expect(n.text?.unsupported).not.toContain("complex text paint");
    expect(n.text?.characters).toBe("999");
  });
  it("reports mixed per-run gradients rather than treating them as one paint", () => {
    const run = {
      characters: "A",
      fontName: { family: "Roboto", style: "Regular" },
      fontSize: 16,
      textDecoration: "NONE",
      letterSpacing: { value: 0 },
      textCase: "ORIGINAL",
      paragraphSpacing: 0,
      paragraphIndent: 0,
      listOptions: { type: "NONE" },
    };
    const n = snapshot(
      frame({
        type: "TEXT",
        characters: "AB",
        getStyledTextSegments: () => [
          { ...run, fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] },
          {
            ...run,
            characters: "B",
            fills: [{ type: "GRADIENT_LINEAR", gradientStops: [] }],
          },
        ],
      }) as unknown as TextNode,
    );
    expect(n.text?.unsupported).toContain("complex text paint");
  });
});
describe("plugin controller contract", () => {
  async function setup() {
    const messages: any[] = [],
      events: Record<string, Function> = {},
      pageEvents: Record<string, Function> = {};
    const selected = frame();
    const page = {
      selection: [selected],
      on: vi.fn((event: string, cb: Function) => {
        pageEvents[event] = cb;
      }),
      off: vi.fn(),
    };
    const f = {
      mixed,
      currentPage: page,
      root: {
        id: "0:0",
        getPluginData: (_key?: string) => "source-id",
        setPluginData: vi.fn(),
      },
      ui: {
        resize: vi.fn(),
        postMessage: (m: unknown) => messages.push(m),
        onmessage: undefined as undefined | ((m: unknown) => Promise<void>),
      },
      showUI: vi.fn(),
      on: vi.fn((event: string, cb: Function) => {
        if (event === "documentchange")
          throw Error("Requires loading all pages");
        events[event] = cb;
      }),
      clientStorage: {
        getAsync: vi.fn(async (_key?: string): Promise<unknown> => undefined),
        setAsync: vi.fn(async (_key: string, _value: unknown) => undefined),
      },
      base64Encode: () => "AQID",
      viewport: { scrollAndZoomIntoView: vi.fn() },
      getNodeByIdAsync: vi.fn(async () => selected),
      closePlugin: vi.fn(),
      openExternal: vi.fn(),
    };
    vi.stubGlobal("figma", f);
    vi.stubGlobal("__html__", "<html/>");
    await import("../plugins/figma/src/controller");
    return { f, messages, events, pageEvents, selected };
  }
  async function vectorBatch(count = 1000) {
    const context = await setup();
    const { f, selected } = context;
    const children = Array.from({ length: count }, (_, i) => {
      const color = i < 2 ? 0 : i % 2;
      const child = vector({
        id: `shared:${i}`,
        name: `Glyph ${i}`,
        parent: selected,
        fills: [{ type: "SOLID", color: { r: color, g: 0, b: 0 } }],
        relativeTransform: [
          [1, 0, (i % 40) * 16 + 0.25],
          [0, 1, Math.floor(i / 40) * 16 + 0.5],
        ],
      });
      (child as any).clone = () => ({
        ...child,
        id: `copy:${i}`,
        parent: null,
        absoluteBoundingBox: { x: -99998, y: -99997, width: 8, height: 8 },
      });
      return child;
    });
    selected.children = children as any;
    const scratches: any[] = [];
    const behavior: { hold?: boolean; fail?: boolean; finish?: () => void } =
      {};
    (f as any).createFrame = () => {
      let copy: any;
      const scratch = frame({
        id: `scratch:${scratches.length}`,
        appendChild: (node: any) => {
          copy = node;
        },
        resizeWithoutConstraints: vi.fn(),
        remove: vi.fn(),
        exportAsync: vi.fn(async () => {
          if (behavior.hold)
            await new Promise<void>((resolve) => {
              behavior.finish = resolve;
            });
          if (behavior.fail) throw Error("Native rendering failed.");
          return batchPng(
            copy.fills[0].color.r +
              (copy.vectorPaths[0].data.includes("changed") ? 10 : 0),
          );
        }),
      });
      scratches.push(scratch);
      return scratch;
    };
    return { ...context, children, scratches, behavior };
  }
  it("keeps native content and cropped artwork in the same local group space after rendering and cache reuse", async () => {
    const { f, messages, selected } = await setup();
    const scratches: any[] = [];
    const installScene = (x: number, y: number) => {
      Object.assign(selected, groupedSettingsScene(x, y));
      const image = (selected as any).children[0].children[0].children[1];
      image.exportAsync = vi.fn(async () => iconPng());
      image.clone = vi.fn(() => ({
        ...image,
        id: "copy:icon",
        absoluteBoundingBox: { x: -100003, y: -100005, width: 38, height: 42 },
      }));
    };
    (f as any).createFrame = () => {
      const scratch = frame({
        id: `scratch:${scratches.length}`,
        appendChild: vi.fn(),
        resizeWithoutConstraints: vi.fn(),
        remove: vi.fn(),
      });
      scratches.push(scratch);
      return scratch;
    };
    const analyze = async (count: number) => {
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(() => {
        expect(messages.filter((m) => m.type === "error")).toEqual([]);
        expect(messages.filter((m) => m.type === "result")).toHaveLength(count);
      });
      return messages.filter((m) => m.type === "result").at(-1).result;
    };
    installScene(48000, -32000);
    const first = await analyze(1);
    const nodes = flatten(first.package.roots);
    expect(nodes.find((n) => n.id === "31:4")!.properties.Position).toEqual({
      type: "UDim2",
      value: [0, 20, 0, 10],
    });
    const artwork = nodes.find((n) => n.id === "31:5")!;
    expect(artwork.properties.Position).toEqual({
      type: "UDim2",
      value: [0, 237, 0, 15],
    });
    expect(artwork.properties.Size).toEqual({
      type: "UDim2",
      value: [0, 38, 0, 42],
    });
    expect(
      first.designs[0].children[0].children[0].children[1].rasterBounds,
    ).toEqual({ x: 237, y: 15, width: 38, height: 42 });
    // Moving the whole UI across the canvas must not invalidate its local image
    // or add the enclosing group/page translation back to cached crop bounds.
    installScene(-75000, 91000);
    const second = await analyze(2);
    expect(second.package.roots).toEqual(first.package.roots);
    expect(scratches).toHaveLength(1);
    expect(scratches[0].remove).toHaveBeenCalledOnce();
    expect(messages.filter((m) => m.type === "error")).toEqual([]);
  });
  it("renders 1,000 equivalent vector references twice, rebases crop bounds and retains every image layer", async () => {
    const { f, messages, children, scratches } = await vectorBatch();
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const result = messages.find((m) => m.type === "result").result;
    expect(scratches).toHaveLength(2);
    expect(scratches.every((s) => s.remove.mock.calls.length === 1)).toBe(true);
    expect(result.package.assets).toHaveLength(1000);
    expect(
      flatten(result.package.roots).filter((n) => n.className === "ImageLabel"),
    ).toHaveLength(1000);
    for (const [i, design] of result.designs[0].children.entries()) {
      expect(design.rasterBounds).toEqual({
        x: children[i].relativeTransform[0][2] + 2,
        y: children[i].relativeTransform[1][2] + 3,
        width: 8,
        height: 8,
      });
      const asset = result.package.assets.find(
        (a: any) => a.nodeId === design.id,
      );
      expect(result.assets[asset.id]).toEqual(
        Array.from(batchPng(i < 2 ? 0 : i % 2)),
      );
    }
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "result")).toHaveLength(2),
    );
    expect(scratches).toHaveLength(2);
    expect(messages.filter((m) => m.type === "error")).toEqual([]);
  }, 10000);
  it("prepares only two PNGs in the browser for 1,000 equivalent references and preserves separate layer flags", async () => {
    const { f, messages, scratches, children } = await vectorBatch();
    (f as any).base64Encode = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString("base64");
    (f as any).base64Decode = (png: string) =>
      new Uint8Array(Buffer.from(png, "base64"));
    const client = createImagePreparationClient(
      (type, data) => void f.ui.onmessage!({ type, ...data }),
    );
    f.ui.postMessage = (message: any) => {
      const count = messages.push(message);
      client.receive(message);
      return count;
    };
    await f.ui.onmessage!({ type: "ready", imagePreparation: 1 });
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(
      () => expect(messages.some((m) => m.type === "result")).toBe(true),
      { timeout: 10000 },
    );
    expect(messages.filter((m) => m.type === "prepare-image")).toHaveLength(2);
    expect(scratches).toHaveLength(2);
    const first = messages.find((m) => m.type === "result").result;
    expect(first.package.assets).toHaveLength(1000);
    for (const asset of first.package.assets)
      expect(first.assets[asset.id]).toEqual(
        Array.from(
          batchPng(
            children.find((n) => n.id === asset.nodeId)!.fills[0].color.r,
          ),
        ),
      );
    await f.ui.onmessage!({
      type: "analyze",
      options: {
        ...DEFAULT_OPTIONS,
        layerOverrides: {
          "shared:0": { imageProcessing: { whiteMask: true } },
          "shared:1": { imageProcessing: { edgeCleanup: false } },
        },
      },
    });
    await vi.waitFor(
      () => expect(messages.filter((m) => m.type === "result")).toHaveLength(2),
      { timeout: 10000 },
    );
    // Raw/prepared pairs fit for 1,000 references; only the new mask needs work.
    expect(messages.filter((m) => m.type === "prepare-image")).toHaveLength(3);
    expect(scratches).toHaveLength(2);
    const second = messages.filter((m) => m.type === "result")[1].result;
    const masked = second.package.assets.find(
      (a: any) => a.nodeId === "shared:0",
    );
    const raw = second.package.assets.find((a: any) => a.nodeId === "shared:1");
    expect(PNG.sync.read(Buffer.from(second.assets[masked.id])).data[0]).toBe(
      255,
    );
    expect(second.assets[raw.id]).toEqual(Array.from(batchPng(0)));
    client.dispose();
  }, 15000);
  it("reuses unrelated artwork and prepared pixels across individual render-type changes", async () => {
    const { f, messages, scratches } = await vectorBatch(1000);
    (f as any).base64Encode = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString("base64");
    (f as any).base64Decode = (png: string) =>
      new Uint8Array(Buffer.from(png, "base64"));
    const client = createImagePreparationClient(
      (type, data) => void f.ui.onmessage!({ type, ...data }),
    );
    f.ui.postMessage = (message: any) => {
      messages.push(message);
      client.receive(message);
      return messages.length;
    };
    await f.ui.onmessage!({ type: "ready", imagePreparation: 1 });
    for (const [index, mode] of [
      undefined,
      "native",
      "image",
      "native",
      undefined,
    ].entries()) {
      await f.ui.onmessage!({
        type: "analyze",
        options: {
          ...DEFAULT_OPTIONS,
          layerOverrides: mode ? { "shared:3": { renderMode: mode } } : {},
        },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(
          index + 1,
        ),
      );
      const result = messages.filter((m) => m.type === "result").at(-1).result;
      expect(result.package.assets).toHaveLength(
        mode === "native" ? 999 : 1000,
      );
      expect(scratches).toHaveLength(2);
      expect(messages.filter((m) => m.type === "prepare-image")).toHaveLength(
        2,
      );
    }
    expect(messages.filter((m) => m.type === "error")).toEqual([]);
    client.dispose();
  });
  it("cancels browser preparation without committing stale renders or accepting late replies", async () => {
    const { f, messages, scratches } = await vectorBatch(2);
    (f as any).base64Encode = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString("base64");
    (f as any).base64Decode = (png: string) =>
      new Uint8Array(Buffer.from(png, "base64"));
    await f.ui.onmessage!({ type: "ready", imagePreparation: 1 });
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "prepare-image")).toBe(true),
    );
    const old = messages.find((m) => m.type === "prepare-image");
    await f.ui.onmessage!({ type: "cancel" });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    await f.ui.onmessage!({
      type: "image-prepared",
      preparationId: old.preparationId,
      unchanged: true,
    });
    expect(messages.some((m) => m.type === "result")).toBe(false);
    const client = createImagePreparationClient(
      (type, data) => void f.ui.onmessage!({ type, ...data }),
    );
    f.ui.postMessage = (message: any) => {
      const count = messages.push(message);
      client.receive(message);
      return count;
    };
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(scratches).toHaveLength(2); // A single shared native render per attempt.
    expect(messages.filter((m) => m.type === "result")).toHaveLength(1);
    client.dispose();
  });
  it("invalidates same-size vector geometry edits and catches edits during a shared render", async () => {
    const { f, messages, children, scratches, behavior, pageEvents } =
      await vectorBatch(2);
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "result")).toHaveLength(1),
    );
    (children[0] as any).vectorPaths[0].data += " changed";
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "result")).toHaveLength(2),
    );
    expect(scratches).toHaveLength(2);
    const result = messages.filter((m) => m.type === "result")[1].result;
    for (const [i, child] of children.entries()) {
      const asset = result.package.assets.find(
        (a: any) => a.nodeId === child.id,
      );
      expect(result.assets[asset.id]).toEqual(
        Array.from(batchPng(i === 0 ? 10 : 0)),
      );
    }
    (children[0] as any).vectorPaths[0].data += " again";
    behavior.hold = true;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() => expect(behavior.finish).toBeDefined());
    (children[0] as any).vectorNetwork.vertices[0].cornerRadius = 3;
    pageEvents.nodechange({
      nodeChanges: [
        {
          node: children[0],
          type: "PROPERTY_CHANGE",
          properties: ["vectorNetwork"],
        },
      ],
    });
    behavior.finish!();
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "idle")).toHaveLength(3),
    );
    expect(messages.filter((m) => m.type === "result")).toHaveLength(2);
    expect(messages.filter((m) => m.type === "error")[0].message).toContain(
      "selection changed",
    );
  });
  it("keeps per-layer image processing separate when native vector pixels are shared", async () => {
    const { f, messages, children, scratches } = await vectorBatch(2);
    await f.ui.onmessage!({
      type: "analyze",
      options: {
        ...DEFAULT_OPTIONS,
        layerOverrides: {
          [children[0].id]: { imageProcessing: { whiteMask: true } },
        },
      },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const result = messages.find((m) => m.type === "result").result;
    expect(scratches).toHaveLength(1);
    const bytes = children.map(
      (child) =>
        result.assets[
          result.package.assets.find((a: any) => a.nodeId === child.id).id
        ],
    );
    const white = PNG.sync.read(Buffer.from(bytes[0]));
    expect(Array.from(white.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(bytes[1]).toEqual(Array.from(batchPng(0)));
  });
  it("refreshes unchanged results for current revisions and invalidates changed export options or source identity", async () => {
    const { f, messages, selected, scratches, events } = await vectorBatch(2);
    const analyze = async (options = DEFAULT_OPTIONS) => {
      const previous = messages.filter((m) => m.type === "result").length;
      await f.ui.onmessage!({ type: "analyze", options });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(
          previous + 1,
        ),
      );
      return messages.filter((m) => m.type === "result").at(-1).result;
    };
    const initial = await analyze();
    const compiler = await import("../packages/core/src/compiler");
    const compile = vi.spyOn(compiler, "compile");
    events.selectionchange();
    const repeat = await analyze();
    expect(repeat.revision).toBe(1);
    expect(compile).not.toHaveBeenCalled();
    expect(repeat.package.roots).toEqual(initial.package.roots);
    expect(scratches).toHaveLength(1);
    const configured = await analyze({
      ...DEFAULT_OPTIONS,
      rootName: "Configured UI",
      layerOverrides: {
        [`screen:${selected.id}`]: { properties: { DisplayOrder: 7 } },
      },
    });
    expect(compile).toHaveBeenCalled();
    expect(configured.package.roots[0].name).toBe("Configured UI");
    expect(configured.package.roots[0].properties.DisplayOrder).toBe(7);
    f.root.getPluginData = (key) =>
      key === "framebridge-source" ? "new-source" : "{}";
    const changedSource = await analyze();
    expect(changedSource.package.sourceId).toBe("new-source");
    compile.mockRestore();
  });
  it.each(["cancel", "failure"])(
    "cleans up a shared %s and retries without poisoned pixels",
    async (kind) => {
      const { f, messages, scratches, behavior } = await vectorBatch(2);
      behavior.hold = true;
      behavior.fail = kind === "failure";
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(() => expect(behavior.finish).toBeDefined());
      expect(scratches).toHaveLength(1);
      if (kind === "cancel") await f.ui.onmessage!({ type: "cancel" });
      behavior.finish!();
      await vi.waitFor(() =>
        expect(messages.some((m) => m.type === "idle")).toBe(true),
      );
      expect(messages.some((m) => m.type === "result")).toBe(false);
      expect(scratches[0].remove).toHaveBeenCalledOnce();
      behavior.hold = false;
      behavior.fail = false;
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(() =>
        expect(messages.some((m) => m.type === "result")).toBe(true),
      );
      expect(scratches).toHaveLength(2);
      expect(scratches[1].remove).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [
      "unrotated",
      [
        [1, 0],
        [0, 1],
      ],
    ],
    [
      "rotated",
      [
        [0, -1],
        [1, 0],
      ],
    ],
    [
      "mirrored",
      [
        [-1, 0],
        [0, 1],
      ],
    ],
    [
      "rotated and mirrored",
      [
        [0, -1],
        [-1, 0],
      ],
    ],
  ] as const)(
    "keeps SCALE-constrained %s SVG artwork at full size while cropping its export",
    async (_name, matrix) => {
      const { f, messages, selected } = await setup();
      // Geometry has a nonzero local origin, independent of the node's layout box.
      const path = [
        [10, 6],
        [16, 10],
        [10, 14],
        [4, 10],
      ];
      const art: any = frame({
        id: "svg-vector",
        name: "SVG diamond",
        type: "VECTOR",
        width: 20,
        height: 22,
        constraints: { horizontal: "SCALE", vertical: "SCALE" },
        parent: selected,
        relativeTransform: [
          [matrix[0][0], matrix[0][1], 37],
          [matrix[1][0], matrix[1][1], 29],
        ],
      });
      selected.children = [art] as any;
      const sourceBefore = JSON.stringify(art, (key, value) =>
        key === "parent" ? undefined : value,
      );
      let copy: any;
      const scratch: any = frame({
        width: 100,
        height: 100,
        appendChild: vi.fn((node: any) => {
          copy = node;
        }),
        remove: vi.fn(),
      });
      // Model Figma resize semantics: SCALE children resize with their parent.
      scratch.resize = vi.fn((width: number, height: number) => {
        copy.width *= width / scratch.width;
        copy.height *= height / scratch.height;
        scratch.width = width;
        scratch.height = height;
      });
      scratch.resizeWithoutConstraints = vi.fn(
        (width: number, height: number) => {
          scratch.width = width;
          scratch.height = height;
        },
      );
      const renderedPath = () =>
        path.map(([x, y]) => {
          x *= copy.width / art.width;
          y *= copy.height / art.height;
          const t = copy.relativeTransform;
          return [
            t[0][0] * x + t[0][1] * y + t[0][2],
            t[1][0] * x + t[1][1] * y + t[1][2],
          ];
        });
      art.clone = () => {
        const node = {
          ...art,
          id: "svg-copy",
          relativeTransform: structuredClone(art.relativeTransform),
        };
        Object.defineProperty(node, "absoluteRenderBounds", {
          get: () => {
            const points = renderedPath();
            const xs = points.map(([x]) => x),
              ys = points.map(([, y]) => y);
            return {
              x: scratch.x + Math.min(...xs),
              y: scratch.y + Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            };
          },
        });
        return node;
      };
      scratch.exportAsync = vi.fn(async () => {
        const width = scratch.width * 2,
          height = scratch.height * 2;
        const pixels = new Uint8Array(width * height * 4);
        const polygon = renderedPath();
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const px = (x + 0.5) / 2,
              py = (y + 0.5) / 2;
            const signs = polygon.map(([ax, ay], i) => {
              const [bx, by] = polygon[(i + 1) % polygon.length];
              return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
            });
            if (
              signs.every((value) => value >= 0) ||
              signs.every((value) => value <= 0)
            )
              pixels.set([32, 144, 224, 255], (y * width + x) * 4);
          }
        return Uint8Array.from(PNG.sync.write({ width, height, data: pixels }));
      });
      (f as any).createFrame = () => scratch;
      f.getNodeByIdAsync = vi.fn(async (id: string) =>
        id === art.id ? art : selected,
      ) as any;
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(() =>
        expect(messages.some((m) => m.type === "result")).toBe(true),
      );
      const result = messages.find((m) => m.type === "result").result;
      const asset = result.package.assets[0];
      const png = PNG.sync.read(Buffer.from(result.assets[asset.id]));
      expect([png.width, png.height]).toEqual(
        matrix[0][0] === 0 ? [16, 24] : [24, 16],
      );
      const center = ((png.height / 2) * png.width + png.width / 2) * 4;
      expect(Array.from(png.data.slice(center, center + 4))).toEqual([
        32, 144, 224, 255,
      ]);
      expect(png.data[3]).toBe(0);
      expect(
        Array.from(png.data).filter((value, i) => i % 4 === 3 && value === 255)
          .length,
      ).toBe(192);
      expect([copy.width, copy.height]).toEqual([20, 22]);
      expect(
        copy.relativeTransform.map((row: number[]) => row.slice(0, 2)),
      ).toEqual(matrix);
      expect(
        JSON.stringify(art, (key, value) =>
          key === "parent" ? undefined : value,
        ),
      ).toBe(sourceBefore);
      expect(messages.filter((m) => m.type === "error")).toEqual([]);
      expect(scratch.remove).toHaveBeenCalledOnce();
    },
  );
  it.each([1000, 250])(
    "renders 1,000 source image references with %i exact unique PNGs using the real controller",
    async (unique) => {
      const { f, messages, selected } = await setup();
      const pngs = Array.from({ length: unique }, (_, i) => batchPng(i));
      const children = Array.from({ length: 1000 }, (_, i) => {
        const child = frame({
          id: `batch:${i}`,
          name: `Artwork ${i}`,
          type: "VECTOR",
          width: 8,
          height: 8,
          parent: selected,
          relativeTransform: [
            [1, 0, (i % 50) * 8],
            [0, 1, Math.floor(i / 50) * 8],
          ],
        });
        (child as any).clone = () =>
          frame({
            id: `copy:${i}`,
            type: "VECTOR",
            width: 8,
            height: 8,
            qaImage: i % unique,
            absoluteBoundingBox: {
              x: -100000,
              y: -100000,
              width: 8,
              height: 8,
            },
          });
        return child;
      });
      selected.children = children as any;
      const byId = new Map(children.map((child) => [child.id, child]));
      f.getNodeByIdAsync = vi.fn(
        async (id: string) => byId.get(id) ?? selected,
      ) as any;
      const scratchFrames: any[] = [];
      let active = 0,
        peak = 0;
      (f as any).createFrame = () => {
        let image = 0;
        const scratch = frame({
          id: `scratch:${scratchFrames.length}`,
          appendChild: (copy: any) => {
            image = copy.qaImage;
          },
          resizeWithoutConstraints: vi.fn(),
          remove: vi.fn(),
          exportAsync: vi.fn(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>((r) => setImmediate(r));
            active--;
            return pngs[image];
          }),
        });
        scratchFrames.push(scratch);
        return scratch;
      };
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(
        () => expect(messages.some((m) => m.type === "result")).toBe(true),
        { timeout: 10000 },
      );
      const result = messages.find((m) => m.type === "result").result;
      expect(result.package.assets).toHaveLength(1000);
      expect(new Set(Object.values(result.assets)).size).toBe(unique);
      expect(peak).toBeLessThanOrEqual(2);
      expect(scratchFrames).toHaveLength(1000);
      expect(scratchFrames.every((s) => s.remove.mock.calls.length === 1)).toBe(
        true,
      );
      expect(messages.filter((m) => m.type === "error")).toEqual([]);
      expect(selected.children).toEqual(children);
    },
    15000,
  );
  it("caps preview dimensions and omits oversized preview payloads while retaining native export", async () => {
    const { f, messages, selected } = await setup();
    selected.height = 100000;
    selected.exportAsync = vi.fn(async () => new Uint8Array(13 * 1024 * 1024));
    const encode = vi.fn();
    (f as any).base64Encode = encode;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(selected.exportAsync).toHaveBeenCalledWith(
      expect.objectContaining({ constraint: { type: "SCALE", value: 0.01 } }),
    );
    expect(encode).not.toHaveBeenCalled();
    const result = messages.find((m) => m.type === "result").result;
    expect(result.previews).toEqual({});
    expect(result.package.roots.length).toBeGreaterThan(0);
    expect(
      result.package.issues.some((i: any) => i.code === "preview-limit"),
    ).toBe(true);
  });
  it("starts with dynamic-page-safe listeners and announces actual selection", async () => {
    const { f, messages } = await setup();
    await f.ui.onmessage!({ type: "ready" });
    expect(f.currentPage.on).toHaveBeenCalledWith(
      "nodechange",
      expect.any(Function),
    );
    expect(messages.find((m) => m.type === "selection").selection[0].name).toBe(
      "Frame",
    );
  });
  it("stores Roblox connection capabilities separately and opens only the validated provider authorization page", async () => {
    const { f, messages } = await setup();
    const { ROBLOX_ACCOUNT_STORAGE_KEY } =
      await import("../plugins/figma/src/roblox-account-storage");
    const { oauthFixture } = await import("./roblox-oauth-fixture");
    const login = await oauthFixture().service.begin("invite");
    const record = {
      origin: "https://relay.test",
      pending: login,
      accountToken: "b".repeat(64),
    };
    await f.ui.onmessage!({
      type: "save-roblox-account",
      accountSettings: { ...record, refresh_token: "not-client-data" },
      revision: 91,
    });
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(
      ROBLOX_ACCOUNT_STORAGE_KEY,
      record,
    );
    f.clientStorage.getAsync.mockImplementation(async (key) =>
      key === ROBLOX_ACCOUNT_STORAGE_KEY ? record : undefined,
    );
    await f.ui.onmessage!({ type: "load-roblox-account", revision: 92 });
    expect(messages.at(-1)).toEqual({
      type: "roblox-account-response",
      revision: 92,
      accountSettings: record,
    });
    await f.ui.onmessage!({
      type: "open-roblox-authorization",
      origin: record.origin,
      authorizationUrl: login.authorizationUrl,
      revision: 93,
    });
    expect(f.openExternal).toHaveBeenCalledWith(login.authorizationUrl);
    expect(messages.at(-1)).toMatchObject({
      type: "roblox-account-response",
      revision: 93,
    });
    await f.ui.onmessage!({
      type: "open-roblox-authorization",
      origin: record.origin,
      authorizationUrl: login.authorizationUrl.replace(
        "apis.roblox.com",
        "malicious.test",
      ),
      revision: 94,
    });
    expect(f.openExternal).toHaveBeenCalledTimes(1);
    const changed = new URL(login.authorizationUrl);
    changed.searchParams.set("state", "e".repeat(64));
    await f.ui.onmessage!({
      type: "open-roblox-authorization",
      origin: record.origin,
      authorizationUrl: changed.href,
    });
    expect(f.openExternal).toHaveBeenCalledTimes(1);
    changed.searchParams.set(
      "state",
      new URL(login.authorizationUrl).searchParams.get("state")!,
    );
    changed.searchParams.set(
      "redirect_uri",
      "https://framebridge.test/oauth/roblox/callback",
    );
    const gatewayRecord = {
      ...record,
      pending: {
        ...login,
        authorizationUrl: changed.href,
        callbackOrigin: "https://framebridge.test",
      },
    };
    f.clientStorage.getAsync.mockImplementation(async (key) =>
      key === ROBLOX_ACCOUNT_STORAGE_KEY ? gatewayRecord : undefined,
    );
    await f.ui.onmessage!({
      type: "open-roblox-authorization",
      origin: record.origin,
      authorizationUrl: changed.href,
    });
    expect(f.openExternal).toHaveBeenLastCalledWith(changed.href);
    expect(f.openExternal).toHaveBeenCalledTimes(2);
    expect(messages.find((m) => m.revision === 94)).toMatchObject({
      type: "roblox-account-response",
      revision: 94,
      error: "Could not open Roblox authorization.",
    });
    f.clientStorage.getAsync.mockRejectedValueOnce(
      Error("secret-provider-error"),
    );
    await f.ui.onmessage!({ type: "load-roblox-account", revision: 95 });
    expect(JSON.stringify(messages)).not.toContain("secret-provider-error");
    expect(messages.at(-1)).toMatchObject({
      error: "Roblox connection storage failed.",
    });
  });
  it("resizes live and persists only completed resize gestures, outside document data", async () => {
    const { f } = await setup();
    await f.ui.onmessage!({ type: "resize", width: 1200, height: 800 });
    expect(f.ui.resize).toHaveBeenLastCalledWith(1200, 800);
    expect(f.clientStorage.setAsync).not.toHaveBeenCalled();
    await f.ui.onmessage!({
      type: "resize",
      width: 1200.4,
      height: 850.6,
      persist: true,
    });
    expect(f.ui.resize).toHaveBeenLastCalledWith(1200, 851);
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(WINDOW_SIZE_KEY, {
      width: 1200,
      height: 851,
    });
    expect(f.root.setPluginData).not.toHaveBeenCalled();
  });
  it("saves the completed resize without repainting identical live dimensions", async () => {
    const { f } = await setup();
    await f.ui.onmessage!({ type: "resize", width: 1200, height: 800 });
    await f.ui.onmessage!({ type: "resize", width: 1200.2, height: 800.1 });
    await f.ui.onmessage!({
      type: "resize",
      width: 1200,
      height: 800,
      persist: true,
    });
    expect(f.ui.resize).toHaveBeenCalledTimes(1);
    expect(f.clientStorage.setAsync).toHaveBeenCalledWith(WINDOW_SIZE_KEY, {
      width: 1200,
      height: 800,
    });
    await f.ui.onmessage!({ type: "resize", width: 1210, height: 810 });
    expect(f.ui.resize).toHaveBeenCalledTimes(2);
    expect(f.ui.resize).toHaveBeenLastCalledWith(1210, 810);
  });
  it("stores sidebar widths locally, separately from exports and the plugin window", async () => {
    const { f, messages } = await setup();
    f.clientStorage.getAsync.mockImplementation(async (key) =>
      key === SIDEBAR_LAYOUT_KEY ? { layers: 280, properties: 450 } : undefined,
    );
    await f.ui.onmessage!({ type: "load-sidebar-layout", revision: 17 });
    expect(messages.at(-1)).toEqual({
      type: "sidebar-layout",
      layout: { layers: 280, properties: 450 },
      revision: 17,
    });
    await f.ui.onmessage!({
      type: "save-sidebar-layout",
      layout: { layers: 310.4, properties: 9000, unrelated: "ignored" },
    });
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(
      SIDEBAR_LAYOUT_KEY,
      { layers: 310, properties: 700 },
    );
    expect(f.ui.resize).not.toHaveBeenCalled();
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    f.clientStorage.setAsync.mockClear();
    await f.ui.onmessage!({
      type: "save-sidebar-layout",
      layout: { layers: Infinity },
    });
    expect(f.clientStorage.setAsync).not.toHaveBeenCalled();
  });
  it("restores the latest sidebar gesture after asynchronous writes finish", async () => {
    const { f, messages } = await setup();
    let release!: () => void;
    let saved: unknown;
    f.clientStorage.setAsync.mockImplementation(async (_key, value) => {
      if (!saved)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      saved = value;
    });
    f.clientStorage.getAsync.mockImplementation(async () => saved);
    const first = f.ui.onmessage!({
      type: "save-sidebar-layout",
      layout: { layers: 240, properties: 360 },
    });
    await Promise.resolve();
    const second = f.ui.onmessage!({
      type: "save-sidebar-layout",
      layout: { layers: 300, properties: 420 },
    });
    const load = f.ui.onmessage!({ type: "load-sidebar-layout", revision: 18 });
    expect(f.clientStorage.getAsync).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second, load]);
    expect(saved).toEqual({ layers: 300, properties: 420 });
    expect(messages.at(-1)).toMatchObject({
      type: "sidebar-layout",
      layout: { layers: 300, properties: 420 },
      revision: 18,
    });
  });
  it("keeps default sidebar widths available when device storage fails", async () => {
    const { f, messages } = await setup();
    f.clientStorage.getAsync.mockRejectedValue(new Error("storage-details"));
    await f.ui.onmessage!({ type: "load-sidebar-layout", revision: 19 });
    expect(messages.at(-1)).toEqual({
      type: "sidebar-layout",
      layout: {},
      revision: 19,
    });
    expect(JSON.stringify(messages)).not.toContain("storage-details");
  });
  it("bounds window sizes and ignores invalid iframe dimensions", async () => {
    const { f } = await setup();
    await f.ui.onmessage!({ type: "resize", width: -10, height: 10000 });
    expect(f.ui.resize).toHaveBeenLastCalledWith(600, 1400);
    f.ui.resize.mockClear();
    for (const width of ["1200", NaN, Infinity, undefined]) {
      await f.ui.onmessage!({
        type: "resize",
        width,
        height: 800,
        persist: true,
      });
    }
    expect(f.ui.resize).not.toHaveBeenCalled();
    expect(f.clientStorage.setAsync).not.toHaveBeenCalled();
  });
  it("restores the saved window without putting its dimensions into conversion settings", async () => {
    const { f, messages } = await setup();
    f.clientStorage.getAsync.mockImplementation(async (key?: string) =>
      key === WINDOW_SIZE_KEY
        ? ({ width: 1280, height: 900 } as any)
        : undefined,
    );
    await f.ui.onmessage!({ type: "ready" });
    expect(f.ui.resize).toHaveBeenCalledWith(1280, 900);
    expect(
      messages.find((m) => m.type === "settings").options,
    ).not.toHaveProperty("width");
  });
  it("does not overwrite a new user resize when a delayed restore finishes", async () => {
    const { f } = await setup();
    let restore!: (value: any) => void;
    f.clientStorage.getAsync.mockImplementation((key?: string) =>
      key === WINDOW_SIZE_KEY
        ? new Promise((resolve) => {
            restore = resolve;
          })
        : Promise.resolve(undefined),
    );
    const ready = f.ui.onmessage!({ type: "ready" });
    await f.ui.onmessage!({
      type: "resize",
      width: 1300,
      height: 900,
      persist: true,
    });
    restore({ width: 900, height: 720 });
    await ready;
    expect(f.ui.resize).toHaveBeenCalledTimes(1);
    expect(f.ui.resize).toHaveBeenLastCalledWith(1300, 900);
  });
  it("restores credentials separately from document and export settings", async () => {
    const { f, messages } = await setup();
    const cloud = { key: "dummy-key", ownerType: "group", ownerId: "123" };
    f.clientStorage.getAsync.mockImplementation(async (key?: string) =>
      key === CLOUD_STORAGE_KEY ? cloud : (undefined as any),
    );
    await f.ui.onmessage!({ type: "load-cloud-settings", revision: 1 });
    expect(messages.at(-1)).toEqual({
      type: "cloud-settings",
      cloud,
      revision: 1,
    });
    await f.ui.onmessage!({ type: "ready" });
    expect(
      JSON.stringify(messages.find((m) => m.type === "settings")),
    ).not.toContain("dummy-key");
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    expect(f.clientStorage.setAsync).not.toHaveBeenCalled();
  });
  it("stores Studio connection capabilities locally and never in design settings", async () => {
    const { f, messages } = await setup();
    const connection = {
      origin: "https://relay.test",
      senderToken: "a".repeat(64),
      expiresAt: 999999,
    };
    await f.ui.onmessage!({
      type: "save-studio-connection",
      connection,
      revision: 10,
    });
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(
      CONNECTION_STORAGE_KEY,
      connection,
    );
    expect(messages.at(-1)).toEqual({
      type: "studio-connection-saved",
      revision: 10,
    });
    f.clientStorage.getAsync.mockImplementation(async (key?: string) =>
      key === CONNECTION_STORAGE_KEY ? connection : (undefined as any),
    );
    await f.ui.onmessage!({ type: "load-studio-connection", revision: 11 });
    expect(messages.at(-1)).toEqual({
      type: "studio-connection",
      connection,
      revision: 11,
    });
    await f.ui.onmessage!({ type: "ready" });
    expect(
      JSON.stringify(messages.find((m) => m.type === "settings")),
    ).not.toContain(connection.senderToken);
    await f.ui.onmessage!({
      type: "save-studio-connection",
      connection: null,
      revision: 12,
    });
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(
      CONNECTION_STORAGE_KEY,
      null,
    );
    expect(f.root.setPluginData).not.toHaveBeenCalled();
  });
  it("acknowledges persistence without echoing credentials and clears stored keys", async () => {
    const { f, messages } = await setup();
    await f.ui.onmessage!({
      type: "save-cloud-settings",
      cloud: { key: "dummy-key", ownerType: "user", ownerId: "123" },
      revision: 2,
    });
    expect(messages.at(-1)).toEqual({
      type: "cloud-settings-saved",
      revision: 2,
    });
    await f.ui.onmessage!({
      type: "save-cloud-settings",
      cloud: { key: "", ownerType: "user", ownerId: "123" },
      revision: 3,
    });
    expect(f.clientStorage.setAsync).toHaveBeenLastCalledWith(
      CLOUD_STORAGE_KEY,
      { ownerType: "user", ownerId: "123" },
    );
    expect(f.root.setPluginData).not.toHaveBeenCalled();
  });
  it("persists a sanitized image library through the real controller and reports storage errors", async () => {
    const { f, messages } = await setup();
    const entry = {
      owner: "group:123",
      fingerprint: "a".repeat(64),
      assetId: "987",
      name: "Icon",
      width: 16,
      height: 16,
      moderation: "MODERATION_STATE_APPROVED",
      savedAt: 1,
      key: "never-persist",
    };
    await f.ui.onmessage!({
      type: "save-asset-catalog",
      catalog: [entry],
      revision: 1,
    });
    const stored = f.clientStorage.setAsync.mock.calls.find(
      (c) => c[0] === ASSET_CATALOG_KEY,
    )![1];
    expect(JSON.stringify(stored)).not.toContain("never-persist");
    f.clientStorage.getAsync.mockResolvedValue(stored as any);
    await f.ui.onmessage!({ type: "load-asset-catalog", revision: 2 });
    expect(messages.at(-1)).toMatchObject({
      type: "asset-catalog-response",
      catalog: [{ assetId: "rbxassetid://987" }],
      revision: 2,
    });
    f.clientStorage.getAsync.mockRejectedValue(new Error("secret-exception"));
    await f.ui.onmessage!({ type: "load-asset-catalog", revision: 3 });
    expect(messages.at(-1)).toEqual({
      type: "asset-catalog-response",
      error: "Image library storage failed.",
      revision: 3,
    });
    expect(JSON.stringify(messages)).not.toContain("secret-exception");
  });
  it("persists bounded review preferences outside document and export data", async () => {
    const { f, messages } = await setup();
    const rule = {
      name: "Inventory list",
      sourceType: "FRAME",
      family: "container",
      decision: { kind: "scroll", value: "Y" },
      token: "never-store",
    };
    await f.ui.onmessage!({
      type: "save-review-preferences",
      revision: 41,
      reviewPreferences: {
        version: 1,
        enabled: true,
        rules: [rule],
        apiKey: "never-store",
      },
    });
    const stored = f.clientStorage.setAsync.mock.calls.find(
      (c) => c[0] === REVIEW_PREFERENCES_KEY,
    )![1];
    expect(JSON.stringify(stored)).not.toContain("never-store");
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    f.clientStorage.getAsync.mockImplementation(async (key?: string) =>
      key === REVIEW_PREFERENCES_KEY ? (stored as any) : undefined,
    );
    await f.ui.onmessage!({ type: "load-review-preferences", revision: 42 });
    expect(messages.at(-1)).toMatchObject({
      type: "review-preferences-response",
      revision: 42,
      preferences: { rules: [{ name: "inventory list" }] },
    });
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(
      JSON.stringify(messages.find((m) => m.type === "result").result.package),
    ).not.toContain("inventory list");
    expect(
      f.root.setPluginData.mock.calls.some(
        (call) => call[0] === REVIEW_PREFERENCES_KEY,
      ),
    ).toBe(false);
    await f.ui.onmessage!({
      type: "save-review-preferences",
      revision: 43,
      reviewPreferences: { version: 1, enabled: true, rules: [] },
    });
    expect(messages.at(-1)).toMatchObject({
      revision: 43,
      preferences: { rules: [] },
    });
    f.clientStorage.getAsync.mockRejectedValue(
      new Error("private-secret-body"),
    );
    await f.ui.onmessage!({ type: "load-review-preferences", revision: 44 });
    expect(messages.at(-1)).toMatchObject({
      revision: 44,
      error: "Saved review choices could not be stored or read.",
    });
    expect(JSON.stringify(messages)).not.toContain("private-secret-body");
  });
  it("keeps handoff management access device-local and serializes save/read/close", async () => {
    const { f, messages } = await setup();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => (release = resolve));
    let stored: any;
    f.clientStorage.setAsync.mockImplementation(async (key, value) => {
      if (key === HANDOFF_STORAGE_KEY) {
        await waiting;
        stored = value;
      }
    });
    f.clientStorage.getAsync.mockImplementation(async (key?: string) =>
      key === HANDOFF_STORAGE_KEY ? stored : undefined,
    );
    const record = {
      origin: "https://private.test",
      ownerToken: "a".repeat(64),
      name: "Design",
      expiresAt: Date.now() + 3600000,
    };
    const saving = f.ui.onmessage!({
      type: "save-handoffs",
      revision: 61,
      handoffs: [record],
    });
    const reading = f.ui.onmessage!({ type: "load-handoffs", revision: 62 });
    const closing = f.ui.onmessage!({ type: "close" });
    await Promise.resolve();
    expect(f.closePlugin).not.toHaveBeenCalled();
    release();
    await Promise.all([saving, reading, closing]);
    expect(messages.find((m) => m.revision === 62)?.handoffs).toEqual([record]);
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    expect(f.closePlugin).toHaveBeenCalledOnce();
    f.clientStorage.getAsync.mockRejectedValue(
      new Error("secret-test-exception"),
    );
    await f.ui.onmessage!({ type: "load-handoffs", revision: 63 });
    expect(messages.at(-1)).toMatchObject({
      revision: 63,
      error: "Saved design codes could not be stored or read.",
    });
    expect(JSON.stringify(messages)).not.toContain("secret-test-exception");
  });
  it("serializes preference writes, reads and close so an older write cannot win", async () => {
    const { f, messages } = await setup();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => (release = resolve));
    let stored: any;
    let writes = 0;
    f.clientStorage.setAsync.mockImplementation(async (key, value) => {
      if (key === REVIEW_PREFERENCES_KEY) {
        if (++writes === 1) await waiting;
        stored = value;
      }
    });
    f.clientStorage.getAsync.mockImplementation(async () => stored);
    const first = f.ui.onmessage!({
      type: "save-review-preferences",
      revision: 1,
      reviewPreferences: { version: 1, enabled: false, rules: [] },
    });
    const second = f.ui.onmessage!({
      type: "save-review-preferences",
      revision: 2,
      reviewPreferences: { version: 1, enabled: true, rules: [] },
    });
    const read = f.ui.onmessage!({
      type: "load-review-preferences",
      revision: 3,
    });
    const close = f.ui.onmessage!({ type: "close" });
    await Promise.resolve();
    expect(f.closePlugin).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second, read, close]);
    expect(stored.enabled).toBe(true);
    expect(messages.find((m) => m.revision === 3)?.preferences.enabled).toBe(
      true,
    );
    expect(f.closePlugin).toHaveBeenCalledOnce();
  });
  it("reports storage failures without leaking exception bodies", async () => {
    const { f, messages } = await setup();
    f.clientStorage.getAsync.mockRejectedValue(new Error("dummy-secret-error"));
    f.clientStorage.setAsync.mockRejectedValue(new Error("dummy-secret-error"));
    await f.ui.onmessage!({ type: "load-cloud-settings", revision: 1 });
    expect(messages.at(-1)).toEqual({
      type: "cloud-storage-error",
      action: "load",
      revision: 1,
    });
    await f.ui.onmessage!({
      type: "save-cloud-settings",
      cloud: { key: "dummy-key" },
      revision: 2,
    });
    expect(messages.at(-1)).toEqual({
      type: "cloud-storage-error",
      action: "save",
      revision: 2,
    });
    expect(JSON.stringify(messages)).not.toContain("dummy-secret-error");
  });
  it("completes a real controller analysis with serializable output", async () => {
    const { f, messages } = await setup();
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const result = messages.find((m) => m.type === "result").result;
    expect(result.package.roots[0].className).toBe("ScreenGui");
    expect(result.package.stats.native).toBe(1);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it("migrates existing Figma preferences to the desktop screen and persists a custom screen", async () => {
    const { f, messages } = await setup();
    let saved: any = { ...DEFAULT_OPTIONS };
    f.clientStorage.getAsync.mockImplementation(async (key) =>
      key === "framebridge-options" ? saved : undefined,
    );
    f.clientStorage.setAsync.mockImplementation(async (key, value) => {
      if (key === "framebridge-options") saved = value;
    });
    await f.ui.onmessage!({ type: "ready" });
    expect(messages.find((m) => m.type === "settings").options).toMatchObject({
      screenSize: [1920, 1080],
      rootPlacement: "center",
    });
    messages.length = 0;
    await f.ui.onmessage!({
      type: "analyze",
      options: {
        ...DEFAULT_OPTIONS,
        screenSize: [2560, 1440],
        rootPlacement: "top-left",
      },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(
      messages.find((m) => m.type === "result").result.package.roots[0]
        .referenceSize,
    ).toEqual([2560, 1440]);
    messages.length = 0;
    await f.ui.onmessage!({ type: "ready" });
    expect(messages.find((m) => m.type === "settings").options).toMatchObject({
      screenSize: [2560, 1440],
      rootPlacement: "top-left",
    });
  });
  it("retains an explicit selected-frame screen preference instead of restoring the desktop default", async () => {
    const { f, messages } = await setup();
    f.clientStorage.getAsync.mockImplementation(async (key) =>
      key === "framebridge-options"
        ? { ...DEFAULT_OPTIONS, screenSize: null }
        : undefined,
    );
    await f.ui.onmessage!({ type: "ready" });
    const options = messages.find((m) => m.type === "settings").options;
    expect(options.screenSize).toBeNull();
    messages.length = 0;
    await f.ui.onmessage!({ type: "analyze", options });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(
      messages.find((m) => m.type === "result").result.package.roots[0]
        .referenceSize,
    ).toEqual([400, 300]);
  });
  it("analyzes and saves a ViewportFrame assignment with typed 3D lighting", async () => {
    const { f, messages, selected } = await setup();
    const layerOverrides = {
      [selected.id]: {
        renderMode: "native",
        className: "ViewportFrame",
        properties: {
          LightDirection: { type: "Vector3", value: [-1, -2, -3] },
        },
      },
    };
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const result = messages.find((m) => m.type === "result").result;
    expect(result.package.roots[0].children[0]).toMatchObject({
      className: "ViewportFrame",
      properties: { LightDirection: { type: "Vector3", value: [-1, -2, -3] } },
    });
    expect(result.package.assets).toHaveLength(0);
    expect(f.root.setPluginData).toHaveBeenCalledWith(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    expect(
      JSON.parse(JSON.stringify(result)).package.roots[0].children[0].properties
        .LightDirection.value,
    ).toEqual([-1, -2, -3]);
  });
  it("persists a two-layer batch through one controller analysis and restores it on reopen", async () => {
    const { f, messages, selected } = await setup();
    const a = frame({ id: "batch-a", name: "Panel A", parent: selected });
    const b = frame({
      id: "batch-b",
      name: "Panel B",
      parent: selected,
      width: 240,
      height: 180,
    });
    selected.children = [a, b] as any;
    const layerOverrides = Object.fromEntries(
      [a, b].map((layer) => [
        layer.id,
        {
          className: "ScrollingFrame",
          renderMode: "native",
          properties: { ScrollBarThickness: 12, Rotation: 15 },
        },
      ]),
    );
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const result = messages.find((m) => m.type === "result").result;
    const children = result.package.roots[0].children[0].children.filter(
      (node: any) => [a.id, b.id].includes(node.id),
    );
    expect(children).toHaveLength(2);
    for (const node of children)
      expect(node).toMatchObject({
        className: "ScrollingFrame",
        properties: { ScrollBarThickness: 12, Rotation: 15 },
      });
    expect(f.root.setPluginData).toHaveBeenCalledTimes(1);
    expect(f.root.setPluginData).toHaveBeenCalledWith(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    f.root.getPluginData = (key?: string) =>
      key === "framebridge-layer-overrides"
        ? JSON.stringify(layerOverrides)
        : "source-id";
    await f.ui.onmessage!({ type: "ready" });
    expect(
      [...messages].reverse().find((message) => message.type === "settings")
        .options.layerOverrides,
    ).toEqual(layerOverrides);
  });
  it("invalidates exports after source property changes", async () => {
    const { messages, pageEvents } = await setup();
    pageEvents.nodechange({
      nodeChanges: [{ node: { id: "1:1" }, type: "PROPERTY_CHANGE" }],
    });
    expect(messages.at(-1).type).toBe("stale");
  });
  it("analyzes pinned sync frames even after the canvas selection changes", async () => {
    const { f, messages, events, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    const other = frame({ id: "other", name: "Other", parent: f.currentPage });
    f.getNodeByIdAsync.mockImplementation(async (id?: string) =>
      id === selected.id ? selected : other,
    );
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    f.currentPage.selection = [other];
    events.selectionchange();
    await f.ui.onmessage!({
      type: "analyze",
      rootIds: [selected.id],
      jobId: "sync-1",
      options: DEFAULT_OPTIONS,
    });
    await vi.waitFor(() =>
      expect(
        messages.some((m) => m.type === "idle" && m.jobId === "sync-1"),
      ).toBe(true),
    );
    expect(
      messages.find((m) => m.type === "result" && m.jobId === "sync-1").result
        .designs[0].id,
    ).toBe(selected.id);
    expect(messages.some((m) => m.type === "sync-source-changed")).toBe(false);
  });
  it("detects edits during a sync render and refuses to deliver the old snapshot", async () => {
    const { f, messages, pageEvents, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    let finish!: (bytes: Uint8Array<ArrayBuffer>) => void;
    selected.exportAsync = vi.fn(
      () =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
          finish = resolve;
        }),
    );
    await f.ui.onmessage!({
      type: "analyze",
      rootIds: [selected.id],
      jobId: "sync-1",
      options: DEFAULT_OPTIONS,
    });
    await vi.waitFor(() => expect(selected.exportAsync).toHaveBeenCalledOnce());
    selected.width += 20;
    pageEvents.nodechange({
      nodeChanges: [
        { node: selected, type: "PROPERTY_CHANGE", properties: ["width"] },
      ],
    });
    expect(
      messages.filter((m) => m.type === "sync-source-changed"),
    ).toHaveLength(1);
    finish(new Uint8Array([1]));
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(messages.find((m) => m.type === "error").message).toContain(
      "changed while analyzing",
    );
    expect(messages.some((m) => m.type === "result")).toBe(false);
  });
  it("ignores unrelated edits and selection changes during a pinned render", async () => {
    const { f, messages, pageEvents, events, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    let finish!: (bytes: Uint8Array<ArrayBuffer>) => void;
    selected.exportAsync = vi.fn(
      () =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
          finish = resolve;
        }),
    );
    await f.ui.onmessage!({
      type: "analyze",
      rootIds: [selected.id],
      jobId: "sync-1",
      options: DEFAULT_OPTIONS,
    });
    await vi.waitFor(() => expect(selected.exportAsync).toHaveBeenCalledOnce());
    const other = frame({ id: "other", parent: f.currentPage });
    pageEvents.nodechange({
      nodeChanges: [
        { node: other, type: "PROPERTY_CHANGE", properties: ["width"] },
      ],
    });
    f.currentPage.selection = [other];
    events.selectionchange();
    finish(new Uint8Array([1]));
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(messages.some((m) => m.type === "sync-source-changed")).toBe(false);
    expect(messages.some((m) => m.type === "error")).toBe(false);
  });
  it("ignores unchanged layout notifications and tracks new and deleted descendants", async () => {
    const { f, messages, pageEvents, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    pageEvents.nodechange({
      nodeChanges: [
        { node: selected, type: "PROPERTY_CHANGE", properties: ["width"] },
      ],
    });
    expect(messages.some((m) => m.type === "sync-source-changed")).toBe(false);
    const child = frame({ id: "new", parent: selected });
    (selected as any).children = [child];
    pageEvents.nodechange({ nodeChanges: [{ node: child, type: "CREATE" }] });
    (selected as any).children = [];
    pageEvents.nodechange({
      nodeChanges: [
        {
          node: { id: child.id, type: "FRAME", removed: true },
          type: "DELETE",
        },
      ],
    });
    expect(
      messages.filter((m) => m.type === "sync-source-changed"),
    ).toHaveLength(2);
  });
  it("reports deleted targets and page changes instead of silently switching to other frames", async () => {
    const { f, messages, pageEvents, events, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    events.currentpagechange();
    expect(
      messages.find((m) => m.type === "sync-target-unavailable").message,
    ).toContain("changed Figma pages");
    messages.length = 0;
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [selected.id] });
    (selected as any).removed = true;
    pageEvents.nodechange({
      nodeChanges: [
        { node: { id: selected.id, removed: true }, type: "DELETE" },
      ],
    });
    expect(
      messages.find((m) => m.type === "sync-target-unavailable").message,
    ).toContain("removed");
  });
  it("does not revive a source watch when its async lookup finishes after sync is disabled", async () => {
    const { f, messages, pageEvents, selected } = await setup();
    (f.currentPage as any).id = "page";
    (selected as any).parent = f.currentPage;
    let finish!: (node: any) => void;
    f.getNodeByIdAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const watching = f.ui.onmessage!({
      type: "watch-sync",
      rootIds: [selected.id],
    });
    await f.ui.onmessage!({ type: "watch-sync", rootIds: [] });
    finish(selected);
    await watching;
    selected.width += 20;
    pageEvents.nodechange({
      nodeChanges: [
        { node: selected, type: "PROPERTY_CHANGE", properties: ["width"] },
      ],
    });
    expect(messages.some((m) => m.type === "sync-source-changed")).toBe(false);
  });
  it("handles an empty selection without producing an export", async () => {
    const { f, messages } = await setup();
    f.currentPage.selection = [];
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "error")).toBe(true),
    );
    expect(messages.find((m) => m.type === "error").message).toContain(
      "Select at least",
    );
  });
  it("cancels even when the selection has no image assets", async () => {
    const { f, messages, selected } = await setup();
    let finish!: (v: Uint8Array<ArrayBuffer>) => void;
    selected.exportAsync = vi.fn(
      () =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
          finish = resolve;
        }),
    );
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await f.ui.onmessage!({ type: "cancel" });
    finish(new Uint8Array([1]));
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "error")).toBe(true),
    );
    expect(messages.find((m) => m.type === "error").message).toBe(
      "Export cancelled.",
    );
    expect(messages.some((m) => m.type === "result")).toBe(false);
  });
  it("keeps layer overrides in the document and global preferences separate", async () => {
    const { f, messages, selected } = await setup();
    const layerOverrides = {
      [selected.id]: {
        name: "ConfiguredFrame",
        properties: { BackgroundTransparency: 0.25 },
      },
    };
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(f.root.setPluginData).toHaveBeenCalledWith(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    expect(f.clientStorage.setAsync.mock.calls[0][1]).not.toHaveProperty(
      "layerOverrides",
    );
    expect(messages.find((m) => m.type === "result").result.designs[0].id).toBe(
      selected.id,
    );
  });
  it("persists changed layer edits without rewriting unchanged global preferences, and still saves new global settings", async () => {
    const { f, messages, selected } = await setup();
    for (const [index, options] of [
      DEFAULT_OPTIONS,
      {
        ...DEFAULT_OPTIONS,
        layerOverrides: { [selected.id]: { name: "Edited layer" } },
      },
      { ...DEFAULT_OPTIONS, rootName: "New screen name" },
    ].entries()) {
      await f.ui.onmessage!({ type: "analyze", options });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(
          index + 1,
        ),
      );
      expect(f.clientStorage.setAsync).toHaveBeenCalledTimes(index < 2 ? 1 : 2);
    }
    expect(f.root.setPluginData).toHaveBeenCalledWith(
      "framebridge-layer-overrides",
      JSON.stringify({ [selected.id]: { name: "Edited layer" } }),
    );
    expect(
      messages.filter((m) => m.type === "result")[1].result.package.roots[0]
        .children[0].name,
    ).toBe("Edited layer");
    expect(
      messages.filter((m) => m.type === "result")[2].result.package.roots[0]
        .name,
    ).toBe("New screen name");
    expect(selected.exportAsync).toHaveBeenCalledOnce();
  });
  it("retries failed preference persistence without accepting an incomplete analysis or caching its preview", async () => {
    const { f, messages, selected } = await setup();
    f.clientStorage.setAsync.mockRejectedValueOnce(
      new Error("Device write failed"),
    );
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(messages.some((m) => m.type === "result")).toBe(false);
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    messages.length = 0;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(f.clientStorage.setAsync).toHaveBeenCalledTimes(2);
    expect(selected.exportAsync).toHaveBeenCalledTimes(2);
  });
  it("restores earlier preferences after a newer device write completes during cancellation", async () => {
    const { f, messages } = await setup();
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    messages.length = 0;
    let release!: () => void;
    let saved: any;
    f.clientStorage.setAsync.mockImplementation(async (_key, value) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      saved = value;
    });
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, rootName: "Cancelled preference" },
    });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await f.ui.onmessage!({ type: "cancel" });
    release();
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(messages.some((m) => m.type === "result")).toBe(false);
    expect(saved.rootName).toBe("Cancelled preference");
    messages.length = 0;
    f.clientStorage.setAsync.mockImplementation(async (_key, value) => {
      saved = value;
    });
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(saved.rootName).toBe(DEFAULT_OPTIONS.rootName);
    expect(f.clientStorage.setAsync).toHaveBeenCalledTimes(3);
  });
  it.each(["cancel", "scoped cancel", "source change", "close"] as const)(
    "rejects %s during the final preferences write without replacing the last valid document overrides",
    async (interruption) => {
      const { f, messages, selected, pageEvents, events } = await setup();
      let stored = "";
      f.root.setPluginData.mockImplementation((key: string, value: string) => {
        if (key === "framebridge-layer-overrides") stored = value;
      });
      const baseline = { [selected.id]: { name: "Last valid export" } };
      await f.ui.onmessage!({
        type: "analyze",
        options: { ...DEFAULT_OPTIONS, layerOverrides: baseline },
      });
      await vi.waitFor(() =>
        expect(messages.some((message) => message.type === "idle")).toBe(true),
      );
      const lastValid = messages.find(
        (message) => message.type === "result",
      ).result;
      const lastValidJson = JSON.stringify(lastValid);
      expect(stored).toBe(JSON.stringify(baseline));
      messages.length = 0;
      f.root.setPluginData.mockClear();
      let release!: () => void;
      let writing = false;
      f.clientStorage.setAsync.mockImplementation(async (key: string) => {
        if (key !== "framebridge-options") return;
        writing = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      const jobId =
        interruption === "scoped cancel" ? "sync-final-save" : undefined;
      await f.ui.onmessage!({
        type: "analyze",
        jobId,
        options: {
          ...DEFAULT_OPTIONS,
          rootName: "Pending preferences",
          layerOverrides: { [selected.id]: { name: "Unaccepted export" } },
        },
      });
      await vi.waitFor(() => expect(writing).toBe(true));
      if (interruption === "source change") {
        selected.width += 10;
        pageEvents.nodechange({
          nodeChanges: [
            { node: selected, type: "PROPERTY_CHANGE", properties: ["width"] },
          ],
        });
      } else if (interruption === "close") events.close();
      else await f.ui.onmessage!({ type: "cancel", jobId });
      const messagesAtInterruption = messages.length;
      release();
      if (interruption === "close")
        await new Promise((resolve) => setTimeout(resolve, 20));
      else {
        await vi.waitFor(() =>
          expect(messages.some((message) => message.type === "idle")).toBe(
            true,
          ),
        );
        expect(
          messages.filter((message) => message.type === "idle"),
        ).toHaveLength(1);
        if (jobId)
          expect(
            messages.find((message) => message.type === "idle").jobId,
          ).toBe(jobId);
      }
      expect(f.root.setPluginData).not.toHaveBeenCalled();
      expect(stored).toBe(JSON.stringify(baseline));
      expect(messages.some((message) => message.type === "result")).toBe(false);
      expect(JSON.stringify(lastValid)).toBe(lastValidJson);
      if (interruption === "close")
        expect(messages).toHaveLength(messagesAtInterruption);
      else
        expect(messages.find((message) => message.type === "error")).toEqual(
          expect.objectContaining({
            message: expect.stringMatching(/cancelled|selection changed/),
          }),
        );
    },
  );
  it("commits document overrides and publishes once after an uninterrupted final preferences write", async () => {
    const { f, messages, selected } = await setup();
    let release!: () => void;
    let writing = false;
    f.clientStorage.setAsync.mockImplementation(async (key: string) => {
      if (key !== "framebridge-options") return;
      writing = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const layerOverrides = { [selected.id]: { name: "Accepted export" } };
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() => expect(writing).toBe(true));
    expect(f.root.setPluginData).not.toHaveBeenCalled();
    expect(messages.some((message) => message.type === "result")).toBe(false);
    release();
    await vi.waitFor(() =>
      expect(messages.some((message) => message.type === "idle")).toBe(true),
    );
    expect(f.root.setPluginData).toHaveBeenCalledExactlyOnceWith(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    expect(
      messages.filter((message) => message.type === "result"),
    ).toHaveLength(1);
    expect(messages.filter((message) => message.type === "idle")).toHaveLength(
      1,
    );
    expect(messages.some((message) => message.type === "error")).toBe(false);
    expect(
      messages.find((message) => message.type === "result").result.package
        .roots[0].children[0].name,
    ).toBe("Accepted export");
  });
  it("persists interaction roles through the controller and restores them from this document", async () => {
    const { f, messages, selected } = await setup();
    const layerOverrides = {
      [selected.id]: {
        behavior: { role: "panel" as const, initialVisible: false },
      },
    };
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    const compiled = messages.find((m) => m.type === "result").result.package
      .roots[0].children[0];
    expect(compiled.behavior).toEqual({ role: "panel" });
    expect(compiled.properties.Visible).toBe(false);
    expect(f.root.setPluginData).toHaveBeenCalledWith(
      "framebridge-layer-overrides",
      JSON.stringify(layerOverrides),
    );
    f.root.getPluginData = (key?: string) =>
      key === "framebridge-layer-overrides"
        ? JSON.stringify(layerOverrides)
        : "source-id";
    messages.length = 0;
    await f.ui.onmessage!({ type: "ready" });
    expect(
      messages.find((m) => m.type === "settings").options.layerOverrides,
    ).toEqual(layerOverrides);
  });
  it("reads this document's overrides rather than reusing another file's layer IDs", async () => {
    const { f, messages, selected } = await setup();
    const scoped = { [selected.id]: { renderMode: "native" } };
    f.root.getPluginData = (key?: string) =>
      key === "framebridge-layer-overrides"
        ? JSON.stringify(scoped)
        : "source-id";
    f.clientStorage.getAsync = vi.fn(async () => ({
      layerOverrides: { other: { renderMode: "skip" } },
    })) as any;
    await f.ui.onmessage!({ type: "ready" });
    expect(
      messages.find((m) => m.type === "settings").options.layerOverrides,
    ).toEqual(scoped);
  });
  it("overlaps artwork with previews and removes temporary frames when one render fails", async () => {
    const { f, messages, selected } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    let finishPreview!: (bytes: Uint8Array<ArrayBuffer>) => void;
    let failArtwork!: (error: Error) => void;
    selected.exportAsync = vi.fn(
      () =>
        new Promise<Uint8Array<ArrayBuffer>>((r) => {
          finishPreview = r;
        }),
    );
    const scratch = frame({
      id: "scratch",
      children: [],
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(
        () =>
          new Promise((_, reject) => {
            failArtwork = reject;
          }),
      ),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(scratch.exportAsync).toHaveBeenCalledTimes(1),
    );
    expect(selected.exportAsync).toHaveBeenCalledTimes(1);
    failArtwork(new Error("Renderer failed"));
    await Promise.resolve();
    expect(messages.some((m) => m.type === "result")).toBe(false);
    finishPreview(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "error")).toBe(true),
    );
    expect((scratch as any).remove).toHaveBeenCalledTimes(1);
    expect(messages.some((m) => m.type === "result")).toBe(false);
  });
  async function decorationHarness(blend = false, text = false) {
    const env = await setup();
    const { f, selected } = env;
    Object.assign(selected, {
      cornerRadius: 0,
      topLeftRadius: 0,
      topRightRadius: 0,
      bottomLeftRadius: 0,
      bottomRightRadius: 0,
    });
    const shadow = {
      type: "DROP_SHADOW",
      visible: true,
      radius: 4,
      spread: 0,
      offset: { x: 0, y: 0 },
      color: { r: 0.1, g: 0.2, b: 0.5, a: 0.5 },
      blendMode: "NORMAL",
    };
    const child = frame({
      id: "decoration-child",
      name: "Editable child",
      width: 8,
      height: 8,
    });
    const panel = frame({
      ...(text
        ? {
            type: "TEXT",
            characters: "Native text",
            textAlignHorizontal: "LEFT",
            textAlignVertical: "CENTER",
            getStyledTextSegments: () => [
              {
                characters: "Native text",
                fontName: { family: "Roboto", style: "Regular" },
                fontSize: 16,
                fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } }],
                textDecoration: "NONE",
                letterSpacing: { value: 0 },
                textCase: "ORIGINAL",
                paragraphSpacing: 0,
                paragraphIndent: 0,
                listOptions: { type: "NONE" },
              },
            ],
          }
        : {}),
      id: "decoration-panel",
      name: "Panel_button",
      width: 40,
      height: 20,
      opacity: text || blend ? 0.6 : 1,
      children: text ? [] : [child],
      parent: selected,
      relativeTransform: [
        [0, -1, 130],
        [1, 0, 20],
      ],
      fills: blend
        ? [
            {
              type: "SOLID",
              color: { r: 0.2, g: 0.5, b: 0.7 },
              blendMode: "MULTIPLY",
            },
          ]
        : text
          ? [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 0.8 } }]
          : [{ type: "IMAGE", imageHash: "art" }],
      effects: blend ? [] : [shadow],
    });
    selected.children = [panel] as any;
    const copies: any[] = [],
      scratchFrames: any[] = [],
      renders: any[] = [];
    const behavior = {
      hold: false,
      malformedBase: false,
      finish: undefined as undefined | (() => void),
    };
    (panel as any).clone = () => {
      const copy = frame({
        ...panel,
        id: `copy:${copies.length}`,
        children: text ? [] : [frame({ ...child, id: "cloned-child" })],
        resizeWithoutConstraints: vi.fn(),
        absoluteRenderBounds: { x: -100002, y: -100004, width: 44, height: 28 },
        absoluteBoundingBox: { x: -100000, y: -100000, width: 40, height: 20 },
      });
      copies.push(copy);
      return copy;
    };
    f.getNodeByIdAsync = vi.fn(async (id: string) =>
      id === panel.id ? panel : selected,
    ) as any;
    (f as any).createFrame = () => {
      let copy: any;
      const scratch: any = frame({
        id: `scratch:${scratchFrames.length}`,
        appendChild: vi.fn((c: any) => {
          copy = c;
        }),
        remove: vi.fn(),
        resizeWithoutConstraints: vi.fn((w: number, h: number) => {
          scratch.width = w;
          scratch.height = h;
        }),
      });
      scratch.exportAsync = vi.fn(async (settings: any) => {
        const hasEffect = copy.effects.length > 0;
        renders.push({
          settings,
          bounds: [scratch.width, scratch.height],
          hasEffect,
          childVisible: copy.children[0]?.visible,
          transform: structuredClone(copy.relativeTransform),
          backdrop: structuredClone(scratch.fills),
        });
        const w =
            behavior.malformedBase && !hasEffect && !blend
              ? scratch.width + 1
              : scratch.width,
          h = scratch.height;
        const bytes = new Uint8Array(w * h * 4);
        for (let i = 0; i < bytes.length; i += 4)
          bytes.set(hasEffect ? [80, 100, 180, 192] : [120, 100, 140, 128], i);
        const png = Uint8Array.from(
          PNG.sync.write({ width: w, height: h, data: bytes }),
        );
        if (behavior.hold && hasEffect)
          return await new Promise<Uint8Array>((resolve) => {
            behavior.finish = () => resolve(png);
          });
        return png;
      });
      scratchFrames.push(scratch);
      return scratch;
    };
    return { ...env, panel, child, copies, scratchFrames, renders, behavior };
  }
  it("routes native text effects through the opacity-aware ABOVE compositor", async () => {
    const h = await decorationHarness(false, true);
    await h.f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, imageScale: 1 },
    });
    await vi.waitFor(() =>
      expect(h.messages.filter((m) => m.type === "result")).toHaveLength(1),
    );
    const result = h.messages.find((m) => m.type === "result").result;
    const asset = result.package.assets.find(
      (a: any) => a.renderMode === "shadow",
    );
    const pixels = PNG.sync.read(Buffer.from(result.assets[asset.id])).data;
    const helper = flatten(result.package.roots).find(
      (n) => n.id === `${h.panel.id}/effect`,
    )!;
    expect(helper.properties.ImageTransparency).toBe(0.4);
    const b = (128 / 255) * 0.6,
      e = (pixels[3] / 255) * 0.6,
      f = (192 / 255) * 0.6;
    expect(pixels[3]).toBeGreaterThan(90);
    expect(pixels[3]).toBeLessThan(94);
    expect(Math.abs(e + (1 - e) * b - f)).toBeLessThan(3 / 255);
    for (let c = 0; c < 3; c++)
      expect(
        Math.abs(
          (pixels[c] / 255) * e +
            (((1 - e) * [120, 100, 140][c]) / 255) * b -
            ([80, 100, 180][c] / 255) * f,
        ),
      ).toBeLessThan(3 / 255);
    expect(h.renders).toHaveLength(2);
    expect(h.panel.opacity).toBe(0.6);
  });
  it("renders rotated owners in local coordinates, matches two shadow bounds and invalidates only content-shaped effects after child edits", async () => {
    const h = await decorationHarness();
    const serialize = () =>
      JSON.stringify(h.panel, (key, value) =>
        key === "parent" ? undefined : value,
      );
    const original = serialize();
    const run = async (count: number, overrides = {}) => {
      await h.f.ui.onmessage!({
        type: "analyze",
        options: {
          ...DEFAULT_OPTIONS,
          imageScale: 1,
          layerOverrides: overrides,
        },
      });
      await vi.waitFor(() =>
        expect(h.messages.filter((m) => m.type === "result")).toHaveLength(
          count,
        ),
      );
      return h.messages.filter((m) => m.type === "result").at(-1).result;
    };
    const result = await run(1);
    const panel = flatten(result.package.roots).find(
      (n: any) => n.id === h.panel.id,
    )!;
    expect(panel.properties.Rotation).toBe(90);
    expect(
      panel.children.find((n: any) => n.id.endsWith("/effect"))!.decorationRect,
    ).toEqual([-0.05, -0.2, 1.1, 1.4]);
    const shadows = h.renders.filter((r) => r.bounds[0] === 44);
    expect(shadows).toHaveLength(2);
    expect(shadows.map((r) => r.hasEffect)).toEqual([true, false]);
    expect(
      shadows.every(
        (r) =>
          r.settings.colorProfile === "SRGB" &&
          r.settings.useAbsoluteBounds &&
          r.childVisible,
      ),
    ).toBe(true);
    expect(shadows.map((r) => r.bounds)).toEqual([
      [44, 28],
      [44, 28],
    ]);
    expect(shadows.map((r) => r.transform)).toEqual([
      [
        [1, 0, 2],
        [0, 1, 4],
      ],
      [
        [1, 0, 2],
        [0, 1, 4],
      ],
    ]);
    expect(h.renders.find((r) => r.bounds[0] === 40).childVisible).toBe(false);
    expect(serialize()).toBe(original);
    h.child.width = 10;
    await run(2);
    expect(h.renders).toHaveLength(5);
    await run(3, {
      [h.panel.id]: { properties: { BackgroundTransparency: 0.2 } },
    });
    expect(h.renders).toHaveLength(5);
    expect(h.scratchFrames.every((s) => s.remove.mock.calls.length === 1)).toBe(
      true,
    );
  });
  it("includes the source flat backdrop in blend render/cache identity and leaves live content out of its own paint", async () => {
    const h = await decorationHarness(true);
    const run = async (count: number) => {
      await h.f.ui.onmessage!({
        type: "analyze",
        options: { ...DEFAULT_OPTIONS, imageScale: 1 },
      });
      await vi.waitFor(() =>
        expect(h.messages.filter((m) => m.type === "result")).toHaveLength(
          count,
        ),
      );
    };
    await run(1);
    expect(h.renders).toHaveLength(1);
    expect(h.renders[0]).toMatchObject({
      bounds: [40, 20],
      childVisible: false,
      transform: [
        [1, 0, -0],
        [0, 1, -0],
      ],
      settings: { colorProfile: "SRGB" },
      backdrop: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
    });
    h.child.width = 12;
    await run(2);
    expect(h.renders).toHaveLength(1);
    h.selected.fills[0].color = { r: 0.4, g: 0.5, b: 0.6 };
    await run(3);
    expect(h.renders).toHaveLength(2);
    expect(h.renders[1].backdrop[0].color).toEqual({ r: 0.4, g: 0.5, b: 0.6 });
    expect(h.panel.relativeTransform).toEqual([
      [0, -1, 130],
      [1, 0, 20],
    ]);
    expect(h.panel.opacity).toBe(0.6);
    expect(h.child.visible).toBe(true);
    expect(h.scratchFrames.every((s) => s.remove.mock.calls.length === 1)).toBe(
      true,
    );
  });
  it("cancels between shadow passes, cleans every temporary frame and rejects no late results", async () => {
    const h = await decorationHarness();
    h.behavior.hold = true;
    await h.f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, imageScale: 1 },
    });
    await vi.waitFor(() => expect(h.behavior.finish).toBeTypeOf("function"));
    await h.f.ui.onmessage!({ type: "cancel" });
    h.behavior.finish!();
    await vi.waitFor(() =>
      expect(
        h.scratchFrames.every((s) => s.remove.mock.calls.length === 1),
      ).toBe(true),
    );
    expect(h.renders.filter((r) => r.bounds[0] === 44)).toHaveLength(1);
    expect(h.messages.some((m) => m.type === "result")).toBe(false);
    expect(h.panel.effects).toHaveLength(1);
    expect(h.child.visible).toBe(true);
    h.behavior.hold = false;
    await h.f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, imageScale: 1 },
    });
    await vi.waitFor(() =>
      expect(h.messages.filter((m) => m.type === "result")).toHaveLength(1),
    );
    expect(h.renders.filter((r) => r.bounds[0] === 44)).toHaveLength(3);
  });
  it("rejects mismatched shadow passes, cleans up and retries without poisoned cached artwork", async () => {
    const h = await decorationHarness();
    h.behavior.malformedBase = true;
    await h.f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, imageScale: 1 },
    });
    await vi.waitFor(() =>
      expect(h.messages.some((m) => m.type === "error")).toBe(true),
    );
    expect(h.messages.some((m) => m.type === "result")).toBe(false);
    expect(h.scratchFrames.every((s) => s.remove.mock.calls.length === 1)).toBe(
      true,
    );
    h.behavior.malformedBase = false;
    await h.f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, imageScale: 1 },
    });
    await vi.waitFor(() =>
      expect(h.messages.filter((m) => m.type === "result")).toHaveLength(1),
    );
    expect(h.renders.filter((r) => r.bounds[0] === 44)).toHaveLength(4);
    expect(h.panel.effects).toHaveLength(1);
  });
  it("renders container fills without content/effects, reuses them after child edits and isolates subtree cache entries", async () => {
    const { f, messages, selected } = await setup();
    const child = frame({
      id: "live-child",
      name: "Editable child",
      width: 60,
      height: 30,
    });
    selected.children = [child] as any;
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    selected.opacity = 0.6;
    selected.effects = [{ type: "LAYER_BLUR", radius: 8 }] as any;
    selected.layoutMode = "VERTICAL";
    const copies: any[] = [];
    const removeScratch = vi.fn();
    const scratch = frame({
      id: "scratch",
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: removeScratch,
      exportAsync: vi.fn(async () => iconPng()),
    });
    (selected as any).clone = () => {
      const copy = frame({
        id: "clone",
        layoutMode: "VERTICAL",
        opacity: selected.opacity,
        effects: selected.effects,
        children: [frame({ id: "copy-child" })],
        strokes: [{ type: "SOLID" }],
        resizeWithoutConstraints: vi.fn(),
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
      copies.push(copy);
      return copy;
    };
    (f as any).createFrame = () => scratch;
    for (let index = 0; index < 4; index++) {
      if (index === 1) child.width = 80;
      if (index === 2)
        selected.fills = [{ type: "IMAGE", imageHash: "changed" }] as any;
      await f.ui.onmessage!({
        type: "analyze",
        options: {
          ...DEFAULT_OPTIONS,
          layerOverrides:
            index === 3 ? { [selected.id]: { renderMode: "image" } } : {},
        },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(
          index + 1,
        ),
      );
      const result = messages.filter((m) => m.type === "result")[index].result;
      expect(result.designs[0].rasterBounds !== undefined).toBe(index === 3);
      expect(result.package.assets[0].renderMode).toBe(
        index === 3 ? undefined : "fills",
      );
      expect(child.visible).toBe(true);
      expect(selected.opacity).toBe(0.6);
      expect(selected.effects).toHaveLength(1);
    }
    expect(scratch.exportAsync).toHaveBeenCalledTimes(3);
    expect(copies[0].children[0].visible).toBe(false);
    expect(copies[0].layoutMode).toBe("NONE");
    expect(copies[0].resizeWithoutConstraints).toHaveBeenCalledWith(400, 300);
    expect(copies[0].opacity).toBe(1);
    expect(copies[0].effects).toEqual([]);
    expect(copies[0].strokes).toEqual([]);
    expect(copies[2].children[0].visible).toBe(true);
    expect(copies[2].opacity).toBe(0.6);
    expect(copies[2].effects).toHaveLength(1);
    expect(removeScratch).toHaveBeenCalledTimes(3);
  });
  it("reuses PNGs and source previews for property edits, but rerenders changed artwork", async () => {
    const { f, messages, selected } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    const scratch = frame({
      id: "scratch",
      children: [],
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    for (let i = 0; i < 2; i++) {
      await f.ui.onmessage!({
        type: "analyze",
        options: {
          ...DEFAULT_OPTIONS,
          layerOverrides: i
            ? { [selected.id]: { properties: { BackgroundTransparency: 0.5 } } }
            : {},
        },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(i + 1),
      );
    }
    expect(scratch.exportAsync).toHaveBeenCalledTimes(1);
    expect(selected.exportAsync).toHaveBeenCalledTimes(1);
    const native = frame({ id: "native" });
    f.currentPage.selection = [selected, native];
    for (let i = 0; i < 2; i++) {
      native.width += 10;
      await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(3 + i),
      );
    }
    expect(scratch.exportAsync).toHaveBeenCalledTimes(1);
    expect(selected.exportAsync).toHaveBeenCalledTimes(1);
    selected.width += 10;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "result")).toHaveLength(5),
    );
    expect(scratch.exportAsync).toHaveBeenCalledTimes(2);
    expect((scratch as any).remove).toHaveBeenCalledTimes(2);
  });
  it("renders confirmed scrollbar art once for three slices, caches changed caps, and persists only configuration", async () => {
    const { f, messages, selected } = await setup();
    const art = frame({
      id: "scroll-art",
      name: "Inventory ScrollBar",
      type: "VECTOR",
      width: 8,
      height: 64,
    });
    const row = frame({ id: "row", width: 190, height: 600 });
    selected.children = [row, art] as any;
    const raw = scrollbarPng();
    const scratch = frame({
      id: "scratch",
      children: [],
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(async () => raw),
    });
    (art as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: { x: -100000, y: -100000, width: 8, height: 64 },
      });
    (f as any).createFrame = () => scratch;
    f.getNodeByIdAsync.mockImplementation(async (id?: string) =>
      id === "scroll-art" ? art : selected,
    );
    for (const [i, startCap] of [0.125, 0.25, 0.125].entries()) {
      const layerOverrides = {
        [selected.id]: {
          scrollbar: {
            artworkId: art.id,
            axis: "Y",
            startCap,
            endCap: 0.125,
            thickness: 8,
          },
        },
      };
      await f.ui.onmessage!({
        type: "analyze",
        options: { ...DEFAULT_OPTIONS, layerOverrides },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(i + 1),
      );
      const result = messages.filter((m) => m.type === "result")[i].result;
      expect(result.package.assets).toHaveLength(3);
      const dimensions = result.package.assets
        .map((a: any) => PNG.sync.read(Buffer.from(result.assets[a.id])))
        .map((p: any) => [p.width, p.height]);
      expect(dimensions).toEqual(
        startCap === 0.125
          ? [
              [8, 8],
              [8, 48],
              [8, 8],
            ]
          : [
              [8, 16],
              [8, 40],
              [8, 8],
            ],
      );
      expect(result.package.assets.map((a: any) => a.pixelSize)).toEqual(
        dimensions,
      );
      expect(f.root.setPluginData).toHaveBeenCalledWith(
        "framebridge-layer-overrides",
        JSON.stringify(layerOverrides),
      );
    }
    expect(scratch.exportAsync).toHaveBeenCalledOnce();
    expect(selected.exportAsync).toHaveBeenCalledOnce();
    expect((scratch as any).remove).toHaveBeenCalledOnce();
  });
  it("prepares image variants without rerendering unchanged Figma artwork and persists the choice", async () => {
    const { f, messages, selected } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    const raw = iconPng();
    const scratch = frame({
      id: "scratch",
      children: [],
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(async () => raw),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    const choices = [
      undefined,
      { whiteMask: true },
      { whiteMask: true },
      { edgeCleanup: false },
      { edgeCleanup: true },
      { edgeCleanup: false, whiteMask: true },
      { edgeCleanup: false, whiteMask: false },
    ];
    for (let i = 0; i < choices.length; i++) {
      const layerOverrides = {
        [selected.id]: {
          imageProcessing: choices[i],
          properties: {
            ImageColor3: { type: "Color3", value: [i / 10, 0.7, 1] },
          },
        },
      };
      await f.ui.onmessage!({
        type: "analyze",
        options: { ...DEFAULT_OPTIONS, layerOverrides },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(i + 1),
      );
      const result = messages.filter((m) => m.type === "result")[i].result;
      const asset = result.package.assets[0];
      const bytes = Buffer.from(result.assets[asset.id]);
      const before = PNG.sync.read(Buffer.from(raw)),
        after = PNG.sync.read(bytes);
      expect([after.width, after.height]).toEqual([
        before.width,
        before.height,
      ]);
      for (let p = 0; p < after.data.length; p += 4) {
        expect(after.data[p + 3]).toBe(before.data[p + 3]);
        if (choices[i]?.whiteMask)
          expect(Array.from(after.data.slice(p, p + 3))).toEqual([
            255, 255, 255,
          ]);
      }
      if (choices[i]?.edgeCleanup === false && !choices[i]?.whiteMask)
        expect(bytes).toEqual(Buffer.from(raw));
      if (!choices[i]) expect(after.data).not.toEqual(before.data);
      expect(asset.processing?.edgeCleanup === true).toBe(
        choices[i]?.edgeCleanup !== false,
      );
      expect(asset.id).toContain(
        choices[i]?.whiteMask
          ? ":mask-v1"
          : choices[i]?.edgeCleanup
            ? ":bleed-v2"
            : `image:${selected.id}`,
      );
      expect(f.root.setPluginData).toHaveBeenCalledWith(
        "framebridge-layer-overrides",
        JSON.stringify(layerOverrides),
      );
    }
    expect(scratch.exportAsync).toHaveBeenCalledOnce();
    expect(selected.exportAsync).toHaveBeenCalledOnce();
    expect((scratch as any).remove).toHaveBeenCalledOnce();
  });
  it("retains slice/tile settings and actual PNG bounds while reusing one source render", async () => {
    const { f, messages, selected } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    const scratch = frame({
      id: "scratch",
      children: [],
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(async () => iconPng()),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    for (const [index, right] of [8, 6].entries()) {
      const layerOverrides = {
        [selected.id]: {
          properties: {
            ScaleType: { type: "Enum", value: ["ScaleType", "Slice"] },
            SliceCenter: { type: "Rect", value: [1, 1, right, 4] },
            SliceScale: 0.5,
          },
        },
      };
      await f.ui.onmessage!({
        type: "analyze",
        options: { ...DEFAULT_OPTIONS, layerOverrides },
      });
      await vi.waitFor(() =>
        expect(messages.filter((m) => m.type === "result")).toHaveLength(
          index + 1,
        ),
      );
      const result = messages.filter((m) => m.type === "result")[index].result;
      expect(result.package.assets[0].pixelSize).toEqual([7, 5]);
      expect(
        result.package.issues.some(
          (issue: any) => issue.code === "image-slice-bounds",
        ),
      ).toBe(index === 0);
      expect(f.root.setPluginData).toHaveBeenCalledWith(
        "framebridge-layer-overrides",
        JSON.stringify(layerOverrides),
      );
    }
    const layerOverrides = {
      [selected.id]: {
        properties: {
          ScaleType: { type: "Enum", value: ["ScaleType", "Tile"] },
          TileSize: { type: "UDim2", value: [0.25, 10, 0, 24] },
        },
      },
    };
    await f.ui.onmessage!({
      type: "analyze",
      options: { ...DEFAULT_OPTIONS, layerOverrides },
    });
    await vi.waitFor(() =>
      expect(messages.filter((m) => m.type === "result")).toHaveLength(3),
    );
    const result = messages.filter((m) => m.type === "result")[2].result;
    const image = result.package.roots[0].children[0];
    expect(image.properties.TileSize).toEqual(
      layerOverrides[selected.id].properties.TileSize,
    );
    expect(result.package.assets[0].pixelSize).toEqual([7, 5]);
    expect(scratch.exportAsync).toHaveBeenCalledOnce();
  });
  it("does not cache cancelled artwork under a source signature that the user can undo back to", async () => {
    const { f, messages, selected, pageEvents } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    let finish!: (bytes: Uint8Array) => void;
    const scratch = frame({
      id: "scratch",
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(
        () =>
          new Promise<Uint8Array>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() => expect(scratch.exportAsync).toHaveBeenCalledOnce());
    selected.width += 10;
    pageEvents.nodechange({
      nodeChanges: [
        { node: selected, type: "PROPERTY_CHANGE", properties: ["width"] },
      ],
    });
    finish(batchPng(99));
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "idle")).toBe(true),
    );
    expect(messages.some((m) => m.type === "result")).toBe(false);
    selected.width -= 10;
    scratch.exportAsync.mockImplementation(async () => batchPng(42));
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "result")).toBe(true),
    );
    expect(scratch.exportAsync).toHaveBeenCalledTimes(2);
    expect(
      Object.values(messages.find((m) => m.type === "result").result.assets),
    ).toEqual([Array.from(batchPng(42))]);
    expect(selected.exportAsync).toHaveBeenCalledTimes(2);
  });
  it("removes temporary render frames synchronously when the plugin closes mid-export", async () => {
    const { f, messages, selected, events } = await setup();
    selected.fills = [{ type: "IMAGE", imageHash: "art" }] as any;
    let finish!: (bytes: Uint8Array) => void;
    const scratch = frame({
      id: "scratch",
      appendChild: vi.fn(),
      resizeWithoutConstraints: vi.fn(),
      remove: vi.fn(),
      exportAsync: vi.fn(
        () =>
          new Promise<Uint8Array>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    (selected as any).clone = () =>
      frame({
        id: "clone",
        absoluteBoundingBox: {
          x: -100000,
          y: -100000,
          width: 400,
          height: 300,
        },
      });
    (f as any).createFrame = () => scratch;
    await f.ui.onmessage!({ type: "analyze", options: DEFAULT_OPTIONS });
    await vi.waitFor(() => expect(scratch.exportAsync).toHaveBeenCalledOnce());
    events.close();
    expect((scratch as any).remove).toHaveBeenCalledOnce();
    const sentBeforeClose = messages.length;
    finish(new Uint8Array([42]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((scratch as any).remove).toHaveBeenCalledOnce();
    expect(messages).toHaveLength(sentBeforeClose);
  });
});
