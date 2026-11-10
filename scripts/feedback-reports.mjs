import { readFile, lstat, open } from "node:fs/promises";
import { resolve } from "node:path";

function argumentsFor(argv) {
  const command = argv.shift();
  if (!["list", "get"].includes(command))
    throw new Error(
      "Use list or get, with --token-file and optionally --origin, --page, --id, --out.",
    );
  const options = { command };
  while (argv.length) {
    const key = argv.shift(),
      value = argv.shift();
    if (
      !["--token-file", "--origin", "--page", "--id", "--out"].includes(key) ||
      !value ||
      options[key]
    )
      throw new Error("Invalid or repeated option.");
    options[key] = value;
  }
  if (!options["--token-file"])
    throw new Error(
      "Provide the private operator token file; do not pass a token directly.",
    );
  if (
    command === "get" &&
    (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      options["--id"] ?? "",
    ) ||
      !options["--out"])
  )
    throw new Error("get requires --id and --out to save the private report.");
  return options;
}
async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const path = resolve(options["--token-file"]),
    stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error(
      "Operator token must be a regular owner-only file (chmod 600).",
    );
  if (stat.size > 66) throw new Error("Invalid operator token file.");
  const token = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid operator token file.");
  const configured =
    options["--origin"] ??
    JSON.parse(
      await readFile(".artifacts/private-beta/deployment.json", "utf8"),
    ).url;
  const origin = new URL(configured);
  if (
    origin.origin !== configured ||
    !(
      origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname))
    )
  )
    throw new Error(
      "Use an HTTPS service origin or local QA origin, without paths or credentials.",
    );
  const page = options["--page"] ?? "0";
  if (!/^[0-5]$/.test(page)) throw new Error("Page must be 0 through 5.");
  const route =
    options.command === "list"
      ? "/v1/feedback/reports?page=" + page
      : "/v1/feedback/reports/" + options["--id"];
  const response = await fetch(origin.origin + route, {
    headers: { Authorization: "Bearer " + token },
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Private report request failed (HTTP " +
        response.status +
        "). Check the origin and operator setup.",
    );
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 900000) {
      await reader.cancel();
      throw new Error("Report response exceeds its limit.");
    }
    chunks.push(value);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    options.command === "list" &&
    (!Array.isArray(result.reports) ||
      result.reports.length > 20 ||
      typeof result.more !== "boolean")
  )
    throw new Error("Invalid report list response.");
  if (
    options.command === "get" &&
    (!result.receipt || result.report?.format !== "framebridge-feedback")
  )
    throw new Error("Invalid report response.");
  const text = JSON.stringify(result, null, 2) + "\n";
  if (options["--out"]) {
    const out = await open(resolve(options["--out"]), "wx", 0o600);
    try {
      await out.writeFile(text);
    } finally {
      await out.close();
    }
    console.log("Private report data saved to the requested file.");
  } else console.log(text);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Private report request failed.",
  );
  process.exitCode = 1;
});
