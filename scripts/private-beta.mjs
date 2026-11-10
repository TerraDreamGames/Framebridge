import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { zipSync, strToU8, unzipSync } from "fflate";
import {
  digest,
  sourceProvenance,
  workerDeployArgs,
  assertUnchangedSource,
  fetchMatchingBackend,
  releaseBuildProvenance,
} from "./private-release-provenance.mjs";
import {
  validateInvitations,
  readDeployInvitations,
  assertUnchangedInvitations,
  workerExistsFromWrangler,
} from "./private-deploy-guards.mjs";

const directory = resolve(".artifacts/private-beta");
const recordsPath = `${directory}/invitations.json`;
await mkdir(`${directory}/invitations`, { recursive: true, mode: 0o700 });
async function invitations() {
  try {
    return validateInvitations(JSON.parse(await readFile(recordsPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
async function store(value) {
  await writeFile(recordsPath, JSON.stringify(value, null, 2), { mode: 0o600 });
}
async function invite(name) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(name ?? ""))
    throw new Error(
      "Choose a tester name: lowercase letters, numbers and hyphens.",
    );
  const records = await invitations();
  if (records[name])
    throw new Error(
      "Tester already exists; revoke before replacing their invitation.",
    );
  const token = randomBytes(32).toString("hex");
  records[name] = digest(token);
  const path = `${directory}/invitations/${name}.txt`;
  await writeFile(path, token + "\n", { mode: 0o600, flag: "wx" });
  await store(records);
  console.log(
    `Tester access saved to ${path}. Share this file privately; it is excluded from Git and release bundles.`,
  );
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}). ${result.stderr ?? ""}`,
    );
  return result.stdout ?? "";
}
function wrangler(args, options = {}) {
  return run(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    options,
  );
}
async function syncAccess(records) {
  // An intentionally empty saved inventory can close access. A missing file
  // must never be mistaken for a deliberate revocation of every tester.
  records ??= validateInvitations(
    JSON.parse(await readFile(recordsPath, "utf8")),
  );
  const hashes = Object.values(records);
  if (hashes.some((value) => !/^[a-f0-9]{64}$/.test(value)))
    throw new Error("Invalid invitation hash record.");
  // Send only hashes over stdin; never place secrets in argv or terminal output.
  wrangler(["secret", "put", "BETA_ACCESS_HASHES"], {
    input: hashes.join(",") + "\n",
  });
  console.log(
    `Synced access for ${hashes.length} testers. Revoked invitations also invalidate existing sessions.`,
  );
}
async function deploymentTarget() {
  const { unstable_readConfig } = await import("wrangler");
  const config = unstable_readConfig({ config: "wrangler.jsonc" });
  if (config.vars?.ACCESS_MODE === "public")
    throw new Error(
      "This Worker is configured for public access. Use npm run release:deploy; private deployment requires a separately configured invitation-protected Worker.",
    );
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? config.account_id;
  if (
    !/^[a-f0-9]{32}$/.test(accountId ?? "") ||
    (config.account_id && config.account_id !== accountId)
  )
    throw new Error(
      "Set CLOUDFLARE_ACCOUNT_ID to the intended existing relay account before deployment; it must agree with any account_id in wrangler.jsonc.",
    );
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.name ?? ""))
    throw new Error(
      "A valid Worker name in wrangler.jsonc is required before deployment.",
    );
  return { accountId, name: config.name };
}
function workerExists(target) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deployments",
      "list",
      "--name",
      target.name,
      "--json",
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1_048_576,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: target.accountId },
    },
  );
  return workerExistsFromWrangler(result, target.accountId, target.name);
}
async function deployed(source, expectedWorkerId) {
  source ??= await sourceProvenance();
  const value = JSON.parse(
    await readFile(`${directory}/deployment.json`, "utf8"),
  );
  const url = new URL(value.url);
  if (
    url.origin !== value.url ||
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev")
  )
    throw new Error("Expected a verified Cloudflare Workers origin.");
  let backend;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      backend = await fetchMatchingBackend(value.url, source, {
        expectedWorkerId,
      });
      break;
    } catch (error) {
      // Retry activation/network failures only. Missing or stale provenance must
      // fail immediately, before building or accepting the deployment record.
      if (!(error instanceof TypeError) && error.name !== "TimeoutError")
        throw error;
      if (attempt === 5)
        throw new Error(
          `HTTPS endpoint is not ready (${error.cause?.code ?? "network error"}). Retry beta:smoke and beta:release once Cloudflare activates it.`,
        );
      if (attempt === 0)
        console.log(
          "Waiting for Cloudflare to activate the new HTTPS endpoint…",
        );
      await delay(Math.min(2000 * 2 ** attempt, 8000));
    }
  }
  value.backend = backend;
  value.verifiedAt = new Date().toISOString();
  await writeFile(
    `${directory}/deployment.json`,
    JSON.stringify(value, null, 2),
  );
  return value;
}
async function smoke(url) {
  const records = await invitations();
  const name = Object.keys(records)[0];
  const access = (
    await readFile(`${directory}/invitations/${name}.txt`, "utf8")
  ).trim();
  async function call(path, token, body, method, headers = {}) {
    const response = await fetch(url + path, {
      redirect: "error",
      signal: AbortSignal.timeout(35_000),
      method: method ?? (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  if ((await call("/v1/sessions", "", {})).status !== 403)
    throw new Error("Backend is not invitation protected.");
  const created = await call("/v1/sessions", "", {}, undefined, {
    "X-Framebridge-Beta": access,
  });
  if (created.status !== 201)
    throw new Error(`Session creation failed (${created.status}).`);
  const receiver = created.data.receiverToken;
  try {
    const pair = await call("/v1/pair", "", { code: created.data.code });
    if (pair.status !== 200) throw new Error("Pairing failed.");
    const pkg = JSON.parse(
      await readFile(
        "examples/layouts/inventory-grid.framebridge.json",
        "utf8",
      ),
    );
    const sent = await call("/v1/package", pair.data.senderToken, pkg);
    const inbox = await call("/v1/inbox?after=0", receiver);
    if (
      sent.status !== 200 ||
      !inbox.data.package ||
      inbox.data.revision !== sent.data.revision
    )
      throw new Error("Export delivery failed.");
    const ack = await call("/v1/receipt", receiver, {
      revision: sent.data.revision,
      status: "ready",
    });
    const receipt = await call(
      `/v1/receipt?revision=${sent.data.revision}`,
      pair.data.senderToken,
    );
    if (ack.status !== 200 || receipt.data.status !== "ready")
      throw new Error("Import acknowledgment failed.");
    pkg.roots[0].name += " · second transfer";
    const second = await call("/v1/package", pair.data.senderToken, pkg);
    const next = await call(`/v1/inbox?after=${sent.data.revision}`, receiver);
    if (
      second.status !== 200 ||
      second.data.revision !== sent.data.revision + 1 ||
      !next.data.paired ||
      !next.data.package
    )
      throw new Error(
        "The paired connection did not survive the first transfer.",
      );
    await call("/v1/receipt", receiver, {
      revision: second.data.revision,
      status: "imported",
    });
    const senderState = await call("/v1/session", pair.data.senderToken);
    const receiverState = await call("/v1/session", receiver);
    if (
      senderState.data.role !== "sender" ||
      !senderState.data.paired ||
      receiverState.data.importedRevision !== second.data.revision
    )
      throw new Error("Connection resume after import acknowledgment failed.");
    console.log(
      "Live HTTPS smoke test passed: invitation, one pairing, two exports, review/import receipts, session resume and disconnect. No Roblox assets created.",
    );
  } finally {
    await call("/v1/session", receiver, undefined, "DELETE");
  }
}
async function release() {
  const source = await sourceProvenance();
  const deployment = await deployed(source);
  run(process.execPath, ["scripts/build.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      FRAMEBRIDGE_PRIVATE_BETA: "1",
      FRAMEBRIDGE_RELAY_URL: deployment.url,
    },
  });
  assertUnchangedSource(source, await sourceProvenance());
  // Do not publish a matching ZIP if the backend changes while clients build.
  const verified = await deployed(source, deployment.backend.worker.id);
  const files = unzipSync(
    new Uint8Array(await readFile("dist/Framebridge-plugins.zip")),
  );
  files["PRIVATE_BETA.md"] = strToU8(
    await readFile("docs/PRIVATE_BETA.md", "utf8"),
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(files["figma/manifest.json"]),
  );
  if (!manifest.networkAccess.allowedDomains.includes(deployment.url))
    throw new Error("Release endpoint mismatch.");
  const release = {
    version: JSON.parse(await readFile("package.json", "utf8")).version,
    builtAt: new Date().toISOString(),
    relay: deployment.url,
    access: "private-beta",
    provenance: releaseBuildProvenance(files, source, verified.backend),
  };
  release.sha256 = release.provenance.sha256;
  files["release.json"] = strToU8(JSON.stringify(release, null, 2));
  // Assert that no raw tester credential slipped into any generated artifact.
  for (const name of Object.keys(await invitations())) {
    const token = (
      await readFile(`${directory}/invitations/${name}.txt`, "utf8")
    ).trim();
    if (
      Object.values(files).some((bytes) => Buffer.from(bytes).includes(token))
    )
      throw new Error("Credential detected in release.");
  }
  const path = `${directory}/Framebridge-private-beta.zip`;
  await writeFile(path, zipSync(files));
  await copyFile(
    "dist/studio/Framebridge.rbxmx",
    `${directory}/Framebridge.rbxmx`,
  );
  console.log(`Matching private plugins built: ${path}`);
}
const [command, name, ...extra] = process.argv.slice(2);
try {
  if (command === "invite") await invite(name);
  else if (command === "revoke") {
    const records = await invitations();
    if (!records[name]) throw new Error("Unknown tester.");
    delete records[name];
    await store(records);
    await rename(
      `${directory}/invitations/${name}.txt`,
      `${directory}/invitations/${name}.revoked-${Date.now()}.txt`,
    );
    console.log(
      "Invitation revoked locally. Run npm run beta:access to apply this to Cloudflare.",
    );
  } else if (command === "access") await syncAccess();
  else if (command === "release") await release();
  else if (command === "smoke") await smoke((await deployed()).url);
  else if (command === "deploy") {
    if (extra.length || (name && name !== "--bootstrap"))
      throw new Error(
        "Use beta:deploy for an existing Worker or beta:deploy -- --bootstrap for a verified new Worker.",
      );
    const bootstrap = name === "--bootstrap";
    const inventory = await readDeployInvitations(directory);
    const target = await deploymentTarget();
    const exists = workerExists(target);
    if (bootstrap && exists)
      throw new Error(
        "Bootstrap refused: this Worker already exists. Restore its invitation inventory and use beta:deploy; beta:access is the explicit access-change command.",
      );
    if (!bootstrap && !exists)
      throw new Error(
        "This Worker does not exist in the selected account. Review the account/name, then use beta:deploy -- --bootstrap only for a genuinely new private service.",
      );
    if (bootstrap) {
      // A saved deployment identifies an existing service even if it was
      // removed remotely. Recreating it requires a separately reviewed setup.
      try {
        await readFile(`${directory}/deployment.json`);
        throw new Error(
          "Bootstrap refused: this workspace has a saved deployment. Restore/update the existing service rather than initializing replacement access.",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const source = await sourceProvenance();
    run("npm", ["run", "check"], { stdio: "inherit" });
    assertUnchangedSource(source, await sourceProvenance());
    assertUnchangedInvitations(
      inventory,
      await readDeployInvitations(directory),
    );
    if (bootstrap && workerExists(target))
      throw new Error(
        "Bootstrap refused: the Worker appeared while checks ran. Review the existing service before retrying.",
      );
    const output = wrangler(
      [...workerDeployArgs(source), "--name", target.name],
      {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: target.accountId },
      },
    );
    assertUnchangedSource(source, await sourceProvenance());
    const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
    if (!url)
      throw new Error(
        "Deployment URL was not reported; inspect Cloudflare before retrying.",
      );
    assertUnchangedInvitations(
      inventory,
      await readDeployInvitations(directory),
    );
    if (bootstrap) await syncAccess(inventory);
    else
      console.log(
        "Existing Worker access preserved. Use beta:access separately only for reviewed invitation changes.",
      );
    await writeFile(
      `${directory}/deployment.json`,
      JSON.stringify(
        { url, deployedAt: new Date().toISOString(), source },
        null,
        2,
      ),
    );
    await deployed(source);
    await smoke(url);
    await release();
    console.log(`Private backend deployed and verified: ${url}`);
  } else
    throw new Error(
      "Use invite <tester>, revoke <tester>, access, deploy, smoke or release.",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
