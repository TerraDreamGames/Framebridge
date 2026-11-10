import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const optionalDirectory = resolve(
  ".artifacts/optional-integration-acceptance",
);
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export async function privateDirectory(path = optionalDirectory) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}
export async function privateJson(path: string) {
  const info = await stat(path);
  if (!info.isFile() || info.mode & 0o077 || info.uid !== process.getuid?.())
    throw new Error("Use an owner-only regular JSON file with mode 600.");
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    // A JSON parse error can contain the private input; never forward it.
    throw new Error("The owner-only file is not valid JSON.");
  }
}
export async function savePrivate(name: string, value: unknown) {
  await privateDirectory();
  const path = resolve(optionalDirectory, name);
  if (!path.startsWith(optionalDirectory + "/"))
    throw new Error("Invalid evidence path.");
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
}
export type OptionalCredentials = {
  relayUrl: string;
  betaAccess: string;
  accountToken: string;
};
export async function optionalCredentials(
  path: string,
): Promise<OptionalCredentials> {
  const value = (await privateJson(path)) as OptionalCredentials;
  let origin: URL;
  try {
    origin = new URL(value.relayUrl);
  } catch {
    throw new Error("Use the exact private HTTPS relay origin.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== value.relayUrl ||
    origin.username ||
    origin.password ||
    !/^[a-f0-9]{64}$/.test(value.betaAccess) ||
    !/^[a-f0-9]{64}$/.test(value.accountToken)
  )
    throw new Error(
      "Use the exact HTTPS origin and current private invitation/account capabilities.",
    );
  return value;
}
