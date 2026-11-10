// Live relay only: controlled receiver acknowledgments, no Studio imports or Roblox assets.
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const mode = process.argv[2];
if (!["poll", "wait"].includes(mode)) throw new Error("Choose poll or wait.");
const { url } = JSON.parse(
  await readFile(".artifacts/private-beta/deployment.json", "utf8"),
);
const access = (
  await readFile(".artifacts/private-beta/invitations/owner.txt", "utf8")
).trim();
const call = async (path, token = "", body, method, headers = {}) => {
  const response = await fetch(url + path, {
    redirect: "error",
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error(`Benchmark request failed (${response.status}).`);
  return response.json();
};
const session = await call("/v1/sessions", "", {}, undefined, {
  "X-Framebridge-Beta": access,
});
try {
  const pair = await call("/v1/pair", "", { code: session.code });
  const pkg = JSON.parse(
    await readFile("examples/layouts/inventory-grid.framebridge.json", "utf8"),
  );
  const results = [];
  for (let revision = 1; revision <= 3; revision++) {
    // Send just after the old receiver's check: an explicitly controlled polling delay.
    if (mode === "poll")
      await call(`/v1/inbox?after=${revision - 1}`, session.receiverToken);
    const receiver = (async () => {
      if (mode === "poll") await delay(5000);
      const inbox = await call(
        `/v1/inbox?after=${revision - 1}${mode === "wait" ? "&paired=true&wait=15000" : ""}`,
        session.receiverToken,
      );
      if (!inbox.package)
        throw new Error("Receiver did not get the benchmark package.");
      await call("/v1/receipt", session.receiverToken, {
        revision: inbox.revision,
        status: "ready",
      });
    })();
    // Allow the notification request to register before the design is sent.
    if (mode === "wait") await delay(200);
    pkg.roots[0].name = "Delivery benchmark " + mode + revision;
    const started = performance.now();
    const sent = await call("/v1/package", pair.senderToken, pkg);
    for (;;) {
      const receipt = await call(
        `/v1/receipt?revision=${sent.revision}${mode === "wait" ? "&wait=15000" : ""}`,
        pair.senderToken,
      );
      if (receipt.status === "ready") break;
      await delay(1000);
    }
    await receiver;
    results.push(Math.round(performance.now() - started));
  }
  const report = {
    mode,
    milliseconds: results,
    medianMs: [...results].sort((a, b) => a - b)[1],
    scope:
      "Live Worker, controlled receiver; native inventory JSON; no imports or assets",
  };
  await writeFile(
    `.artifacts/delivery-${mode}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await call("/v1/session", session.receiverToken, undefined, "DELETE");
}
