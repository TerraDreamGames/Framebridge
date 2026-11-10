import { build } from "esbuild";

/** Embed the worker in ui.html so private testers still install only three files. */
export async function imagePreparationBuildDefines() {
  const worker = await build({
    entryPoints: ["plugins/figma/src/image-preparation-worker.ts"],
    bundle: true,
    format: "iife",
    target: "es2018",
    minify: true,
    write: false,
  });
  return {
    __FRAMEBRIDGE_IMAGE_WORKER__: JSON.stringify(worker.outputFiles[0].text),
    // The production branch uses the embedded Blob, never a relative file URL.
    "import.meta.url": '"embedded-worker"',
  };
}
