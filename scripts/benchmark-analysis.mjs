// Runs the production controller in Figma's ES-only sandbox shape. Native PNG
// rendering and device storage are controlled stubs, not real Figma timings.
import { build } from "esbuild";
import { createContext, runInContext } from "node:vm";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { encode } from "fast-png";
import { FIGMA_CONTROLLER_BUILD_OPTIONS } from "./figma-controller-build.mjs";

const code = (await build({ ...FIGMA_CONTROLLER_BUILD_OPTIONS, write: false }))
  .outputFiles[0].text;
const png = encode({
  width: 8,
  height: 8,
  channels: 4,
  data: new Uint8Array(8 * 8 * 4).fill(255),
});
const pause = () => new Promise((resolve) => setImmediate(resolve));
function fixture(layers, artwork) {
  const counters = { textReads: 0, lookups: 0, writes: 0, renders: 0 };
  const messages = [];
  const frame = (id, type = "FRAME") => ({
    id,
    name: id,
    type,
    width: 8,
    height: 8,
    visible: true,
    relativeTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    opacity: 1,
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    clipsContent: false,
    effects: [],
    blendMode: "NORMAL",
    children: [],
    exportAsync: async () => {
      counters.renders++;
      await pause();
      return png;
    },
    clone() {
      return {
        ...this,
        id: id + ":clone",
        children: [],
        absoluteBoundingBox: { x: -100000, y: -100000, width: 8, height: 8 },
      };
    },
  });
  const root = frame("screen");
  root.width = 1000;
  root.height = 800;
  root.children = Array.from({ length: layers - 1 }, (_, i) => {
    const child = frame("layer:" + i, artwork ? "VECTOR" : "TEXT");
    child.parent = root;
    if (!artwork)
      Object.assign(child, {
        characters: "Label " + i,
        textAlignHorizontal: "LEFT",
        textAlignVertical: "TOP",
        textAutoResize: "NONE",
        getStyledTextSegments() {
          counters.textReads++;
          return [
            {
              characters: child.characters,
              fontName: { family: "Inter", style: "Regular" },
              fontSize: 14,
              fills: child.fills,
              textDecoration: "NONE",
              letterSpacing: { unit: "PIXELS", value: 0 },
              lineHeight: { unit: "AUTO" },
              textCase: "ORIGINAL",
              paragraphSpacing: 0,
              paragraphIndent: 0,
              listOptions: { type: "NONE" },
            },
          ];
        },
      });
    return child;
  });
  const byId = new Map([root, ...root.children].map((node) => [node.id, node]));
  const page = { selection: [root], on() {} };
  root.parent = page;
  const api = {
    editorType: "figma",
    mode: "default",
    mixed: Symbol("mixed"),
    currentPage: page,
    root: { getPluginData: () => "benchmark", setPluginData() {} },
    ui: { postMessage: (message) => messages.push(message) },
    showUI() {},
    on() {},
    base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
    clientStorage: {
      getAsync: async () => undefined,
      setAsync: async () => {
        counters.writes++;
        await pause();
      },
    },
    getNodeByIdAsync: async (id) => {
      counters.lookups++;
      await pause();
      return byId.get(id);
    },
    createFrame() {
      return {
        ...frame("scratch"),
        appendChild() {},
        resizeWithoutConstraints() {},
        remove() {},
      };
    },
  };
  runInContext(code, createContext({ figma: api, __html__: "<html/>" }));
  return {
    async analyze() {
      messages.length = 0;
      for (const key of Object.keys(counters)) counters[key] = 0;
      const started = performance.now();
      await api.ui.onmessage({ type: "analyze", options: {} });
      while (!messages.some((message) => message.type === "idle"))
        await pause();
      const milliseconds = performance.now() - started;
      const error = messages.find((message) => message.type === "error");
      if (error) throw new Error(error.message);
      const { createdAt, ...pkg } = messages.find(
        (message) => message.type === "result",
      ).result.package;
      return {
        milliseconds,
        ...counters,
        outputHash: createHash("sha256")
          .update(JSON.stringify(pkg))
          .digest("hex"),
      };
    },
  };
}
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cases = [];
// Prime the VM/compiler before measuring independent controller sessions.
await fixture(100, false).analyze();
for (const [layers, artwork] of [
  [100, false],
  [1000, false],
  [5000, false],
  [501, true],
]) {
  const cold = [],
    warm = [];
  for (let repeat = 0; repeat < 7; repeat++) {
    const run = fixture(layers, artwork);
    cold.push(await run.analyze());
    warm.push(await run.analyze());
  }
  const summarize = (runs) => ({
    medianMs: Math.round(median(runs.map((run) => run.milliseconds)) * 10) / 10,
    milliseconds: runs.map((run) => Math.round(run.milliseconds * 10) / 10),
    textReads: runs[0].textReads,
    lookups: runs[0].lookups,
    writes: runs[0].writes,
    renders: runs[0].renders,
    outputHash: runs[0].outputHash,
  });
  cases.push({ layers, artwork, cold: summarize(cold), warm: summarize(warm) });
}
const report = {
  scope:
    "Production bundled controller in Node VM; controlled PNG/storage/lookup stubs. Excludes native Figma rendering, IPC and React display.",
  samplesPerCase: 7,
  cases,
};
const output = process.argv[2] ?? ".artifacts/analysis-performance/latest.json";
await mkdir(new URL("../.artifacts/analysis-performance/", import.meta.url), {
  recursive: true,
});
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
