import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { zipSync, strToU8, unzipSync } from "fflate";
import { unstable_readConfig } from "wrangler";
import {
  sourceProvenance,
  workerDeployArgs,
  assertUnchangedSource,
  fetchMatchingBackend,
  releaseBuildProvenance,
} from "./private-release-provenance.mjs";
import { workerExistsFromWrangler } from "./private-deploy-guards.mjs";

const directory = ".artifacts/public-release";
const config = JSON.parse(await readFile("framebridge.config.json", "utf8"));
if (
  config.privateBeta !== false ||
  new URL(config.relayUrl).origin !== config.relayUrl ||
  !config.relayUrl.startsWith("https://")
)
  throw new Error(
    "Public releases require a configured HTTPS service and privateBeta: false.",
  );
const workerConfig = unstable_readConfig({ config: "wrangler.jsonc" });
if (workerConfig.vars?.ACCESS_MODE !== "public")
  throw new Error(
    "Public releases require ACCESS_MODE: public in wrangler.jsonc.",
  );

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed (${result.status ?? "unavailable"}). ${result.stderr ?? ""}`,
    );
  return result.stdout ?? "";
}
async function call(path, token = "", body, method) {
  const response = await fetch(config.relayUrl + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(35_000),
    redirect: "error",
  });
  return { status: response.status, data: await response.json() };
}
async function smoke() {
  const health = await call("/health");
  if (health.data.access !== "public" || health.data.configured !== true)
    throw new Error("The deployed backend still requires an invitation.");
  const created = await call("/v1/sessions", "", {});
  if (created.status !== 201)
    throw new Error(`Public session creation failed (${created.status}).`);
  const receiver = created.data.receiverToken;
  try {
    const paired = await call("/v1/pair", "", { code: created.data.code });
    if (paired.status !== 200) throw new Error("Public Studio pairing failed.");
    const sender = paired.data.senderToken;
    const pkg = JSON.parse(
      await readFile(
        "examples/layouts/inventory-grid.framebridge.json",
        "utf8",
      ),
    );
    for (let revision = 1; revision <= 2; revision++) {
      pkg.roots[0].name += " · public release smoke";
      const sent = await call("/v1/package", sender, pkg);
      const inbox = await call(`/v1/inbox?after=${revision - 1}`, receiver);
      if (
        sent.status !== 200 ||
        sent.data.revision !== revision ||
        inbox.data.revision !== revision ||
        !inbox.data.package
      )
        throw new Error("Repeated public transfer failed.");
      const ack = await call("/v1/receipt", receiver, {
        revision,
        status: "imported",
      });
      const receipt = await call(`/v1/receipt?revision=${revision}`, sender);
      if (ack.status !== 200 || receipt.data.status !== "imported")
        throw new Error("Public import acknowledgment failed.");
    }
    if (
      (await call("/v1/inbox")).status !== 401 ||
      (await call("/v1/roblox/account")).status !== 401 ||
      (await call("/v1/feedback/reports")).status !== 403
    )
      throw new Error(
        "Private data must still require its capability or administrator credential.",
      );
    const oauth = await call("/v1/roblox/config");
    if (oauth.data.available !== true)
      throw new Error("Roblox sign-in is not configured.");
    const login = await call("/v1/roblox/login", "", {});
    if (login.status !== 201)
      throw new Error(`Public Roblox login could not start (${login.status}).`);
    try {
      const url = new URL(login.data.authorizationUrl);
      if (
        url.origin !== "https://apis.roblox.com" ||
        url.pathname !== "/oauth/v1/authorize"
      )
        throw new Error("Roblox authorization URL is invalid.");
    } finally {
      await call(
        "/v1/roblox/login",
        login.data.loginToken,
        undefined,
        "DELETE",
      );
    }
    console.log(
      "Public HTTPS checks passed: no invite, pairing, two transfers, receipts, Roblox login start and protected private data. No assets uploaded.",
    );
  } finally {
    await call("/v1/session", receiver, undefined, "DELETE");
  }
}
async function release(source, backend) {
  run("npm", ["run", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      FRAMEBRIDGE_RELAY_URL: config.relayUrl,
      FRAMEBRIDGE_PRIVATE_BETA: "0",
    },
  });
  assertUnchangedSource(source, await sourceProvenance());
  const verified = await fetchMatchingBackend(config.relayUrl, source, {
    expectedAccess: "public",
    expectedWorkerId: backend.worker.id,
  });
  const files = unzipSync(await readFile("dist/Framebridge-plugins.zip"));
  const manifest = JSON.parse(
    new TextDecoder().decode(files["figma/manifest.json"]),
  );
  if (!manifest.networkAccess.allowedDomains.includes(config.relayUrl))
    throw new Error("Release endpoint mismatch.");
  const metadata = {
    version: JSON.parse(await readFile("package.json", "utf8")).version,
    builtAt: new Date().toISOString(),
    relay: config.relayUrl,
    access: "public",
    figmaStoreIdAssigned: /^\d+$/.test(manifest.id),
    provenance: releaseBuildProvenance(files, source, verified, "public"),
  };
  files["release.json"] = strToU8(JSON.stringify(metadata, null, 2));
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/Framebridge-public-release.zip`,
    zipSync(files),
  );
  await writeFile(
    `${directory}/deployment.json`,
    JSON.stringify(metadata, null, 2),
  );
  await copyFile(
    "dist/studio/Framebridge.rbxmx",
    `${directory}/Framebridge.rbxmx`,
  );
  console.log(
    `Matching public plugins: ${directory}/Framebridge-public-release.zip`,
  );
  if (!metadata.figmaStoreIdAssigned)
    console.log(
      "Development installation is ready. Figma store publication still needs an assigned plugin ID.",
    );
}
const [command, ...extra] = process.argv.slice(2);
try {
  if (extra.length)
    throw new Error(
      "Use release:deploy, release:package or release:smoke without extra arguments.",
    );
  if (command === "smoke") await smoke();
  else if (command === "deploy" || command === "package") {
    const source = await sourceProvenance();
    if (command === "deploy") {
      const accountId =
        process.env.CLOUDFLARE_ACCOUNT_ID ?? workerConfig.account_id;
      if (
        !/^[a-f0-9]{32}$/.test(accountId ?? "") ||
        (workerConfig.account_id && workerConfig.account_id !== accountId)
      )
        throw new Error(
          "Set CLOUDFLARE_ACCOUNT_ID to the intended existing relay account before deployment.",
        );
      const options = {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
      };
      const args = ["node_modules/wrangler/bin/wrangler.js"];
      const exists = spawnSync(
        process.execPath,
        [...args, "deployments", "list", "--name", workerConfig.name, "--json"],
        { encoding: "utf8", timeout: 30_000, maxBuffer: 1_048_576, ...options },
      );
      if (!workerExistsFromWrangler(exists, accountId, workerConfig.name))
        throw new Error(
          "This command updates the existing configured Worker; it does not create replacement access or credentials.",
        );
      run("npm", ["run", "check"], { stdio: "inherit" });
      assertUnchangedSource(source, await sourceProvenance());
      const output = run(
        process.execPath,
        [...args, ...workerDeployArgs(source), "--name", workerConfig.name],
        options,
      );
      if (!output.includes(config.relayUrl))
        throw new Error(
          "Cloudflare reported a different deployment endpoint. Inspect before retrying.",
        );
    }
    const backend = await fetchMatchingBackend(config.relayUrl, source, {
      expectedAccess: "public",
    });
    assertUnchangedSource(source, await sourceProvenance());
    await smoke();
    await release(source, backend);
  } else throw new Error("Use deploy, package or smoke.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
