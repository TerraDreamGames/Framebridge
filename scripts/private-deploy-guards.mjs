import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const testerName = /^[a-z][a-z0-9-]{0,39}$/;
const hash = /^[a-f0-9]{64}$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function validateInvitations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Invalid private invitation inventory. Restore the reviewed inventory before continuing.",
    );
  const entries = Object.entries(value);
  if (
    entries.some(
      ([name, value]) =>
        !testerName.test(name) ||
        typeof value !== "string" ||
        !hash.test(value),
    ) ||
    new Set(entries.map(([, value]) => value)).size !== entries.length
  )
    throw new Error(
      "Invalid private invitation inventory. Restore the reviewed inventory before continuing.",
    );
  return Object.fromEntries(entries);
}

export async function readDeployInvitations(directory) {
  let records;
  try {
    const file = resolve(directory, "invitations.json");
    if (!(await lstat(file)).isFile()) throw new Error();
    const bytes = await readFile(file);
    if (bytes.length > 65_536) throw new Error();
    records = validateInvitations(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new Error(
      "Private deployment requires the existing reviewed invitations.json and code files. Restore them securely into .artifacts/private-beta; deployment does not create or replace access. For a genuinely new Worker, explicitly create an owner with beta:invite and use beta:deploy -- --bootstrap.",
    );
  }
  if (!Object.keys(records).length)
    throw new Error(
      "Private deployment requires at least one active invitation. An empty inventory must not bootstrap or replace production access.",
    );
  for (const [name, expected] of Object.entries(records)) {
    try {
      const file = resolve(directory, "invitations", `${name}.txt`);
      const info = await lstat(file);
      if (!info.isFile() || info.size > 256) throw new Error();
      const token = (await readFile(file, "utf8")).trim();
      if (!hash.test(token) || digest(token) !== expected) throw new Error();
    } catch {
      throw new Error(
        "Private invitation code files are missing or do not match the reviewed inventory. Restore matching owner-only files before deployment.",
      );
    }
  }
  return records;
}

export function assertUnchangedInvitations(before, after) {
  const ordered = (records) =>
    JSON.stringify(
      Object.entries(records).sort(([a], [b]) => a.localeCompare(b)),
    );
  if (ordered(before) !== ordered(after))
    throw new Error(
      "Private invitation inventory changed during deployment. Review it and retry; access synchronization requires an explicit beta:access command.",
    );
}

/** Only an authenticated, account/Worker-specific not-found response proves absence. */
export function workerExistsFromWrangler(result, accountId, workerName) {
  if (!result.error && result.status === 0) {
    try {
      const deployments = JSON.parse(result.stdout);
      if (Array.isArray(deployments)) return true;
    } catch {
      /* Invalid output is an unknown state, never a new Worker. */
    }
  } else if (!result.error && result.status === 1) {
    const output = String(result.stderr ?? "").replace(/\x1b\[[0-9;]*m/g, "");
    const resource = `/accounts/${accountId}/workers/scripts/${workerName}/deployments`;
    const codes = [...output.matchAll(/\[code:\s*(\d+)\]/g)];
    if (
      output.includes(
        `A request to the Cloudflare API (${resource}) failed.`,
      ) &&
      codes.length === 1 &&
      codes[0][1] === "10007"
    )
      return false;
  }
  throw new Error(
    "Could not verify the Worker in the selected Cloudflare account. Check account access and retry; authentication, network or unknown failures cannot authorize bootstrap.",
  );
}
