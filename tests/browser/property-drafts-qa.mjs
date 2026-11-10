// Run from the repository: node tests/browser/property-drafts-qa.mjs
// This serves the real production App with a local simulated Figma host.
// Browser tests dispatch synthetic input; native badInput needs real typing.
import { build } from "esbuild";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import http from "node:http";
import { unzipSync, strFromU8 } from "fflate";
import { shadcnStyles } from "../../scripts/shadcn-styles.mjs";
const root = process.cwd(),
  directory = root + "/.artifacts/property-drafts-browser-qa";
await mkdir(directory, { recursive: true, mode: 0o700 });
const png = Array.from(await readFile("tests/fixtures/upload-test.png"));
const app = await build({
  entryPoints: ["plugins/figma/src/ui.tsx"],
  plugins: [shadcnStyles],
  loader: { ".png": "dataurl", ".woff2": "dataurl" },
  bundle: true,
  write: false,
  outfile: "app.js",
  format: "iife",
  target: "es2020",
  minify: true,
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_FRAMEBRIDGE_LIBRARY_MODE": '"true"',
    "import.meta.env.VITE_FRAMEBRIDGE_RELAY_URL": '""',
    "import.meta.env.VITE_FRAMEBRIDGE_PRIVATE_BETA": '"0"',
    "process.env.NODE_ENV": '"production"',
  },
});
const appJS = app.outputFiles.find((x) => x.path.endsWith(".js")).text;
const appCSS = app.outputFiles
  .find((x) => x.path.endsWith(".css"))
  .text.replace(/@import[^;]+;/g, "");
const isolation = `window.__qaDownloads=[];window.__qaDownloadBytes=[];const qaBlobs=new Map(),qaCreate=URL.createObjectURL.bind(URL),qaRevoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(blob)=>{const url=qaCreate(blob);qaBlobs.set(url,blob);return url;};URL.revokeObjectURL=(url)=>{qaBlobs.delete(url);qaRevoke(url);};window.__qaExternalRequests=[];window.fetch=(input)=>{window.__qaExternalRequests.push(String(input));return Promise.reject(new Error('External requests disabled in isolated QA'));};HTMLAnchorElement.prototype.click=function(){if(this.download){window.__qaDownloads.push({name:this.download,href:this.href});const name=this.download;window.__qaDownloadBytes.push(qaBlobs.get(this.href).arrayBuffer().then(data=>({name,bytes:Array.from(new Uint8Array(data))})));return;}return HTMLElement.prototype.click.call(this);};`;
const ui = `<!doctype html><html><head><meta charset="utf-8"><style>${appCSS}</style></head><body><div id="root"></div><script>${isolation}</script><script>${appJS.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
const hostSource = `
import {compile} from './packages/core/src/compiler';
import {node} from './packages/core/src/demo';
import {DEFAULT_OPTIONS,flatten} from './packages/core/src/types';
import {retainLinkedAssets} from './packages/core/src/editor';
import {unzipSync,strFromU8} from 'fflate';
const png=${JSON.stringify(png)};
const catalog=[{owner:'user:1',fingerprint:${JSON.stringify(createHash("sha256").update(Uint8Array.from(png)).digest("hex"))},assetId:'123456',name:'Saved QA artwork',width:96,height:96,moderation:'MODERATION_STATE_APPROVED',savedAt:1}];
const designs=[node('Property draft QA',{id:'draft:root',width:600,height:420,children:[
 node('Draft image',{id:'draft:image',type:'RECTANGLE',width:96,height:96,fills:[{type:'IMAGE',imageHash:'saved-qa-png',scaleMode:'FILL'}],transform:[[1,0,40],[0,1,40]]}),
 node('Draft viewport',{id:'draft:viewport',width:100,height:100,transform:[[1,0,160],[0,1,40]]}),
 node('Draft text',{id:'draft:text',type:'TEXT',width:180,height:32,characters:'Saved text',fontSize:20,transform:[[1,0,40],[0,1,170]]})
]})];
let options={...DEFAULT_OPTIONS,assetIds:{},layerOverrides:{'draft:image':{components:{padding:{}}},'draft:viewport':{className:'ViewportFrame',renderMode:'native'}}};
let latest,previous,revision=0,holdAnalysis=false,pendingAnalysis,sourceId='isolated-property-draft-qa';const records=[];const frame=document.querySelector('iframe'),output=document.querySelector('pre');
function record(stage,detail={}){const row={stage,at:new Date().toISOString(),...detail};records.push(row);output.textContent=JSON.stringify({scope:'Mounted production App and synthetic local host/input. No native Figma, Studio, provider or physical-input acceptance.',records},null,2);fetch('/record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)}).catch(()=>{});}
function reply(m){frame.contentWindow.postMessage({pluginMessage:m},location.origin);}
function analyze(next=options){options=next;previous=latest;const packageValue=compile(designs,sourceId,options);latest={designs,package:packageValue,assets:Object.fromEntries(packageValue.assets.map(asset=>[asset.id,png])),previews:{},revision:++revision};record('host-analysis',{revision,options:structuredClone(options),package:structuredClone(latest.package)});reply({type:'result',result:latest});reply({type:'idle'});}
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const m=event.data?.pluginMessage;if(!m)return;
 if(m.type==='ready'){reply({type:'settings',options});reply({type:'selection',selection:[{id:'draft:root',name:'Property draft QA',type:'FRAME',width:600,height:420,layers:4}]});}
 else if(m.type==='analyze'){if(holdAnalysis){pendingAnalysis=m.options;record('host-analysis-pending',{options:structuredClone(m.options)});}else analyze(m.options);}
 else if(m.type==='load-review-preferences'||m.type==='save-review-preferences')reply({type:'review-preferences-response',revision:m.revision,preferences:m.reviewPreferences??null});
 else if(m.type==='load-asset-catalog'||m.type==='save-asset-catalog')reply({type:'asset-catalog-response',revision:m.revision,catalog:m.catalog??catalog});
});
const wait=async(predicate,label)=>{const until=Date.now()+7000;while(Date.now()<until){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+label);};
const doc=()=>frame.contentDocument;
const button=(label)=>[...doc().querySelectorAll('button')].find(e=>e.textContent.trim()===label||e.getAttribute('aria-label')===label);
const input=(label)=>doc().querySelector('[aria-label="'+label+'"]');
function write(element,value){if(!element)throw Error('Input unavailable');element.focus();const w=frame.contentWindow;const prototype=element.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new w.Event('input',{bubbles:true}));}
async function choose(id){doc().querySelector('[role="treeitem"][data-id="'+id+'"] > .explorer-row').click();await wait(()=>doc().querySelector('[role="treeitem"][data-id="'+id+'"][aria-selected="true"]'),'layer selection '+id);}
const selectedIds=()=>[...doc().querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(row=>row.dataset.id);
async function add(id){doc().querySelector('[role="treeitem"][data-id="'+id+'"] > .explorer-row').dispatchEvent(new frame.contentWindow.MouseEvent('click',{bubbles:true,ctrlKey:true}));await wait(()=>selectedIds().includes(id)&&selectedIds().length===2,'add selection '+id);}
async function exportView(){button('More options').dispatchEvent(new frame.contentWindow.PointerEvent('pointerdown',{bubbles:true,button:0}));await wait(()=>[...doc().querySelectorAll('[role="menuitem"]')].some(e=>e.textContent.trim()==='Export options'),'export menu');[...doc().querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim()==='Export options').click();await wait(()=>button('Back to layers'),'export view');}
async function layersView(){button('Back to layers').click();await wait(()=>doc().querySelector('[role="tree"]'),'return to layers');}
async function workspaceTab(label){const tab=[...doc().querySelectorAll('[role="tab"]')].find(e=>e.textContent.startsWith(label));assert(tab,'Missing workspace tab '+label);tab.dispatchEvent(new frame.contentWindow.MouseEvent('mousedown',{bubbles:true,button:0}));await wait(()=>tab.getAttribute('aria-selected')==='true','workspace tab '+label);}
async function bulkCompound(name){const summary=[...doc().querySelectorAll('.bulk-compound > summary')].find(e=>e.querySelector('span')?.textContent===name);assert(summary,'Missing shared compound '+name);summary.click();await wait(()=>summary.parentElement.open,'expand shared '+name);}
const guarded=()=>!!doc().querySelector('[data-property-draft-guard="true"]');
const footer=()=>doc().querySelector('.footer-actions .primary');
const saved=(id,key)=>flatten(latest.package.roots).find(n=>n.id===id)?.properties[key];
async function check(name,fn){try{await fn();record('check',{name,passed:true});}catch(error){record('check',{name,passed:false,error:String(error)});throw error;}}
function assert(ok,message){if(!ok)throw Error(message);}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
async function revert(name){button('Revert '+name.toLowerCase()).click();await wait(()=>!guarded(),'revert '+name);}
async function compound(label){const mounted=()=>input(label+' X')||input(label+' X scale')||input(label+' Scale')||input(label+' Left');await wait(()=>button('Expand '+label)||mounted(),'property available '+label);const toggle=button('Expand '+label);if(toggle)toggle.click();await wait(mounted,'expand '+label);}
document.querySelector('#run').onclick=async()=>{document.querySelector('#run').disabled=true;try{
 await wait(()=>footer(),'App startup');if(footer()?.textContent.includes('Analyze'))footer().click();await wait(()=>latest&&footer()?.textContent.includes('Export for Studio'),'initial analysis');await choose('draft:image');
 await check('scalar incomplete draft blocks before blur and leaves saved package intact',async()=>{const before=JSON.stringify(latest.package);write(input('Rotation'),'');await wait(guarded,'incomplete rotation');assert(footer().disabled,'Export remains enabled');assert(JSON.stringify(latest.package)===before,'Rejected draft modified saved package');const count=frame.contentWindow.__qaDownloads.length;footer().click();assert(frame.contentWindow.__qaDownloads.length===count,'Disabled export produced a file');});
 await check('fresh completed analysis does not release mounted invalid field',async()=>{analyze();await new Promise(r=>setTimeout(r,100));assert(guarded()&&footer().disabled,'Analysis released guard');});
 await check('Revert releases only draft validity and retains unrelated host errors',async()=>{reply({type:'error',message:'Unrelated host failure retained'});await wait(()=>doc().body.textContent.includes('Unrelated host failure retained'),'host error');await revert('Rotation');assert(doc().body.textContent.includes('Unrelated host failure retained'),'Revert erased unrelated error');assert(input('Rotation').value==='0','Revert did not restore saved Rotation');});
 await check('draft introduced during pending analysis remains guarded after its real result',async()=>{holdAnalysis=true;pendingAnalysis=undefined;const count=frame.contentWindow.__qaDownloads.length;button('Analyze selection').click();await wait(()=>pendingAnalysis,'real pending analyze request');write(input('Rotation'),'');await wait(guarded,'draft during analysis');const next=pendingAnalysis;pendingAnalysis=undefined;holdAnalysis=false;analyze(next);await wait(()=>footer()?.textContent.includes('Export for Studio'),'analysis completed');assert(guarded()&&footer().disabled,'Late analysis unblocked invalid input');assert(frame.contentWindow.__qaDownloads.length===count,'Late analysis exported old data');await revert('Rotation');});
 await check('out-of-range scalar is blocked while focused and Escape restores it',async()=>{write(input('Rotation'),'1000001');await wait(guarded,'range');input('Rotation').dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>!guarded(),'Escape');assert(input('Rotation').value==='0','Escape changed saved value');});
 await check('compound UDim2 keeps a second invalid component after correcting the first',async()=>{await compound('Position');write(input('Position X scale'),'');write(input('Position Y scale'),'');await wait(guarded,'two invalid components');write(input('Position X scale'),'0');await new Promise(r=>setTimeout(r,80));assert(guarded()&&footer().disabled,'Correcting X erased Y error');await revert('Position');});
 await check('Vector2 semantic range rejection preserves last valid AnchorPoint',async()=>{await compound('Anchor point');const before=JSON.stringify(saved('draft:image','AnchorPoint'));write(input('Anchor point X'),'2');input('Anchor point X').blur();await wait(guarded,'anchor range');assert(JSON.stringify(saved('draft:image','AnchorPoint'))===before,'Invalid anchor committed');await revert('Anchor point');});
 await check('Rect ordering rejects crossing slice guides',async()=>{button('All').click();await new Promise(r=>setTimeout(r,80));await compound('Slice guides');write(input('Slice guides Left'),'5');input('Slice guides Left').blur();await wait(guarded,'Rect ordering');await revert('Slice guides');});
 await check('rejected Image string uses the same property guard',async()=>{write(input('Image asset'),'not-an-asset');input('Image asset').blur();await wait(guarded,'Image string');assert(footer().disabled,'Image rejection did not block export');await revert('Image asset');});
 await check('property search disposes a hidden invalid field',async()=>{write(input('Rotation'),'');await wait(guarded,'search fixture');write(input('Search properties'),'AnchorPoint');await wait(()=>!guarded(),'hidden field disposal');write(input('Search properties'),'');await new Promise(r=>setTimeout(r,80));assert(input('Rotation').value==='0','Search retained discarded draft');});
 await check('property view disposes its invalid field',async()=>{write(input('Rotation'),'');await wait(guarded,'view fixture');button('Common').click();await wait(()=>!guarded(),'view disposal');});
 await check('layer switch disposes only departed field and restores valid UI',async()=>{write(input('Rotation'),'');await wait(guarded,'layer fixture');await choose('draft:viewport');await wait(()=>!guarded(),'layer disposal');});
 await check('Vector3 field rejects incomplete draft',async()=>{button('All').click();await new Promise(r=>setTimeout(r,80));const lighting=button('3D lighting');if(lighting?.getAttribute('data-state')==='closed')lighting.click();await compound('Light direction');write(input('Light direction Z'),'');input('Light direction Z').blur();await wait(guarded,'Vector3');await revert('Light direction');});
 await check('UDim padding field rejects negative scale',async()=>{await choose('draft:image/padding');await compound('Top padding');write(input('Top padding Scale'),'-1');input('Top padding Scale').blur();await wait(guarded,'UDim');await revert('Top padding');});
 await check('valid edits retain real App Undo and Redo',async()=>{await choose('draft:image');write(input('Rotation'),'30');input('Rotation').blur();await wait(()=>saved('draft:image','Rotation')===30&&footer()?.textContent.includes('Export for Studio'),'valid committed rotation');button('Undo property edit').click();await wait(()=>saved('draft:image','Rotation')===0&&footer()?.textContent.includes('Export for Studio'),'Undo');button('Redo property edit').click();await wait(()=>saved('draft:image','Rotation')===30&&footer()?.textContent.includes('Export for Studio'),'Redo');button('Reset Rotation').click();await wait(()=>saved('draft:image','Rotation')===0&&footer()?.textContent.includes('Export for Studio'),'Reset');});
 await check('valid package export resumes after field recovery',async()=>{const count=frame.contentWindow.__qaDownloads.length;assert(!footer().disabled,'Recovered export is disabled');footer().click();await wait(()=>frame.contentWindow.__qaDownloads.length===count+1,'valid package download');const file=await frame.contentWindow.__qaDownloadBytes[count];assert(file.name.endsWith('.zip'),'Expected production ZIP with pending artwork');const entries=unzipSync(new Uint8Array(file.bytes));const packageName=Object.keys(entries).find(name=>name.endsWith('.framebridge.json'));const exported=JSON.parse(strFromU8(entries[packageName]));const expected=retainLinkedAssets(previous,structuredClone(latest),options.layerOverrides).package;record('observed-production-export',{file,packageName,package:exported,referencePackage:structuredClone(latest.package),expectedPackage:expected,entries:Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,Array.from(bytes)]))});assert(JSON.stringify(canonical(exported))===JSON.stringify(canonical(expected)),'Export differs from production-normalized recovered saved package');assert(Object.keys(entries).some(name=>name.startsWith('images/')),'ZIP lost pending PNG');record('accepted-production-export',{file,packageName,package:exported,referencePackage:structuredClone(latest.package),expectedPackage:expected,entries:Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,Array.from(bytes)]))});});
 await check('export view returns to the same group and primary while discarding unfinished compound drafts',async()=>{await choose('draft:image');await add('draft:text');await bulkCompound('Position');const before=JSON.stringify(latest.package);write(input('Selected layers Position X scale'),'');await exportView();await layersView();await wait(()=>selectedIds().length===2,'group restored');assert(JSON.stringify(selectedIds())===JSON.stringify(['draft:image','draft:text']),'Export view discarded the group');assert(doc().querySelector('[data-id="draft:text"]').tabIndex===0,'Export view changed primary');assert(JSON.stringify(latest.package)===before,'View change committed unfinished compound draft');await bulkCompound('Position');assert(input('Selected layers Position X scale').value==='0','View return retained unfinished draft');});
 await check('Images view returns to the same group',async()=>{await workspaceTab('Images');await workspaceTab('Layers');await wait(()=>selectedIds().length===2,'Images group restored');assert(JSON.stringify(selectedIds())===JSON.stringify(['draft:image','draft:text']),'Images view discarded the group');});
 await check('range keyboard selection retains its anchor after view return',async()=>{doc().querySelector('[data-id="draft:text"]').dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'ArrowUp',shiftKey:true,bubbles:true}));await wait(()=>JSON.stringify(selectedIds())===JSON.stringify(['draft:viewport','draft:text']),'retained range anchor');});
 await check('same-source reanalysis while Layers is hidden retains the selection',async()=>{await choose('draft:image');await add('draft:text');await exportView();analyze();await new Promise(r=>setTimeout(r,100));await layersView();assert(JSON.stringify(selectedIds())===JSON.stringify(['draft:image','draft:text']),'Reanalysis discarded valid group');});
 await check('removing a selected primary while Layers is hidden retains only surviving nodes',async()=>{await exportView();designs[0].children=designs[0].children.filter(n=>n.id!=='draft:text');analyze();await new Promise(r=>setTimeout(r,100));await layersView();await wait(()=>JSON.stringify(selectedIds())===JSON.stringify(['draft:image']),'removed primary reconciliation');assert(doc().querySelector('[data-id="draft:image"]').tabIndex===0,'Surviving node did not become primary');});
 await check('a changed source clears the group even when node IDs are reused',async()=>{await add('draft:viewport');await exportView();sourceId='another-isolated-design';analyze();await new Promise(r=>setTimeout(r,100));await layersView();await wait(()=>JSON.stringify(selectedIds())===JSON.stringify(['screen:draft:root']),'source-scoped selection reset');});
 await check('ImageLibrary Show use normalizes a hidden generated artwork ID without another result',async()=>{designs[0].children.push(node('Hidden artwork owner',{id:'draft:decor',width:100,height:100,fills:[{type:'IMAGE',imageHash:'saved-qa-png',scaleMode:'FILL'}],children:[node('Editable artwork child',{id:'draft:decor-child',width:20,height:20})]}));options={...options,assetIds:{...options.assetIds,'image:draft:decor:fills-v1':'123456'}};analyze();await wait(()=>doc().querySelector('[data-id="draft:decor"]'),'decorated owner analysis');const hidden=flatten(latest.package.roots).find(n=>n.id==='draft:decor/decoration');assert(hidden?.decorationRect&&hidden.assetRef==='image:draft:decor:fills-v1','Fixture did not generate hidden decoration');assert(!doc().querySelector('[data-id="'+hidden.id+'"]'),'Generated artwork was visible in explorer');const before=JSON.stringify(latest.package),beforeRevision=revision;await workspaceTab('Images');doc().querySelector('.image-library > summary').click();await wait(()=>doc().querySelector('.image-library article details > summary'),'catalog artwork uses');doc().querySelector('.image-library article details > summary').click();await wait(()=>button('Show use: Hidden artwork owner background'),'Show use hidden artwork');button('Show use: Hidden artwork owner background').click();await wait(()=>JSON.stringify(selectedIds())===JSON.stringify(['screen:draft:root']),'hidden artwork selection normalization');assert(doc().querySelector('[data-id="screen:draft:root"]').tabIndex===0,'Fallback did not become primary');assert(revision===beforeRevision&&JSON.stringify(latest.package)===before,'Normalization required analysis or changed saved properties');record('hidden-artwork-locate-observed',{generatedId:hidden.id,assetRef:hidden.assetRef,selectedIds:selectedIds(),revision});});
 record('completed',{passed:records.filter(x=>x.stage==='check'&&x.passed).length,failed:records.filter(x=>x.stage==='check'&&!x.passed).length,externalRequests:frame.contentWindow.__qaExternalRequests,downloads:frame.contentWindow.__qaDownloads});
}catch(error){record('aborted',{error:String(error)});}finally{document.querySelector('#run').disabled=false;}};
document.querySelector('#snapshot').onclick=()=>record('manual-DOM-snapshot',{guarded:guarded(),footer:footer()?{disabled:footer().disabled,text:footer().textContent}:null,alerts:[...doc().querySelectorAll('[role="alert"]')].map(e=>e.textContent),fields:[...doc().querySelectorAll('input[aria-invalid="true"],textarea[aria-invalid="true"]')].map(e=>({label:e.getAttribute('aria-label'),value:e.value,badInput:e.validity.badInput})),downloads:frame.contentWindow.__qaDownloads,externalRequests:frame.contentWindow.__qaExternalRequests});
frame.src='/ui.html';`;
const host = await build({
  stdin: {
    contents: hostSource,
    resolveDir: root,
    sourcefile: "property-drafts-host.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
});
const hostJS = host.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Framebridge property draft regression</title><style>body{margin:0;background:#151515;color:#ddd;font:13px system-ui}header{padding:10px}button{padding:8px;margin-right:8px}main{display:grid;grid-template-columns:minmax(820px,1fr) 340px;height:calc(100vh - 75px)}iframe{height:100%;width:100%;border:1px solid #555}pre{overflow:auto;white-space:pre-wrap;padding:8px;font-size:11px}</style></head><body><header>Real production App; synthetic local Figma host and browser input. No provider/native acceptance.<br><button id="run">Run mounted regressions</button><button id="snapshot">Record manual snapshot</button></header><main><iframe title="Production Framebridge App"></iframe><pre>Ready</pre></main><script src="/host.js"></script></body></html>`;
for (const [name, data] of [
  ["ui.html", ui],
  ["host.js", hostJS],
  ["index.html", html],
]) {
  await writeFile(directory + "/" + name, data, { mode: 0o600 });
  await chmod(directory + "/" + name, 0o600);
}
const records = [];
let dropped = 0;
const pages = {
  "/": "index.html",
  "/index.html": "index.html",
  "/ui.html": "ui.html",
  "/host.js": "host.js",
};
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/record") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1e6) throw Error("Record too large");
      }
      if (records.length >= 1000) {
        dropped++;
        res.writeHead(429);
        res.end();
        return;
      }
      const row = JSON.parse(body);
      records.push(row);
      if (
        ["accepted-production-export", "observed-production-export"].includes(
          row.stage,
        )
      ) {
        const prefix =
          row.stage === "accepted-production-export" ? "accepted" : "observed";
        const name = row.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const bytes = Uint8Array.from(row.file.bytes);
        const entries = unzipSync(bytes);
        const decoded = JSON.parse(strFromU8(entries[row.packageName]));
        await writeFile(directory + "/" + name, bytes, { mode: 0o600 });
        await writeFile(
          directory + "/" + prefix + "-export-package.json",
          JSON.stringify(decoded, null, 2) + "\n",
          { mode: 0o600 },
        );
        if (row.expectedPackage)
          await writeFile(
            directory + "/" + prefix + "-expected-package.json",
            JSON.stringify(row.expectedPackage, null, 2) + "\n",
            { mode: 0o600 },
          );
        if (row.referencePackage)
          await writeFile(
            directory + "/" + prefix + "-host-package.json",
            JSON.stringify(row.referencePackage, null, 2) + "\n",
            { mode: 0o600 },
          );
        await writeFile(
          directory + "/" + prefix + "-export-summary.json",
          JSON.stringify(
            {
              file: name,
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              packageName: row.packageName,
              packageSha256: createHash("sha256")
                .update(entries[row.packageName])
                .digest("hex"),
              sameDecodedPackage:
                JSON.stringify(decoded) === JSON.stringify(row.package),
              entries: Object.fromEntries(
                Object.entries(entries).map(([name, data]) => [
                  name,
                  {
                    bytes: data.length,
                    sha256: createHash("sha256").update(data).digest("hex"),
                  },
                ]),
              ),
            },
            null,
            2,
          ) + "\n",
          { mode: 0o600 },
        );
      }
      await writeFile(
        directory + "/actual-browser-records.json",
        JSON.stringify(
          {
            scope:
              "Local production-App browser regression evidence; synthetic Figma host and input; no native/provider acceptance.",
            dropped,
            records,
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
      await chmod(directory + "/actual-browser-records.json", 0o600);
      res.writeHead(204);
      res.end();
      return;
    }
    const page = pages[req.url];
    if (req.method !== "GET" || !page) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": page.endsWith(".js") ? "text/javascript" : "text/html",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; img-src 'self' data: blob:; frame-src 'self'",
    });
    res.end(await readFile(directory + "/" + page));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const manifest = {
  url: "http://127.0.0.1:" + server.address().port + "/",
  pid: process.pid,
  scope:
    "Production App mounted with synthetic Figma IPC and input. Prepared, not yet executed.",
  files: Object.fromEntries(
    [
      ["ui.html", ui],
      ["host.js", hostJS],
      ["index.html", html],
    ].map(([name, data]) => [
      name,
      {
        bytes: Buffer.byteLength(data),
        sha256: createHash("sha256").update(data).digest("hex"),
      },
    ]),
  ),
};
await writeFile(
  directory + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(manifest));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
