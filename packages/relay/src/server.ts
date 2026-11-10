import { IMAGE_BATCH_LIMITS } from "../../core/src/image-batches";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { setInterval, clearInterval } from "node:timers";
import { randomBytes, randomUUID } from "node:crypto";
import {
  PublicError,
  uploadImage,
  uploadKey,
  retryableUploadFailure,
  validateUpload,
  type Upload,
  type Uploaded,
} from "./roblox";
import { validatePackage } from "./protocol";
import { Waiters, waitMilliseconds } from "./waiters";
import { Handoffs, memoryHandoffs } from "./handoff";
import type { TransferPackage } from "../../core/src/types";
const token = () => randomBytes(32).toString("hex");
type Job = {
  id: string;
  state: "uploading" | "done" | "failed";
  result?: Uploaded;
  error?: string;
  retryable?: boolean;
  created?: number;
};
type Session = {
  uploadOnly?: boolean;
  receiver: string;
  sender?: string;
  code: string;
  pairExpires: number;
  expires: number;
  revision: number;
  package?: TransferPackage;
  receipt?: {
    revision: number;
    status: "imported" | "ready" | "queued" | "failed";
    message?: string;
  };
  jobs: Map<string, Job>;
  cache: Map<string, Job>;
};
export function createRelay(
  deps: {
    upload?: typeof uploadImage;
    now?: () => number;
    maxSessions?: number;
  } = {},
) {
  const sessions = new Map<string, Session>();
  const waiters = new Waiters();
  const limits = new Map<string, { count: number; expires: number }>();
  const now = deps.now ?? Date.now;
  const handoffs = new Handoffs(memoryHandoffs(), {
    now,
    active: (invite) => invite === "local",
    count(scope, maximum, window) {
      const key = "handoff:" + scope,
        previous = limits.get(key);
      if (!previous && limits.size >= 10_000)
        throw new PublicError("The local relay is busy. Try later.", 429);
      const current =
        previous && previous.expires > now()
          ? previous
          : { count: 0, expires: now() + window };
      if (current.count >= maximum)
        throw new PublicError(
          "Handoff usage limit reached. Try after the quota resets.",
          429,
        );
      current.count++;
      limits.set(key, current);
    },
  });
  const prune = () => {
    handoffs.prune();
    for (const [id, session] of sessions)
      if (session.expires <= now()) {
        sessions.delete(id);
        waiters.notify(id);
      }
    for (const [ip, limit] of limits)
      if (limit.expires < now()) limits.delete(ip);
  };
  const timer = setInterval(prune, 60_000) as unknown as NodeJS.Timeout;
  timer.unref();
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // Sandboxed Figma UI has a null origin. Bearer tokens authorize every private endpoint.
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Roblox-Api-Key, X-Framebridge-Beta",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.headers["access-control-request-private-network"] === "true")
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      prune();
      const url = new URL(req.url ?? "/", "http://relay");
      const path = url.pathname;
      if (path === "/health" && req.method === "GET")
        return json(res, 200, { ok: true });
      if (path === "/v1/feedback/config" && req.method === "GET")
        return json(res, 200, {
          available: false,
          retentionDays: 14,
          maximumBytes: 800000,
          screenshotBytes: 512 * 1024,
        });
      if (
        ["/v1/sessions", "/v1/pair", "/v1/upload-sessions"].includes(path) &&
        req.method === "POST"
      ) {
        // Deliberately do not trust forwarded headers; set edge rate limits when deploying behind a proxy.
        const ip = req.socket.remoteAddress ?? "unknown";
        if (!limits.has(ip) && limits.size >= 10_000)
          throw new PublicError("Connection limit reached. Try later.", 429);
        const limit = limits.get(ip) ?? { count: 0, expires: now() + 60_000 };
        limits.set(ip, limit);
        if (++limit.count > 20)
          throw new PublicError(
            "Too many connection attempts. Wait a minute.",
            429,
          );
        if (path === "/v1/sessions" || path === "/v1/upload-sessions") {
          if (sessions.size >= (deps.maxSessions ?? 20))
            throw new PublicError("The relay is busy. Try again shortly.", 503);
          const receiver = token(),
            code = randomBytes(6).toString("hex").toUpperCase();
          const session: Session = {
            uploadOnly: path === "/v1/upload-sessions",
            receiver,
            code,
            pairExpires: now() + 600_000,
            expires: now() + 7_200_000,
            revision: 0,
            jobs: new Map(),
            cache: new Map(),
          };
          sessions.set(receiver, session);
          if (session.uploadOnly)
            return json(res, 201, {
              uploadToken: receiver,
              expiresAt: session.expires,
            });
          return json(res, 201, {
            receiverToken: receiver,
            code,
            expiresAt: session.expires,
            pairExpiresAt: session.pairExpires,
          });
        }
        const body = (await readJson(req, 1024)) as { code?: string };
        const code =
          typeof body.code === "string"
            ? body.code.replace(/[ -]/g, "").toUpperCase()
            : "";
        const session = [...sessions.values()].find(
          (s) =>
            !s.uploadOnly &&
            s.code === code &&
            !s.sender &&
            s.pairExpires > now(),
        );
        if (!session)
          throw new PublicError(
            "That Studio code is invalid, expired, or already used. Create a new connection in Studio.",
            401,
          );
        session.sender = token();
        waiters.notify(session.receiver);
        return json(res, 200, {
          senderToken: session.sender,
          expiresAt: session.expires,
        });
      }
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      if (path === "/v1/handoffs/open" && req.method === "POST")
        return json(
          res,
          200,
          handoffs.open("local", await readJson(req, 2048)),
        );
      if (path === "/v1/handoff" && req.method === "GET")
        return json(res, 200, handoffs.owner(bearer ?? "").summary);
      if (path === "/v1/handoff" && req.method === "DELETE")
        return json(res, 200, handoffs.revoke(bearer ?? ""));
      if (path === "/v1/handoff-receipt" && req.method === "POST")
        return json(
          res,
          200,
          handoffs.receipt(bearer ?? "", await readJson(req, 4096)),
        );
      let session = [...sessions.values()].find(
        (s) => bearer && (s.receiver === bearer || s.sender === bearer),
      );
      if (!session)
        throw new PublicError(
          "Connection expired. Reconnect and try again.",
          401,
        );
      const isSender = session.sender === bearer;
      const canUpload = isSender || session.uploadOnly;
      if (path === "/v1/handoffs" && req.method === "POST" && canUpload) {
        const body = await readJson(req, 8_001_024);
        prune();
        if (!sessions.has(session.receiver))
          throw new PublicError(
            "Connection expired. Reconnect and try again.",
            401,
          );
        return json(res, 201, handoffs.create("local", body));
      }
      const waiting = async (kind: string) => {
        const abort = new AbortController();
        const close = () => abort.abort();
        res.once("close", close);
        try {
          await waiters.wait(
            `${session!.receiver}:${kind}`,
            Math.min(waitMilliseconds(url), session!.expires - now()),
            abort.signal,
          );
        } finally {
          res.off("close", close);
        }
        prune();
        const current = [...sessions.values()].find(
          (s) => bearer && (s.receiver === bearer || s.sender === bearer),
        );
        if (!current)
          throw new PublicError(
            "Connection expired. Reconnect and try again.",
            401,
          );
        session = current;
      };
      if (path === "/v1/session" && req.method === "GET" && !session.uploadOnly)
        return json(res, 200, {
          role: isSender ? "sender" : "receiver",
          paired: !!session.sender,
          expiresAt: session.expires,
          ...(isSender
            ? {}
            : {
                code:
                  !session.sender && session.pairExpires > now()
                    ? session.code
                    : undefined,
                importedRevision:
                  session.receipt?.status === "imported"
                    ? session.receipt.revision
                    : 0,
              }),
        });
      if (path === "/v1/session" && req.method === "DELETE") {
        sessions.delete(session.receiver);
        waiters.notify(session.receiver);
        return json(res, 200, { ok: true });
      }
      if (
        path === "/v1/inbox" &&
        req.method === "GET" &&
        !isSender &&
        !session.uploadOnly
      ) {
        if (
          session.revision <= Number(url.searchParams.get("after") ?? -1) &&
          String(!!session.sender) === url.searchParams.get("paired")
        )
          await waiting("inbox");
        return json(res, 200, {
          paired: !!session.sender,
          revision: session.revision,
          ...(waitMilliseconds(url) ? { longPoll: true } : {}),
          package:
            Number(url.searchParams.get("after") ?? -1) < session.revision
              ? session.package
              : undefined,
        });
      }
      if (path === "/v1/receipt" && !session.uploadOnly) {
        if (req.method === "GET" && isSender) {
          const revision = Number(url.searchParams.get("revision"));
          if (
            !Number.isSafeInteger(revision) ||
            revision < 1 ||
            revision > session.revision
          )
            throw new PublicError("Invalid transfer revision.");
          if (revision === session.revision && !session.receipt)
            await waiting("receipt");
          return json(
            res,
            200,
            revision < session.revision
              ? { revision, status: "superseded" }
              : {
                  ...(session.receipt ?? { revision, status: "pending" }),
                  ...(waitMilliseconds(url) ? { longPoll: true } : {}),
                },
          );
        }
        if (req.method === "POST" && !isSender) {
          const receipt = (await readJson(req, 4096)) as {
            revision?: number;
            status?: string;
            message?: string;
          };
          if (receipt.revision !== session.revision || !session.package)
            throw new PublicError(
              "This transfer was replaced by a newer export.",
              409,
            );
          if (
            !["imported", "ready", "queued", "failed"].includes(
              receipt.status ?? "",
            ) ||
            (receipt.message !== undefined &&
              typeof receipt.message !== "string")
          )
            throw new PublicError("Invalid Studio receipt.");
          session.receipt = {
            revision: receipt.revision,
            status: receipt.status as
              "imported" | "ready" | "queued" | "failed",
            ...(receipt.message
              ? { message: receipt.message.slice(0, 500) }
              : {}),
          };
          waiters.notify(session.receiver);
          return json(res, 200, { ok: true });
        }
      }
      if (path === "/v1/package" && req.method === "POST" && isSender) {
        const pkg = (await readJson(req, 8_000_000)) as TransferPackage;
        validatePackage(pkg);
        // No API keys or image byte payloads are accepted in transfer envelopes.
        session.receipt = undefined;
        session.package = pkg;
        session.revision++;
        waiters.notify(session.receiver);
        return json(res, 200, { revision: session.revision });
      }
      if (path === "/v1/assets" && req.method === "POST" && canUpload) {
        const apiKey = req.headers["x-roblox-api-key"];
        if (
          typeof apiKey !== "string" ||
          apiKey.length < 10 ||
          apiKey.length > 4096
        )
          throw new PublicError("Enter your Roblox Open Cloud API key.");
        const input = (await readJson(req, 28_001_024)) as Upload;
        const bytes = validateUpload(input),
          hash = uploadKey(input, bytes, apiKey);
        let job = session.cache.get(hash);
        const retry =
          job &&
          retryableUploadFailure(job) &&
          now() - (job.created ?? 0) >= 10_000;
        if (!job || retry) {
          if (!retry && session.jobs.size >= IMAGE_BATCH_LIMITS.unique)
            throw new PublicError(
              "This connection has reached 1,000 unique uploads. Completed links are retained; start a new connection for another batch.",
              429,
            );
          if (
            [...session.jobs.values()].filter((j) => j.state === "uploading")
              .length >= 2
          )
            throw new PublicError(
              "Wait for the current images to finish uploading.",
              429,
            );
          job = {
            id: job?.id ?? randomUUID(),
            state: "uploading",
            created: now(),
          };
          session.cache.set(hash, job);
          session.jobs.set(job.id, job);
          const pending = job;
          // Credentials exist only in the request/task closure and are never stored in the session or logs.
          void (deps.upload ?? uploadImage)(input, bytes, apiKey)
            .then((result) => {
              pending.result = result;
              pending.state = "done";
            })
            .catch((error) => {
              pending.state = "failed";
              pending.retryable =
                error instanceof PublicError && error.rejectedCreate;
              pending.error =
                error instanceof PublicError
                  ? error.message
                  : "Image upload failed. Check Creator Dashboard before retrying.";
            });
        }
        return json(res, 202, job);
      }
      if (path.startsWith("/v1/assets/") && req.method === "GET" && canUpload) {
        const job = session.jobs.get(path.slice("/v1/assets/".length));
        if (!job) throw new PublicError("Upload not found.", 404);
        return json(res, 200, job);
      }
      throw new PublicError("Endpoint not found.", 404);
    } catch (error) {
      json(res, error instanceof PublicError ? error.status : 500, {
        error:
          error instanceof PublicError
            ? error.message
            : "The relay could not complete this request.",
      });
    }
  });
  server.requestTimeout = 35_000;
  server.on("close", () => clearInterval(timer));
  return server;
}
function json(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new PublicError("Expected JSON.", 415);
  if (Number(req.headers["content-length"]) > max) {
    req.resume();
    throw new PublicError("Payload is too large.", 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      throw new PublicError("Payload is too large.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PublicError("Invalid JSON.");
  }
}
