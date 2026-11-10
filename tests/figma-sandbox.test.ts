import { beforeAll, describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { createContext, runInContext } from "node:vm";
import { encode, decode } from "fast-png";
import { FIGMA_CONTROLLER_BUILD_OPTIONS } from "../scripts/figma-controller-build.mjs";

let codecs: {
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
};
let controller: string;
beforeAll(async () => {
  const output = await build({
    ...FIGMA_CONTROLLER_BUILD_OPTIONS,
    entryPoints: ["plugins/figma/src/sandbox-text-codecs.ts"],
    globalName: "codecs",
    write: false,
  });
  const context = createContext({});
  runInContext(output.outputFiles![0].text, context);
  codecs = context.codecs;
  controller = (
    await build({ ...FIGMA_CONTROLLER_BUILD_OPTIONS, write: false })
  ).outputFiles![0].text;
});

describe("Figma controller without browser text codecs", () => {
  it("imports a validated PNG through the bundled native controller, preserves existing layers and rolls back a failed layer creation", async () => {
    const bytes = encode({
        width: 2,
        height: 1,
        channels: 4,
        data: new Uint8Array([40, 60, 80, 255, 20, 30, 40, 128]),
      }),
      existing = { id: "existing", name: "Manual settings" },
      messages: any[] = [],
      nodes: any[] = [existing],
      images: Uint8Array[] = [];
    let fail = false;
    const page: any = {
      selection: [existing],
      on: vi.fn(),
      appendChild: (n: any) => {
        if (fail) throw Error("simulated insertion failure");
        if (!nodes.includes(n)) nodes.push(n);
      },
    };
    const api: any = {
      editorType: "figma",
      mode: "default",
      currentPage: page,
      root: { getPluginData: () => "", setPluginData: vi.fn() },
      ui: { postMessage: (m: any) => messages.push(m), resize: vi.fn() },
      showUI: vi.fn(),
      on: vi.fn(),
      notify: vi.fn(),
      clientStorage: {
        getAsync: async () => undefined,
        setAsync: async () => {},
      },
      viewport: { center: { x: 100, y: 80 }, scrollAndZoomIntoView: vi.fn() },
      commitUndo: vi.fn(),
      createImage: (b: Uint8Array) => {
        images.push(b);
        return { hash: "qa-image" };
      },
      createRectangle: () => {
        const node: any = {
          id: "new-" + images.length,
          resize(w: number, h: number) {
            this.width = w;
            this.height = h;
          },
          remove() {
            const at = nodes.indexOf(this);
            if (at >= 0) nodes.splice(at, 1);
          },
        };
        nodes.push(node);
        return node;
      },
    };
    runInContext(
      controller,
      createContext({ figma: api, __html__: "<html/>" }),
    );
    await api.ui.onmessage({
      type: "import-artwork",
      revision: 1,
      artwork: { name: "Cloud icon", png: Array.from(bytes) },
    });
    expect(messages.find((m) => m.revision === 1).imported).toMatchObject({
      name: "Cloud icon",
      width: 2,
      height: 1,
    });
    expect(Array.from(images[0])).toEqual(Array.from(bytes));
    expect(nodes[1]).toMatchObject({
      name: "Cloud icon",
      width: 2,
      height: 1,
      x: 99,
      y: 79.5,
      fills: [{ type: "IMAGE", imageHash: "qa-image", scaleMode: "FILL" }],
      strokes: [],
    });
    expect(nodes[0]).toBe(existing);
    expect(api.commitUndo).toHaveBeenCalledOnce();
    page.selection = [existing];
    fail = true;
    await api.ui.onmessage({
      type: "import-artwork",
      revision: 2,
      artwork: { name: "Failed icon", png: Array.from(bytes) },
    });
    expect(messages.find((m) => m.revision === 2).error).toBeTruthy();
    expect(nodes).toHaveLength(2);
    expect(page.selection).toEqual([existing]);
    for (const input of [
      { name: "Bad", png: [1, 2, 3] },
      { name: "Bad", png: Array.from(bytes), credentials: "no" },
      { name: "Bad", png: [-1] },
    ])
      await api.ui.onmessage({
        type: "import-artwork",
        revision: 3,
        artwork: input,
      });
    expect(images).toHaveLength(2);
    expect(nodes[0]).toEqual(existing);
  });
  it("persists separate artwork grants through controller reopen and waits for writes before close", async () => {
    const data = new Map<string, unknown>([
        ["manual-settings", { keep: true }],
      ]),
      messages: any[] = [];
    let release: () => void,
      began: () => void,
      delay = true;
    const writing = new Promise<void>((r) => (began = r));
    const start = () => {
      const api: any = {
        editorType: "figma",
        mode: "default",
        currentPage: { selection: [], on: vi.fn() },
        root: { getPluginData: () => "", setPluginData: vi.fn() },
        ui: { postMessage: (m: any) => messages.push(m), resize: vi.fn() },
        showUI: vi.fn(),
        on: vi.fn(),
        closePlugin: vi.fn(),
        clientStorage: {
          getAsync: async (k: string) => data.get(k),
          setAsync: async (k: string, v: unknown) => {
            if (delay && k === "framebridge-artwork-access-v1")
              await new Promise<void>((r) => {
                release = r;
                began();
              });
            data.set(k, v);
          },
        },
      };
      runInContext(
        controller,
        createContext({ figma: api, __html__: "<html/>" }),
      );
      return api;
    };
    const access = {
        version: 1,
        origin: "https://relay.test",
        userId: "123",
        grantToken: "a".repeat(64),
        scope: { kind: "personal", id: "123", label: "Creator" },
      },
      first = start(),
      save = first.ui.onmessage({
        type: "save-artwork-access",
        revision: 1,
        artworkAccess: access,
      });
    await writing;
    const close = first.ui.onmessage({ type: "close" });
    await Promise.resolve();
    expect(first.closePlugin).not.toHaveBeenCalled();
    delay = false;
    release!();
    await Promise.all([save, close]);
    expect(first.closePlugin).toHaveBeenCalled();
    const next = start();
    await next.ui.onmessage({ type: "load-artwork-access", revision: 2 });
    expect(messages.find((m) => m.revision === 2).artworkAccess).toEqual(
      access,
    );
    await next.ui.onmessage({
      type: "save-artwork-access",
      revision: 3,
      artworkAccess: { ...access, png: [1] },
    });
    expect(messages.find((m) => m.revision === 3).error).toBeTruthy();
    expect(data.get("framebridge-artwork-access-v1")).toEqual(access);
    await next.ui.onmessage({
      type: "save-artwork-access",
      revision: 4,
      artworkAccess: null,
    });
    expect(data.get("framebridge-artwork-access-v1")).toBeNull();
    expect(data.get("manual-settings")).toEqual({ keep: true });
  });
  it("persists review conventions and scoped sync settings across actual controller restarts and validates malformed saves", async () => {
    const data = new Map<string, unknown>();
    const messages: any[] = [];
    let delaySync = false,
      release: (() => void) | undefined,
      began: (() => void) | undefined;
    const writing = new Promise<void>((resolve) => {
      began = resolve;
    });
    const start = () => {
      const api: any = {
        editorType: "figma",
        mode: "default",
        currentPage: { selection: [], on: vi.fn() },
        root: { getPluginData: () => "", setPluginData: vi.fn() },
        ui: { postMessage: (m: any) => messages.push(m), resize: vi.fn() },
        showUI: vi.fn(),
        on: vi.fn(),
        closePlugin: vi.fn(),
        clientStorage: {
          getAsync: async (k: string) => data.get(k),
          setAsync: async (k: string, v: unknown) => {
            if (delaySync && k === "framebridge-review-sync-v1") {
              await new Promise<void>((resolve) => {
                release = resolve;
                began?.();
              });
            }
            data.set(k, v);
          },
        },
      };
      runInContext(
        controller,
        createContext({ figma: api, __html__: "<html/>" }),
      );
      return api;
    };
    const preferences = {
      version: 1,
      enabled: true,
      rules: [],
      naming: { style: "snake", prefix: "UI_" },
      hints: [
        {
          phrase: "purchase",
          sourceType: "*",
          decision: { kind: "class", value: "TextButton" },
        },
      ],
    };
    const syncSettings = {
      version: 1,
      origin: "https://relay.test",
      userId: "123",
      grantToken: "a".repeat(64),
      scope: { kind: "personal", id: "123", label: "Creator" },
    };
    const first = start();
    await first.ui.onmessage({
      type: "save-review-preferences",
      revision: 1,
      reviewPreferences: preferences,
    });
    delaySync = true;
    const save = first.ui.onmessage({
      type: "save-review-sync",
      revision: 2,
      syncSettings,
    });
    await writing;
    const close = first.ui.onmessage({ type: "close" });
    await Promise.resolve();
    expect(first.closePlugin).not.toHaveBeenCalled();
    delaySync = false;
    release?.();
    await Promise.all([save, close]);
    expect(first.closePlugin).toHaveBeenCalled();
    const next = start();
    await next.ui.onmessage({ type: "load-review-preferences", revision: 3 });
    await next.ui.onmessage({ type: "load-review-sync", revision: 4 });
    expect(messages.find((m) => m.revision === 3).preferences).toEqual(
      preferences,
    );
    expect(messages.find((m) => m.revision === 4).syncSettings).toEqual(
      syncSettings,
    );
    await next.ui.onmessage({
      type: "save-review-sync",
      revision: 5,
      syncSettings: { ...syncSettings, package: { secret: "no" } },
    });
    expect(messages.find((m) => m.revision === 5).error).toBeTruthy();
    expect(data.get("framebridge-review-sync-v1")).toEqual(syncSettings);
    await next.ui.onmessage({
      type: "save-review-sync",
      revision: 6,
      syncSettings: null,
    });
    expect(data.get("framebridge-review-sync-v1")).toBeNull();
    expect(data.get("framebridge-review-preferences-v1")).toEqual(preferences);
  });
  it("matches native UTF-8 encoding, including unmatched surrogates and bounded destinations", () => {
    const native = new TextEncoder(),
      sandbox = new codecs.TextEncoder();
    for (const text of [
      "",
      "ASCII",
      "Café · 日本語",
      "🎮 😀",
      "\ud800 A \udfff",
      "𐀀\ufeff€",
    ]) {
      expect(Array.from(sandbox.encode(text))).toEqual(
        Array.from(native.encode(text)),
      );
      for (let size = 0; size <= 20; size++) {
        const actual = new Uint8Array(size),
          expected = new Uint8Array(size);
        expect(sandbox.encodeInto(text, actual)).toEqual(
          native.encodeInto(text, expected),
        );
        expect(actual).toEqual(expected);
      }
    }
  });
  it("matches native UTF-8 replacement behavior for valid and malformed byte sequences", () => {
    const cases = [
      [0xef, 0xbb, 0xbf, 65],
      [0xc0, 0xaf],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
      [0xf0, 0x9f],
      [0xe2, 65],
      [0x80, 255],
    ];
    let seed = 713;
    for (let n = 0; n < 1000; n++) {
      const bytes: number[] = [];
      for (let i = 0; i < n % 16; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bytes.push(seed >>> 24);
      }
      cases.push(bytes);
    }
    for (const bytes of cases) {
      const input = new Uint8Array(bytes);
      expect(new codecs.TextDecoder().decode(input)).toBe(
        new TextDecoder().decode(input),
      );
    }
  });
  it("preserves streaming boundaries, BOM options and decoder reuse", () => {
    for (const bytes of [
      Array.from(new TextEncoder().encode("\ufeffA € 😀 日本語")),
      [0xf0, 0x9f],
      [0xed, 0xa0, 0x80],
      [0xe2, 65],
    ]) {
      for (const ignoreBOM of [false, true]) {
        for (let split = 0; split <= bytes.length; split++) {
          const actual = new codecs.TextDecoder("utf8", { ignoreBOM });
          const expected = new TextDecoder("utf8", { ignoreBOM });
          const first = new Uint8Array(bytes.slice(0, split)),
            last = new Uint8Array(bytes.slice(split));
          expect(
            actual.decode(first, { stream: true }) + actual.decode(last),
          ).toBe(
            expected.decode(first, { stream: true }) + expected.decode(last),
          );
          expect(actual.decode(new Uint8Array([0xef, 0xbb, 0xbf, 65]))).toBe(
            expected.decode(new Uint8Array([0xef, 0xbb, 0xbf, 65])),
          );
        }
      }
    }
    expect(() =>
      new codecs.TextDecoder("utf8", { fatal: true }).decode(
        new Uint8Array([0xc0]),
      ),
    ).toThrow(/Invalid UTF-8/);
    expect(() => new codecs.TextDecoder("unknown")).toThrow(/Unsupported/);
  });
  it("matches the Latin-1 alias used by PNG metadata and respects byte-view bounds", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(new codecs.TextDecoder("latin1").decode(bytes)).toBe(
      new TextDecoder("latin1").decode(bytes),
    );
    const wrapped = new Uint8Array([0xff, 65, 66, 0xff]);
    expect(
      new codecs.TextDecoder().decode(new DataView(wrapped.buffer, 1, 2)),
    ).toBe("AB");
  });
  it("starts the actual classic controller bundle and handles UI readiness", async () => {
    const messages: any[] = [];
    const api: any = {
      editorType: "figma",
      mode: "default",
      currentPage: { selection: [], on: vi.fn() },
      root: { getPluginData: () => "", setPluginData: vi.fn() },
      ui: {
        postMessage: (message: any) => messages.push(message),
        resize: vi.fn(),
      },
      clientStorage: {
        getAsync: async () => undefined,
        setAsync: async () => undefined,
      },
      showUI: vi.fn(),
      on: vi.fn(),
    };
    runInContext(
      controller,
      createContext({ figma: api, __html__: "<html/>" }),
    );
    expect(api.showUI).toHaveBeenCalledOnce();
    await api.ui.onmessage({ type: "ready" });
    expect(messages.map((message) => message.type)).toEqual([
      "settings",
      "selection",
    ]);
  });
  it("stores optional screenshot reports in the real controller without browser globals and serializes writes before close", async () => {
    const storage = new Map<string, unknown>(),
      messages: any[] = [];
    const api: any = {
      editorType: "figma",
      mode: "default",
      currentPage: { selection: [], on: vi.fn() },
      root: { getPluginData: () => "", setPluginData: vi.fn() },
      ui: { postMessage: (m: any) => messages.push(m), resize: vi.fn() },
      clientStorage: {
        getAsync: async (k: string) => storage.get(k),
        setAsync: async (k: string, v: unknown) => {
          storage.set(k, v);
        },
      },
      showUI: vi.fn(),
      on: vi.fn(),
      closePlugin: vi.fn(),
    };
    runInContext(
      controller,
      createContext({ figma: api, __html__: "<html/>" }),
    );
    const png = encode({
      width: 1,
      height: 1,
      channels: 4,
      data: new Uint8Array([20, 40, 80, 255]),
    });
    const feedback = [
      {
        origin: "https://relay.test",
        reportToken: "b".repeat(64),
        expiresAt: Date.now() + 86400000,
        report: {
          format: "framebridge-feedback",
          version: 1,
          clientVersion: "0.1.0",
          category: "images",
          title: "Image did not load",
          steps: "Import",
          expected: "Image",
          actual: "Blank",
          screenshot: {
            mime: "image/png",
            data: Buffer.from(png).toString("base64"),
            width: 1,
            height: 1,
          },
        },
      },
    ];
    await api.ui.onmessage({ type: "save-feedback", revision: 7, feedback });
    expect(messages.at(-1)).toMatchObject({
      type: "feedback-response",
      revision: 7,
    });
    expect(messages.at(-1).error).toBeUndefined();
    await api.ui.onmessage({ type: "load-feedback", revision: 8 });
    expect(messages.at(-1).feedback).toEqual(feedback);
    const save = api.ui.onmessage({
      type: "save-feedback",
      revision: 9,
      feedback: [],
    });
    const close = api.ui.onmessage({ type: "close" });
    await Promise.all([save, close]);
    expect(storage.get("framebridge.privateFeedback.v1")).toEqual([]);
    expect(api.closePlugin).toHaveBeenCalledOnce();
    expect(api.root.setPluginData).not.toHaveBeenCalled();
  });
  it("starts Dev Mode from the same bundle without opening the classic UI", () => {
    const api = {
      editorType: "dev",
      mode: "codegen",
      codegen: { on: vi.fn() },
      showUI: vi.fn(),
    };
    runInContext(controller, createContext({ figma: api }));
    expect(api.codegen.on).toHaveBeenCalledWith(
      "generate",
      expect.any(Function),
    );
    expect(api.showUI).not.toHaveBeenCalled();
  });
  it("prepares real PNGs with metadata in the codec-free sandbox", async () => {
    const output = await build({
      ...FIGMA_CONTROLLER_BUILD_OPTIONS,
      entryPoints: ["packages/core/src/image-processing.ts"],
      globalName: "preparation",
      write: false,
    });
    const context = createContext({});
    runInContext(output.outputFiles![0].text, context);
    const input = encode({
      width: 2,
      height: 1,
      channels: 4,
      data: new Uint8Array([20, 40, 80, 128, 0, 0, 0, 0]),
      text: { Comment: "Café" },
    });
    const original = input.slice();
    const mask = context.preparation.preparePng(input, { whiteMask: true });
    expect(input).toEqual(original);
    const parsed = decode(mask);
    expect([parsed.width, parsed.height]).toEqual([2, 1]);
    expect(Array.from(parsed.data)).toEqual([
      255, 255, 255, 128, 255, 255, 255, 0,
    ]);
  });
});
