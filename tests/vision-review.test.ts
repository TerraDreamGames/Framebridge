import { describe, it, expect } from "vitest";
import {
  FULL_VISION_REGION,
  prepareVisionMetadata,
  readVisionResult,
  validateVisionRequest,
  visionChanges,
} from "../packages/core/src/vision-review";
import {
  requestVision,
  visionProviderBody,
  visionSettings,
} from "../packages/relay/src/vision-provider";
import {
  visionAnalysis,
  visionRequest,
  visionEnv,
  simulatedVisionResult,
  providerResponse,
} from "./vision-review-fixtures";
import { applyOverrideChanges } from "../packages/core/src/bulk-editor";
import { reviewPackage } from "./structure-review-fixtures";
import {
  generateSource,
  SOURCE_FORMATS,
} from "../packages/core/src/source-code";
import { generateModel } from "../packages/core/src/model-export";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import { createVisionReviewManager } from "../plugins/figma/src/vision-review-manager";
import { node } from "../packages/core/src/demo";
import { compile } from "../packages/core/src/compiler";
import { flatten } from "../packages/core/src/types";
describe("optional vision review privacy and corrections", () => {
  it("projects scoped geometry with opaque labels and excludes design/package secrets", () => {
    const result = visionAnalysis();
    result.package.sourceId = "secret-project-id";
    result.designs![0].fills[0].imageHash = "secret-image-hash";
    const all = prepareVisionMetadata(
      result,
      "review-root",
      FULL_VISION_REGION,
      false,
    );
    expect(JSON.stringify(all.layers)).not.toMatch(
      /secret-project|secret-image|review-root|ambiguous-button|characters|robloxId|Source|text"/,
    );
    expect(all.map.L1).toBe("review-root");
    const crop = prepareVisionMetadata(
      result,
      "review-root",
      { x: 0.5, y: 0.1, width: 0.5, height: 0.7 },
      false,
    );
    expect(crop.layers.some((l) => l.name === "Inventory list")).toBe(false);
    expect(crop.layers.some((l) => l.name === "Quick slots")).toBe(true);
    expect(crop.layers.find((l) => l.name === "Quick slots")?.bounds).toEqual([
      0.0667, 0.102, 0.6667, 0.6803,
    ]);
    expect(crop.layers[0].bounds).toEqual([-1, -0.1429, 2, 1.4286]);
    const withText = prepareVisionMetadata(
      result,
      "review-root",
      FULL_VISION_REGION,
      true,
    );
    expect(withText.layers.some((l) => l.text === "Claim")).toBe(true);
  });
  it("limits metadata and region depth without returning hidden layers", () => {
    const result = visionAnalysis();
    result.designs![0].children[0].visible = false;
    expect(
      prepareVisionMetadata(
        result,
        "review-root",
        FULL_VISION_REGION,
        false,
      ).layers.some((l) => l.name === "Frame 17"),
    ).toBe(false);
    expect(() =>
      prepareVisionMetadata(
        result,
        "review-root",
        { x: 0.9, y: 0, width: 0.2, height: 1 },
        false,
      ),
    ).toThrow(/valid review/);
    result.designs![0].children = Array.from({ length: 200 }, (_, i) =>
      node("Cell", { id: "c" + i, width: 1, height: 1 }),
    );
    const data = prepareVisionMetadata(
      result,
      "review-root",
      FULL_VISION_REGION,
      false,
    );
    expect(data.layers.length).toBeLessThanOrEqual(128);
    expect(
      new TextEncoder().encode(JSON.stringify(data.layers)).length,
    ).toBeLessThanOrEqual(24000);
    expect(data.truncated).toBe(true);
  });
  it.each([
    "consent",
    "url",
    "unknown",
    "text",
    "source",
    "parent",
    "bounds",
    "class",
    "allowance",
  ])("rejects unconsented or expanded payload %s", (kind) => {
    const p = visionRequest() as any;
    if (kind === "consent") p.consent.screenshot = false;
    if (kind === "url") p.image = "https://example.com/private.png";
    if (kind === "unknown") p.apiKey = "secret";
    if (kind === "text") p.layers[0].text = "not approved";
    if (kind === "source") p.layers[0].sourceId = "secret";
    if (kind === "parent") p.layers[0].parent = "L900";
    if (kind === "bounds") p.layers[0].bounds[0] = Infinity;
    if (kind === "class") p.layers[0].choices = ["Script"];
    if (kind === "allowance") p.maxCostMicros = 1000001;
    expect(() => validateVisionRequest(p)).toThrow();
  });
  it("rejects oversized screenshot dimensions before any provider request", () => {
    const request = visionRequest(),
      bytes = Buffer.from(request.image.slice(22), "base64");
    bytes.writeUInt32BE(513, 16);
    request.image = "data:image/png;base64," + bytes.toString("base64");
    expect(() => validateVisionRequest(request)).toThrow(/512-pixel/);
  });
  it.each([
    "unknown",
    "source",
    "foreign",
    "confidence",
    "reasons",
    "code",
    "class",
  ])("rejects unsupported provider output %s", (kind) => {
    const request = visionRequest(),
      result = simulatedVisionResult(request.layers) as any,
      s = result.suggestions[0];
    if (kind === "unknown") result.package = {};
    if (kind === "source") s.source = "print(1)";
    if (kind === "foreign") s.layer = "L999";
    if (kind === "confidence") s.confidence = Infinity;
    if (kind === "reasons") s.reasons = ["x".repeat(181)];
    if (kind === "code") {
      s.kind = "Source";
      s.value = "print(1)";
    }
    if (kind === "class") {
      s.kind = "class";
      s.value = "Script";
    }
    expect(() => readVisionResult(result, request.layers)).toThrow();
  });
  it("applies only an accepted correction through history, exporting no AI data", () => {
    const original = visionAnalysis(),
      scope = prepareVisionMetadata(
        original,
        "review-root",
        FULL_VISION_REGION,
        false,
      ),
      request = visionRequest(),
      result = simulatedVisionResult(request.layers),
      history = createOverrideHistory();
    const changes = visionChanges(
        original,
        scope.map,
        result.suggestions[0],
        {},
      ),
      edits = applyOverrideChanges({}, changes);
    history.record({}, edits);
    expect(original.package).toEqual(reviewPackage());
    expect(edits["ambiguous-button"].name).toBe("ClaimButton");
    expect(history.undo(edits)).toEqual({});
    const pkg = reviewPackage(edits);
    for (const format of SOURCE_FORMATS)
      expect(generateSource(pkg, format.id)).not.toMatch(
        /Simulated review|confidence|VISION_|local-simulated-provider-key|reservedCost/,
      );
    expect(generateModel(pkg)).toContain("ClaimButton");
  });
  it("rechecks native state ownership and rejects duplicate state writers", () => {
    const design = node("Root", {
      id: "root",
      children: [
        node("Button [button]", {
          id: "owner",
          children: [node("Artwork", { id: "art" })],
        }),
      ],
    });
    const result = {
        ...visionAnalysis(),
        designs: [design],
        package: compile([design], "state"),
      },
      map = { L1: "art" };
    const s = {
      layer: "L1",
      kind: "state" as const,
      value: "hover",
      confidence: 0.7,
      reasons: ["Possible hover artwork"],
      related: [],
    };
    const edits = applyOverrideChanges({}, visionChanges(result, map, s, {}));
    expect((edits.art.behavior || {}).state).toBe("hover");
    const compiled = compile([design], "state", { layerOverrides: edits });
    expect(
      flatten(compiled.roots).find((n) => n.id === "art")?.behavior?.state,
    ).toEqual({ kind: "hover", owner: "owner" });
    expect(() => visionChanges(result, { L1: "owner" }, s, {})).toThrow(
      /separate editable/,
    );
    expect(() =>
      visionChanges(
        result,
        map,
        { ...s, kind: "component", value: "review", related: ["L1", "L2"] },
        {},
      ),
    ).toThrow(/component candidates/);
  });
});
describe("provider contract and recovery", () => {
  it("fails closed without explicit bounded provider/pricing configuration", () => {
    expect(visionSettings({})).toBeUndefined();
    expect(
      visionSettings({ ...visionEnv, VISION_ENABLED: "0" }),
    ).toBeUndefined();
    expect(
      visionSettings({ ...visionEnv, VISION_OUTPUT_MICROS_PER_MILLION: "" }),
    ).toBeUndefined();
    expect(
      visionSettings({ ...visionEnv, VISION_MODEL: "https://evil.test" }),
    ).toBeUndefined();
    expect(visionSettings(visionEnv)?.costMicros).toBe(5530);
  });
  it("uses a fixed Responses endpoint, structured output, bounded image and no response storage", async () => {
    const request = visionRequest(),
      settings = visionSettings(visionEnv)!,
      calls: any[] = [];
    const result = await requestVision(
      request,
      settings,
      new AbortController().signal,
      async (url, options) => {
        calls.push({ url, options });
        return providerResponse(simulatedVisionResult(request.layers));
      },
    );
    expect(result.suggestions).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].options.redirect).toBe("manual");
    const body = JSON.parse(calls[0].options.body);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(1024);
    expect(body.tools).toBeUndefined();
    expect(body.input[0].content[1].detail).toBe("low");
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /accountToken|projectId|map|local-simulated-provider-key/,
    );
    expect(() =>
      visionProviderBody(request, { ...settings, inputTokens: 100 }),
    ).toThrow(/configured input/);
  });
  it("sanitizes provider errors, refusals, incomplete responses and oversized output", async () => {
    const request = visionRequest(),
      settings = visionSettings(visionEnv)!,
      signal = new AbortController().signal;
    for (const response of [
      new Response("secret-key private-image", { status: 401 }),
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.test" },
      }),
      Response.json({ status: "incomplete", output: [] }),
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "private" }],
          },
        ],
      }),
      new Response("x".repeat(65537)),
    ]) {
      await expect(
        requestVision(request, settings, signal, async () => response),
      ).rejects.toThrow(/AI provider/);
    }
  });
  it("never requests review before explicit enablement/configuration/valid consent", async () => {
    const calls: string[] = [],
      request = visionRequest();
    const manager = createVisionReviewManager(
      async (path) => {
        calls.push(path);
        if (path === "/config")
          return {
            available: true,
            provider: "OpenAI",
            model: "test-model",
            maxCostMicros: 5530,
            remainingRequests: 10,
            remainingCostMicros: 100000,
            resetsAt: 1,
          };
        return {
          result: simulatedVisionResult(request.layers),
          reservedCostMicros: 5530,
          remainingRequests: 9,
          remainingCostMicros: 94470,
          resetsAt: 1,
        };
      },
      () => {},
    );
    manager.setContext("account", "snapshot");
    await manager.review(request);
    expect(calls).toEqual([]);
    manager.enable(true);
    await manager.configure();
    await manager.review({
      ...request,
      consent: { ...request.consent, screenshot: false },
    } as any);
    expect(calls).toEqual(["/config"]);
    await manager.review(request);
    expect(calls).toEqual(["/config", ""]);
    expect(manager.state.result?.suggestions).toHaveLength(1);
    expect(manager.state.config?.remainingRequests).toBe(9);
    manager.dispose();
  });
  it("ignores cancelled/account-changed replies and explicitly requests server cancellation", async () => {
    let resolve!: (v: any) => void;
    const calls: string[] = [];
    const request = visionRequest(),
      result = simulatedVisionResult(request.layers);
    const manager = createVisionReviewManager(
      async (path) => {
        calls.push(path);
        if (path === "/config")
          return {
            available: true,
            provider: "OpenAI",
            model: "test-model",
            maxCostMicros: 5530,
            remainingRequests: 10,
            remainingCostMicros: 100000,
            resetsAt: 1,
          };
        if (path === "/cancel") return { cancelled: true };
        return new Promise((r) => (resolve = r));
      },
      () => {},
    );
    manager.setContext("account", "snapshot");
    expect(manager.state.enabled).toBe(false);
    manager.enable(true);
    await manager.configure();
    const pending = manager.review(request);
    manager.cancel();
    resolve({ result, reservedCostMicros: 5530 });
    await pending;
    expect(calls).toContain("/cancel");
    expect(manager.state.result).toBeUndefined();
    expect(manager.state.notice).toMatch(/incurred/);
    const next = manager.review({ ...request, id: crypto.randomUUID() });
    manager.setContext("peer", "snapshot");
    resolve({ result, reservedCostMicros: 5530 });
    await next;
    expect(manager.state.enabled).toBe(false);
    expect(manager.state.result).toBeUndefined();
    manager.dispose();
  });
});
