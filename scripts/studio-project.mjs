import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { loadStudioTree, STUDIO_MODULES } from "./studio-tree.mjs";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export async function rojoBinary() {
  if (process.env.ROJO_BIN) return process.env.ROJO_BIN;
  // Prefer Aftman's installed, pinned executable. This also avoids launcher
  // issues when a freshly recreated macOS shim has not been approved yet.
  try {
    const version = (await readFile("aftman.toml", "utf8")).match(
      /rojo\s*=\s*"rojo-rbx\/rojo@([\d.]+)"/,
    )?.[1];
    if (version) {
      const executable = join(
        homedir(),
        ".aftman",
        "tool-storage",
        "rojo-rbx",
        "rojo",
        version,
        process.platform === "win32" ? "rojo.exe" : "rojo",
      );
      await access(executable);
      return executable;
    }
  } catch {
    // CI and developers using other tool managers supply Rojo through PATH.
  }
  return "rojo";
}

// Explicit project nodes preserve upstream names such as ReactFiberWorkLoop.new
// and ModuleScripts with children; filesystem inference never rewrites them.
export function studioProjectFiles(tree) {
  const files = {};
  function nodeProject(node, path, filePrefix = "") {
    if (
      !node.name ||
      /[\\/]/.test(node.name) ||
      node.name === "." ||
      node.name === ".."
    )
      throw new Error(`Unsafe Studio module name: ${node.name}`);
    const project = {
      $className:
        node.className ??
        (node.source !== undefined ? "ModuleScript" : "Folder"),
    };
    if (node.source !== undefined) {
      if (Buffer.byteLength(node.source) >= 200_000)
        throw new Error(
          `Studio source exceeds the assignment limit; split this module: ${path}`,
        );
      delete project.$className;
      project.$path = `${path}.luau`;
      files[`${filePrefix}${project.$path}`] = node.source;
    }
    for (const child of node.children) {
      if (Object.hasOwn(project, child.name))
        throw new Error(`Duplicate Studio child: ${child.name}`);
      project[child.name] = nodeProject(
        child,
        `${path}/${child.name}`,
        filePrefix,
      );
    }
    return project;
  }
  if (Buffer.byteLength(tree.source) >= 200_000)
    throw new Error(
      "Studio entry exceeds the assignment limit; move its features into ModuleScripts.",
    );
  files["generated/Plugin.server.luau"] = tree.source;
  const root = { $path: "generated/Plugin.server.luau" };
  for (const child of tree.children) {
    if (child.name === "ReactLua") {
      const prefix = "generated/ReactLua/";
      files[`${prefix}default.project.json`] = json({
        name: "ReactLua",
        tree: nodeProject(child, "src/ReactLua", prefix),
      });
      root.ReactLua = { $path: `${prefix}default.project.json` };
    } else {
      root[child.name] = nodeProject(
        child,
        `${STUDIO_MODULES.includes(child.name) ? "src" : "generated"}/${child.name}`,
      );
    }
  }
  files["default.project.json"] = json({ name: "Framebridge", tree: root });
  files["serve.project.json"] = json({
    name: "Framebridge development",
    serveAddress: "127.0.0.1",
    servePort: 34873,
    tree: {
      $className: "DataModel",
      $ignoreUnknownInstances: true,
      ServerStorage: {
        $className: "ServerStorage",
        $ignoreUnknownInstances: true,
        Framebridge: { $path: "default.project.json" },
      },
    },
  });
  return files;
}

export async function studioProjectPaths() {
  return Object.keys(
    studioProjectFiles(
      await loadStudioTree("-- Entry supplied by the connected build.\n"),
    ),
  )
    .map((path) => `studio/${path}`)
    .sort();
}

async function writeProject(directory, files, preserveSources = false) {
  // Only remove our generated subtree; never modify hand-written modules.
  await rm(join(directory, "generated"), { recursive: true, force: true });
  for (const [path, source] of Object.entries(files)) {
    if (preserveSources && path.startsWith("src/")) continue;
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), source);
  }
}

export async function prepareStudioProject(entrySource) {
  const files = studioProjectFiles(await loadStudioTree(entrySource));
  await writeProject("plugins/studio", files, true);
  return files;
}

export async function buildStudioProject(
  entrySource,
  directory = "dist/studio",
) {
  const files = await prepareStudioProject(entrySource);
  await writeProject(directory, files);
  const binary = await rojoBinary();
  const build = spawnSync(
    binary,
    [
      "build",
      resolve(directory, "default.project.json"),
      "--output",
      resolve(directory, "Framebridge.rbxmx"),
    ],
    { encoding: "utf8" },
  );
  if (build.error || build.status !== 0)
    throw new Error(
      `Rojo could not build the Studio plugin. Install the pinned tools with aftman install, or set ROJO_BIN.\n${build.error?.message ?? build.stderr ?? ""}${build.signal ? `\nProcess signal: ${build.signal}` : ""}`,
    );
  // Do not leave the old single-script artifact beside the modular model.
  await rm(join(directory, "Framebridge.plugin.luau"), { force: true });
  if (build.stdout.trim()) console.log(build.stdout.trim());
  return [...Object.keys(files), "Framebridge.rbxmx"];
}

export async function configuredStudioEntry(relayUrl, privateBeta) {
  return (await readFile("plugins/studio/src/Plugin.server.luau", "utf8"))
    .replace('"__FRAMEBRIDGE_RELAY_URL__"', JSON.stringify(relayUrl))
    .replace(
      '"__FRAMEBRIDGE_PRIVATE_BETA__"',
      JSON.stringify(String(privateBeta)),
    );
}
