import { build } from "esbuild";
import { imagePreparationBuildDefines } from "./image-preparation-build.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import { shadcnStyles } from "./shadcn-styles.mjs";
import { buildTypedLibrary } from "./typed-library.mjs";
const id = process.argv.includes("--check")
  ? "local-build-check"
  : process.env.FIGMA_LIBRARY_PLUGIN_ID;
if (!id || !/^[a-zA-Z0-9-]+$/.test(id))
  throw new Error("Provide the account-library plugin ID returned by Figma.");
const out = ".artifacts/figma-library";
await mkdir(out, { recursive: true });
const { code, modules } = await buildTypedLibrary({ commandId: id });
const ui = await build({
  loader: { ".woff2": "dataurl", ".png": "dataurl" },
  entryPoints: ["plugins/figma/src/ui.tsx"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "ui.js",
  write: false,
  minify: true,
  alias: {
    "react-dom/client": "preact/compat/client",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
    react: "preact/compat",
  },
  define: {
    ...(await imagePreparationBuildDefines()),
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_FRAMEBRIDGE_LIBRARY_MODE": '"true"',
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    shadcnStyles,
    {
      name: "local-export-transport",
      setup(b) {
        b.onLoad(
          { filter: /plugins\/figma\/src\/ui\.tsx$/ },
          async ({ path }) => ({
            contents: (await readFile(path, "utf8"))
              .replace(/^const LIBRARY_MODE\s*=[^;]+;\n/m, "")
              .replace(/\bLIBRARY_MODE\b/g, "true"),
            loader: "tsx",
            resolveDir: dirname(path),
          }),
        );
        b.onResolve({ filter: /^\.\/transfer$/ }, () => ({
          path: new URL(
            "../plugins/figma/src/transfer-library.ts",
            import.meta.url,
          ).pathname,
        }));
        b.onResolve({ filter: /^\.\/useRobloxAccount$/ }, () => ({
          path: new URL(
            "../plugins/figma/src/roblox-account-library.ts",
            import.meta.url,
          ).pathname,
        }));
      },
    },
  ],
});
const js = ui.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = ui.outputFiles.find((f) => f.path.endsWith(".css")).text;
const shim = `<script>try{window.localStorage.getItem('framebridge')}catch(e){const s=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,String(v)),removeItem:k=>s.delete(k),clear:()=>s.clear(),key:i=>Array.from(s.keys())[i]??null,get length(){return s.size}}})}</script>`;
const notices = (
  await Promise.all(
    [
      "LICENSE",
      "docs/licenses/JavaScript-dependencies.txt",
      "docs/licenses/Inter.txt",
      "docs/licenses/GoogleSans.txt",
    ].map((path) => readFile(path, "utf8")),
  )
).join("\n\n");
const noticeMetadata = JSON.stringify(notices).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${shim}<style>${css}</style></head><body><div id="root"></div><script type="application/json" id="framebridge-license-notices">${noticeMetadata}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
if (
  html.includes("https://apis.roblox.com") ||
  /fetch\(/.test(html) ||
  html.includes("Roblox Open Cloud API key")
)
  throw new Error(
    "The account-library plugin must not contain authenticated network controls.",
  );
const noticeBanner = notices
  .split(/\r?\n/)
  .map((line) => `// ${line}`)
  .join("\n");
await writeFile(`${out}/code.ts`, `${noticeBanner}\n${code}`);
await writeFile(`${out}/modules.json`, JSON.stringify(modules, null, 2) + "\n");
const program = ts.createProgram([`${out}/code.ts`], {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2020,
  lib: ["lib.es2020.d.ts"],
  types: ["@figma/plugin-typings"],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }),
  );
// The publishing gateway has a small request limit. Keep a readable UI artifact
// and ship the same complete UI compressed; Figma's browser iframe expands it.
await writeFile(`${out}/ui-expanded.html`, html);
const packed = gzipSync(Buffer.from(html), { level: 9 }).toString("base64");
const loader = `<!doctype html><html><head><meta charset="UTF-8"></head><body style="background:#18191c;color:#e7e8eb;font:14px system-ui;padding:20px">Opening Framebridge…<script>(async()=>{try{if(typeof DecompressionStream==='undefined')throw new Error('Please update your browser.');const data=Uint8Array.from(atob('${packed}'),c=>c.charCodeAt(0));const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));const source=await new Response(stream).text();document.open();document.write(source);document.close()}catch(e){document.body.textContent='Could not open Framebridge. '+(e.message||'Try again.')}})();</script></body></html>`;
await writeFile(`${out}/ui.html`, loader);
console.log(`Prepared Figma account-library sources for ${id}.`);
