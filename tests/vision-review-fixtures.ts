import { randomUUID } from "node:crypto";
import {
  prepareVisionMetadata,
  FULL_VISION_REGION,
  type VisionRequest,
  type VisionResult,
} from "../packages/core/src/vision-review";
import { reviewDesign, reviewPackage } from "./structure-review-fixtures";
import { iconPng } from "./image-tools-fixtures";
import type { AnalysisResult } from "../packages/core/src/types";
export const visionEnv = {
  VISION_ENABLED: "1",
  VISION_OPENAI_KEY: "local-simulated-provider-key",
  VISION_MODEL: "gpt-4o-mini-2024-07-18",
  VISION_INPUT_MICROS_PER_MILLION: "150000",
  VISION_OUTPUT_MICROS_PER_MILLION: "600000",
  VISION_IMAGE_TOKEN_BUDGET: "8192",
  VISION_INPUT_TOKEN_BUDGET: "32768",
  VISION_OUTPUT_TOKENS: "1024",
  VISION_DAILY_COST_MICROS: "1000000",
  VISION_DAILY_USER_COST_MICROS: "100000",
  VISION_DAILY_INVITE_COST_MICROS: "500000",
};
export function visionAnalysis(): AnalysisResult {
  return {
    designs: [reviewDesign()],
    package: reviewPackage(),
    previews: {},
    assets: {},
    revision: 1,
  };
}
export function visionRequest(): VisionRequest {
  return {
    version: 1,
    id: randomUUID(),
    consent: { screenshot: true, metadata: true, text: false },
    maxCostMicros: 20000,
    image: "data:image/png;base64," + Buffer.from(iconPng()).toString("base64"),
    layers: prepareVisionMetadata(
      visionAnalysis(),
      "review-root",
      FULL_VISION_REGION,
      false,
    ).layers,
  };
}
export function simulatedVisionResult(
  layers: VisionRequest["layers"],
): VisionResult {
  const layer =
    layers.find((l) => l.name === "Frame 17") ??
    layers.find((l) => l.editable)!;
  return {
    summary:
      "Simulated review for local QA. Review each choice before applying.",
    suggestions: [
      {
        layer: layer.token,
        kind: "name",
        value: "ClaimButton",
        confidence: 0.73,
        reasons: [
          "The visible label suggests a claim action; the source name is generic.",
        ],
        related: [],
      },
    ],
  };
}
export function providerResponse(result: VisionResult): Response {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(result) }],
      },
    ],
  });
}
