import { afterAll, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertUnchangedInvitations,
  validateInvitations,
  workerExistsFromWrangler,
} from "../scripts/private-deploy-guards.mjs";
import { digest } from "../scripts/private-release-provenance.mjs";

const account = "a".repeat(32),
  worker = "framebridge-private-beta";
const resource = `/accounts/${account}/workers/scripts/${worker}/deployments`;
const absent = `A request to the Cloudflare API (${resource}) failed.\nScript not found [code: 10007]`;
const token = "1".repeat(64),
  otherToken = "2".repeat(64);
const inventory = { owner: digest(token), tester: digest(otherToken) };
const directories: string[] = [];
afterAll(async () => {
  await Promise.all(
    directories.map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("private deployment access guards", () => {
  it("accepts reviewed inventory and rejects malformed names, hashes and duplicate identities", () => {
    expect(validateInvitations(inventory)).toEqual(inventory);
    for (const invalid of [
      null,
      [],
      "private-token",
      { "../outside": digest(token) },
      { owner: token.slice(0, 20) },
      { owner: digest(token), tester: digest(token) },
    ])
      expect(() => validateInvitations(invalid)).toThrow(
        "Invalid private invitation inventory",
      );
    expect(() =>
      assertUnchangedInvitations(inventory, {
        tester: inventory.tester,
        owner: inventory.owner,
      }),
    ).not.toThrow();
    expect(() =>
      assertUnchangedInvitations(inventory, { owner: inventory.owner }),
    ).toThrow("changed");
  });
  it("requires an exact account/Worker-specific API not-found error to permit bootstrap", () => {
    expect(
      workerExistsFromWrangler({ status: 0, stdout: "[]" }, account, worker),
    ).toBe(true);
    expect(
      workerExistsFromWrangler({ status: 1, stderr: absent }, account, worker),
    ).toBe(false);
    for (const result of [
      { status: 0, stdout: "not-json" },
      { status: 0, stdout: "{}" },
      { status: 1, stderr: "network timeout; private upstream details" },
      { status: 1, stderr: absent.replace(account, "b".repeat(32)) },
      { status: 1, stderr: absent.replace(worker, "another-worker") },
      { status: 1, stderr: absent.replace("10007", "10000") },
      { status: 1, stderr: absent + "\nUnauthorized [code: 10000]" },
      { status: 1, stderr: "Script not found [code: 10007]" },
      { status: 1, stderr: absent, error: new Error("timed out") },
    ])
      expect(() => workerExistsFromWrangler(result, account, worker)).toThrow(
        "Could not verify",
      );
  });
});

type Mode = "existing" | "absent" | "outage" | "appeared" | "inventory-change";
async function cli(
  options: {
    command?: "deploy" | "access";
    mode?: Mode;
    bootstrap?: boolean;
    inventory?: "missing" | "empty" | "mismatch" | "valid";
    savedDeployment?: boolean;
    account?: string;
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "framebridge-deploy-guard-"));
  directories.push(dir);
  for (const p of [
    "packages/relay/cloudflare",
    "plugins/figma/src",
    "scripts",
    "docs",
    "examples/layouts",
    ".artifacts/private-beta/invitations",
  ])
    await mkdir(join(dir, p), { recursive: true });
  await symlink(resolve("node_modules"), join(dir, "node_modules"), "dir");
  await writeFile(
    join(dir, ".gitignore"),
    ".artifacts/\nnode_modules\ndist/\n",
  );
  await writeFile(
    join(dir, "packages/relay/cloudflare/worker.ts"),
    "export default {};\n",
  );
  await writeFile(
    join(dir, "plugins/figma/src/runtime.ts"),
    "export const version=1;\n",
  );
  await writeFile(
    join(dir, "package.json"),
    '{"version":"0.1.0","type":"module"}',
  );
  await writeFile(
    join(dir, "wrangler.jsonc"),
    JSON.stringify({
      name: worker,
      main: "packages/relay/cloudflare/worker.ts",
    }),
  );
  await writeFile(
    join(dir, "docs/PRIVATE_BETA.md"),
    "Synthetic isolated deployment QA.\n",
  );
  await writeFile(
    join(dir, "examples/layouts/inventory-grid.framebridge.json"),
    JSON.stringify({ roots: [{ name: "Synthetic" }] }),
  );
  await writeFile(
    join(dir, "scripts/build.mjs"),
    `import {mkdir,writeFile} from 'node:fs/promises'; import {zipSync,strToU8} from 'fflate';
await mkdir('dist/studio',{recursive:true}); const files={'figma/manifest.json':strToU8(JSON.stringify({networkAccess:{allowedDomains:[process.env.FRAMEBRIDGE_RELAY_URL]}})),'figma/code.js':strToU8('synthetic reviewed client'),'studio/Framebridge.rbxmx':strToU8('<roblox/>')};
await writeFile('dist/Framebridge-plugins.zip',zipSync(files)); await writeFile('dist/studio/Framebridge.rbxmx',files['studio/Framebridge.rbxmx']);`,
  );
  for (const args of [
    ["init", "-q"],
    ["config", "user.email", "qa@example.invalid"],
    ["config", "user.name", "Local QA"],
    ["add", "."],
    ["commit", "-qm", "reviewed fixture"],
  ]) {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  const kind = options.inventory ?? "valid";
  if (kind !== "missing") {
    await writeFile(
      join(dir, ".artifacts/private-beta/invitations.json"),
      JSON.stringify(kind === "empty" ? {} : inventory),
      { mode: 0o600 },
    );
    await writeFile(
      join(dir, ".artifacts/private-beta/invitations/owner.txt"),
      (kind === "mismatch" ? otherToken : token) + "\n",
      { mode: 0o600 },
    );
    await writeFile(
      join(dir, ".artifacts/private-beta/invitations/tester.txt"),
      otherToken + "\n",
      { mode: 0o600 },
    );
  }
  if (options.savedDeployment)
    await writeFile(
      join(dir, ".artifacts/private-beta/deployment.json"),
      '{"url":"https://old.workers.dev"}',
    );
  const imported = pathToFileURL(
    resolve("scripts/private-release-provenance.mjs"),
  ).href;
  const preload = join(dir, ".artifacts/preload.mjs");
  await writeFile(
    preload,
    `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; import {appendFileSync,writeFileSync} from 'node:fs'; import {sourceProvenance,compilationProvenance} from ${JSON.stringify(imported)};
const original=cp.spawnSync, mode=${JSON.stringify(options.mode ?? "existing")}; let queries=0, revision=0, importedRevision=0, paired=false, pkg;
const trace=(value)=>appendFileSync('.artifacts/trace.jsonl',JSON.stringify(value)+'\\n');
cp.spawnSync=(command,args,opts)=>{
if(command==='npm'){trace({command:'check'}); if(mode==='inventory-change')writeFileSync('.artifacts/private-beta/invitations.json',JSON.stringify({owner:${JSON.stringify(inventory.owner)}}));return {status:0,stdout:'',stderr:''};}
if(args?.[0]==='node_modules/wrangler/bin/wrangler.js'){
trace({args, input:opts?.input, account:opts?.env?.CLOUDFLARE_ACCOUNT_ID});
if(args[1]==='deployments'){queries++; if(mode==='outage')return {status:1,stdout:'',stderr:'network unavailable; private diagnostic'}; if(mode==='absent'||(mode==='appeared'&&queries===1))return {status:1,stdout:'',stderr:${JSON.stringify(absent)}};return {status:0,stdout:'[]',stderr:''};}
if(args[1]==='deploy')return {status:0,stdout:'https://fixture.workers.dev',stderr:''};
if(args[1]==='secret')return {status:0,stdout:'secret applied',stderr:''};throw Error('Unexpected Wrangler command');}
return original(command,args,opts);};syncBuiltinESMExports();
const source=await sourceProvenance();
globalThis.fetch=async(url,init={})=>{const u=new URL(url),path=u.pathname; trace({path,method:init.method??'GET'});
if(path==='/health')return Response.json({ok:true,access:'private-beta',configured:true,provenance:{...compilationProvenance(source),worker:{id:'12345678-1234-4321-9876-123456789abc',tag:'synthetic',timestamp:'2026-10-03T14:00:00.000Z'}}});
if(path==='/v1/sessions')return new Response(JSON.stringify(init.headers?.['X-Framebridge-Beta']?{receiverToken:'synthetic-receiver',code:'123456'}:{}),{status:init.headers?.['X-Framebridge-Beta']?201:403});
if(path==='/v1/pair'){paired=true;return Response.json({senderToken:'synthetic-sender'});}
if(path==='/v1/package'){pkg=JSON.parse(init.body);revision++;return Response.json({revision});}
if(path==='/v1/inbox')return Response.json({package:pkg,revision,paired});
if(path==='/v1/receipt'){if(init.method==='POST'){if(JSON.parse(init.body).status==='imported')importedRevision=revision;return Response.json({ok:true});}return Response.json({status:'ready'});}
if(path==='/v1/session')return Response.json({role:init.headers?.Authorization?.includes('sender')?'sender':'receiver',paired,importedRevision});
throw Error('Unexpected external request');};`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      preload,
      resolve("scripts/private-beta.mjs"),
      options.command ?? "deploy",
      ...(options.bootstrap ? ["--bootstrap"] : []),
    ],
    {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: options.account ?? account,
      },
    },
  );
  const trace = await readFile(join(dir, ".artifacts/trace.jsonl"), "utf8")
    .then((s) =>
      s
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    )
    .catch(() => []);
  expect(result.stdout + result.stderr).not.toContain(token);
  expect(result.stdout + result.stderr).not.toContain(otherToken);
  return { dir, result, trace };
}

describe("real private deployment CLI with isolated command fixtures", () => {
  it("refuses a missing inventory for explicit access synchronization rather than revoking everyone", async () => {
    const { result, trace } = await cli({
      command: "access",
      inventory: "missing",
    });
    expect(result.status).toBe(1);
    expect(trace).toEqual([]);
  });
  it("allows an explicitly saved empty inventory to close access only through beta:access", async () => {
    const { result, trace } = await cli({
      command: "access",
      inventory: "empty",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(trace).toHaveLength(1);
    expect(trace[0].args).toEqual([
      "node_modules/wrangler/bin/wrangler.js",
      "secret",
      "put",
      "BETA_ACCESS_HASHES",
    ]);
    expect(trace[0].input).toBe("\n");
  });
  it.each(["missing", "empty", "mismatch"] as const)(
    "refuses %s inventory before checking or touching Cloudflare",
    async (inventory) => {
      const { dir, result, trace } = await cli({ inventory });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/invitation|inventory/);
      expect(trace).toEqual([]);
      if (inventory === "missing")
        await expect(
          readFile(join(dir, ".artifacts/private-beta/invitations.json")),
        ).rejects.toThrow();
    },
  );
  it("pins the target account instead of choosing an account interactively", async () => {
    const { result, trace } = await cli({ account: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(trace).toEqual([]);
  });
  it("updates an existing Worker without sending invitation hashes or replacing local codes", async () => {
    const { dir, result, trace } = await cli();
    expect(result.status, result.stderr).toBe(0);
    expect(trace.some((t) => t.args?.[1] === "deploy")).toBe(true);
    expect(trace.some((t) => t.args?.[1] === "secret")).toBe(false);
    expect(
      trace.filter((t) => t.args).every((t) => t.account === account),
    ).toBe(true);
    expect(
      JSON.parse(
        await readFile(
          join(dir, ".artifacts/private-beta/invitations.json"),
          "utf8",
        ),
      ),
    ).toEqual(inventory);
    expect(
      (
        await readFile(
          join(dir, ".artifacts/private-beta/invitations/owner.txt"),
          "utf8",
        )
      ).trim(),
    ).toBe(token);
    expect(result.stdout).toContain("Existing Worker access preserved");
  });
  it("requires explicit bootstrap for a genuinely absent Worker", async () => {
    const { result, trace } = await cli({ mode: "absent" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--bootstrap");
    expect(trace).toHaveLength(1);
  });
  it("refuses bootstrap of an existing Worker without checking/building or synchronizing access", async () => {
    const { result, trace } = await cli({ bootstrap: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already exists");
    expect(trace).toHaveLength(1);
  });
  it.each([false, true])(
    "refuses unknown backend state for bootstrap=%s without mutation",
    async (bootstrap) => {
      const { result, trace } = await cli({ mode: "outage", bootstrap });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Could not verify");
      expect(result.stderr).not.toContain("private diagnostic");
      expect(trace).toHaveLength(1);
    },
  );
  it("bootstraps only after two verified absence checks and applies the explicit existing inventory via stdin", async () => {
    const { result, trace } = await cli({ mode: "absent", bootstrap: true });
    expect(result.status, result.stderr).toBe(0);
    const commands = trace.filter((t) => t.args || t.command);
    expect(commands.map((t) => t.args?.[1] ?? t.command)).toEqual([
      "deployments",
      "check",
      "deployments",
      "deploy",
      "secret",
    ]);
    const access = commands.at(-1);
    expect(access.args).toEqual([
      "node_modules/wrangler/bin/wrangler.js",
      "secret",
      "put",
      "BETA_ACCESS_HASHES",
    ]);
    expect(access.input).toBe(Object.values(inventory).join(",") + "\n");
    expect(JSON.stringify(commands.map((t) => t.args))).not.toContain(token);
  });
  it("refuses replacement initialization when saved deployment metadata exists", async () => {
    const { result, trace } = await cli({
      mode: "absent",
      bootstrap: true,
      savedDeployment: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("saved deployment");
    expect(trace).toHaveLength(1);
  });
  it("refuses bootstrap if a Worker appears while checks run", async () => {
    const { result, trace } = await cli({ mode: "appeared", bootstrap: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("appeared");
    expect(trace.some((t) => t.args?.[1] === "deploy")).toBe(false);
  });
  it("refuses changed inventory before deployment instead of applying a partial access list", async () => {
    const { result, trace } = await cli({ mode: "inventory-change" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("inventory changed");
    expect(
      trace.some((t) => t.args?.[1] === "deploy" || t.args?.[1] === "secret"),
    ).toBe(false);
  });
});
