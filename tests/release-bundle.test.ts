import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  checkReleaseBundle as verifyRelease,
  RELEASE_GUIDES,
  RELEASE_NOTICES,
  relocateMarkdownLinks,
} from "../scripts/check-release-bundle.mjs";

const examples = [
  "examples/conditional-rules/store.framebridge.json",
  "examples/conditional-rules/DemoData.server.luau",
  "examples/conditional-rules/README.md",
];
const studio = [
  "studio/default.project.json",
  "studio/generated/Plugin.server.luau",
];
const checkReleaseBundle = (
  archive: Uint8Array,
  expectedExamples: readonly string[],
) => verifyRelease(archive, expectedExamples, studio);
function fixture(): Record<string, Uint8Array> {
  const files = Object.fromEntries(
    RELEASE_GUIDES.map((guide) => [guide, strToU8(`# ${guide}\n`)]),
  );
  Object.assign(files, {
    "figma/manifest.json": strToU8(
      JSON.stringify({ main: "code.js", ui: "ui.html" }),
    ),
    "figma/code.js": strToU8("void 0;"),
    "figma/ui.html": strToU8("<!doctype html><title>Framebridge</title>"),
    "studio/default.project.json": strToU8(
      JSON.stringify({
        name: "Framebridge",
        tree: { $path: "generated/Plugin.server.luau" },
      }),
    ),
    "studio/generated/Plugin.server.luau": strToU8("-- Readable entrypoint\n"),
    "studio/Framebridge.rbxmx": strToU8('<roblox version="4"/>'),
    "examples/conditional-rules/store.framebridge.json": strToU8(
      JSON.stringify({ version: 1, roots: [{ className: "ScreenGui" }] }),
    ),
    "examples/conditional-rules/DemoData.server.luau": strToU8("return nil"),
    "examples/conditional-rules/README.md": strToU8(
      "[Rules](../../CONDITIONAL_RULES.md)",
    ),
  });
  for (const name of RELEASE_NOTICES) files[name] = strToU8("License notice");
  return files;
}

describe("tester release archive contract", () => {
  it("checks compressed artifacts, example references and manifest targets without rebuilding", () => {
    const report = checkReleaseBundle(zipSync(fixture()), examples);
    expect(report.examples).toBe(3);
    expect(report.localLinks).toBe(1);
  });
  it.each([
    "CONDITIONAL_RULES.md",
    "ROBLOX_SIGN_IN.md",
    "STUDIO_COMMANDS.md",
    "TYPOGRAPHY.md",
    ...RELEASE_NOTICES,
    ...examples,
    ...studio,
  ])("rejects the previous omission: %s", (entry) => {
    const files = fixture();
    delete files[entry];
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      `Missing release entry: ${entry}`,
    );
  });
  it("requires newly discovered source examples instead of silently shipping a partial tree", () => {
    expect(() =>
      checkReleaseBundle(zipSync(fixture()), [
        ...examples,
        "examples/new-control/README.md",
      ]),
    ).toThrow("Missing release entry: examples/new-control/README.md");
  });
  it("rejects a guide link that only resolves inside the source checkout", () => {
    const files = fixture();
    files[examples[2]] = strToU8("[Rules](../../docs/CONDITIONAL_RULES.md)");
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      "Broken release link",
    );
  });
  it("rejects a Figma manifest pointing to an absent artifact", () => {
    const files = fixture();
    files["figma/manifest.json"] = strToU8(
      JSON.stringify({ main: "stale-code.js", ui: "ui.html" }),
    );
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      "Figma manifest main does not resolve",
    );
  });
  it("rejects stale and escaping Rojo paths", () => {
    const files = fixture();
    for (const path of ["src/missing.luau", "../../outside.luau"]) {
      files[studio[0]] = strToU8(
        JSON.stringify({ name: "Framebridge", tree: { $path: path } }),
      );
      expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
        "Studio project source does not resolve",
      );
    }
  });
  it("rejects an empty example and invalid design JSON shape", () => {
    const files = fixture();
    files[examples[1]] = new Uint8Array();
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      "Empty release entry",
    );
    files[examples[1]] = strToU8("return nil");
    files[examples[0]] = strToU8('{"version":1,"roots":[]}');
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      "Invalid release design example",
    );
  });
  it("rejects traversal entries even if the required inventory is otherwise present", () => {
    const files = fixture();
    files["../outside.txt"] = strToU8("outside");
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      "Unsafe release entry",
    );
  });
  it.each([
    ".env",
    ".dev.vars",
    ".artifacts/private-beta/credentials.json",
    ".wrangler/config/default.toml",
    "private-key.pem",
    "figma/secrets.json",
  ])("rejects unapproved private files in a release: %s", (entry) => {
    const files = fixture();
    files[entry] = strToU8("private local configuration");
    expect(() => checkReleaseBundle(zipSync(files), examples)).toThrow(
      `Unexpected release entry: ${entry}`,
    );
  });
});

describe("release documentation relocation", () => {
  it("relocates source guide and example targets while retaining anchors and external links", () => {
    const source =
      "[Demo](../examples/keyframes/README.md#record) [Rules](CONDITIONAL_RULES.md) [API](https://example.com/docs) [Here](#local)";
    expect(
      relocateMarkdownLinks(
        source,
        "docs/KEYFRAME_MOTION.md",
        "KEYFRAME_MOTION.md",
      ),
    ).toBe(
      "[Demo](examples/keyframes/README.md#record) [Rules](CONDITIONAL_RULES.md) [API](https://example.com/docs) [Here](#local)",
    );
  });
  it("rewrites README links to root guides without moving example-relative files", () => {
    const source =
      "[Rules](../../docs/CONDITIONAL_RULES.md) [Design](store.framebridge.json)";
    expect(relocateMarkdownLinks(source, examples[2], examples[2])).toBe(
      "[Rules](../../CONDITIONAL_RULES.md) [Design](store.framebridge.json)",
    );
  });
});
