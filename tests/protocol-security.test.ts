import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { demoResult } from "../packages/core/src/demo";
import { validatePackage } from "../packages/relay/src/protocol";
import type { RbxNode } from "../packages/core/src/types";

const node = (id: string): RbxNode => ({
  id,
  name: id,
  className: "Frame",
  properties: {},
  children: [],
});
describe("untrusted transfer structure", () => {
  it("accepts a normal compiled design", () => {
    expect(() => validatePackage(demoResult().package)).not.toThrow();
  });
  it.each(["Script", "LocalScript", "ModuleScript", "Part", "__proto__"])(
    "rejects the unsupported class %s before storing a transfer",
    (className) => {
      const pkg = demoResult().package;
      pkg.roots[0].children = [{ ...node("untrusted"), className }];
      expect(() => validatePackage(pkg)).toThrow("unsupported UI instance");
    },
  );
  it.each(["Source", "Parent", "RunContext", "ScriptGuid", "Disabled"])(
    "rejects executable/control property %s",
    (key) => {
      const pkg = demoResult().package;
      pkg.roots[0].properties[key] = "untrusted";
      expect(() => validatePackage(pkg)).toThrow("unsupported UI instance");
    },
  );
  it("rejects deep trees before recursive feature validation", () => {
    const pkg = demoResult().package;
    let child = node("leaf");
    for (let i = 0; i < 5_000; i++)
      child = { ...node(String(i)), children: [child] };
    pkg.roots[0].children = [child];
    expect(() => validatePackage(pkg)).toThrow("unsupported UI instance");
  });
  it("rejects broad trees before allocating recursive traversal results", () => {
    const pkg = demoResult().package;
    pkg.roots[0].children = Array.from({ length: 15_000 }, (_, i) =>
      node(String(i)),
    );
    expect(() => validatePackage(pkg)).toThrow("15,000-instance");
  });
  it("rejects cycles and malformed child collections", () => {
    const pkg = demoResult().package;
    pkg.roots[0].children = [pkg.roots[0]];
    expect(() => validatePackage(pkg)).toThrow("unsupported UI instance");
    pkg.roots[0].children = null as never;
    expect(() => validatePackage(pkg)).toThrow("unsupported UI instance");
  });
  it("rejects null asset and diagnostic records with a public validation error", () => {
    for (const key of ["assets", "issues"] as const) {
      const pkg = demoResult().package;
      pkg[key] = [null] as never;
      expect(() => validatePackage(pkg)).toThrow("Invalid Framebridge package");
    }
  });
  it("covers every data-only class supported by the native importer", () => {
    const source = readFileSync(
      new URL("../plugins/studio/src/Importer.luau", import.meta.url),
      "utf8",
    );
    const classes = [
      ...source
        .slice(
          source.indexOf("local PROPERTIES = {"),
          source.indexOf("local ENUMS"),
        )
        .matchAll(/(\w+)\s*=\s*set\(/g),
    ].map((m) => m[1]);
    expect(classes.length).toBeGreaterThan(20);
    for (const className of classes) {
      const pkg = demoResult().package;
      pkg.roots[0].children = [{ ...node("supported"), className }];
      // Feature validation can reject an incomplete fixture, but the structure
      // boundary must recognize every class that Studio intentionally accepts.
      try {
        validatePackage(pkg);
      } catch (error) {
        expect((error as Error).message).not.toContain(
          "unsupported UI instance",
        );
      }
    }
  });
});
