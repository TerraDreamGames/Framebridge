import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { RUNTIME_LICENSE } from "../packages/core/src/runtime-license.mjs";

const output = "docs/licenses/JavaScript-dependencies.txt";
const fallbacks = {
  "react-remove-scroll-bar@2.3.8": {
    path: "docs/licenses/upstream/react-remove-scroll-bar-2.3.8.txt",
    source:
      "https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE",
  },
};
const permitted = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "(MIT OR Apache-2.0)",
  "CC0-1.0",
]);
// Tailwind's preflight/utility CSS is shipped even though its compiler is a
// development dependency. Native compiler tools themselves are not bundled.
const shippedBuildAssets = new Set(["node_modules/tailwindcss"]);

export async function dependencyNotices(root = ".") {
  if (
    (await readFile(`${root}/LICENSE`, "utf8")).replace(/\r\n?/g, "\n") !==
    RUNTIME_LICENSE
  )
    throw new Error("The generated runtime MIT notice differs from LICENSE.");
  const lock = JSON.parse(await readFile(`${root}/package-lock.json`, "utf8"));
  const sections = [];
  for (const [location, entry] of Object.entries(lock.packages).sort(
    ([a], [b]) => a.localeCompare(b, "en"),
  )) {
    if (!location || (entry.dev && !shippedBuildAssets.has(location))) continue;
    if (!permitted.has(entry.license))
      throw new Error(
        `Review runtime license: ${location} (${entry.license ?? "missing"})`,
      );
    const metadata = JSON.parse(
      await readFile(`${root}/${location}/package.json`, "utf8"),
    );
    if (metadata.version !== entry.version)
      throw new Error(
        `Installed dependency differs from lockfile: ${location}`,
      );
    const names = (await readdir(`${root}/${location}`))
      .filter((name) => /^(license|licence|copying|notice)([.-]|$)/i.test(name))
      .sort();
    const identifier = `${metadata.name}@${metadata.version}`;
    const notices = [];
    for (const name of names) {
      const content = (
        await readFile(`${root}/${location}/${name}`, "utf8")
      ).replace(/\r\n?/g, "\n");
      if (!content.trim())
        throw new Error(`Empty dependency notice: ${location}/${name}`);
      notices.push(`${name}\n\n${content.trim()}`);
    }
    if (!notices.length) {
      const fallback = fallbacks[identifier];
      if (!fallback)
        throw new Error(`Missing full dependency license: ${identifier}`);
      const content = (
        await readFile(`${root}/${fallback.path}`, "utf8")
      ).replace(/\r\n?/g, "\n");
      if (!/Permission is hereby granted/.test(content))
        throw new Error(`Incomplete fallback notice: ${identifier}`);
      notices.push(
        `Upstream license omitted from the npm archive\nSource: ${fallback.source}\nSHA-256: ${createHash("sha256").update(content).digest("hex")}\n\n${content.trim()}`,
      );
    }
    sections.push(
      `${identifier}\nLicense: ${entry.license}\nInstalled path: ${location}\n\n${notices.join("\n\n")}`,
    );
  }
  return `Framebridge JavaScript dependency notices\n\nGenerated from package-lock.json and installed production dependencies,\nplus Tailwind CSS used in the shipped stylesheet. Includes full license\nand notice files; native build tools are not bundled.\nRegenerate with npm run licenses:update after npm ci.\n\n${sections.join("\n\n" + "=".repeat(72) + "\n\n")}\n`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const notices = await dependencyNotices();
  if (process.argv.includes("--write")) {
    await writeFile(output, notices);
    console.log(`Updated ${output}.`);
  } else {
    if ((await readFile(output, "utf8")) !== notices)
      throw new Error(
        "Dependency notices are stale. Run npm run licenses:update.",
      );
    console.log("Runtime dependency licenses and full notices verified.");
  }
}
