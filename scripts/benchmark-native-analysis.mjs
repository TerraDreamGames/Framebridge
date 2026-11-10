// Builds a local development plugin around the production controller. PNG
// exports and source reads are native Figma operations; device storage, event
// subscriptions and the production iframe are deliberately excluded. The
// collector binds to loopback and never contacts the relay or Roblox.
import { build } from "esbuild";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { FIGMA_CONTROLLER_BUILD_OPTIONS } from "./figma-controller-build.mjs";
import { imagePreparationBuildDefines } from "./image-preparation-build.mjs";

const label = process.argv[2] || "candidate";
if (!/^[a-z0-9-]+$/.test(label)) throw Error("Use a simple benchmark label.");
const out = resolve(
  process.argv[3] || `.artifacts/native-analysis-benchmark/${label}`,
);
const trials = Number(process.argv[4] || 3);
const selectedFixture = process.env.FRAMEBRIDGE_BENCHMARK_SELECTION === "1";
const edits = process.env.FRAMEBRIDGE_BENCHMARK_EDITS === "1";
const phases = edits
  ? ["fresh", "repeat", "native", "image"]
  : ["fresh", "repeat"];
const baseline = process.env.FRAMEBRIDGE_BENCHMARK_BASELINE;
if (baseline && !/^[a-f0-9]{40}$/.test(baseline))
  throw Error("Use a full baseline commit hash.");
const baselineFiles = new Set([
  "plugins/figma/src/classic-controller.ts",
  "plugins/figma/src/image-preparation-client.ts",
  "packages/core/src/image-processing.ts",
]);
const baselinePlugin = baseline
  ? [
      {
        name: "baseline-source",
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
            const local = path.slice(process.cwd().length + 1);
            if (!baselineFiles.has(local)) return;
            return {
              contents: execFileSync("git", ["show", `${baseline}:${local}`], {
                encoding: "utf8",
              }),
              loader: "ts",
              resolveDir: resolve(path, ".."),
            };
          });
        },
      },
    ]
  : [];
if (!Number.isInteger(trials) || trials < 1 || trials > 10)
  throw Error("Use 1–10 trial pairs.");
await mkdir(out, { recursive: true });
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const records = [];
const runToken = randomUUID();
let bundleSha256;
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/result") {
    res.writeHead(404).end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 64 * 1024 * 1024)
        throw Error("Benchmark payload exceeds 64 MiB.");
    }
    const record = JSON.parse(body);
    if (record.label !== label) throw Error("Unexpected benchmark label.");
    if (record.runToken !== runToken) throw Error("Stale benchmark run.");
    if (record.error) {
      await writeFile(join(out, "error.json"), JSON.stringify(record, null, 2));
      console.error(record.error);
      res.writeHead(200).end("saved");
      server.close();
      return;
    }
    if (
      !Number.isInteger(record.pair) ||
      record.pair < 1 ||
      record.pair > trials ||
      !phases.includes(record.cache) ||
      records.some(
        (saved) => saved.pair === record.pair && saved.cache === record.cache,
      )
    )
      throw Error("Invalid or duplicate trial.");
    const { createdAt, ...pkg } = record.result.package;
    const pngHashes = Object.fromEntries(
      Object.entries(record.result.assets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, bytes]) => [id, sha(Buffer.from(bytes))]),
    );
    const summary = {
      label,
      revision,
      bundleSha256,
      pair: record.pair,
      cache: record.cache,
      milliseconds: record.milliseconds,
      stages: record.stages,
      nativeArtworkRenders: record.nativeArtworkRenders,
      preparationJobs: record.preparationJobs,
      worker: record.worker,
      scratchFramesRemoved: record.scratchFramesRemoved,
      sourceUnchanged: record.sourceUnchanged,
      selectionUnchanged: record.selectionUnchanged,
      imageReferences: Object.keys(pngHashes).length,
      uniquePngs: new Set(Object.values(pngHashes)).size,
      packageSha256: sha(JSON.stringify(pkg)),
      assetsSha256: sha(JSON.stringify(pngHashes)),
      previewSha256: sha(JSON.stringify(record.result.previews)),
      fixture: record.fixture,
    };
    await writeFile(
      join(out, `pair-${record.pair}-${record.cache}.json`),
      JSON.stringify({ ...record, summary }),
    );
    records.push(summary);
    await writeFile(
      join(out, "summary.json"),
      JSON.stringify(
        {
          scope:
            "Native Figma controller analysis, including real PNG rendering and preview export; excludes production iframe delivery, device storage and documentchange subscriptions. Fresh means fresh controller cache; Figma's own renderer cache is not reset.",
          revision,
          records,
        },
        null,
        2,
      ),
    );
    const { fixture, ...progress } = summary;
    console.log(JSON.stringify(progress));
    res.writeHead(200).end("saved");
    if (records.length === trials * phases.length) server.close();
  } catch (error) {
    res.writeHead(400).end(String(error));
  }
});
await new Promise((done) =>
  server.listen(Number(process.argv[5] || 0), "127.0.0.1", done),
);
const collector = `http://localhost:${server.address().port}`;
const preparationClient = (
  await build({
    stdin: {
      contents: `import {createImagePreparationClient} from ${JSON.stringify(resolve("plugins/figma/src/image-preparation-client.ts"))};
      window.prepareArtwork = createImagePreparationClient((type,data)=>parent.postMessage({pluginMessage:{type,...data}},'*'));`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    plugins: baselinePlugin,
    format: "iife",
    target: "es2018",
    minify: true,
    write: false,
    define: {
      ...(await imagePreparationBuildDefines()),
      "import.meta.env.DEV": "false",
    },
  })
).outputFiles[0].text;
const ui = `<!doctype html><html><style>body{background:#181a1f;color:#eef1f5;font:13px system-ui;padding:16px}pre{white-space:pre-wrap;font:12px ui-monospace}h2{font-size:16px}</style><h2>Framebridge native analysis · ${label}</h2><p>${selectedFixture ? "Selected design" : "1,000 vector references"} · native PNG rendering</p><pre id="status">Preparing benchmark…</pre><script>
const status = document.getElementById('status');
let workersStarted=0, workerErrors=0, ticks=0, maxTickGap=0, previousTick=performance.now();
if(window.Worker) { const OriginalWorker=window.Worker; window.Worker=class extends OriginalWorker { constructor(...args){super(...args);workersStarted++;this.addEventListener('error',()=>workerErrors++);} }; }
setInterval(()=>{const now=performance.now();maxTickGap=Math.max(maxTickGap,now-previousTick);previousTick=now;ticks++;},16);
onmessage = async event => {
  const m = event.data.pluginMessage;
  if (!m) return;
  if (window.prepareArtwork.receive(m)) return;
  if (m.type === 'progress') status.textContent = m.label;
  if (m.type === 'record') {
    m.record.worker={workersStarted,workerErrors,ticks,maxTickGap};
    try {
      const response = await fetch('${collector}/result', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m.record)});
      if (!response.ok) throw Error(await response.text());
      parent.postMessage({pluginMessage:{type:'collected'}}, '*');
    } catch (e) { status.textContent = String(e); parent.postMessage({pluginMessage:{type:'collection-error',message:String(e)}}, '*'); }
  }
  if (m.type === 'complete') status.textContent = m.summary;
};
parent.postMessage({pluginMessage:{type:'ready'}}, '*');
</script><script>${preparationClient}</script></html>`;
await writeFile(join(out, "ui.html"), ui);
const entry = `
import { startClassicController } from ${JSON.stringify(resolve("plugins/figma/src/classic-controller.ts"))};
import { snapshot } from ${JSON.stringify(resolve("plugins/figma/src/snapshot.ts"))};
import { DEFAULT_OPTIONS } from ${JSON.stringify(resolve("packages/core/src/types.ts"))};
const label = ${JSON.stringify(label)};
const runToken = ${JSON.stringify(runToken)};
const trials = ${trials};
const phases = ${JSON.stringify(phases)};
let ack;
let started = false;
const closeCallbacks = [];
nativeFigma.on('close',()=>closeCallbacks.forEach(callback=>callback()));
nativeFigma.showUI(__html__, {width:520,height:340,title:'Framebridge · Native analysis benchmark'});
nativeFigma.ui.onmessage = m => {
  if (m.type === 'image-prepared' && benchmarkApi?.ui.onmessage) { void benchmarkApi.ui.onmessage(m); return; }
  if (m.type === 'collected') { if (ack) ack(); ack = undefined; }
  if (m.type === 'collection-error') { if (ack) ack(new Error(m.message)); ack = undefined; }
  if (m.type === 'ready' && !started) { started = true; void run(); }
};
async function collect(record) {
  await new Promise((resolve,reject) => { ack = error => error ? reject(error) : resolve(); nativeFigma.ui.postMessage({type:'record',record:{...record,runToken}}); });
}
async function run() {
  try {
    const batch = ${selectedFixture ? "nativeFigma.currentPage.selection[0]" : "await nativeFigma.getNodeByIdAsync('182:76')"};
    if (!batch || batch.type !== 'FRAME' || ${selectedFixture ? "nativeFigma.currentPage.selection.length !== 1" : "batch.name !== 'Framebridge_Native_Batch_QA_20261005_2' || batch.children.length !== 1000 || batch.children.some(n => n.type !== 'VECTOR')"}) throw Error('The requested benchmark fixture is unavailable.');
    if (!${selectedFixture} && batch.parent !== nativeFigma.currentPage) throw Error('Open the fixture page before benchmarking.');
    const selection = JSON.stringify(nativeFigma.currentPage.selection.map(n => n.id));
    const first = batch.children[0];
    const fixture = {id:batch.id,name:batch.name,width:batch.width,height:batch.height,vectors:batch.children.filter(n=>n.type==='VECTOR').length,firstVector:first?{width:first.width,height:first.height,vectorPaths:first.vectorPaths,vectorNetwork:first.vectorNetwork,blendMode:first.blendMode,strokes:first.strokes,effects:first.effects,boundVariables:first.boundVariables}:undefined};
    const totals = [];
    for (let pair = 1; pair <= trials; pair++) {
      const data = new Map([['framebridge-source','native-analysis-benchmark']]);
      const storage = new Map();
      const scratches = [];
      let complete;
      let active;
      benchmarkApi = {
        mixed:nativeFigma.mixed, editorType:nativeFigma.editorType,
        root:{id:nativeFigma.root.id,documentColorProfile:nativeFigma.root.documentColorProfile,getPluginData:key=>data.get(key)||'',setPluginData:(key,value)=>data.set(key,value)},
        currentPage:{id:nativeFigma.currentPage.id,selection:[batch],on(){},off(){}},
        ui:{postMessage(message){
          if (message.type==='prepare-image' || message.type==='cancel-image-preparation') { if(active && message.type==='prepare-image') active.preparationJobs++; nativeFigma.ui.postMessage(message); return; }
          if (!active) return;
          if (message.type === 'progress') {
            const elapsed = Date.now()-active.start;
            if (message.progress === 5) active.stages.reading = elapsed;
            if (/^Rendering artwork/.test(message.label) && active.stages.rendering === undefined) active.stages.rendering = elapsed;
            if (message.progress === 90) active.stages.preparing = elapsed;
            nativeFigma.ui.postMessage({type:'progress',label:'Pair '+pair+' · '+active.cache+' cache\\n'+message.label});
          }
          if (message.type === 'result') {active.result=message.result;active.milliseconds=Date.now()-active.start;}
          if (message.type === 'error') active.error=message.message;
          if (message.type === 'idle' && complete) complete();
        },resize(){}},
        clientStorage:{getAsync:async key=>storage.get(key),setAsync:async(key,value)=>storage.set(key,value)},
        showUI(){},on(event,callback){if(event==='close')closeCallbacks.push(callback);},
        base64Encode:bytes=>nativeFigma.base64Encode(bytes),
        base64Decode:value=>nativeFigma.base64Decode(value),
        getNodeByIdAsync:id=>nativeFigma.getNodeByIdAsync(id),
        createFrame(){const frame=nativeFigma.createFrame();scratches.push(frame);return frame;},
      };
      startClassicController();
      await benchmarkApi.ui.onmessage({type:'ready',imagePreparation:1});
      const before = JSON.stringify(snapshot(batch));
      for (const cache of phases) {
        const scratchStart = scratches.length;
        active={cache,stages:{},preparationJobs:0,start:Date.now()};
        const changedId=batch.children[batch.children.length-1]?.id;
        const layerOverrides=cache==='native'||cache==='image'?{[changedId]:{renderMode:cache}}:{};
        await new Promise(resolve=>{complete=resolve;void benchmarkApi.ui.onmessage({type:'analyze',options:{...DEFAULT_OPTIONS,layerOverrides,assetIds:{},fontIds:{},layout:'responsive'},jobId:'native-benchmark'});});
        complete=undefined;
        if (active.error || !active.result) throw Error(active.error || 'No analysis result.');
        const record={label,pair,cache,milliseconds:active.milliseconds,stages:active.stages,preparationJobs:active.preparationJobs,nativeArtworkRenders:scratches.length-scratchStart,scratchFramesRemoved:scratches.slice(scratchStart).every(n=>n.removed),sourceUnchanged:before===JSON.stringify(snapshot(batch)),selectionUnchanged:selection===JSON.stringify(nativeFigma.currentPage.selection.map(n=>n.id)),fixture,result:active.result};
        totals.push({pair,cache,milliseconds:record.milliseconds,renders:record.nativeArtworkRenders});
        await collect(record);
        active=undefined;
      }
    }
    nativeFigma.ui.postMessage({type:'complete',summary:'Complete · '+label+'\\n'+totals.map(r=>'Pair '+r.pair+' '+r.cache+': '+r.milliseconds+' ms · '+r.renders+' artwork renders').join('\\n')+'\\nResults saved locally. Source and selection preserved.'});
  } catch (error) {
    nativeFigma.ui.postMessage({type:'progress',label:String(error)});
    await collect({label,error:String(error)});
  }
}
`;
await writeFile(join(out, "entry.ts"), entry);
await build({
  ...FIGMA_CONTROLLER_BUILD_OPTIONS,
  plugins: baselinePlugin,
  entryPoints: [join(out, "entry.ts")],
  outfile: join(out, "code.js"),
  define: {
    ...FIGMA_CONTROLLER_BUILD_OPTIONS.define,
    figma: "benchmarkApi",
    __html__: JSON.stringify(ui),
  },
  banner: { js: "const nativeFigma = figma; let benchmarkApi;" },
});
bundleSha256 = sha(await readFile(join(out, "code.js")));
await writeFile(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      name: `Framebridge · Native benchmark ${label}`,
      id: `framebridge-native-benchmark-${label}`,
      api: "1.0.0",
      main: "code.js",
      ui: "ui.html",
      editorType: ["figma"],
      documentAccess: "dynamic-page",
      networkAccess: {
        allowedDomains: ["none"],
        devAllowedDomains: [collector],
        reasoning: "Saves QA benchmark results to this computer only.",
      },
    },
    null,
    2,
  ),
);
console.log(`Import development manifest: ${join(out, "manifest.json")}`);
console.log(
  `Local collector: ${collector}; waiting for ${trials * phases.length} analyses.`,
);
