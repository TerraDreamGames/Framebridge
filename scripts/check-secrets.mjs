import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { unzipSync } from "fflate";

const version = "8.30.1";
const archives = {
  darwin_arm64: [
    "tar.gz",
    "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  ],
  darwin_x64: [
    "tar.gz",
    "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  ],
  linux_arm64: [
    "tar.gz",
    "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  ],
  linux_x64: [
    "tar.gz",
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  ],
  windows_arm64: [
    "zip",
    "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f",
  ],
  windows_x64: [
    "zip",
    "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  ],
};
const platform = `${process.platform === "win32" ? "windows" : process.platform}_${process.arch}`;
const reportDir = resolve(".artifacts/security-audit");
await mkdir(reportDir, { recursive: true, mode: 0o700 });
let binary = process.env.GITLEAKS_BIN;
if (!binary) {
  const archive = archives[platform];
  if (!archive)
    throw new Error(
      "Unsupported automatic Gitleaks platform; set GITLEAKS_BIN to your installed scanner.",
    );
  const [extension, checksum] = archive;
  const directory = resolve(
    `.artifacts/security-tools/gitleaks-${version}-${platform}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `gitleaks_${version}_${platform}.${extension}`;
  const archivePath = join(directory, filename);
  let data;
  try {
    data = await readFile(archivePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!data) {
    const response = await fetch(
      `https://github.com/gitleaks/gitleaks/releases/download/v${version}/${filename}`,
      { signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok)
      throw new Error(`Gitleaks download failed (${response.status}).`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(data).digest("hex") !== checksum)
    throw new Error("Gitleaks archive checksum mismatch.");
  await writeFile(archivePath, data, { mode: 0o600 });
  binary = join(
    directory,
    process.platform === "win32" ? "gitleaks.exe" : "gitleaks",
  );
  // Re-extract from the verified archive; do not trust an older cached binary.
  if (extension === "zip") {
    const executable = unzipSync(data)["gitleaks.exe"];
    if (!executable)
      throw new Error(
        "Gitleaks executable is missing from the verified archive.",
      );
    await writeFile(binary, executable);
  } else {
    const extract = spawnSync(
      "tar",
      ["-xzf", archivePath, "-C", directory, "gitleaks"],
      { encoding: "utf8" },
    );
    if (extract.status !== 0)
      throw new Error("Could not extract the verified Gitleaks archive.");
  }
  await chmod(binary, 0o700);
}

const gitFiles = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (gitFiles.status !== 0)
  throw new Error(
    "Secret checks require a Git checkout. Initialize the clean source snapshot as a new repository first.",
  );
let failures = 0;
const results = [];
async function scan(name, args) {
  const report = join(reportDir, `gitleaks-${name}.json`);
  const result = spawnSync(
    binary,
    [
      ...args,
      "--redact=100",
      "--no-banner",
      "--no-color",
      "--report-format=json",
      `--report-path=${report}`,
      `--gitleaks-ignore-path=${resolve(".gitleaksignore")}`,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  let findings;
  try {
    findings = JSON.parse(await readFile(report, "utf8"));
    await chmod(report, 0o600);
  } catch {
    /* A failed scanner is never a passing audit. */
  }
  const pass =
    result.status === 0 && Array.isArray(findings) && findings.length === 0;
  if (!pass) failures++;
  results.push({
    scope: name,
    passed: pass,
    findings: Array.isArray(findings) ? findings.length : null,
  });
  console.log(
    `${name}: ${pass ? "passed" : "FAILED"}${Array.isArray(findings) ? ` (${findings.length} findings)` : " (scanner did not complete)"}.`,
  );
}

await scan("history", ["git", "--log-opts=--all", "."]);
const snapshot = await mkdtemp(join(tmpdir(), "framebridge-secret-check-"));
try {
  for (const file of new Set(gitFiles.stdout.split("\0").filter(Boolean))) {
    if (file.startsWith("/") || file.split(/[\\/]/).includes(".."))
      throw new Error("Unsafe source path in Git inventory.");
    let stat;
    try {
      stat = await lstat(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isFile())
      throw new Error(
        `Source snapshot cannot contain symlinks or special files: ${file}`,
      );
    const destination = join(snapshot, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
  }
  await scan("source", ["dir", snapshot, "--max-archive-depth=2"]);
} finally {
  await rm(snapshot, { recursive: true, force: true });
}
const release = resolve("dist/Framebridge-plugins.zip");
await lstat(release); // A missing release fails, rather than silently skipping it.
await scan("release", ["dir", release, "--max-archive-depth=2"]);
await writeFile(
  join(reportDir, "secret-check-summary.json"),
  JSON.stringify({ scanner: `Gitleaks ${version}`, results }, null, 2) + "\n",
  { mode: 0o600 },
);
if (failures)
  throw new Error(
    `Secret checks failed. Review redacted reports in ${reportDir}; do not publish them.`,
  );
