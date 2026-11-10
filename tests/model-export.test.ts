import { describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import {
  buildModelExport,
  generateModel,
} from "../packages/core/src/model-export";
import { flatten } from "../packages/core/src/types";
import { modelPackages } from "./model-export-fixtures";

describe("Roblox model downloads", () => {
  const packages = modelPackages();
  it.each(Object.keys(packages))(
    "exports %s without altering the analyzed package",
    (name) => {
      const pkg = packages[name];
      const before = JSON.stringify(pkg);
      const file = buildModelExport({
        package: pkg,
        assets: {},
        previews: {},
        revision: 1,
      });
      expect(file.name).toMatch(/\.rbxmx$/);
      expect(file.mime).toBe("application/xml");
      const xml = strFromU8(file.data);
      const runtimeCount = pkg.roots.filter((root) =>
        flatten([root]).some(
          (n) => n.behavior || n.maskBasis || n.decorationRect || n.layoutCanvas,
        ),
      ).length;
      expect(xml.startsWith('<roblox version="4">')).toBe(true);
      expect([...xml.matchAll(/<Item /g)]).toHaveLength(
        flatten(pkg.roots).length + runtimeCount * 2,
      );
      const ids = [...xml.matchAll(/referent="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(JSON.stringify(pkg)).toBe(before);
      expect([
        ...xml.matchAll(/<ProtectedString name="Source">/g),
      ]).toHaveLength(runtimeCount * 2);
    },
  );
  it("requires image links and supports a corrected package without PNG bytes", () => {
    const pkg = structuredClone(packages.preparedImage);
    pkg.assets[0].robloxId = undefined;
    expect(() => generateModel(pkg)).toThrow("Link 1 image in Images");
    pkg.assets[0].robloxId = "rbxassetid://246801357";
    expect(generateModel(pkg)).toContain(
      '<ContentId name="Image"><url>rbxassetid://246801357</url></ContentId>',
    );
  });
  it("escapes text and names without changing the content", () => {
    const xml = generateModel(packages.properties);
    expect(xml).toContain(
      "Text &amp; &lt;&quot;quoted&quot;&gt; &apos;☃🙂&apos;",
    );
    expect(xml).toContain(
      "  &lt;b&gt;Keep &amp; escape&lt;/b&gt;&#13;\nSecond\tline 🙂  ",
    );
    expect(xml).toContain('<float name="TextSize">18.75</float>');
    expect(xml).toContain('<int name="LayoutOrder">7</int>');
    expect(xml).toContain("<XO>12</XO>");
    expect(xml).toContain("<YO>-12</YO>");
  });
  it.each(["\u0000", "\u0001", "\ud800", "\udc00", "\ufffe"])(
    "rejects unrepresentable XML text %j with guidance",
    (text) => {
      const pkg = structuredClone(packages.demo);
      pkg.roots[0].name = text;
      expect(() => generateModel(pkg)).toThrow(
        "download the Framebridge package instead",
      );
    },
  );
  it("retains blank intentional images and rejects invalid links", () => {
    expect(generateModel(packages.properties)).toContain(
      '<ContentId name="Image"><null></null></ContentId>',
    );
    const pkg = structuredClone(packages.preparedImage);
    pkg.assets[0].robloxId = "javascript:alert(1)";
    expect(() => generateModel(pkg)).toThrow("Invalid Roblox image ID");
  });
  it("rejects blocking conversion errors, unknown classes, duplicate identities and malformed properties", () => {
    for (const mutate of [
      (pkg: typeof packages.demo) =>
        pkg.issues.push({
          severity: "error",
          code: "blocked",
          message: "Blocked",
          nodeId: "blocked",
          nodeName: "Blocked",
        }),
      (pkg: typeof packages.demo) => {
        pkg.roots[0].className = "Script";
      },
      (pkg: typeof packages.demo) => {
        pkg.roots.push(structuredClone(pkg.roots[0]));
      },
      (pkg: typeof packages.demo) => {
        pkg.roots[0].properties.Enabled = { type: "Vector2", value: [1, 1] };
      },
    ]) {
      const pkg = structuredClone(packages.demo);
      mutate(pkg);
      expect(() => generateModel(pkg)).toThrow();
    }
  });
});
