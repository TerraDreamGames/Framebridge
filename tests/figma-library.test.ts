import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTypedLibrary } from "../scripts/typed-library.mjs";
import { compile } from "../packages/core/src/compiler";
import {
  DEFAULT_OPTIONS,
  flatten,
  type AnalysisResult,
  type ExportOptions,
} from "../packages/core/src/types";
import { snapshot } from "../plugins/figma/src/snapshot";
import { DEFAULT_FIGMA_OPTIONS } from "../plugins/figma/src/design-screen";
import { iconPng, PNG } from "./image-tools-fixtures";

let directory: string, code: string, javascript: string;
let modules: string[];
beforeAll(async () => {
  await mkdir(".artifacts", { recursive: true });
  directory = await mkdtemp(resolve(".artifacts/library-tests-"));
  ({ code, modules } = await buildTypedLibrary({
    commandId: "local-build-check",
  }));
  javascript = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    },
  }).outputText;
}, 20000);
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true });
});

async function diagnostics(source: string) {
  const path = resolve(directory, "generated.ts");
  await writeFile(path, source);
  const program = ts.createProgram([path], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    lib: ["lib.es2020.d.ts"],
    types: ["@figma/plugin-typings"],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
type MockNode = {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  children: MockNode[];
  parent: unknown;
  exportAsync(): Promise<Uint8Array>;
  [key: string]: unknown;
};
const mixed = Symbol("mixed");
function frame(extra: Record<string, unknown> = {}): MockNode {
  return {
    id: "frame",
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
    exportAsync: async () => iconPng(),
    setRelaunchData: vi.fn(),
    ...extra,
  };
}
type HostMessage = {
  type: string;
  result?: AnalysisResult;
  message?: string;
  [key: string]: unknown;
};
function setup(selected = frame(), bytes = iconPng()) {
  const messages: HostMessage[] = [];
  const page = { selection: [selected], on: vi.fn(), off: vi.fn() };
  selected.parent = page;
  const scratch = {
    ...frame({ id: "scratch", name: "Scratch" }),
    appendChild: vi.fn(),
    resizeWithoutConstraints: vi.fn(),
    remove: vi.fn(),
    exportAsync: vi.fn(async () => bytes),
  };
  const find = (node: MockNode, id: string): MockNode | undefined =>
    node.id === id
      ? node
      : node.children.map((child) => find(child, id)).find(Boolean);
  const host = {
    mixed,
    currentPage: page,
    root: {
      id: "document",
      getPluginData: () => "library-qa-source",
      setPluginData: vi.fn(),
      setRelaunchData: vi.fn(),
    },
    ui: {
      postMessage: (message: HostMessage) => messages.push(message),
      resize: vi.fn(),
      onmessage: undefined as
        undefined | ((message: Record<string, unknown>) => Promise<void>),
    },
    showUI: vi.fn(),
    on: vi.fn(),
    closePlugin: vi.fn(),
    clientStorage: {
      getAsync: vi.fn(async (_key?: string): Promise<unknown> => undefined),
      setAsync: vi.fn(async (_key: string, _value: unknown) => {}),
    },
    createFrame: () => scratch,
    getNodeByIdAsync: async (id: string) => find(selected, id),
    base64Encode: (value: Uint8Array) => Buffer.from(value).toString("base64"),
    viewport: { scrollAndZoomIntoView: vi.fn() },
  };
  // No browser window, crypto, fetch, require or import machinery is available.
  runInNewContext(javascript, {
    figma: host,
    __html__: "<html/>",
    structuredClone,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
  });
  return { host, messages, scratch };
}
async function analyze(
  fixture: ReturnType<typeof setup>,
  overrides = {},
  options: Partial<ExportOptions> = {},
) {
  await fixture.host.ui.onmessage!({
    type: "analyze",
    options: { ...DEFAULT_OPTIONS, ...options, layerOverrides: overrides },
  });
  await vi.waitFor(() =>
    expect(fixture.messages.some((m) => m.type === "idle")).toBe(true),
  );
  return fixture.messages.find((m) => m.type === "result")?.result;
}

describe("private account-library entrypoint", () => {
  it("strictly checks the complete source graph with Figma's ES-only typings", async () => {
    expect(await diagnostics(code)).toEqual([]);
    expect(modules).toContain("plugins/figma/src/classic-controller.ts");
    for (const name of [
      "motion",
      "world-space",
      "scrollbar",
      "structure-review",
    ])
      expect(modules).toContain(`packages/core/src/${name}.ts`);
    expect(code).not.toMatch(/\bimport\s*(?:["'{*]|type\b)|\bimport\s*\(/);
    expect(code).not.toContain("crypto.subtle");
    expect(code).not.toContain("@ts-nocheck");
    // Deliberately break an owned annotation: the vendor adapter must not hide it.
    expect(
      (
        await diagnostics(
          code.replace(
            "export type Color = {",
            "export type Color = { broken: MissingType;",
          ),
        )
      ).some((message) => message.includes("MissingType")),
    ).toBe(true);
  }, 20000);

  it("preserves named aliases, namespace imports, shorthand, shadows, cycles and inline types", async () => {
    await writeFile(
      resolve(directory, "a.ts"),
      `
      import { callBack } from "./b";
      export type Paint = { name: string };
      export const label = "first";
      export function draw() { return label; }
      export function call() { return callBack(); }
    `,
    );
    await writeFile(
      resolve(directory, "b.ts"),
      `
      import { draw } from "./a";
      const label = "second";
      export function callBack() { return draw() + label; }
    `,
    );
    await writeFile(
      resolve(directory, "entry.ts"),
      `
      import { draw as render, call, type Paint as DataPaint } from "./a";
      import * as artwork from "./a";
      export function startClassicController() {
        const own: DataPaint = { name: "own" };
        const inline: import("./a").Paint = own;
        const fn: typeof import("./a").draw = render;
        const native: Paint = { type: "SOLID", color: { r: 1, g: 0, b: 0 } };
        const shorthand = { render };
        const shadow = (render: string) => render;
        figma.root.setRelaunchData({ result: JSON.stringify([
          call(), shorthand.render(), artwork.draw(), shadow("shadow"),
          inline.name, fn(), native.type
        ]) });
      }
    `,
    );
    const bundled = await buildTypedLibrary({
      entrypoint: resolve(directory, "entry.ts"),
      commandId: "alias-test",
    });
    expect(await diagnostics(bundled.code)).toEqual([]);
    const output: Record<string, string>[] = [];
    runInNewContext(
      ts.transpileModule(bundled.code, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
      }).outputText,
      {
        figma: {
          root: {
            setRelaunchData: (value: Record<string, string>) =>
              output.push(value),
          },
        },
      },
    );
    expect(JSON.parse(output[0].result)).toEqual([
      "firstsecond",
      "first",
      "first",
      "shadow",
      "own",
      "first",
      "SOLID",
    ]);
  }, 20000);

  it("runs current native layout and motion conversion with the same result as the normal compiler", async () => {
    const row = frame({
      id: "row",
      name: "Shop_button_smooth",
      width: 120,
      height: 48,
      topLeftRadius: 12,
      topRightRadius: 4,
      bottomLeftRadius: 4,
      bottomRightRadius: 12,
    });
    const selected = frame({
      id: "shop",
      name: "Shop",
      layoutMode: "VERTICAL",
      itemSpacing: 8,
      primaryAxisAlignItems: "MIN",
      counterAxisAlignItems: "MIN",
      primaryAxisSizingMode: "FIXED",
      counterAxisSizingMode: "FIXED",
      layoutWrap: "NO_WRAP",
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
      children: [row],
    });
    row.parent = selected;
    const fixture = setup(selected);
    const result = (await analyze(fixture, {}, { layout: "responsive" }))!;
    expect(result, JSON.stringify(fixture.messages)).toBeDefined();
    vi.stubGlobal("figma", fixture.host);
    const expected = compile(
      [snapshot(selected as unknown as SceneNode)],
      "library-qa-source",
      { ...DEFAULT_FIGMA_OPTIONS, layout: "responsive" },
    );
    vi.unstubAllGlobals();
    expect(result.package.roots).toEqual(expected.roots);
    expect(
      flatten(result.package.roots).some((n) => n.className === "UIListLayout"),
    ).toBe(true);
    expect(
      flatten(result.package.roots).some((n) => n.behavior?.motion?.hover),
    ).toBe(true);
    expect(fixture.host.root.setRelaunchData).toHaveBeenCalledWith({
      "local-build-check": "Open Framebridge",
    });
  });

  it.each([8, 16])(
    "ships the actual PNG codecs and preserves %s-bit alpha during controller image preparation",
    async (depth) => {
      const bytes =
        depth === 8
          ? iconPng()
          : new Uint8Array(
              PNG.sync.write(
                {
                  width: 2,
                  height: 1,
                  data: new Uint16Array([
                    1000, 32000, 65535, 10000, 500, 600, 700, 65535,
                  ]),
                },
                { bitDepth: 16 },
              ),
            );
      const width = depth === 8 ? 7 : 2,
        height = depth === 8 ? 5 : 1;
      const art = frame({
        id: "icon",
        name: "Icon",
        type: "VECTOR",
        width,
        height,
        clone: () =>
          frame({
            id: "clone",
            width,
            height,
            absoluteRenderBounds: { x: -100000, y: -100000, width, height },
          }),
      });
      const selected = frame({ children: [art] });
      art.parent = selected;
      const fixture = setup(selected, bytes);
      const result = (await analyze(fixture, {
        icon: { imageProcessing: { whiteMask: true } },
      }))!;
      expect(result).toBeDefined();
      const pixels = PNG.sync.read(
        Buffer.from(Object.values(result.assets)[0]),
        { skipRescale: true },
      );
      const original = PNG.sync.read(Buffer.from(bytes), { skipRescale: true });
      expect([pixels.width, pixels.height]).toEqual([width, height]);
      for (let i = 0; i < pixels.data.length; i += 4) {
        expect(Array.from(pixels.data.slice(i, i + 3))).toEqual(
          Array(3).fill(depth === 8 ? 255 : 65535),
        );
        expect(pixels.data[i + 3]).toBe(original.data[i + 3]);
      }
      expect(fixture.scratch.remove).toHaveBeenCalledOnce();
    },
  );

  it("retains malformed-PNG rejection and temporary-layer cleanup in the bundled controller", async () => {
    const bytes = iconPng();
    bytes[bytes.length - 1] ^= 1;
    const art = frame({
      id: "icon",
      type: "VECTOR",
      width: 7,
      height: 5,
      clone: () =>
        frame({
          id: "clone",
          absoluteRenderBounds: { x: -100000, y: -100000, width: 7, height: 5 },
        }),
    });
    const selected = frame({ children: [art] });
    art.parent = selected;
    const fixture = setup(selected, bytes);
    expect(
      await analyze(fixture, {
        icon: { imageProcessing: { whiteMask: true } },
      }),
    ).toBeUndefined();
    expect(
      fixture.messages.some(
        (m) => m.type === "error" && m.message?.includes("checksum"),
      ),
    ).toBe(true);
    expect(fixture.scratch.remove).toHaveBeenCalledOnce();
  });

  it("keeps local resizing and review storage while blocking authenticated connection commands", async () => {
    const { host, messages } = setup();
    for (const type of [
      "load-cloud-settings",
      "save-cloud-settings",
      "load-studio-connection",
      "save-studio-connection",
      "load-handoffs",
      "save-handoffs",
      "load-roblox-account",
      "save-roblox-account",
      "open-roblox-authorization",
      "load-review-sync",
      "save-review-sync",
    ])
      await host.ui.onmessage!({ type, cloud: { key: "test-secret" } });
    expect(host.clientStorage.getAsync).not.toHaveBeenCalled();
    expect(host.clientStorage.setAsync).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    await host.ui.onmessage!({ type: "watch-sync", rootIds: ["frame"] });
    expect(messages.at(-1)).toMatchObject({
      type: "sync-target-unavailable",
      message: "Automatic sync is unavailable in this build.",
    });
    await host.ui.onmessage!({
      type: "resize",
      width: 1200,
      height: 850,
      persist: true,
    });
    expect(host.ui.resize).toHaveBeenCalledWith(1200, 850);
    await host.ui.onmessage!({ type: "load-review-preferences", revision: 7 });
    expect(messages.at(-1)).toMatchObject({
      type: "review-preferences-response",
      revision: 7,
    });
    expect(JSON.stringify(messages)).not.toContain("test-secret");
  });
});
