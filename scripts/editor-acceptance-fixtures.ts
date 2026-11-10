import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { quoteLuau } from "../packages/core/src/source-code";
import { validateExportPackage } from "../packages/core/src/export-package";
import { flatten } from "../packages/core/src/types";
import { scalingPng } from "../tests/image-scaling-fixtures";
import { imageScalingResult } from "../tests/image-scaling-fixtures";
import { componentResult, stateComponentResult } from "../tests/components-fixtures";
import { scrollbarResult, scrollbarPng } from "../tests/scrollbar-fixtures";
import { compile } from "../packages/core/src/compiler";

// Preparation only. Root's native applications own every acceptance operation.
const output = ".artifacts/final-editor-checks";
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
const files: Record<string, { bytes: number; utf16: number; sha256: string }> = {};
async function save(name: string, content: string | Uint8Array) {
  await writeFile(`${output}/${name}`, content, { mode: 0o600 });
  await chmod(`${output}/${name}`, 0o600);
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  files[name] = {
    bytes: bytes.length,
    utf16: typeof content === "string" ? content.length : 0,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const png = scalingPng();
await save("slice-source.png", new Uint8Array(png));
const setup = await readFile("tests/editor-acceptance/figma-setup.js", "utf8");
await save("figma-setup.js", setup.replace("/* SOURCE_PNG */ []", JSON.stringify(png)));
for (const name of ["figma-readback.js", "figma-cleanup.js"])
  await save(name, await readFile(`tests/editor-acceptance/${name}`, "utf8"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const name of ["figma-setup.js", "figma-readback.js", "figma-cleanup.js"])
  new AsyncFunction("figma", await readFile(`${output}/${name}`, "utf8"));
const historyObservers = await readFile("tests/editor-acceptance/history-observers.luau", "utf8");
for (const name of ["class-setup.luau", "class-readback.luau", "class-cleanup.luau"])
  await save(name, (name === "class-setup.luau" ? historyObservers : "") + await readFile(`tests/editor-acceptance/${name}`, "utf8"));

if (process.argv.includes("--browser")) {
  const designs = [...componentResult().designs!, ...stateComponentResult(true).designs!];
  const components = { designs, package: compile(designs, "final-editor-components", { detectButtons: false }, "fixed"), assets: {}, previews: {}, revision: 1 };
  const scroll = scrollbarResult({});
  const previews = {
    "../reusable-components/preview.json": { data: components, selected: designs.map(n => ({ id: n.id, name: n.name, type: n.type, width: n.width, height: n.height, layers: components.package.stats.layers })) },
    "../image-scaling-preview.json": { data: imageScalingResult(), selected: [{ id: "image-scaling", name: "Image scaling", type: "FRAME", width: 460, height: 340, layers: imageScalingResult().package.stats.layers }] },
    "../scrollbar-artwork/preview.json": { data: { ...scroll, assets: { "image:vertical-art": scrollbarPng(), "image:horizontal-art": scrollbarPng("X") } }, selected: [{ id: "scroll-root", name: "Scrollbar examples", type: "FRAME", width: 600, height: 420, layers: scroll.package.stats.layers }] },
  };
  for (const [name, data] of Object.entries(previews)) {
    await mkdir(resolve(output, name, ".."), { recursive: true, mode: 0o700 });
    await save(name, JSON.stringify(data));
  }
}

const templateArg = process.argv.indexOf("--template");
let templateEvidence: Record<string, unknown> | undefined;
if (templateArg >= 0) {
  const path = process.argv[templateArg + 1];
  if (!path || path.startsWith("--")) throw new Error("--template needs the actual downloaded JSON path");
  const bytes = await readFile(resolve(path));
  const pkg = JSON.parse(bytes.toString("utf8"));
  validateExportPackage(pkg);
  const widget = pkg.roots[0]?.children[0];
  if (pkg.roots.length !== 1 || pkg.assets.length || widget?.className !== "TextButton"
      || widget.behavior?.control?.kind !== "toggle" || widget.behavior.control.value !== false)
    throw new Error("Expected an actual asset-free extracted toggle template, initially false");
  const caption = flatten(widget.children).find((n) => n.className === "TextLabel");
  if (!caption || typeof caption.properties.Text !== "string") throw new Error("Expected an editable caption");
  const changed = JSON.parse(JSON.stringify(pkg));
  flatten(changed.roots).find((n) => n.id === caption.id)!.properties.Text = "Updated native template caption";
  validateExportPackage(changed);
  await save("template-original.framebridge.json", bytes);
  await save("template-update.framebridge.json", JSON.stringify(changed));
  const config = `local expectedSource=${quoteLuau(pkg.sourceId)}\nlocal expectedRoot=${quoteLuau(pkg.roots[0].id)}\nlocal expectedWidget=${quoteLuau(widget.id)}\nlocal expectedCaption=${quoteLuau(caption.id)}\nlocal originalText=${quoteLuau(caption.properties.Text)}\nlocal updatedText="Updated native template caption"\n`;
  for (const name of ["template-preflight.luau", "template-readback.luau", "template-attach.luau", "template-cleanup.luau"])
    await save(name, config + (name === "template-preflight.luau" ? historyObservers : "") + await readFile(`tests/editor-acceptance/${name}`, "utf8"));
  templateEvidence = { inputSha256: createHash("sha256").update(bytes).digest("hex"), sourceId: pkg.sourceId,
    rootId: pkg.roots[0].id, widgetId: widget.id, captionId: caption.id, originalText: caption.properties.Text,
    instances: pkg.stats.instances, assets: 0 };
}
await save("README.md", "# Editor acceptance fixtures\n\nUse the generated setup, readback and cleanup programs only in an isolated QA file/place. Template checks require the actual native Save download. Run installed-plugin interactions separately; detached fixtures do not establish end-to-end acceptance. Preserve each result and clean up only the owned fixture instances.\n");
await save("compile.luau", `local fs=require("@lune/fs")\nlocal count=0\nfor _,name in ipairs(fs.readDir("${output}")) do\n if name:match("%.luau$") and name~="compile.luau" then local source=fs.readFile("${output}/"..name);local chunk,why=loadstring(source);assert(chunk,name..": "..tostring(why));count+=1 end\nend\nprint("Prepared editor native programs compile: "..count)\n`);
await save("metadata.json", JSON.stringify({ preparedOnly: true, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), scope: "Native editor source setup/readback and actual downloaded template UI acceptance; no native execution", template: templateEvidence, files }, null, 2));
console.log(JSON.stringify({ output, preparedOnly: true, files: Object.keys(files).length, actualTemplate: !!templateEvidence }));
