import { zipSync, strToU8 } from "fflate";
import type { AnalysisResult } from "./types";
/** Builds identical exports for the plugin and fixture tooling. No platform APIs. */
export function buildExport(result: AnalysisResult) {
  const pkg = result.package;
  if (!pkg.roots.length) throw new Error("There are no screens to export.");
  if (pkg.issues.some((i) => i.severity === "error"))
    throw new Error("Resolve blocking review notes before exporting.");
  const base = (pkg.name || "design")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  const json = strToU8(JSON.stringify(pkg, null, 2));
  const pending = pkg.assets.filter((asset) => !asset.robloxId);
  if (!pending.length)
    return {
      name: `${base}.framebridge.json`,
      data: json,
      mime: "application/json",
    };
  const files: Record<string, Uint8Array> = {
    [`${base}.framebridge.json`]: json,
    "conversion-report.json": strToU8(JSON.stringify(pkg.issues, null, 2)),
    "READ_ME.txt": strToU8(
      "FRAMEBRIDGE\n1. Extract this ZIP.\n2. Upload the remaining images/ PNGs using Studio Asset Manager, or use Upload all images in Figma before exporting.\n3. Open the .framebridge.json file in the Framebridge Studio plugin.\n4. Link any remaining image asset IDs and import. Already uploaded images are linked automatically.\n\nCheck fonts and layout at your target resolutions before shipping.\n",
    ),
  };
  for (const asset of pending) {
    const bytes = result.assets[asset.id];
    if (!bytes?.length)
      throw new Error(`The image for ${asset.name} is missing. Analyze again.`);
    if (!/^[a-zA-Z0-9_-]+\.png$/.test(asset.filename))
      throw new Error("Invalid image filename.");
    files[`images/${asset.filename}`] = new Uint8Array(bytes);
  }
  return {
    name: `${base}.framebridge.zip`,
    data: zipSync(files),
    mime: "application/zip",
  };
}
