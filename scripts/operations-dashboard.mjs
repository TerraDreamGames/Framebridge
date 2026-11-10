import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import {
  readFile,
  lstat,
  mkdir,
  open,
  writeFile,
  chmod,
} from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";
import {
  PERIODS,
  analyticsQuery,
  readAnalytics,
  allowedDashboardRequest,
} from "./operations-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  run = promisify(execFile);
const argv = process.argv.slice(2),
  command = argv.shift() ?? "serve",
  options = {};
while (argv.length) {
  const key = argv.shift(),
    value = argv.shift();
  if (
    !["--port", "--token-file", "--account", "--origin"].includes(key) ||
    !value ||
    options[key]
  )
    throw new Error("Invalid dashboard option.");
  options[key] = value;
}
const config = unstable_readConfig({ config: resolve(root, "wrangler.jsonc") });
const savedPath = resolve(root, ".artifacts/operations/config.json");
let saved = {};
try {
  const raw = await readFile(savedPath, "utf8");
  if (raw.length > 2048)
    throw new Error("Invalid saved operator configuration.");
  const value = JSON.parse(raw);
  if (value.worker === config.name) saved = value;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const worker = config.name,
  account =
    options["--account"] ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    config.account_id ??
    saved.account;
const configured = JSON.parse(
  await readFile(resolve(root, "framebridge.config.json"), "utf8"),
);
const origin = options["--origin"] ?? saved.origin ?? configured.relayUrl,
  parsed = new URL(origin);
if (
  parsed.origin !== origin ||
  parsed.protocol !== "https:" ||
  parsed.username ||
  parsed.password
)
  throw new Error("Use an HTTPS service origin without paths or credentials.");
if (!/^[a-f0-9]{32}$/.test(account ?? "") || !worker)
  throw new Error("Set CLOUDFLARE_ACCOUNT_ID to your existing relay account.");
const tokenPath = resolve(
  root,
  options["--token-file"] ??
    saved.tokenFile ??
    ".artifacts/operations/admin-token.txt",
);
async function operatorToken() {
  const stat = await lstat(tokenPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    stat.size > 66
  )
    throw new Error(
      "Dashboard token requires an owner-only regular file (chmod 600).",
    );
  const token = (await readFile(tokenPath, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid dashboard token file.");
  return token;
}
if (command === "setup") {
  // Verify the existing target before creating local access or updating a secret.
  let settings;
  try {
    const auth = JSON.parse(
      (
        await run(
          process.execPath,
          [
            resolve(root, "node_modules/wrangler/bin/wrangler.js"),
            "auth",
            "token",
            "--json",
          ],
          { cwd: root, timeout: 30000, maxBuffer: 100000 },
        )
      ).stdout,
    ).token;
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/settings`,
      {
        headers: { Authorization: "Bearer " + auth },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    const body = await response.json();
    if (!response.ok || !body.success || !Array.isArray(body.result?.bindings))
      throw new Error();
    settings = body.result;
  } catch {
    throw new Error(
      "Could not verify the existing relay Worker. Check the account and Cloudflare login.",
    );
  }
  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  try {
    await lstat(tokenPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (
      settings.bindings.some(
        (binding) => binding.name === "OPERATIONS_ADMIN_HASH",
      )
    )
      throw new Error(
        "Existing operator access has no matching local token file. Restore it securely; setup will not silently replace access.",
      );
    const file = await open(tokenPath, "wx", 0o600);
    try {
      await file.writeFile(randomBytes(32).toString("hex") + "\n");
    } finally {
      await file.close();
    }
  }
  const hash = createHash("sha256")
    .update(await operatorToken())
    .digest("hex");
  const child = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/wrangler/bin/wrangler.js"),
      "secret",
      "put",
      "OPERATIONS_ADMIN_HASH",
      "--name",
      worker,
    ],
    {
      cwd: root,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  child.stdin.end(hash + "\n");
  await new Promise((yes, no) => {
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? yes() : no(new Error("Dashboard secret setup failed.")),
    );
  });
  await mkdir(dirname(savedPath), { recursive: true, mode: 0o700 });
  await writeFile(
    savedPath,
    JSON.stringify({ worker, account, origin, tokenFile: tokenPath }) + "\n",
    { mode: 0o600 },
  );
  await chmod(savedPath, 0o600);
  console.log(
    "Private dashboard access configured. Deploy the reviewed backend before starting the dashboard.",
  );
} else if (command === "serve") {
  const token = await operatorToken(),
    port = Number(options["--port"] ?? 4319);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Use a port between 1024 and 65535.");
  let auth,
    authExpires = 0;
  async function cf(path, body) {
    if (!auth || Date.now() >= authExpires) {
      try {
        const result = await run(
          process.execPath,
          [
            resolve(root, "node_modules/wrangler/bin/wrangler.js"),
            "auth",
            "token",
            "--json",
          ],
          { cwd: root, timeout: 30_000, maxBuffer: 100_000 },
        );
        auth = JSON.parse(result.stdout).token;
        authExpires = Date.now() + 240_000;
      } catch {
        throw new Error(
          "Cloudflare login unavailable. Run npx wrangler login.",
        );
      }
    }
    const response = await fetch(
      "https://api.cloudflare.com/client/v4" + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Cloudflare data unavailable (HTTP " + response.status + ").",
      );
    return response.json();
  }
  const cache = new Map();
  function cached(key, ttl, load) {
    const previous = cache.get(key);
    if (previous && previous.expires > Date.now()) return previous.value;
    const value = Promise.resolve()
      .then(load)
      .catch((error) => {
        cache.delete(key);
        throw error;
      });
    cache.set(key, { expires: Date.now() + ttl, value });
    return value;
  }
  async function snapshot(period) {
    const [application, traffic] = await Promise.allSettled([
      cached("application", 10_000, async () => {
        const response = await fetch(origin + "/v1/operations", {
          headers: { Authorization: "Bearer " + token },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new Error(
            "Connection metrics unavailable (HTTP " +
              response.status +
              "). Check the backend deployment and dashboard token.",
          );
        return response.json();
      }),
      cached("traffic:" + period, 120_000, async () => {
        const query = analyticsQuery(account, worker, period);
        return {
          ...readAnalytics(await cf("/graphql", query), query),
          observedAt: new Date().toISOString(),
        };
      }),
    ]);
    const part = (result) =>
      result.status === "fulfilled"
        ? { available: true, data: result.value }
        : { available: false, error: result.reason.message };
    return {
      generatedAt: new Date().toISOString(),
      worker,
      period,
      application: part(application),
      traffic: part(traffic),
      links: {
        worker: `https://dash.cloudflare.com/${account}/workers/services/view/${worker}/production/metrics/charts/invocations`,
        storage: `https://dash.cloudflare.com/${account}/r2/overview`,
        billing: `https://dash.cloudflare.com/${account}/billing`,
      },
    };
  }
  const files = new Map([
    ["/", ["dashboard.html", "text/html"]],
    ["/dashboard.js", ["dashboard.js", "text/javascript"]],
    ["/dashboard.css", ["dashboard.css", "text/css"]],
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    if (!allowedDashboardRequest(req, port) || req.method !== "GET") {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1:" + port);
      if (url.pathname === "/api/snapshot") {
        const period = url.searchParams.get("period") ?? "24h";
        if (!PERIODS[period]) {
          res.writeHead(400).end("Invalid period");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await snapshot(period)));
        return;
      }
      const file = files.get(url.pathname);
      if (!file) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.setHeader("Content-Type", file[1] + "; charset=utf-8");
      res.end(await readFile(resolve(root, "packages/operations", file[0])));
    } catch {
      res.writeHead(503).end("Dashboard data unavailable. Retry shortly.");
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Framebridge activity dashboard: http://127.0.0.1:${port}/ (private to this computer)`,
    ),
  );
  server.on("error", () => {
    console.error("Dashboard could not start. Choose an unused port.");
    process.exitCode = 1;
  });
} else throw new Error("Use serve or setup.");
