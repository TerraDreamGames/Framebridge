import { describe, expect, it } from "vitest";
import { PNG } from "./image-tools-fixtures";
import { demoResult } from "../packages/core/src/demo";
import {
  feedbackDiagnostics,
  feedbackBytes,
  feedbackScreenshot,
  feedbackText,
  normalizeFeedback,
} from "../packages/core/src/feedback";
import { Feedbacks, REPORT_RETENTION } from "../packages/relay/src/feedback";
import { feedbackReport, feedbackMemory } from "./feedback-fixture";
const token = "a".repeat(64),
  other = "b".repeat(64);
function service() {
  const memory = feedbackMemory(),
    invites = new Set(["one", "two"]);
  let now = 100000,
    enabled = true;
  const counts: { scope: string; maximum: number; window: number }[] = [];
  const feedback = new Feedbacks(memory.store, {
    now: () => now,
    active: (invite) => invites.has(invite),
    enabled: () => enabled,
    count: (scope, maximum, window) => {
      counts.push({ scope, maximum, window });
    },
    knownSecrets: () => ["actual-local-client-secret"],
  });
  return {
    ...memory,
    invites,
    feedback,
    counts,
    advance: (n: number) => {
      now += n;
    },
    disable: () => {
      enabled = false;
    },
  };
}
describe("reviewable feedback privacy", () => {
  it("counts serialized UTF-8 without browser codecs", () => {
    const report = { ...feedbackReport(), actual: "日本語 🎮 Café \ud800" };
    expect(feedbackBytes(report)).toBe(
      Buffer.byteLength(JSON.stringify(report)),
    );
  });
  it("builds useful layout diagnostics without names, document IDs, artwork, text or bindings", () => {
    const pkg = demoResult().package;
    pkg.sourceId = "private-file-id";
    pkg.name = "private-design-name";
    const node = pkg.roots[0];
    node.id = "private-node-id";
    node.name = "private-layer-name";
    node.properties.Text = "private-text";
    node.properties.Image = "rbxassetid://123456789";
    node.properties.FontFace = {
      type: "Font",
      family: "private-font-url",
      weight: "Bold",
      style: "Normal",
    };
    node.properties.Position = { type: "UDim2", value: [0.5, 20, 0.25, 10] };
    node.behavior = {
      binding: {
        source: "attribute",
        key: "private-binding",
        template: "private-template",
      },
    };
    pkg.issues.push({
      nodeId: node.id,
      nodeName: node.name,
      severity: "warning",
      code: "private-warning",
      message: "private-warning-message",
    });
    const data = feedbackDiagnostics(pkg),
      raw = JSON.stringify(data);
    expect(data.nodes[0]).toMatchObject({
      path: "1",
      properties: { Position: [0.5, 20, 0.25, 10] },
      interactions: true,
    });
    expect(data.issues.at(-1)).toEqual({
      severity: "warning",
      code: "private-warning",
      path: "1",
    });
    for (const s of [
      pkg.sourceId,
      pkg.name,
      node.id,
      node.name,
      "private-text",
      "123456789",
      "private-font-url",
      "private-binding",
      "private-template",
      "private-warning-message",
    ])
      expect(raw).not.toContain(s);
    expect(
      normalizeFeedback({ ...feedbackReport(), diagnostics: data }).diagnostics,
    ).toEqual(data);
  });
  it("bounds large/deep hierarchies and marks omitted nodes", () => {
    const pkg = demoResult().package,
      node = pkg.roots[0];
    pkg.roots = Array.from({ length: 350 }, (_, i) => ({
      ...node,
      id: String(i),
      children: [],
    }));
    pkg.stats.instances = 350;
    expect(feedbackDiagnostics(pkg).nodes).toHaveLength(300);
    expect(feedbackDiagnostics(pkg).truncated).toBe(true);
  });
  it("redacts retained secrets, credential labels, Bearer tokens, JWTs and callback query values", () => {
    const raw =
      "API key: plain-secret accountToken=secret-value Bearer abc.def.ghi " +
      token +
      " eyJtest.eyJbody.signature https://example.test/callback?code=secret&state=state-value&token=token-value kept";
    const clean = feedbackText(raw + ["actual-opaque-key"].join(""), [
      "actual-opaque-key",
    ]);
    for (const s of [
      "plain-secret",
      "secret-value",
      "abc.def.ghi",
      token,
      "eyJtest",
      "state-value",
      "token-value",
      "actual-opaque-key",
    ])
      expect(clean).not.toContain(s);
    expect(clean).toContain("kept");
    expect(
      feedbackText("API key upload failed; the UI said permission denied."),
    ).toBe("API key upload failed; the UI said permission denied.");
  });
  it.each([
    { apiKey: "hidden" },
    { senderToken: token },
    { roots: [] },
    { title: "x" },
    { actual: "" },
    { steps: "x".repeat(4001) },
    { category: "unrecognized" },
    { version: 2 },
    { clientVersion: "https://private.test" },
    { screenshot: { mime: "image/svg+xml", data: "svg" } },
  ])("rejects malformed or extra report fields %#", (patch) => {
    expect(() =>
      normalizeFeedback({ ...feedbackReport(), ...patch }),
    ).toThrow();
  });
  it("rejects extra fields nested in diagnostics instead of storing raw properties", () => {
    const diagnostics = feedbackDiagnostics(demoResult().package);
    (diagnostics.nodes[0].properties as any).Text = "do-not-store";
    expect(() =>
      normalizeFeedback({ ...feedbackReport(), diagnostics }),
    ).toThrow();
  });
  it("strips PNG metadata, preserves pixel samples and validates dimensions", () => {
    const png = PNG.sync.write({
        width: 2,
        height: 1,
        data: Buffer.from([10, 20, 30, 255, 100, 110, 120, 128]),
      }),
      text = Buffer.from("Comment\0private screenshot metadata");
    const type = Buffer.from("tEXt"),
      chunk = Buffer.alloc(text.length + 12);
    chunk.writeUInt32BE(text.length, 0);
    type.copy(chunk, 4);
    text.copy(chunk, 8);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([type, text])) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
    const annotated = Buffer.concat([
        png.subarray(0, 33),
        chunk,
        png.subarray(33),
      ]),
      screenshot = feedbackScreenshot(annotated),
      clean = Buffer.from(screenshot.data, "base64");
    expect(clean.toString()).not.toContain("private screenshot metadata");
    expect(PNG.sync.read(clean).data).toEqual(PNG.sync.read(annotated).data);
    expect(
      normalizeFeedback({ ...feedbackReport(), screenshot }).screenshot,
    ).toEqual(screenshot);
    expect(() =>
      normalizeFeedback({
        ...feedbackReport(),
        screenshot: { ...screenshot, width: 3 },
      }),
    ).toThrow();
    const corrupt = Uint8Array.from(clean);
    corrupt[29] ^= 1;
    expect(() => feedbackScreenshot(corrupt)).toThrow();
    expect(() => feedbackScreenshot(new Uint8Array(512 * 1024 + 1))).toThrow();
    expect(() =>
      feedbackScreenshot(new TextEncoder().encode("<svg></svg>")),
    ).toThrow();
  });
});
describe("private report lifecycle", () => {
  it("reserves cancelled pending attempts without collecting report content", () => {
    const s = service();
    expect(s.feedback.cancel("one", token)).toEqual({ withdrawn: true });
    expect(s.feedback.cancel("one", token)).toEqual({ withdrawn: true });
    expect(s.records.size).toBe(0);
    expect(s.reports.size).toBe(0);
    expect(s.counts).toHaveLength(2);
    expect(() =>
      s.feedback.create("one", {
        reportToken: token,
        report: feedbackReport(),
      }),
    ).toThrow("withdrawn");
    expect(() => s.feedback.cancel("unapproved", other)).toThrow();
  });
  it("stores canonical redacted reports and only hashed reporter capabilities", () => {
    const s = service(),
      report = {
        ...feedbackReport(),
        actual: "Failure involving actual-local-client-secret",
      },
      receipt = s.feedback.create("one", { reportToken: token, report });
    expect(s.feedback.inspect(token).receipt).toEqual(receipt);
    expect(s.feedback.inspect(token).report.actual).not.toContain(
      "actual-local-client-secret",
    );
    expect(JSON.stringify([...s.records.values()])).not.toContain(token);
    expect([...s.records.values()][0].bytes).toBe(
      Buffer.byteLength([...s.reports.values()][0]),
    );
    expect(receipt.expiresAt - receipt.receivedAt).toBe(REPORT_RETENTION);
    expect(s.counts.map((c) => c.maximum)).toEqual([30, 5]);
  });
  it("deduplicates lost responses and rejects another invitation or edited snapshot with the same attempt", () => {
    const s = service(),
      input = { reportToken: token, report: feedbackReport() },
      first = s.feedback.create("one", input);
    expect(s.feedback.create("one", input)).toEqual(first);
    expect(s.records.size).toBe(1);
    expect(s.counts).toHaveLength(2);
    expect(() => s.feedback.create("two", input)).toThrow("another snapshot");
    expect(() =>
      s.feedback.create("one", {
        ...input,
        report: { ...input.report, actual: "Changed notes" },
      }),
    ).toThrow("another snapshot");
    expect(() => s.feedback.inspect(other)).toThrow();
  });
  it("withdraws private payloads and prevents delayed retries from recreating them", () => {
    const s = service(),
      input = { reportToken: token, report: feedbackReport() };
    s.feedback.create("one", input);
    expect(s.feedback.withdraw(token)).toEqual({ withdrawn: true });
    expect(s.feedback.withdraw(token)).toEqual({ withdrawn: true });
    expect(s.records.size).toBe(0);
    expect(s.reports.size).toBe(0);
    expect(() => s.feedback.create("one", input)).toThrow("withdrawn");
    expect(() => s.feedback.inspect(token)).toThrow();
  });
  it("expires reports and removes reports from revoked invitations", () => {
    const s = service();
    s.feedback.create("one", { reportToken: token, report: feedbackReport() });
    s.invites.delete("one");
    s.feedback.prune();
    expect(s.records.size).toBe(0);
    expect(s.reports.size).toBe(0);
    s.feedback.create("two", { reportToken: other, report: feedbackReport() });
    s.advance(REPORT_RETENTION);
    s.feedback.prune();
    expect(s.records.size).toBe(0);
  });
  it("does not collect when configuration is disabled but still permits withdrawal", () => {
    const s = service();
    s.feedback.create("one", { reportToken: token, report: feedbackReport() });
    s.disable();
    expect(s.feedback.config().available).toBe(false);
    expect(() =>
      s.feedback.create("one", {
        reportToken: other,
        report: feedbackReport(),
      }),
    ).toThrow("not enabled");
    expect(s.feedback.withdraw(token).withdrawn).toBe(true);
  });
  it("bounds per-tester storage, reports and operator pages", () => {
    const s = service();
    for (let i = 0; i < 10; i++)
      s.feedback.create("one", {
        reportToken: i.toString(16).padStart(64, "0"),
        report: feedbackReport(),
      });
    expect(() =>
      s.feedback.create("one", {
        reportToken: other,
        report: feedbackReport(),
      }),
    ).toThrow("storage is full");
    expect(s.feedback.list().reports).toHaveLength(10);
    expect(() => s.feedback.list(NaN)).toThrow();
    expect(() => s.feedback.list(-1)).toThrow();
    expect(() =>
      s.feedback.create("not-approved", {
        reportToken: other,
        report: feedbackReport(),
      }),
    ).toThrow("Private beta");
  });
});
