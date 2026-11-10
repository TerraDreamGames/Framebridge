import { readFile, readdir } from "node:fs/promises";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { studioProjectPaths } from "./studio-project.mjs";

// Ship user guides only. Development journals and design explorations stay local.
export const RELEASE_GUIDES = Object.freeze([
  "ADVANCED_CONTROLS.md",
  "BULK_EDITING.md",
  "CLOUD_ARTWORK_LIBRARY.md",
  "CONDITIONAL_RULES.md",
  "DESIGN_HANDOFF.md",
  "DEVICE_PREVIEW.md",
  "EDITOR.md",
  "IMAGE_BATCHES.md",
  "IMAGE_SCALING.md",
  "IMAGE_TOOLS.md",
  "IMPORT_HISTORY.md",
  "INSTALL.md",
  "KEYFRAME_MOTION.md",
  "LIVE_TEXT_DECORATION.md",
  "MODEL_EXPORT.md",
  "MOTION_PRESETS.md",
  "NATIVE_STRUCTURE.md",
  "ONBOARDING.md",
  "RELEASE.md",
  "REPORT_FEEDBACK.md",
  "REUSABLE_COMPONENTS.md",
  "REVIEW_PREFERENCE_SYNC.md",
  "ROBLOX_SIGN_IN.md",
  "RUNTIME_CLEANUP.md",
  "SCROLLBAR_ARTWORK.md",
  "SOURCE_EXPORT.md",
  "STRUCTURE_REVIEW.md",
  "STUDIO_CLASS_TOOLS.md",
  "STUDIO_COMMANDS.md",
  "STUDIO_DEVELOPMENT.md",
  "STYLE_SIZING.md",
  "THEME_TOKENS.md",
  "TYPOGRAPHY.md",
  "UI_BEHAVIORS.md",
  "UI_PARTICLES.md",
  "USABILITY_CHECKS.md",
  "VISION_REVIEW.md",
  "VIEWPORT_FRAME.md",
  "WORLD_SPACE.md",
]);
export const RELEASE_NOTICES = Object.freeze([
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  ...[
    "PNG-codecs",
    "Inter",
    "GoogleSans",
    "React-Lua",
    "React-Lua-dependencies",
    "Codify",
    "JavaScript-dependencies",
  ].map((name) => `licenses/${name}.txt`),
]);
const artifacts = [
  "figma/manifest.json",
  "figma/code.js",
  "figma/ui.html",
  "studio/Framebridge.rbxmx",
  ...RELEASE_NOTICES,
];

export async function sourceExamplePaths(root = ".") {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(`${root}/${directory}`, {
      withFileTypes: true,
    })) {
      const entryPath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(entryPath);
      else if (
        entry.isFile() &&
        /(?:\.framebridge\.json|\.luau|\.md)$/.test(entry.name)
      )
        result.push(entryPath);
    }
  }
  await visit("examples");
  return result.sort();
}

const markdownLink = /\]\(([^)\s]+)\)/g;
function localTarget(href) {
  if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(href)) return null;
  const index = href.search(/[?#]/);
  const encoded = index < 0 ? href : href.slice(0, index);
  return {
    target: decodeURIComponent(encoded),
    suffix: index < 0 ? "" : href.slice(index),
  };
}

export function relocateMarkdownLinks(markdown, sourcePath, artifactPath) {
  return markdown.replace(markdownLink, (match, href) => {
    const local = localTarget(href);
    if (!local) return match;
    const sourceTarget = posix.normalize(
      posix.join(posix.dirname(sourcePath), local.target),
    );
    const archiveTarget = sourceTarget.startsWith("docs/")
      ? sourceTarget.slice(5)
      : sourceTarget;
    return `](${posix.relative(posix.dirname(artifactPath), archiveTarget)}${local.suffix})`;
  });
}

export function checkReleaseBundle(
  archiveBytes,
  expectedExamples,
  expectedStudio,
) {
  if (
    !Array.isArray(expectedStudio) ||
    !expectedStudio.includes("studio/default.project.json")
  )
    throw new Error("A reviewed Studio project inventory is required.");
  const files = unzipSync(archiveBytes);
  const paths = Object.keys(files);
  const allowed = new Set([
    ...artifacts,
    ...RELEASE_GUIDES,
    ...expectedExamples,
    ...expectedStudio,
    "release.json",
  ]);
  for (const entry of paths) {
    if (
      !entry ||
      entry.startsWith("/") ||
      entry.includes("\\") ||
      posix.normalize(entry) !== entry ||
      entry.split("/").includes("..")
    )
      throw new Error(`Unsafe release entry: ${entry}`);
    if (!allowed.has(entry))
      throw new Error(`Unexpected release entry: ${entry}`);
    if (!files[entry].length) throw new Error(`Empty release entry: ${entry}`);
  }
  for (const entry of [
    ...artifacts,
    ...RELEASE_GUIDES,
    ...expectedExamples,
    ...expectedStudio,
  ])
    if (!Object.hasOwn(files, entry))
      throw new Error(`Missing release entry: ${entry}`);

  const decoder = new TextDecoder("utf-8", { fatal: true });
  // Every Rojo source reference must resolve inside the shipped Studio tree.
  // Check nested vendor projects as well as the build and serve entrypoints.
  for (const path of expectedStudio.filter((path) =>
    path.endsWith(".project.json"),
  )) {
    const project = JSON.parse(decoder.decode(files[path]));
    if (!project.name || !project.tree)
      throw new Error(`Invalid Studio project: ${path}`);
    function visit(node) {
      if (!node || typeof node !== "object")
        throw new Error(`Invalid Studio project node: ${path}`);
      if (node.$path !== undefined) {
        if (
          typeof node.$path !== "string" ||
          node.$path.startsWith("/") ||
          node.$path.includes("\\")
        )
          throw new Error(`Unsafe Studio source reference: ${path}`);
        const target = posix.normalize(
          posix.join(posix.dirname(path), node.$path),
        );
        if (
          !target.startsWith("studio/") ||
          !expectedStudio.includes(target) ||
          !files[target]
        )
          throw new Error(
            `Studio project source does not resolve: ${path} → ${node.$path}`,
          );
      }
      for (const [name, child] of Object.entries(node))
        if (!name.startsWith("$")) visit(child);
    }
    visit(project.tree);
  }
  const manifest = JSON.parse(decoder.decode(files["figma/manifest.json"]));
  for (const field of ["main", "ui"])
    if (
      typeof manifest[field] !== "string" ||
      !Object.hasOwn(files, `figma/${manifest[field]}`)
    )
      throw new Error(`Figma manifest ${field} does not resolve in release.`);

  let localLinks = 0;
  for (const entry of paths) {
    if (entry.endsWith(".framebridge.json")) {
      const design = JSON.parse(decoder.decode(files[entry]));
      if (
        design.version !== 1 ||
        !Array.isArray(design.roots) ||
        design.roots.length === 0
      )
        throw new Error(`Invalid release design example: ${entry}`);
    }
    if (!entry.endsWith(".md")) continue;
    for (const match of decoder.decode(files[entry]).matchAll(markdownLink)) {
      const local = localTarget(match[1]);
      if (!local) continue;
      const target = posix.normalize(
        posix.join(posix.dirname(entry), local.target),
      );
      if (!Object.hasOwn(files, target))
        throw new Error(`Broken release link: ${entry} → ${match[1]}`);
      localLinks++;
    }
  }
  return {
    entries: paths.length,
    examples: paths.filter((entry) => entry.startsWith("examples/")).length,
    guides: RELEASE_GUIDES.length,
    studioSources: expectedStudio.filter((path) => path.endsWith(".luau"))
      .length,
    localLinks,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const archivePath = process.argv[2] ?? "dist/Framebridge-plugins.zip";
  const report = checkReleaseBundle(
    new Uint8Array(await readFile(archivePath)),
    await sourceExamplePaths(),
    await studioProjectPaths(),
  );
  console.log(JSON.stringify({ archive: archivePath, ...report }));
}
