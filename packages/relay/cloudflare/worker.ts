import { IMAGE_BATCH_LIMITS } from "../../core/src/image-batches";
import { env as currentBindings } from "cloudflare:workers";
import { OperationsStore, operationsAuthorized } from "./operations-store";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  DurableObjectNamespace,
  DurableObjectState,
  R2Bucket,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import { validatePackage } from "../src/protocol";
import { Waiters, waitMilliseconds } from "../src/waiters";
import { Handoffs } from "../src/handoff";
import { sqliteHandoffs } from "./handoff-store";
import { sqliteOAuth } from "./oauth-store";
import { ReviewStore } from "./review-store";
import { VisionStore } from "./vision-store";
import {
  requestVision,
  visionProviderBody,
  visionSettings,
  type VisionEnvironment,
} from "../src/vision-provider";
import {
  validateVisionRequest,
  VISION_LIMITS,
} from "../../core/src/vision-review";
import { ArtworkStore } from "./artwork-store";
import { ARTWORK_LIMITS } from "../../core/src/cloud-artwork";
import { RobloxOAuth, ROBLOX_OAUTH_SCOPES } from "../src/roblox-oauth";
import { oauthPage, validatedOAuthCallback } from "../src/oauth-callback";
import { Feedbacks } from "../src/feedback";
import { sqliteFeedback } from "./feedback-store";
import { textChunks } from "../src/chunks";
import {
  PublicError,
  validateUpload,
  uploadKey,
  retryableUploadFailure,
  legacyUploadRejection,
  createImageOperation,
  readImageOperation,
  type Upload,
  type Uploaded,
  type Owner,
  type RobloxCredential,
} from "../src/roblox";
import type { TransferPackage } from "../../core/src/types";
import { workerReleaseProvenance } from "../src/release-provenance.mjs";
import {
  activeAccess,
  clientIdentity,
  invitations,
  publicAccess,
  publicIdentity,
} from "./access";
declare const __FRAMEBRIDGE_RELEASE_PROVENANCE__: unknown;

export interface Env extends VisionEnvironment {
  RELAY: DurableObjectNamespace;
  ACCESS_MODE?: string;
  BETA_ACCESS_HASHES?: string;
  MAX_SESSIONS?: string;
  DAILY_REQUESTS?: string;
  DAILY_TRANSFERS?: string;
  DAILY_UPLOADS?: string;
  DAILY_UPLOADS_PER_TESTER?: string;
  DAILY_UPLOADS_PER_CLIENT?: string;
  MAX_ROBLOX_ACCOUNTS?: string;
  MAX_ROBLOX_LOGINS?: string;
  ROBLOX_OAUTH_CLIENT_ID?: string;
  ROBLOX_OAUTH_CLIENT_SECRET?: string;
  ROBLOX_OAUTH_LEGACY_CLIENT_ID?: string;
  ROBLOX_OAUTH_LEGACY_CLIENT_SECRET?: string;
  ROBLOX_OAUTH_REDIRECT_URI?: string;
  ROBLOX_OAUTH_SEALING_KEY?: string;
  ROBLOX_OAUTH_GATEWAY_SECRET?: string;
  FEEDBACK_ADMIN_HASH?: string;
  OPERATIONS_ADMIN_HASH?: string;
  ARTWORK_ENABLED?: string;
  ARTWORK_BUCKET?: R2Bucket;
  FRAMEBRIDGE_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const limit = (value: string | undefined, fallback: number) =>
  /^\d+$/.test(value ?? "")
    ? Math.max(1, Math.min(Number(value), 100_000))
    : fallback;
function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof PublicError
          ? error.message
          : "The relay could not complete this request.",
    },
    error instanceof PublicError ? error.status : 500,
  );
}
async function readJson(request: Request, maximum: number) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new PublicError("Expected JSON.", 415);
  if (Number(request.headers.get("Content-Length")) > maximum)
    throw new PublicError("Payload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError("Expected JSON.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximum) {
      await reader.cancel();
      throw new PublicError("Payload is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PublicError("Invalid JSON.");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      const path = new URL(request.url).pathname;
      if (
        path === "/v1/operations" &&
        (request.method !== "GET" ||
          !operationsAuthorized(request, env.OPERATIONS_ADMIN_HASH))
      )
        throw new PublicError("Not found.", 404);
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else if (path === "/health" && request.method === "GET")
        response = json({
          ok: true,
          access: publicAccess(env) ? "public" : "private-beta",
          configured: publicAccess(env) || invitations(env).length > 0,
          provenance: workerReleaseProvenance(
            typeof __FRAMEBRIDGE_RELEASE_PROVENANCE__ === "undefined"
              ? null
              : __FRAMEBRIDGE_RELEASE_PROVENANCE__,
            env.FRAMEBRIDGE_VERSION_METADATA,
          ),
        });
      else if (!publicAccess(env) && !invitations(env).length)
        throw new PublicError(
          "Private beta access has not been configured.",
          503,
        );
      else {
        let forwarded: Request;
        if (path === "/v1/roblox/callback-forward") {
          const key = env.ROBLOX_OAUTH_GATEWAY_SECRET ?? "",
            bearer = request.headers.get("Authorization") ?? "";
          if (
            request.method !== "POST" ||
            !/^[a-f0-9]{64}$/.test(key) ||
            !/^Bearer [a-f0-9]{64}$/.test(bearer) ||
            !timingSafeEqual(Buffer.from(key), Buffer.from(bearer.slice(7)))
          )
            throw new PublicError("Not found.", 404);
          const body = await readJson(request, 20000),
            callback = validatedOAuthCallback(
              body?.callbackUrl,
              env.ROBLOX_OAUTH_REDIRECT_URI,
            );
          if (!callback)
            throw new PublicError(
              "Invalid Roblox authorization callback.",
              400,
            );
          // Recreate only the validated registered callback, with no proxy/client
          // headers. The normal PKCE, state, capability and quota checks still run.
          forwarded = new Request(callback.href);
        } else forwarded = new Request(request);
        forwarded.headers.delete("X-Framebridge-Invite-Id");
        if (
          [
            "/v1/sessions",
            "/v1/upload-sessions",
            "/v1/handoffs/open",
            "/v1/roblox/login",
            "/v1/feedback",
            "/v1/feedback/cancel",
          ].includes(path) &&
          request.method === "POST"
        ) {
          if (publicAccess(env)) {
            forwarded.headers.set(
              "X-Framebridge-Invite-Id",
              publicIdentity(request),
            );
          } else {
            const access = request.headers.get("X-Framebridge-Beta") ?? "";
            if (
              access.length < 32 ||
              access.length > 256 ||
              !invitations(env).includes(digest(access))
            )
              throw new PublicError(
                "Enter your private beta access code.",
                403,
              );
            forwarded.headers.set("X-Framebridge-Invite-Id", digest(access));
          }
          forwarded.headers.delete("X-Framebridge-Beta");
        }
        // Keep the existing room identity so upgrades preserve paired sessions,
        // OAuth accounts and snapshots. Quotas bound the shared service.
        response = (await env.RELAY.get(
          env.RELAY.idFromName("private-beta-v1"),
        ).fetch(forwarded as never)) as unknown as Response;
      }
    } catch (error) {
      response = failure(error);
    }
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*"); // Figma sandbox uses a null origin; capabilities authorize requests.
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Roblox-Api-Key, X-Framebridge-Beta, X-Framebridge-Roblox-Account, X-Framebridge-Review-Grant, X-Framebridge-Artwork-Grant",
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
};

type Session = {
  id: string;
  receiver: string;
  sender: string | null;
  code: string;
  invite: string;
  expires: number;
  pairExpires: number;
  uploadOnly: boolean;
  revision: number;
  packageHash?: string;
  receipt?: { revision: number; status: string; message?: string };
};
type Job = {
  id: string;
  state: "uploading" | "done" | "failed";
  operation?: string;
  keyHash: string;
  created: number;
  checked: number;
  error?: string;
  retryable?: boolean;
  errorStage?: "create" | "check";
  providerStatus?: number;
  result?: Uploaded;
};
export class RelayRoom {
  private operations?: OperationsStore;
  private waiters = new Waiters();
  private handoffs: Handoffs;
  private oauth: RobloxOAuth;
  private feedback: Feedbacks;
  private review: ReviewStore;
  private vision: VisionStore;
  private visionRequests = new Map<
    string,
    { account: string; abort: AbortController }
  >();
  private artwork: ArtworkStore;
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, receiver TEXT UNIQUE, sender TEXT UNIQUE, code TEXT UNIQUE, invite TEXT, expires REAL, data TEXT);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
      CREATE TABLE IF NOT EXISTS chunks (session TEXT, part INTEGER, data TEXT, PRIMARY KEY(session,part));
      CREATE TABLE IF NOT EXISTS jobs (session TEXT, id TEXT, hash TEXT, data TEXT, PRIMARY KEY(session,id), UNIQUE(session,hash));
      CREATE TABLE IF NOT EXISTS counters (scope TEXT PRIMARY KEY, count INTEGER, expires REAL);
      CREATE INDEX IF NOT EXISTS counters_expiry ON counters(expires);
    `);
    // Migrate existing beta jobs once. Indexed active-slot lookups and a stored
    // total avoid loading/scanning every completed upload for each new image.
    ctx.storage.transactionSync(() => {
      const jobColumns = this.rows("PRAGMA table_info(jobs)");
      let migrated = false;
      for (const [name, type] of [
        ["state", "TEXT"],
        ["created", "REAL"],
      ])
        if (!jobColumns.some((column) => column.name === name)) {
          ctx.storage.sql.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
          migrated = true;
        }
      if (migrated)
        ctx.storage.sql.exec(
          "UPDATE jobs SET state=json_extract(data,'$.state'), created=json_extract(data,'$.created')",
        );
      const hasUsage = this.rows(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='job_usage'",
      ).length;
      ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS jobs_active ON jobs(session,state,created);
      CREATE TABLE IF NOT EXISTS job_usage (session TEXT PRIMARY KEY, total INTEGER NOT NULL);
    `);
      if (!hasUsage)
        ctx.storage.sql.exec(
          "INSERT INTO job_usage SELECT session,COUNT(*) FROM jobs GROUP BY session",
        );
    });
    this.handoffs = new Handoffs(sqliteHandoffs(ctx.storage), {
      now: Date.now,
      active: (invite) => activeAccess(this.env, invite),
      count: (scope, maximum, window) => this.count(scope, maximum, window),
      created: (invite) => {
        this.daily("transfers", limit(this.env.DAILY_TRANSFERS, 1000));
        this.daily(`transfers:${invite}`, 200);
      },
    });
    this.feedback = new Feedbacks(sqliteFeedback(ctx.storage), {
      now: Date.now,
      active: (invite) => activeAccess(this.env, invite),
      enabled: () => /^[a-f0-9]{64}$/.test(this.env.FEEDBACK_ADMIN_HASH ?? ""),
      count: (scope, maximum, window) => this.count(scope, maximum, window),
      knownSecrets: () => {
        const current = currentBindings as unknown as Env;
        return [
          current.ROBLOX_OAUTH_CLIENT_SECRET ?? "",
          current.ROBLOX_OAUTH_LEGACY_CLIENT_SECRET ?? "",
          current.ROBLOX_OAUTH_SEALING_KEY ?? "",
          current.ROBLOX_OAUTH_GATEWAY_SECRET ?? "",
        ];
      },
    });
    this.oauth = new RobloxOAuth(
      sqliteOAuth(ctx.storage),
      () => {
        // Cloudflare can reuse this object after a secrets-only deployment.
        // Resolve live bindings instead of retaining constructor-time strings.
        const current = currentBindings as unknown as Env;
        return {
          clientId: current.ROBLOX_OAUTH_CLIENT_ID,
          clientSecret: current.ROBLOX_OAUTH_CLIENT_SECRET,
          legacyClientId: current.ROBLOX_OAUTH_LEGACY_CLIENT_ID,
          legacyClientSecret: current.ROBLOX_OAUTH_LEGACY_CLIENT_SECRET,
          redirectUri: current.ROBLOX_OAUTH_REDIRECT_URI,
          sealingKey: current.ROBLOX_OAUTH_SEALING_KEY,
        };
      },
      {
        active: (invite) => activeAccess(this.env, invite),
        maxAccounts: limit(
          env.MAX_ROBLOX_ACCOUNTS,
          publicAccess(env) ? 1000 : 20,
        ),
        maxLogins: limit(env.MAX_ROBLOX_LOGINS, publicAccess(env) ? 1000 : 40),
        maxAccountsPerIdentity: publicAccess(env) ? 20 : 2,
        count: (scope, maximum, window) => this.count(scope, maximum, window),
        accountRemoved: (account) => {
          this.review.disconnect(account);
          this.artwork.disconnect(account);
          for (const [id, pending] of this.visionRequests)
            if (pending.account === account) {
              pending.abort.abort();
              this.vision.finish(id, "cancelled");
            }
        },
      },
    );
    this.review = new ReviewStore(ctx.storage, (invite) =>
      activeAccess(this.env, invite),
    );
    this.vision = new VisionStore(ctx.storage);
    this.artwork = new ArtworkStore(ctx.storage, env.ARTWORK_BUCKET, (invite) =>
      activeAccess(this.env, invite),
    );
    if (/^[a-f0-9]{64}$/.test(env.OPERATIONS_ADMIN_HASH ?? ""))
      this.operations = new OperationsStore(ctx.storage);
  }
  private rows(query: string, ...values: SqlStorageValue[]) {
    return this.ctx.storage.sql.exec(query, ...values).toArray();
  }
  private save(session: Session) {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?)",
      session.id,
      session.receiver,
      session.sender,
      session.code,
      session.invite,
      session.expires,
      JSON.stringify(session),
    );
  }
  private remove(id: string) {
    this.ctx.storage.sql.exec("DELETE FROM chunks WHERE session=?", id);
    this.ctx.storage.sql.exec("DELETE FROM jobs WHERE session=?", id);
    this.ctx.storage.sql.exec("DELETE FROM job_usage WHERE session=?", id);
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE id=?", id);
    this.operations?.remove(id);
    this.waiters.notify(id);
  }
  private prune() {
    this.handoffs.prune();
    this.oauth.prune();
    this.feedback.prune();
    this.review.prune();
    this.vision.prune();
    this.ctx.storage.transactionSync(() => {
      for (const row of this.rows(
        "SELECT id FROM sessions WHERE expires<=?",
        Date.now(),
      ))
        this.remove(String(row.id));
      this.ctx.storage.sql.exec(
        "DELETE FROM counters WHERE expires<=?",
        Date.now(),
      );
    });
  }
  private count(
    scope: string,
    maximum: number,
    window: number,
    label?: string,
  ) {
    const row = this.rows(
      "SELECT count,expires FROM counters WHERE scope=?",
      scope,
    )[0];
    const fresh = !row || Number(row.expires) <= Date.now();
    const count = fresh ? 0 : Number(row.count);
    if (count >= maximum)
      throw new PublicError(
        label
          ? `${label} limit of ${maximum} reached. Completed image links are kept. Try after the daily reset at 00:00 UTC.`
          : "Service usage limit reached. Try after the quota resets.",
        429,
      );
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO counters VALUES (?,?,?)",
      scope,
      count + 1,
      fresh ? Date.now() + window : Number(row.expires),
    );
  }
  private daily(scope: string, maximum: number) {
    const day = Math.floor(Date.now() / 86_400_000);
    this.count(
      `${day}:${scope}`,
      maximum,
      (day + 1) * 86_400_000 - Date.now(),
      scope === "uploads"
        ? "The service's daily artwork upload"
        : scope.startsWith("uploads:")
          ? "Your daily artwork upload"
          : undefined,
    );
  }
  private session(request: Request) {
    const token =
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError(
        "Connection expired. Reconnect and try again.",
        401,
      );
    const hash = digest(token);
    const row = this.rows(
      "SELECT data FROM sessions WHERE receiver=? OR sender=?",
      hash,
      hash,
    )[0];
    const session: Session | undefined = row
      ? JSON.parse(String(row.data))
      : undefined;
    if (
      !session ||
      session.expires <= Date.now() ||
      !activeAccess(this.env, session.invite)
    )
      throw new PublicError(
        "Connection expired. Reconnect and try again.",
        401,
      );
    const sender = session.sender === hash;
    if (!session.uploadOnly) this.operations?.touch(session.id, sender);
    return { session, sender };
  }
  private job(session: string, id: string): Job | undefined {
    const row = this.rows(
      "SELECT data FROM jobs WHERE session=? AND id=?",
      session,
      id,
    )[0];
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  private saveJob(session: string, hash: string, job: Job, reserve = false) {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO jobs (session,id,hash,data,state,created) VALUES (?,?,?,?,?,?)",
      session,
      job.id,
      hash,
      JSON.stringify(job),
      job.state,
      job.created,
    );
    if (reserve)
      this.ctx.storage.sql.exec(
        "INSERT INTO job_usage VALUES (?,1) ON CONFLICT(session) DO UPDATE SET total=total+1",
        session,
      );
  }
  private publicJob(job: Job, cached = false) {
    return {
      id: job.id,
      state: job.state,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
      ...(job.state === "failed"
        ? {
            diagnostics: {
              stage: job.errorStage ?? (job.operation ? "check" : "create"),
              cached,
              sourceRevision:
                workerReleaseProvenance(
                  typeof __FRAMEBRIDGE_RELEASE_PROVENANCE__ === "undefined"
                    ? null
                    : __FRAMEBRIDGE_RELEASE_PROVENANCE__,
                  this.env.FRAMEBRIDGE_VERSION_METADATA,
                )?.source.revision ?? "development",
              ...(job.providerStatus
                ? { providerStatus: job.providerStatus }
                : {}),
            },
          }
        : {}),
      ...(job.state === "uploading"
        ? {
            pollAfterMs:
              Date.now() - job.created < 10000
                ? 1000
                : Date.now() - job.created < 30000
                  ? 2000
                  : 4000,
          }
        : {}),
    };
  }
  async fetch(request: Request): Promise<Response> {
    try {
      return await this.handle(request);
    } catch (error) {
      return failure(error);
    }
  }
  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    if (path === "/v1/operations") {
      if (
        request.method !== "GET" ||
        !operationsAuthorized(request, this.env.OPERATIONS_ADMIN_HASH) ||
        !this.operations
      )
        throw new PublicError("Not found.", 404);
      return json(
        this.operations.snapshot(
          {
            requests: limit(this.env.DAILY_REQUESTS, 25_000),
            transfers: limit(this.env.DAILY_TRANSFERS, 1000),
            uploads: limit(this.env.DAILY_UPLOADS, 200),
            sessions: limit(this.env.MAX_SESSIONS, 20),
          },
          this.env.ARTWORK_ENABLED === "1" && !!this.env.ARTWORK_BUCKET,
        ),
      );
    }
    // Global request budget bounds background polling and service costs.
    this.daily("requests", limit(this.env.DAILY_REQUESTS, 25_000));
    if (path === "/v1/feedback/config" && request.method === "GET")
      return json(this.feedback.config());
    if (path === "/v1/feedback" && request.method === "POST") {
      const result = this.feedback.create(
        request.headers.get("X-Framebridge-Invite-Id") ?? "",
        await readJson(request, 801024),
      );
      await this.scheduleAlarm();
      return json(result, 201);
    }
    if (path === "/v1/feedback/report") {
      // A saved receipt capability grants access only to its own report.
      const token =
        request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (request.method === "GET") return json(this.feedback.inspect(token));
      if (request.method === "DELETE") {
        const result = this.feedback.withdraw(token);
        await this.scheduleAlarm();
        return json(result);
      }
    }
    if (path === "/v1/feedback/cancel" && request.method === "POST") {
      const body = await readJson(request, 1024);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => k !== "reportToken")
      )
        throw new PublicError("Invalid report cancellation.");
      const result = this.feedback.cancel(
        request.headers.get("X-Framebridge-Invite-Id") ?? "",
        body.reportToken,
      );
      await this.scheduleAlarm();
      return json(result);
    }
    if (
      (path === "/v1/feedback/reports" ||
        path.startsWith("/v1/feedback/reports/")) &&
      request.method === "GET"
    ) {
      const token =
          request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
        expected = this.env.FEEDBACK_ADMIN_HASH ?? "";
      if (
        !/^[a-f0-9]{64}$/.test(token) ||
        !/^[a-f0-9]{64}$/.test(expected) ||
        !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(expected))
      )
        throw new PublicError("Private report access required.", 403);
      const result =
        path === "/v1/feedback/reports"
          ? this.feedback.list(Number(url.searchParams.get("page") ?? 0))
          : this.feedback.review(path.slice("/v1/feedback/reports/".length));
      return json(result);
    }
    if (path === "/v1/roblox/config" && request.method === "GET")
      return json({
        ...this.oauth.publicConfig(),
        scopes: ROBLOX_OAUTH_SCOPES,
      });
    if (path === "/v1/artwork/config" && request.method === "GET")
      return json({
        enabled: this.env.ARTWORK_ENABLED === "1" && !!this.env.ARTWORK_BUCKET,
        limits: ARTWORK_LIMITS,
      });
    if (path === "/oauth/roblox/complete" && request.method === "GET")
      return oauthPage();
    if (path === "/oauth/roblox/callback" && request.method === "GET") {
      try {
        const connected = await this.oauth.callback(url);
        await this.scheduleAlarm();
        return oauthPage(
          connected
            ? "Roblox authorization completed"
            : "Roblox authorization could not finish",
        );
      } catch (error) {
        return oauthPage(
          "Roblox authorization could not finish",
          error instanceof PublicError ? error.status : 500,
        );
      }
    }
    if (path === "/v1/roblox/login" && request.method === "POST") {
      this.prune();
      const previous =
        request.headers.get("X-Framebridge-Roblox-Account") ?? undefined;
      // A saved account capability lets a reconnect retain its scope when the
      // user's network changes or an invited account upgrades to public access.
      const invite =
        publicAccess(this.env) && previous
          ? this.oauth.accountScope(previous)
          : (request.headers.get("X-Framebridge-Invite-Id") ?? "");
      const result = await this.oauth.begin(invite, previous);
      await this.scheduleAlarm();
      return json(result, 201);
    }
    if (
      ["/v1/sessions", "/v1/upload-sessions", "/v1/pair"].includes(path) &&
      request.method === "POST"
    ) {
      this.count(`ip:${clientIdentity(request)}`, 20, 60_000);
      const body = await readJson(request, 1024);
      this.prune();
      if (path !== "/v1/pair") {
        const invite = request.headers.get("X-Framebridge-Invite-Id") ?? "";
        if (!activeAccess(this.env, invite))
          throw new PublicError("Service access is unavailable.", 403);
        if (
          Number(this.rows("SELECT COUNT(*) AS n FROM sessions")[0].n) >=
          limit(this.env.MAX_SESSIONS, 20)
        )
          throw new PublicError(
            "The connection service is at capacity. Try later.",
            503,
          );
        if (
          Number(
            this.rows(
              "SELECT COUNT(*) AS n FROM sessions WHERE invite=?",
              invite,
            )[0].n,
          ) >= 4
        )
          throw new PublicError("Disconnect an existing session first.", 429);
        this.daily(`sessions:${invite}`, 30);
        const receiver = secret();
        const session: Session = {
          id: randomUUID(),
          receiver: digest(receiver),
          sender: null,
          code: randomBytes(6).toString("hex").toUpperCase(),
          invite,
          expires: Date.now() + 7_200_000,
          pairExpires: Date.now() + 600_000,
          uploadOnly: path === "/v1/upload-sessions",
          revision: 0,
        };
        this.save(session);
        if (!session.uploadOnly) this.operations?.touch(session.id, false);
        const alarm = await this.ctx.storage.getAlarm();
        if (!alarm || alarm > session.expires)
          await this.ctx.storage.setAlarm(session.expires);
        return session.uploadOnly
          ? json({ uploadToken: receiver, expiresAt: session.expires }, 201)
          : json(
              {
                receiverToken: receiver,
                code: session.code,
                expiresAt: session.expires,
                pairExpiresAt: session.pairExpires,
              },
              201,
            );
      }
      const code =
        typeof body?.code === "string"
          ? body.code.replace(/[ -]/g, "").toUpperCase()
          : "";
      const row = this.rows("SELECT data FROM sessions WHERE code=?", code)[0];
      const session: Session | undefined = row
        ? JSON.parse(String(row.data))
        : undefined;
      if (
        !session ||
        session.uploadOnly ||
        session.sender ||
        session.pairExpires <= Date.now() ||
        !activeAccess(this.env, session.invite)
      )
        throw new PublicError(
          "That Studio code is invalid, expired, or already used.",
          401,
        );
      const sender = secret();
      session.sender = digest(sender);
      this.save(session);
      this.operations?.touch(session.id, true);
      this.waiters.notify(session.id);
      return json({ senderToken: sender, expiresAt: session.expires });
    }
    const bearer =
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    if (path === "/v1/roblox/login" && request.method === "GET")
      return json(this.oauth.poll(bearer));
    if (path === "/v1/roblox/login" && request.method === "DELETE") {
      await this.oauth.cancel(bearer);
      await this.scheduleAlarm();
      return json({ cancelled: true });
    }
    if (path === "/v1/roblox/login/complete" && request.method === "POST") {
      await this.oauth.acknowledge(bearer);
      await this.scheduleAlarm();
      return json({ ok: true });
    }
    if (path === "/v1/roblox/account" && request.method === "GET")
      return json(await this.oauth.inspect(bearer));
    if (path === "/v1/roblox/account" && request.method === "DELETE") {
      const result = await this.oauth.disconnect(bearer);
      await this.scheduleAlarm();
      return json(result);
    }
    if (path.startsWith("/v1/vision-review")) {
      let identity = this.oauth.reviewAccountIdentity(bearer);
      const settings = visionSettings(this.env);
      if (path === "/v1/vision-review/config" && request.method === "GET")
        return json(
          settings
            ? {
                available: true,
                provider: "OpenAI",
                model: settings.model,
                maxCostMicros: settings.costMicros,
                maxOutputTokens: settings.outputTokens,
                ...this.vision.remaining(identity, settings),
              }
            : { available: false },
        );
      if (path === "/v1/vision-review/cancel" && request.method === "POST") {
        const body = await readJson(request, 128);
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).length !== 1 ||
          typeof body.id !== "string" ||
          !/^[a-f0-9-]{36}$/.test(body.id ?? "")
        )
          throw new PublicError("Invalid review request ID.", 400);
        identity = this.oauth.reviewAccountIdentity(bearer);
        const id = digest(identity.account + ":" + body.id);
        this.vision.cancel(id, identity);
        this.visionRequests.get(id)?.abort.abort();
        await this.scheduleAlarm();
        return json({ cancelled: true });
      }
      if (path !== "/v1/vision-review" || request.method !== "POST")
        throw new PublicError("Not found.", 404);
      if (!settings)
        throw new PublicError(
          "Optional AI review is disabled. Use local structure review.",
          503,
        );
      let body;
      try {
        body = validateVisionRequest(
          await readJson(request, VISION_LIMITS.requestBytes),
        );
      } catch (e) {
        if (e instanceof PublicError) throw e;
        throw new PublicError(
          "Review consent, screenshot or metadata is invalid.",
          400,
        );
      }
      // Body streaming can outlive account expiry, invitation revocation or
      // sign-out. Recheck before reserving cost or publishing provider work.
      identity = this.oauth.reviewAccountIdentity(bearer);
      if (request.signal.aborted)
        throw new PublicError(
          "AI review cancelled. Local review remains available.",
          408,
        );
      if (body.maxCostMicros < settings.costMicros)
        throw new PublicError(
          "Review exceeds your approved allowance. Nothing was sent to the provider.",
          403,
        );
      visionProviderBody(body, settings); // Reject input overflow before reservation or outbound work.
      const id = digest(identity.account + ":" + body.id);
      this.vision.reserve(id, identity, settings);
      const abort = new AbortController();
      this.visionRequests.set(id, { account: identity.account, abort });
      const signal = AbortSignal.any([
        abort.signal,
        request.signal,
        AbortSignal.timeout(VISION_LIMITS.timeoutMs),
      ]);
      try {
        await this.scheduleAlarm();
        signal.throwIfAborted();
        this.oauth.reviewAccountIdentity(bearer);
        const result = await requestVision(body, settings, signal);
        signal.throwIfAborted();
        this.oauth.reviewAccountIdentity(bearer); // Revocation wins over an awaited reply.
        this.vision.finish(id, "complete");
        return json({
          result,
          reservedCostMicros: settings.costMicros,
          ...this.vision.remaining(identity, settings),
        });
      } catch (e) {
        this.vision.finish(
          id,
          abort.signal.aborted || request.signal.aborted
            ? "cancelled"
            : "failed",
        );
        if (signal.aborted)
          throw new PublicError(
            "AI review cancelled or timed out. Local review remains available.",
            408,
          );
        throw e;
      } finally {
        this.visionRequests.delete(id);
        await this.scheduleAlarm();
      }
    }
    if (path.startsWith("/v1/review-sync")) {
      this.oauth.status(bearer); // Validate account/invitation before counting or touching storage.
      this.count("review:" + digest(bearer), 60, 3600000);
      if (path === "/v1/review-sync/connect" && request.method === "POST") {
        const body = await readJson(request, 1024);
        if (
          !body ||
          body.consent !== true ||
          !["personal", "group"].includes(body.scope) ||
          Object.keys(body).some(
            (k) => !["scope", "groupId", "consent"].includes(k),
          ) ||
          (body.scope === "personal" && body.groupId !== undefined) ||
          (body.scope === "group" && typeof body.groupId !== "string")
        )
          throw new PublicError(
            "Choose a scope and explicitly enable preference sync.",
            400,
          );
        const identity = await this.oauth.reviewIdentity(
          bearer,
          body.scope === "group" ? body.groupId : undefined,
        );
        const result = this.review.connect(identity);
        await this.scheduleAlarm();
        return json(result, 201);
      }
      const grantToken =
        request.headers.get("X-Framebridge-Review-Grant") ?? "";
      const grant = this.review.grant(grantToken, digest(bearer));
      if (path === "/v1/review-sync/grant" && request.method === "DELETE") {
        const result = this.review.revoke(grantToken, digest(bearer));
        await this.scheduleAlarm();
        return json(result);
      }
      const identity = await this.oauth.reviewIdentity(bearer, grant.group);
      if (path === "/v1/review-sync" && request.method === "GET")
        return json(this.review.read(grantToken, identity));
      if (
        path === "/v1/review-sync" &&
        ["POST", "DELETE"].includes(request.method)
      ) {
        const result = this.review.write(
          grantToken,
          identity,
          await readJson(request, 34000),
          request.method === "DELETE",
        );
        await this.scheduleAlarm();
        return json(result, "conflict" in result ? 409 : 200);
      }
      throw new PublicError("Not found.", 404);
    }
    if (path.startsWith("/v1/artwork")) {
      this.oauth.status(bearer);
      this.count(
        "artwork:" + digest(bearer),
        ARTWORK_LIMITS.requestsHour,
        3600000,
      );
      const grantToken =
        request.headers.get("X-Framebridge-Artwork-Grant") ?? "";
      if (path === "/v1/artwork/grant" && request.method === "DELETE") {
        const result = this.artwork.revoke(grantToken, digest(bearer));
        await this.scheduleAlarm();
        return json(result);
      }
      if (this.env.ARTWORK_ENABLED !== "1" || !this.env.ARTWORK_BUCKET)
        throw new PublicError(
          "Private cloud artwork is disabled. Local saved images and file import remain available.",
          503,
        );
      if (path === "/v1/artwork/connect" && request.method === "POST") {
        const body = await readJson(request, 1024);
        if (
          !body ||
          body.consent !== true ||
          !["personal", "group"].includes(body.scope) ||
          Object.keys(body).some(
            (k) => !["scope", "groupId", "consent"].includes(k),
          ) ||
          (body.scope === "personal" && body.groupId !== undefined) ||
          (body.scope === "group" && typeof body.groupId !== "string")
        )
          throw new PublicError(
            "Choose a scope and explicitly consent to private PNG storage.",
            400,
          );
        const guard = () =>
          this.oauth.artworkIdentity(
            bearer,
            body.scope === "group" ? body.groupId : undefined,
          );
        try {
          return json(
            await this.artwork.connect(await guard(), guard, grantToken),
            201,
          );
        } finally {
          await this.scheduleAlarm();
        }
      }
      const access = this.artwork.grant(grantToken, digest(bearer)),
        guard = () => this.oauth.artworkIdentity(bearer, access.group);
      if (path === "/v1/artwork" && request.method === "GET")
        return json(this.artwork.read(grantToken, await guard()));
      if (path === "/v1/artwork/images" && request.method === "POST") {
        const body = await readJson(request, 710000),
          identity = await guard();
        try {
          const result = await this.artwork.upload(
            grantToken,
            identity,
            body,
            guard,
            (scope) => {
              this.daily(
                "artwork:uploads:global",
                ARTWORK_LIMITS.uploadGlobalDay,
              );
              this.daily(
                "artwork:uploads:account:" + digest(bearer),
                ARTWORK_LIMITS.uploadAccountDay,
              );
              this.daily(
                "artwork:uploads:scope:" + scope,
                ARTWORK_LIMITS.uploadScopeDay,
              );
            },
            () => this.scheduleAlarm(),
          );
          result.snapshot = this.artwork.read(grantToken, await guard());
          return json(result, 201);
        } finally {
          await this.scheduleAlarm();
        }
      }
      if (path.startsWith("/v1/artwork/images/") && request.method === "GET") {
        this.daily(
          "artwork:downloads:" + digest(bearer),
          ARTWORK_LIMITS.downloadAccountDay,
        );
        const bytes = await this.artwork.download(
          grantToken,
          await guard(),
          path.slice("/v1/artwork/images/".length),
          guard,
        );
        return new Response(new Uint8Array(bytes).buffer, {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      }
      if (path === "/v1/artwork/edit" && request.method === "POST") {
        const body = await readJson(request, 2048),
          identity = await guard();
        const result = this.artwork.mutate(grantToken, identity, body);
        try {
          if (!("conflict" in result)) {
            await this.artwork.cleanup(access.library);
            if ("snapshot" in result)
              result.snapshot = this.artwork.read(grantToken, await guard());
            if ("deleted" in result)
              result.pendingCleanup = this.artwork.remaining(access.library);
          }
          return json(result, "conflict" in result ? 409 : 200);
        } finally {
          await this.scheduleAlarm();
        }
      }
      if (path === "/v1/artwork/cleanup" && request.method === "POST") {
        const body = await readJson(request, 1024);
        if (!body || Object.keys(body).length)
          throw new PublicError("Invalid artwork cleanup request.", 400);
        await guard();
        this.daily("artwork:cleanup:" + digest(bearer), 10);
        await this.artwork.cleanup(access.library);
        await this.scheduleAlarm();
        return json({ snapshot: this.artwork.read(grantToken, await guard()) });
      }
      throw new PublicError("Not found.", 404);
    }
    if (path === "/v1/handoffs/open" && request.method === "POST") {
      const body = await readJson(request, 2048),
        invite = request.headers.get("X-Framebridge-Invite-Id") ?? "";
      return json(this.handoffs.open(invite, body));
    }
    if (path === "/v1/handoff" && request.method === "GET")
      return json(this.handoffs.owner(bearer).summary);
    if (path === "/v1/handoff" && request.method === "DELETE") {
      const result = this.handoffs.revoke(bearer);
      await this.scheduleAlarm();
      return json(result);
    }
    if (path === "/v1/handoff-receipt" && request.method === "POST")
      return json(this.handoffs.receipt(bearer, await readJson(request, 4096)));
    let { session, sender } = this.session(request);
    if (
      path === "/v1/handoffs" &&
      request.method === "POST" &&
      (sender || session.uploadOnly)
    ) {
      const body = await readJson(request, 8_001_024);
      ({ session, sender } = this.session(request));
      if (!sender && !session.uploadOnly)
        throw new PublicError("This connection cannot export a design.", 403);
      const result = this.handoffs.create(session.invite, body);
      await this.scheduleAlarm();
      return json(result, 201);
    }
    if (
      path === "/v1/session" &&
      request.method === "GET" &&
      !session.uploadOnly
    )
      return json({
        role: sender ? "sender" : "receiver",
        paired: !!session.sender,
        expiresAt: session.expires,
        ...(sender
          ? {}
          : {
              code:
                !session.sender && session.pairExpires > Date.now()
                  ? session.code
                  : undefined,
              importedRevision:
                session.receipt?.status === "imported"
                  ? session.receipt.revision
                  : 0,
            }),
      });
    if (path === "/v1/session" && request.method === "DELETE") {
      this.ctx.storage.transactionSync(() => this.remove(session.id));
      return json({ ok: true });
    }
    if (
      path === "/v1/inbox" &&
      request.method === "GET" &&
      !sender &&
      !session.uploadOnly
    ) {
      const wait = waitMilliseconds(url);
      if (
        session.revision <= Number(url.searchParams.get("after") ?? -1) &&
        String(!!session.sender) === url.searchParams.get("paired")
      ) {
        await this.waiters.wait(
          `${session.id}:inbox`,
          Math.min(wait, session.expires - Date.now()),
          request.signal,
        );
        ({ session, sender } = this.session(request));
      }
      const changed =
        session.revision > Number(url.searchParams.get("after") ?? -1);
      const raw =
        changed && session.packageHash
          ? this.rows(
              "SELECT data FROM chunks WHERE session=? ORDER BY part",
              session.id,
            )
              .map((r) => r.data)
              .join("")
          : "";
      return json({
        paired: !!session.sender,
        revision: session.revision,
        pollAfterMs: session.sender ? 5000 : 2000,
        ...(wait ? { longPoll: true } : {}),
        ...(raw ? { package: JSON.parse(raw) } : {}),
      });
    }
    if (path === "/v1/package" && request.method === "POST" && sender) {
      const pkg = (await readJson(request, 8_000_000)) as TransferPackage;
      validatePackage(pkg);
      // Recheck capabilities after the streamed body; a disconnect/revocation can happen during I/O.
      ({ session, sender } = this.session(request));
      const hash = digest(JSON.stringify({ ...pkg, createdAt: "" }));
      if (session.packageHash === hash)
        return json({ revision: session.revision, unchanged: true });
      this.daily("transfers", limit(this.env.DAILY_TRANSFERS, 1000));
      this.daily(`transfers:${session.invite}`, 200);
      const raw = JSON.stringify(pkg);
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "DELETE FROM chunks WHERE session=?",
          session.id,
        );
        for (const [part, chunk] of textChunks(raw).entries())
          this.ctx.storage.sql.exec(
            "INSERT INTO chunks VALUES (?,?,?)",
            session.id,
            part,
            chunk,
          );
        session.packageHash = hash;
        session.revision++;
        delete session.receipt;
        this.save(session);
      });
      this.waiters.notify(session.id);
      return json({ revision: session.revision });
    }
    if (path === "/v1/receipt" && !session.uploadOnly) {
      if (request.method === "GET" && sender) {
        const revision = Number(url.searchParams.get("revision"));
        if (
          !Number.isSafeInteger(revision) ||
          revision < 1 ||
          revision > session.revision
        )
          throw new PublicError("Invalid transfer revision.");
        if (revision === session.revision && !session.receipt) {
          await this.waiters.wait(
            `${session.id}:receipt`,
            Math.min(waitMilliseconds(url), session.expires - Date.now()),
            request.signal,
          );
          ({ session, sender } = this.session(request));
        }
        return json(
          revision < session.revision
            ? { revision, status: "superseded" }
            : {
                ...(session.receipt ?? { revision, status: "pending" }),
                ...(waitMilliseconds(url) ? { longPoll: true } : {}),
              },
        );
      }
      if (request.method === "POST" && !sender) {
        const receipt = await readJson(request, 4096);
        ({ session } = this.session(request));
        if (receipt?.revision !== session.revision || !session.packageHash)
          throw new PublicError(
            "This transfer was replaced by a newer export.",
            409,
          );
        if (
          !["imported", "ready", "queued", "failed"].includes(
            receipt?.status,
          ) ||
          (receipt.message !== undefined && typeof receipt.message !== "string")
        )
          throw new PublicError("Invalid Studio receipt.");
        session.receipt = {
          revision: receipt.revision,
          status: receipt.status,
          ...(receipt.message
            ? { message: receipt.message.slice(0, 500) }
            : {}),
        };
        this.save(session);
        this.waiters.notify(session.id);
        return json({ ok: true });
      }
    }
    if (sender || session.uploadOnly) {
      if (path === "/v1/assets" && request.method === "POST") {
        const input = (await readJson(request, 28_001_024)) as Upload;
        const bytes = validateUpload(input);
        ({ session } = this.session(request));
        const { credential, identity } = await this.uploadCredential(
          request,
          session,
          input.owner,
        );
        ({ session } = this.session(request));
        const hash = uploadKey(input, bytes, identity);
        const existing = this.rows(
          "SELECT data FROM jobs WHERE session=? AND hash=?",
          session.id,
          hash,
        )[0];
        let retry: Job | undefined;
        if (existing) {
          const job: Job = JSON.parse(String(existing.data));
          if (
            !job.operation &&
            job.state === "uploading" &&
            Date.now() - job.created > 60_000
          ) {
            job.state = "failed";
            job.error =
              "Upload response was lost. Check Creator Dashboard; no duplicate will be created automatically.";
            this.saveJob(session.id, hash, job);
          }
          if (
            job.state === "failed" &&
            job.operation &&
            job.result === undefined &&
            legacyUploadRejection(job.error)
          ) {
            const active = this.rows(
              "SELECT id FROM jobs WHERE session=? AND state='uploading' AND created>? LIMIT 2",
              session.id,
              Date.now() - 600_000,
            ).length;
            if (active >= IMAGE_BATCH_LIMITS.concurrency)
              throw new PublicError(
                "Wait for the current images to finish checking.",
                429,
              );
            // Recheck the existing operation only. Never recreate an image that
            // Roblox already accepted, and don't charge another create quota.
            job.state = "uploading";
            job.created = Date.now();
            job.checked = 0;
            delete job.error;
            delete job.providerStatus;
            this.saveJob(session.id, hash, job);
            return json(this.publicJob(job), 202);
          }
          if (retryableUploadFailure(job) && Date.now() - job.created >= 10_000)
            retry = job;
          else return json(this.publicJob(job, true), 202);
        }
        const total = Number(
          this.rows(
            "SELECT total FROM job_usage WHERE session=?",
            session.id,
          )[0]?.total ?? 0,
        );
        const active = this.rows(
          "SELECT id FROM jobs WHERE session=? AND state='uploading' AND created>? LIMIT 2",
          session.id,
          Date.now() - 600_000,
        ).length;
        if (
          (!retry && total >= IMAGE_BATCH_LIMITS.unique) ||
          active >= IMAGE_BATCH_LIMITS.concurrency
        )
          throw new PublicError(
            "Wait for current uploads or start a new session after reaching 1,000 unique uploads. Completed links are retained.",
            429,
          );
        const job: Job = {
          id: retry?.id ?? randomUUID(),
          state: "uploading",
          keyHash: digest(identity),
          created: Date.now(),
          checked: 0,
        };
        // Both daily counters and the slot are reserved atomically. Exhausting
        // a client's quota must not consume another user's global allowance.
        this.ctx.storage.transactionSync(() => {
          this.daily("uploads", limit(this.env.DAILY_UPLOADS, 200));
          this.daily(
            `uploads:${session.invite}`,
            limit(
              this.env.DAILY_UPLOADS_PER_CLIENT ??
                this.env.DAILY_UPLOADS_PER_TESTER,
              40,
            ),
          );
          this.saveJob(session.id, hash, job, !retry);
        });
        try {
          job.operation = await createImageOperation(input, bytes, credential);
        } catch (error) {
          if (
            error instanceof PublicError &&
            error.status === 401 &&
            typeof credential !== "string"
          )
            this.oauth.invalidate(
              request.headers.get("X-Framebridge-Roblox-Account") ?? "",
              credential.oauthToken,
            );
          job.state = "failed";
          job.errorStage = "create";
          job.providerStatus =
            error instanceof PublicError ? error.providerStatus : undefined;
          job.retryable = error instanceof PublicError && error.rejectedCreate;
          job.error =
            error instanceof PublicError
              ? error.message
              : "Upload response was lost. Check Creator Dashboard before retrying.";
        }
        // A disconnected session must not be recreated by an in-flight upload.
        if (this.rows("SELECT id FROM sessions WHERE id=?", session.id).length)
          this.saveJob(session.id, hash, job);
        return json(this.publicJob(job), 202);
      }
      if (path.startsWith("/v1/assets/") && request.method === "GET") {
        const id = path.slice("/v1/assets/".length);
        let job = this.job(session.id, id);
        if (!job) throw new PublicError("Upload not found.", 404);
        const cachedFailure = job.state === "failed";
        const { credential, identity } = await this.uploadCredential(
          request,
          session,
        );
        ({ session } = this.session(request));
        if (digest(identity) !== job.keyHash)
          throw new PublicError(
            "Use the same Roblox sign-in or Open Cloud key that started this upload.",
            403,
          );
        if (
          job.state === "uploading" &&
          job.operation &&
          Date.now() - job.checked >= 1000
        ) {
          job.checked = Date.now();
          const hash = String(
            this.rows(
              "SELECT hash FROM jobs WHERE session=? AND id=?",
              session.id,
              id,
            )[0].hash,
          );
          this.saveJob(session.id, hash, job);
          try {
            const result = await readImageOperation(job.operation, credential);
            if (result) {
              job.result = result;
              job.state = "done";
            }
          } catch (error) {
            if (
              error instanceof PublicError &&
              error.status === 401 &&
              typeof credential !== "string"
            )
              this.oauth.invalidate(
                request.headers.get("X-Framebridge-Roblox-Account") ?? "",
                credential.oauthToken,
              );
            job.state = "failed";
            job.errorStage = "check";
            job.providerStatus =
              error instanceof PublicError ? error.providerStatus : undefined;
            job.error =
              error instanceof PublicError
                ? error.message
                : "Could not check this upload. Check Creator Dashboard.";
          }
          const current = this.job(session.id, id);
          if (current && current.state !== "uploading") job = current;
          else if (current) this.saveJob(session.id, hash, job);
        }
        return json(this.publicJob(job, cachedFailure));
      }
    }
    throw new PublicError("Endpoint not found.", 404);
  }
  private apiKey(request: Request) {
    const key = request.headers.get("X-Roblox-Api-Key") ?? "";
    if (key.length < 10 || key.length > 4096)
      throw new PublicError("Enter your Roblox Open Cloud API key.");
    return key;
  }
  private async uploadCredential(
    request: Request,
    session: Session,
    owner?: Owner,
  ): Promise<{ credential: RobloxCredential; identity: string }> {
    const account = request.headers.get("X-Framebridge-Roblox-Account");
    if (account) {
      if (request.headers.has("X-Roblox-Api-Key"))
        throw new PublicError(
          "Choose Roblox sign-in or API-key uploads, rather than both.",
        );
      // Public pairing may connect Figma and Studio on different networks.
      // The explicit account capability and approved owner still authorize uploads.
      const identity = publicAccess(this.env)
        ? this.oauth.accountScope(account)
        : session.invite;
      const auth = await this.oauth.credential(account, identity, owner);
      return {
        credential: { oauthToken: auth.token },
        identity: auth.identity,
      };
    }
    const key = this.apiKey(request);
    return { credential: key, identity: key };
  }
  async alarm() {
    this.prune();
    await this.artwork.cleanup();
    await this.scheduleAlarm();
  }
  private async scheduleAlarm() {
    // Workerd limits compound SELECT terms. Separate per-table minima also avoid
    // scanning every live row just to schedule the next retention cleanup.
    const expiries = [
      "sessions",
      "handoffs",
      "handoff_retired",
      "oauth_logins",
      "oauth_accounts",
      "feedback",
      "feedback_retired",
      "review_profiles",
      "review_grants",
      "vision_attempts",
      "vision_budget",
      "vision_cancellations",
    ]
      .map(
        (table) =>
          this.rows(`SELECT MIN(expires) AS next FROM ${table}`)[0]?.next,
      )
      .filter((value) => value !== null && value !== undefined)
      .map(Number);
    const artwork = this.artwork.nextCleanup();
    if (artwork !== undefined) expiries.push(artwork);
    const row = { next: expiries.length ? Math.min(...expiries) : null };
    if (row.next) await this.ctx.storage.setAlarm(Number(row.next));
    else await this.ctx.storage.deleteAlarm();
  }
}
