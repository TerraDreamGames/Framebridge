import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  loadStudioTree,
  sourceTemplate,
  STUDIO_MODULES,
} from "../scripts/studio-tree.mjs";
import { studioProjectFiles } from "../scripts/studio-project.mjs";

describe("native Studio packaging", () => {
  it("ships readable source files with the real require hierarchy and preserved vendor code", async () => {
    const tree = await loadStudioTree(
      "-- Entry\nlocal Importer = require(script.Importer)\n",
    );
    const files = studioProjectFiles(tree);
    const project = JSON.parse(files["default.project.json"]);
    expect(project.tree.$path).toBe("generated/Plugin.server.luau");
    expect(files[project.tree.$path]).not.toContain("__factory");
    expect(files[project.tree.$path]).toContain("MIT License");
    for (const name of STUDIO_MODULES) {
      expect(project.tree[name].$path).toBe(`src/${name}.luau`);
      expect(files[`src/${name}.luau`]).toBe(
        await readFile(`plugins/studio/src/${name}.luau`, "utf8"),
      );
    }
    const vendor = tree.children.find((child) => child.name === "ReactLua")!;
    const vendorProject = JSON.parse(
      files["generated/ReactLua/default.project.json"],
    );
    function check(node: typeof vendor, mapped: Record<string, any>) {
      if (node.source !== undefined)
        expect(files[`generated/ReactLua/${mapped.$path}`]).toBe(node.source);
      else expect(mapped.$className).toBe(node.className);
      for (const child of node.children) check(child, mapped[child.name]);
    }
    check(vendor, vendorProject.tree);
    const sources = Object.entries(files).filter(([path]) =>
      path.endsWith(".luau"),
    );
    expect(sources.length).toBeGreaterThan(364);
    expect(
      sources.every(([, source]) => Buffer.byteLength(source) < 200_000),
    ).toBe(true);
    expect(files["generated/BehaviorSources/Base.luau"]).toContain(
      "require(script.Part01)",
    );
    expect(files["generated/BehaviorSource.luau"]).toContain(
      "require(Templates.Base)",
    );
    expect(
      files["generated/BehaviorSource.luau"].split("\n").length,
    ).toBeLessThan(20);
  });

  it("keeps runtime templates readable even when they contain long-string delimiters", () => {
    const source = "-- Comments\nlocal text = [=[nested]=]\nreturn text\n";
    expect(sourceTemplate(source)).toContain(`return [==[\n${source}]==]`);
  });

  it("rejects modules that cannot be assigned through Studio", () => {
    expect(() =>
      studioProjectFiles({
        name: "Framebridge",
        className: "Script",
        source: "-- Entry",
        children: [
          {
            name: "Oversized",
            className: "ModuleScript",
            source: "x".repeat(200_000),
            children: [],
          },
        ],
      }),
    ).toThrow("split this module");
  });

  it("syncs only the plugin under ServerStorage and preserves other place content", async () => {
    const files = studioProjectFiles(await loadStudioTree("-- Entry\n"));
    const serve = JSON.parse(files["serve.project.json"]);
    expect(serve.serveAddress).toBe("127.0.0.1");
    expect(serve.servePort).toBe(34873);
    expect(serve.tree.$ignoreUnknownInstances).toBe(true);
    expect(serve.tree.ServerStorage.$ignoreUnknownInstances).toBe(true);
    expect(serve.tree.ServerStorage.Framebridge.$path).toBe(
      "default.project.json",
    );
    expect(
      Object.keys(serve.tree).filter((key) => !key.startsWith("$")),
    ).toEqual(["ServerStorage"]);
  });
});
