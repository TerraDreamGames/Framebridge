import {
  normalizeFeedback,
  type FeedbackReport,
} from "../../../packages/core/src/feedback";
import { relayRequest } from "./transfer";
import { readFeedbackReceipt } from "./feedback-storage";
export async function feedbackConfig(signal: AbortSignal) {
  const result = await relayRequest<{
    available: boolean;
    retentionDays: number;
    maximumBytes: number;
    screenshotBytes: number;
  }>("/v1/feedback/config", "", undefined, signal);
  if (
    typeof result.available !== "boolean" ||
    result.retentionDays !== 14 ||
    result.maximumBytes !== 800000 ||
    result.screenshotBytes !== 512 * 1024
  )
    throw new Error("Private report availability could not be checked.");
  return result.available;
}
export async function submitFeedback(
  token: string,
  report: FeedbackReport,
  beta: string,
  signal: AbortSignal,
) {
  return readFeedbackReceipt(
    await relayRequest(
      "/v1/feedback",
      "",
      { reportToken: token, report },
      signal,
      undefined,
      undefined,
      beta,
    ),
  );
}
export async function inspectFeedback(token: string, signal: AbortSignal) {
  const result = await relayRequest<{ receipt: unknown; report: unknown }>(
    "/v1/feedback/report",
    token,
    undefined,
    signal,
  );
  return {
    receipt: readFeedbackReceipt(result.receipt),
    report: normalizeFeedback(result.report),
  };
}
export async function withdrawFeedback(
  token: string,
  beta: string,
  pending: boolean,
  signal: AbortSignal,
) {
  const result = await (pending
    ? relayRequest<{ withdrawn: boolean }>(
        "/v1/feedback/cancel",
        "",
        { reportToken: token },
        signal,
        undefined,
        undefined,
        beta,
      )
    : relayRequest<{ withdrawn: boolean }>(
        "/v1/feedback/report",
        token,
        undefined,
        signal,
        undefined,
        "DELETE",
      ));
  if (result.withdrawn !== true)
    throw new Error(
      "Could not confirm report withdrawal. Check status and try again.",
    );
}
