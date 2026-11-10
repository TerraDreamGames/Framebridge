type Context = {
  service: string;
  pluginRevision: string;
  authMode: "roblox" | "api-key";
  secrets?: (string | undefined)[];
  image?: { name: string; uploadName: string; nodeId: string };
};
const scrub = (message: string, secrets: Context["secrets"] = []) => {
  for (const secret of secrets)
    if (secret) message = message.split(secret).join("[redacted]");
  return message
    .replace(/https?:\/\/\S+/gi, "[link omitted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/_=.-]{24,}/g, "[redacted]")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .slice(0, 750);
};
export class ArtworkUploadError extends Error {
  readonly report: string;
  constructor(message: string, diagnostic: unknown, context: Context) {
    const imageName = context.image
      ? scrub(context.image.name, context.secrets).trim().slice(0, 160)
      : "";
    const imageNodeId =
      context.image && /^\d+:\d+$/.test(context.image.nodeId)
        ? context.image.nodeId
        : undefined;
    super(
      (
        (imageName || imageNodeId
          ? `Image${imageName ? ` “${imageName}”` : ""}${imageNodeId ? ` (layer ${imageNodeId})` : ""}: `
          : "") + scrub(message, context.secrets)
      ).slice(0, 750),
    );
    this.name = "ArtworkUploadError";
    const record =
      diagnostic && typeof diagnostic === "object"
        ? (diagnostic as Record<string, unknown>)
        : {};
    const revision = (value: unknown) =>
      typeof value === "string" &&
      /^[a-f0-9]{40}$/.test(value) &&
      !context.secrets?.includes(value)
        ? value
        : "unreported";
    let service = "unreported";
    try {
      const url = new URL(context.service);
      if (["https:", "http:"].includes(url.protocol)) service = url.origin;
    } catch {
      /* Only a validated origin goes into the report. */
    }
    // Never serialize settings, capabilities, request/response bodies or artwork.
    this.report = JSON.stringify(
      {
        tool: "Framebridge",
        kind: "image-upload",
        pluginRevision: revision(context.pluginRevision),
        service,
        serviceRevision: revision(record.sourceRevision),
        stage:
          record.stage === "create" || record.stage === "check"
            ? record.stage
            : "unreported",
        cached:
          typeof record.cached === "boolean" ? record.cached : "unreported",
        providerStatus:
          typeof record.providerStatus === "number" &&
          Number.isInteger(record.providerStatus) &&
          record.providerStatus >= 100 &&
          record.providerStatus <= 599
            ? record.providerStatus
            : "unreported",
        authMode: context.authMode,
        ...(context.image
          ? {
              imageName,
              uploadName: scrub(
                context.image.uploadName,
                context.secrets,
              ).slice(0, 160),
              ...(imageNodeId ? { imageNodeId } : {}),
            }
          : {}),
        message: this.message,
      },
      null,
      2,
    );
  }
}
