import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { PublicError, type Owner } from "./roblox";
import { readProviderRefreshDiagnostics } from "../../core/src/provider-refresh";
import { RobloxGroupNames } from "./roblox-group-names";

const API = "https://apis.roblox.com/oauth/v1/";
import { ROBLOX_OAUTH_SCOPES } from "./oauth-protocol";
export { ROBLOX_OAUTH_SCOPES } from "./oauth-protocol";
const DAY = 86_400_000;
const PROVIDER_TIMEOUT = 15_000;
const PROVIDER_RETRIES = 3;
class OAuthHostingBlocked extends PublicError {
  constructor() {
    super(
      "Roblox is currently blocking requests from Framebridge's hosting network (Cloudflare error 1015). Sign-in cannot finish until that block clears. Please try again later.",
      503,
      false,
      429,
    );
  }
}
async function hostingBlocked(response: Response) {
  if (
    response.headers.get("Server")?.toLowerCase() !== "cloudflare" ||
    !response.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("text/plain")
  )
    return false;
  const reader = response.body?.getReader();
  if (!reader) return false;
  try {
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const next = await reader.read();
      if (next.done) {
        text += decoder.decode();
        return text.trim() === "error code: 1015";
      }
      bytes += next.value.byteLength;
      if (bytes > 128) return false;
      text += decoder.decode(next.value, { stream: true });
    }
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function retryAfter(headers: Headers, now: number) {
  const value = headers.get("Retry-After")?.trim();
  if (value) {
    const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
            value,
          )
        ? Date.parse(value) - now
        : NaN;
    if (Number.isFinite(milliseconds) && milliseconds >= 0)
      return Math.max(250, Math.ceil(milliseconds));
  }
  return undefined;
}
function waitForProvider(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const numeric = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
const opaque = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 10 &&
  value.length <= 16384 &&
  !/[\r\n]/.test(value);
export type OAuthConfig = {
  clientId?: string;
  clientSecret?: string;
  /** Keep the former app's credentials while its saved grants expire or reconnect. */
  legacyClientId?: string;
  legacyClientSecret?: string;
  redirectUri?: string;
  sealingKey?: string;
};
export type OAuthLogin = {
  id: string;
  state: string;
  invite: string;
  expires: number;
  status: "pending" | "exchanging" | "ready" | "failed";
  sealed?: string;
  error?: string;
  account?: string;
  previous?: string;
};
export type OAuthOwner = Owner & { label: string };
export type OAuthProfile = {
  userId: string;
  username: string;
  displayName: string;
  owners: OAuthOwner[];
};
export type OAuthAccount = OAuthProfile & {
  id: string;
  invite: string;
  expires: number;
  accessExpires: number;
  /** Absent on legacy JSON records; initialized only by login or successful refresh. */
  providerRefreshCount?: number;
  providerRefreshedAt?: number | null;
  state: "active" | "refreshing" | "reauthorize";
  sealed: string;
  pendingLogin?: string;
  ownerNamesCheckedAt?: number;
};
export type OAuthStore = {
  login(id: string): OAuthLogin | undefined;
  loginState(state: string): OAuthLogin | undefined;
  saveLogin(value: OAuthLogin): void;
  removeLogin(id: string): void;
  account(id: string): OAuthAccount | undefined;
  saveAccount(value: OAuthAccount): void;
  removeAccount(id: string): void;
  count(invite: string, kind: "login" | "account"): number;
  prune(now: number, active: (invite: string) => boolean): void;
  nextExpiry(): number | undefined;
};
type Tokens = {
  access: string;
  refresh: string;
  accessExpires: number;
  clientId?: string;
};
type Pending = { verifier: string; clientId?: string; accountToken?: string };

/** Resources are permission grants, not a membership list. Unknown shapes grant no creator. */
export function grantedCreators(
  value: unknown,
  userId: string,
  username: string,
): OAuthOwner[] {
  const info = value as {
    resource_infos?: {
      owner?: { id?: unknown; type?: unknown };
      resources?: { creator?: { ids?: unknown } };
    }[];
  };
  if (!Array.isArray(info?.resource_infos) || info.resource_infos.length > 200)
    return [];
  const owners = new Map<string, OAuthOwner>();
  const add = (kind: Owner["kind"], id: string) =>
    owners.set(kind + ":" + id, {
      kind,
      id,
      label: kind === "user" ? username : "Group " + id,
    });
  for (const row of info.resource_infos) {
    const ids = row?.resources?.creator?.ids;
    if (!Array.isArray(ids) || ids.length > 200 || !numeric(row.owner?.id))
      continue;
    if (row.owner?.type === "User" && row.owner.id === userId) {
      for (const id of ids) {
        if (id === "U" || id === userId) add("user", userId);
        // Roblox returns approved groups as G-prefixed creator IDs beneath
        // the authenticated user's resource owner, not as memberships.
        else if (typeof id === "string" && /^G[1-9]\d{0,19}$/.test(id))
          add("group", id.slice(1));
      }
    } else if (
      row.owner?.type === "Group" &&
      (ids.includes("U") || ids.includes(row.owner.id))
    )
      add("group", row.owner.id);
  }
  return [...owners.values()].slice(0, 200);
}

export class RobloxOAuth {
  private refreshing = new Map<string, Promise<OAuthAccount>>();
  private providerBlockedUntil = 0;
  private request: typeof fetch;
  private now: () => number;
  private groupNames: RobloxGroupNames;
  constructor(
    private store: OAuthStore,
    private configSource: OAuthConfig | (() => OAuthConfig),
    private deps: {
      active: (invite: string) => boolean;
      count: (scope: string, maximum: number, window: number) => void;
      request?: typeof fetch;
      now?: () => number;
      sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
      maxAccounts?: number;
      maxLogins?: number;
      maxAccountsPerIdentity?: number;
      /** Synchronous local cleanup after forgetting an account, before provider I/O. */
      accountRemoved?: (accountId: string) => void;
    },
  ) {
    this.request = deps.request ?? ((input, init) => fetch(input, init));
    this.now = deps.now ?? Date.now;
    this.groupNames = new RobloxGroupNames(this.request, this.now);
  }
  private get config() {
    return typeof this.configSource === "function"
      ? this.configSource()
      : this.configSource;
  }
  available() {
    try {
      const url = new URL(this.config.redirectUri ?? "");
      return (
        /^\d{1,40}$/.test(this.config.clientId ?? "") &&
        opaque(this.config.clientSecret) &&
        /^[a-f0-9]{64}$/i.test(this.config.sealingKey ?? "") &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && url.hostname === "localhost")) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/oauth/roblox/callback"
      );
    } catch {
      return false;
    }
  }
  private configured() {
    if (!this.available())
      throw new PublicError(
        "Roblox sign-in is not configured yet. Use an Open Cloud API key meanwhile.",
        503,
      );
  }
  /** Public routing metadata only; provider credentials remain in this service. */
  publicConfig() {
    const available = this.available();
    return {
      available,
      ...(available
        ? { callbackOrigin: new URL(this.config.redirectUri!).origin }
        : {}),
    };
  }
  private seal(kind: string, id: string, invite: string, value: unknown) {
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(this.config.sealingKey!, "hex"),
        iv,
      );
    cipher.setAAD(Buffer.from(kind + ":" + id + ":" + invite));
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  private open<T>(kind: string, id: string, invite: string, sealed: string): T {
    try {
      const data = Buffer.from(sealed, "base64"),
        decipher = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(this.config.sealingKey!, "hex"),
          data.subarray(0, 12),
        );
      decipher.setAAD(Buffer.from(kind + ":" + id + ":" + invite));
      decipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      );
    } catch {
      throw new PublicError(
        "This Roblox connection could not be restored. Sign in again.",
        401,
      );
    }
  }
  private async json(
    path: string,
    parameters?: Record<string, string>,
    access?: string,
    clientId = this.config.clientId,
  ) {
    if (this.now() < this.providerBlockedUntil) throw new OAuthHostingBlocked();
    // Bind provider requests to the issuing app. Never try another client's
    // secret after an OAuth failure: rotating refresh tokens are single use.
    const client = parameters ? this.client(clientId) : undefined;
    // A 429 explicitly rejects the request. Retry only that response, never a
    // timeout, redirect or 5xx: an ambiguous token exchange may have consumed
    // its one-use authorization code/refresh token already.
    const signal = AbortSignal.timeout(PROVIDER_TIMEOUT);
    const deadline = this.now() + PROVIDER_TIMEOUT;
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.request(API + path, {
          method: parameters ? "POST" : "GET",
          headers: parameters
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : { Authorization: "Bearer " + access },
          ...(parameters
            ? {
                body: new URLSearchParams({
                  ...parameters,
                  client_id: client!.id,
                  client_secret: client!.secret,
                }),
              }
            : {}),
          redirect: "manual",
          signal,
        });
      } catch {
        throw new PublicError(
          "Roblox did not finish the sign-in request. Try signing in again.",
          502,
        );
      }
      if (response.status !== 429 || path === "token/revoke") break;
      const cooldown = retryAfter(response.headers, this.now());
      if (await hostingBlocked(response)) {
        // This is an edge-network block, not the Roblox API's ordinary quota.
        // A zero/one-second Retry-After on these responses is misleading. Pause
        // this service instance, without trying another address or credential.
        this.providerBlockedUntil =
          this.now() + Math.max(15 * 60_000, cooldown ?? 0);
        throw new OAuthHostingBlocked();
      }
      const delay = cooldown ?? 1000 * 2 ** attempt;
      await response.body?.cancel();
      const stage =
        path === "userinfo"
          ? "profile lookup"
          : path === "token/resources"
            ? "creator permissions"
            : "token exchange";
      const limited = () =>
        new PublicError(
          `Roblox is temporarily limiting sign-in requests (${stage}). ${
            cooldown !== undefined && delay <= DAY
              ? `Wait ${Math.ceil(delay / 1000)} ${delay <= 1000 ? "second" : "seconds"}, then sign in again.`
              : "Wait a minute, then sign in again."
          }`,
          429,
          false,
          429,
        );
      // Do not retry sooner than Roblox asks, or hold the callback beyond its
      // bounded request budget. The same signal covers all attempts and waits.
      if (
        attempt >= PROVIDER_RETRIES ||
        delay > 10_000 ||
        this.now() + delay >= deadline ||
        signal.aborted
      )
        throw limited();
      try {
        await (this.deps.sleep ?? waitForProvider)(delay, signal);
      } catch {
        throw limited();
      }
      if (signal.aborted || this.now() >= deadline) throw limited();
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PublicError(
        response.status === 429
          ? "Roblox sign-in is busy. Try again shortly."
          : "Roblox authorization ended or was declined. Sign in again.",
        response.status === 429 ? 429 : 401,
      );
    }
    // Revocation is successful even when Roblox returns an empty body.
    if (path === "token/revoke") {
      await response.body?.cancel();
      return {};
    }
    let text = "";
    try {
      const reader = response.body?.getReader(),
        decoder = new TextDecoder();
      let bytes = 0;
      if (reader)
        while (true) {
          const next = await reader.read();
          if (next.done) {
            text += decoder.decode();
            break;
          }
          bytes += next.value.byteLength;
          if (bytes > 131072) {
            await reader.cancel();
            throw new Error("Response limit");
          }
          text += decoder.decode(next.value, { stream: true });
        }
    } catch {
      throw new PublicError(
        "Roblox returned an unexpected authorization response.",
        502,
      );
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PublicError(
        "Roblox returned an unexpected authorization response.",
        502,
      );
    }
  }
  private storedClientId(clientId?: string) {
    // Records created before issuer tracking belong to the explicitly retained
    // former app, or to the current app on deployments without a migration.
    return clientId ?? this.config.legacyClientId ?? this.config.clientId;
  }
  private client(id?: string) {
    const clientSecret =
      id === this.config.clientId
        ? this.config.clientSecret
        : id === this.config.legacyClientId
          ? this.config.legacyClientSecret
          : undefined;
    if (!/^\d{1,40}$/.test(id ?? "") || !opaque(clientSecret))
      throw new PublicError(
        "This Roblox sign-in app is no longer configured. Sign in again.",
        401,
      );
    return { id: id!, secret: clientSecret };
  }
  private tokens(value: Record<string, unknown>, clientId: string): Tokens {
    const scopes = new Set(
      typeof value.scope === "string" ? value.scope.split(" ") : [],
    );
    // Roblox coalesces an asset read/write grant into "asset:read,write".
    // Expand only these exact asset actions; other namespaces stay literal.
    for (const scope of scopes) {
      if (/^asset:(read|write)(,(read|write))?$/.test(scope))
        for (const action of scope.slice("asset:".length).split(","))
          scopes.add("asset:" + action);
    }
    if (
      !opaque(value.access_token) ||
      !opaque(value.refresh_token) ||
      typeof value.token_type !== "string" ||
      value.token_type.toLowerCase() !== "bearer" ||
      typeof value.expires_in !== "number" ||
      !Number.isFinite(value.expires_in) ||
      value.expires_in <= 0 ||
      value.expires_in > 86400 ||
      typeof value.scope !== "string" ||
      !ROBLOX_OAUTH_SCOPES.every((scope) => scopes.has(scope))
    )
      throw new PublicError(
        "Roblox did not grant the identity and image-upload permissions required. Sign in and approve those permissions.",
        401,
      );
    return {
      access: value.access_token,
      refresh: value.refresh_token,
      accessExpires: this.now() + value.expires_in * 1000,
      clientId,
    };
  }
  private async profile(tokens: Tokens): Promise<OAuthProfile> {
    const [profile, resources] = await Promise.all([
      this.json("userinfo", undefined, tokens.access),
      this.json(
        "token/resources",
        { token: tokens.access },
        undefined,
        this.storedClientId(tokens.clientId),
      ),
    ]);
    if (!numeric(profile.sub))
      throw new PublicError(
        "Roblox did not return a valid account identity.",
        502,
      );
    const clean = (value: unknown, fallback: string) =>
      typeof value === "string" && value.trim() && value.length <= 100
        ? value
        : fallback;
    const username = clean(profile.preferred_username, "User " + profile.sub);
    const owners = grantedCreators(resources, profile.sub, username);
    if (!owners.length)
      throw new PublicError(
        "No image creator was authorized. Sign in again and select your personal account or a group for image uploads.",
        401,
      );
    return {
      userId: profile.sub,
      username,
      displayName: clean(profile.name, username),
      owners: await this.groupNames.resolve(owners),
    };
  }
  async begin(invite: string, previousToken?: string) {
    this.configured();
    this.prune();
    if (!this.deps.active(invite))
      throw new PublicError("Private beta access required.", 403);
    const previous = previousToken
      ? this.account(previousToken, invite, false).id
      : undefined;
    this.deps.count("oauth-start:" + invite, 15, DAY);
    if (
      this.store.count(invite, "login") >= 2 ||
      this.store.count(invite, "account") >=
        (this.deps.maxAccountsPerIdentity ?? 2) ||
      this.store.count("*", "account") >= (this.deps.maxAccounts ?? 20) ||
      this.store.count("*", "login") >= (this.deps.maxLogins ?? 40)
    )
      throw new PublicError(
        "Disconnect an existing Roblox connection before signing in again.",
        429,
      );
    const token = secret(),
      state = secret(),
      verifier = randomBytes(32).toString("base64url");
    const login: OAuthLogin = {
      id: hash(token),
      state: hash(state),
      invite,
      expires: this.now() + 600000,
      status: "pending",
      ...(previous ? { previous } : {}),
    };
    login.sealed = this.seal("login", login.id, invite, {
      verifier,
      clientId: this.config.clientId,
    });
    this.store.saveLogin(login);
    const url = new URL(API + "authorize");
    for (const [key, value] of Object.entries({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      scope: ROBLOX_OAUTH_SCOPES.join(" "),
      response_type: "code",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }))
      url.searchParams.set(key, value);
    return {
      loginToken: token,
      authorizationUrl: url.href,
      expiresAt: login.expires,
    };
  }
  private login(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError(
        "That Roblox sign-in attempt ended. Start again.",
        401,
      );
    const login = this.store.login(hash(token));
    if (
      !login ||
      login.expires <= this.now() ||
      !this.deps.active(login.invite)
    )
      throw new PublicError(
        "That Roblox sign-in attempt ended. Start again.",
        401,
      );
    return login;
  }
  poll(token: string) {
    this.configured();
    const login = this.login(token);
    if (login.status === "failed")
      return { status: "failed", error: login.error };
    if (login.status !== "ready")
      return { status: "pending", expiresAt: login.expires, pollAfterMs: 2000 };
    const pending = this.open<Pending>(
      "login",
      login.id,
      login.invite,
      login.sealed!,
    );
    if (!pending.accountToken || !this.store.account(login.account!))
      throw new PublicError("That Roblox connection ended. Start again.", 401);
    return {
      status: "ready",
      accountToken: pending.accountToken,
      account: this.status(pending.accountToken),
    };
  }
  async cancel(token: string) {
    const login = this.login(token);
    this.store.removeLogin(login.id);
    const account = login.account && this.store.account(login.account);
    if (account && account.pendingLogin === login.id)
      await this.removeAccount(account);
  }
  async acknowledge(token: string) {
    const login = this.login(token);
    if (login.status !== "ready")
      throw new PublicError("Finish Roblox authorization first.", 409);
    const account = this.store.account(login.account!);
    if (!account)
      throw new PublicError("That Roblox connection ended. Start again.", 401);
    this.store.saveAccount({ ...account, pendingLogin: undefined });
    this.store.removeLogin(login.id);
    const previous = login.previous && this.store.account(login.previous);
    if (previous && previous.invite === login.invite)
      await this.removeAccount(previous);
  }
  async callback(url: URL) {
    this.configured();
    if (
      url.origin + url.pathname !== this.config.redirectUri ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get("state") ?? "")
    )
      throw new PublicError("Invalid Roblox authorization callback.", 400);
    const login = this.store.loginState(hash(url.searchParams.get("state")!));
    if (
      !login ||
      login.status !== "pending" ||
      login.expires <= this.now() ||
      !this.deps.active(login.invite)
    )
      throw new PublicError(
        "This Roblox sign-in attempt ended. Return to Framebridge and start again.",
        401,
      );
    if (url.searchParams.has("error")) {
      this.store.saveLogin({
        ...login,
        status: "failed",
        error:
          "Roblox authorization was declined. You can try again or use an API key.",
      });
      return false;
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096 || /[\r\n]/.test(code))
      throw new PublicError("Missing Roblox authorization code.");
    const pending = this.open<Pending>(
      "login",
      login.id,
      login.invite,
      login.sealed!,
    );
    this.store.saveLogin({ ...login, status: "exchanging" });
    let tokens: Tokens | undefined;
    try {
      const clientId = this.client(this.storedClientId(pending.clientId)).id;
      const response = await this.json(
        "token",
        {
          grant_type: "authorization_code",
          code,
          code_verifier: pending.verifier,
          redirect_uri: this.config.redirectUri!,
        },
        undefined,
        clientId,
      );
      try {
        tokens = this.tokens(response, clientId);
      } catch (error) {
        if (opaque(response.refresh_token))
          await this.revoke(response.refresh_token, clientId);
        throw error;
      }
      const profile = await this.profile(tokens);
      if (
        !this.store.login(login.id) ||
        !this.deps.active(login.invite) ||
        login.expires <= this.now()
      ) {
        await this.revoke(tokens.refresh, tokens.clientId);
        return false;
      }
      if (
        this.store.count(login.invite, "account") >=
          (this.deps.maxAccountsPerIdentity ?? 2) ||
        this.store.count("*", "account") >= (this.deps.maxAccounts ?? 20)
      )
        throw new PublicError(
          "Disconnect an existing Roblox connection before signing in again.",
          429,
        );
      const accountToken = secret(),
        id = hash(accountToken);
      this.store.saveAccount({
        ...profile,
        id,
        invite: login.invite,
        expires: this.now() + 90 * DAY,
        accessExpires: tokens.accessExpires,
        providerRefreshCount: 0,
        providerRefreshedAt: null,
        state: "active",
        pendingLogin: login.id,
        ownerNamesCheckedAt: this.now(),
        sealed: this.seal("account", id, login.invite, tokens),
      });
      this.store.saveLogin({
        ...login,
        account: id,
        status: "ready",
        sealed: this.seal("login", login.id, login.invite, { accountToken }),
      });
      return true;
    } catch (error) {
      if (tokens) await this.revoke(tokens.refresh, tokens.clientId);
      if (this.store.login(login.id))
        this.store.saveLogin({
          ...login,
          status: "failed",
          sealed: undefined,
          error:
            error instanceof PublicError
              ? error.message
              : "Roblox sign-in could not finish. Start again.",
        });
      return false;
    }
  }
  private account(token: string, invite?: string, requireActive = true) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError("Sign in with Roblox first.", 401);
    const account = this.store.account(hash(token));
    if (
      !account ||
      (requireActive &&
        (account.expires <= this.now() || !this.deps.active(account.invite))) ||
      (invite !== undefined && invite !== account.invite)
    )
      throw new PublicError(
        "This Roblox connection ended. Sign in again.",
        401,
      );
    return account;
  }
  /** Find a capability's stored scope without granting data access. Reconnect
   * must still work when the provider grant needs fresh authorization. */
  accountScope(token: string) {
    return this.account(token, undefined, false).invite;
  }
  async inspect(token: string) {
    const original = this.account(token);
    const groups = original.owners.filter((owner) => owner.kind === "group");
    if (
      groups.length &&
      (!original.ownerNamesCheckedAt ||
        this.now() - original.ownerNamesCheckedAt >= DAY ||
        groups.some((owner) => owner.label === `Group ${owner.id}`))
    ) {
      const named = await this.groupNames.resolve(original.owners);
      // Disconnect, token refresh and changed grants must win while directory I/O is pending.
      const current = this.account(token);
      const labels = new Map(
        named
          .filter((owner) => owner.kind === "group")
          .map((owner) => [owner.id, owner.label]),
      );
      this.store.saveAccount({
        ...current,
        owners: current.owners.map((owner) =>
          owner.kind === "group" && labels.has(owner.id)
            ? { ...owner, label: labels.get(owner.id)! }
            : owner,
        ),
        ownerNamesCheckedAt: this.now(),
      });
    }
    return this.status(token);
  }
  status(token: string) {
    const account = this.account(token);
    let readable = this.available();
    try {
      const tokens = this.open<Tokens>(
        "account",
        account.id,
        account.invite,
        account.sealed,
      );
      this.client(this.storedClientId(tokens.clientId));
    } catch {
      readable = false;
    }
    return {
      userId: account.userId,
      username: account.username,
      displayName: account.displayName,
      owners: account.owners,
      expiresAt: account.expires,
      ...readProviderRefreshDiagnostics({
        providerAccessExpiresAt: account.accessExpires,
        providerRefreshCount: account.providerRefreshCount ?? 0,
        providerRefreshedAt: account.providerRefreshedAt ?? null,
      }),
      needsAuthorization:
        !readable ||
        account.state === "reauthorize" ||
        (account.state === "refreshing" && !this.refreshing.has(account.id)),
    };
  }
  invalidate(token: string, rejectedAccess?: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const account = this.store.account(hash(token));
    if (account && rejectedAccess) {
      try {
        if (
          this.open<Tokens>(
            "account",
            account.id,
            account.invite,
            account.sealed,
          ).access !== rejectedAccess
        )
          return;
      } catch {
        /* An unreadable connection also needs reauthorization. */
      }
    }
    if (account) this.store.saveAccount({ ...account, state: "reauthorize" });
  }
  /** Authenticate optional review without transmitting the Roblox token to an AI provider. */
  reviewAccountIdentity(token: string) {
    const account = this.account(token);
    if (this.status(token).needsAuthorization)
      throw new PublicError("Sign in with Roblox again before AI review.", 401);
    return {
      account: account.id,
      invite: account.invite,
      userId: hash(account.userId),
    };
  }
  /** PNG access requires a fresh provider identity, including personal scopes. */
  async artworkIdentity(token: string, group?: string) {
    const initial = this.account(token),
      credential = await this.credential(token, initial.invite);
    try {
      const profile = await this.json("userinfo", undefined, credential.token);
      if (profile.sub !== initial.userId)
        throw new PublicError(
          "Roblox artwork authorization changed. Sign in again.",
          401,
        );
      return await this.reviewIdentity(token, group);
    } catch (error) {
      if (error instanceof PublicError && error.status === 401)
        this.invalidate(token, credential.token);
      throw error;
    }
  }
  /** Server-derived preference identity; creator grants are not Figma team membership. */
  async reviewIdentity(token: string, group?: string) {
    const initial = this.account(token);
    const credential = await this.credential(token, initial.invite);
    const account = this.account(token);
    if (group !== undefined) {
      if (!numeric(group))
        throw new PublicError("Choose an authorized Roblox group.", 400);
      const resources = await this.json("token/resources", {
        token: credential.token,
      });
      const owners = grantedCreators(
        resources,
        account.userId,
        account.username,
      );
      if (!owners.some((o) => o.kind === "group" && o.id === group))
        throw new PublicError(
          "This Roblox group is no longer authorized. Sign in again to approve it.",
          403,
        );
    }
    // Recheck after provider awaits: disconnect/revoked invitation must win.
    const current = this.account(token);
    return {
      account: current.id,
      invite: current.invite,
      scope: group
        ? { kind: "group" as const, id: group, label: "Roblox group " + group }
        : {
            kind: "personal" as const,
            id: current.userId,
            label: current.username,
          },
    };
  }
  async credential(token: string, invite: string, owner?: Owner) {
    this.configured();
    let account = this.account(token, invite);
    if (account.state === "reauthorize")
      throw new PublicError(
        "Your Roblox authorization ended. Sign in again or choose API-key uploads.",
        401,
      );
    if (
      account.accessExpires <= this.now() + 60000 ||
      account.state === "refreshing"
    ) {
      let pending = this.refreshing.get(account.id);
      if (!pending) {
        if (account.state === "refreshing") {
          this.store.saveAccount({ ...account, state: "reauthorize" });
          throw new PublicError(
            "Roblox refresh was interrupted. Sign in again.",
            401,
          );
        }
        pending = this.refresh(account);
        this.refreshing.set(account.id, pending);
        pending
          .finally(() => this.refreshing.delete(account.id))
          .catch(() => {});
      }
      account = await pending;
    }
    account = this.account(token, invite);
    if (
      owner &&
      !account.owners.some(
        (allowed) => allowed.kind === owner.kind && allowed.id === owner.id,
      )
    )
      throw new PublicError(
        "Choose a creator authorized by this Roblox sign-in, or approve that creator by signing in again.",
        403,
      );
    const tokens = this.open<Tokens>(
      "account",
      account.id,
      invite,
      account.sealed,
    );
    this.client(this.storedClientId(tokens.clientId));
    return {
      token: tokens.access,
      identity: "oauth:" + account.id,
    };
  }
  private async refresh(account: OAuthAccount) {
    const count = account.providerRefreshCount ?? 0;
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count >= Number.MAX_SAFE_INTEGER
    )
      throw new PublicError(
        "Roblox refresh diagnostics need a new sign-in.",
        401,
      );
    const original = this.open<Tokens>(
      "account",
      account.id,
      account.invite,
      account.sealed,
    );
    this.store.saveAccount({ ...account, state: "refreshing" });
    let tokens: Tokens | undefined;
    try {
      const clientId = this.client(this.storedClientId(original.clientId)).id;
      const response = await this.json(
        "token",
        { grant_type: "refresh_token", refresh_token: original.refresh },
        undefined,
        clientId,
      );
      try {
        tokens = this.tokens(response, clientId);
      } catch (error) {
        if (opaque(response.refresh_token))
          await this.revoke(response.refresh_token, clientId);
        throw error;
      }
      const profile = await this.profile(tokens);
      if (profile.userId !== account.userId)
        throw new PublicError(
          "Roblox returned a different account during refresh. Sign in again.",
          401,
        );
      const current = this.store.account(account.id);
      if (!current || !this.deps.active(account.invite)) {
        throw new PublicError("This Roblox connection ended.", 401);
      }
      const next: OAuthAccount = {
        ...current,
        ...profile,
        state: "active",
        expires: this.now() + 90 * DAY,
        accessExpires: tokens.accessExpires,
        // Commit the attestation with the rotated ciphertext only after exchange,
        // identity/grant validation and the account/invitation recheck all succeed.
        providerRefreshCount: count + 1,
        providerRefreshedAt: this.now(),
        ownerNamesCheckedAt: this.now(),
        sealed: this.seal("account", account.id, account.invite, tokens),
      };
      this.store.saveAccount(next);
      return next;
    } catch (error) {
      if (tokens) await this.revoke(tokens.refresh, tokens.clientId);
      const current = this.store.account(account.id);
      if (current) {
        // A rejected refresh has not rotated the credential. Keep it usable
        // after the cooldown; a successful rotation or an ambiguous failure
        // still requires the existing conservative reauthorization path.
        const rejectedRefresh =
          !tokens &&
          error instanceof PublicError &&
          (error.status === 429 || error instanceof OAuthHostingBlocked) &&
          current.state === "refreshing" &&
          current.sealed === account.sealed;
        this.store.saveAccount({
          ...current,
          state: rejectedRefresh ? "active" : "reauthorize",
        });
      }
      throw error instanceof PublicError
        ? error
        : new PublicError(
            "Roblox authorization could not refresh. Sign in again.",
            401,
          );
    }
  }
  private async revoke(refresh: string, clientId?: string) {
    try {
      await this.json(
        "token/revoke",
        { token: refresh },
        undefined,
        this.storedClientId(clientId),
      );
      return true;
    } catch {
      return false;
    }
  }
  async disconnect(token: string) {
    const account = this.account(token, undefined, false);
    return this.removeAccount(account);
  }
  private async removeAccount(account: OAuthAccount) {
    // Forget first: missing/rotated configuration cannot strand a saved account.
    this.store.removeAccount(account.id);
    this.deps.accountRemoved?.(account.id);
    try {
      const tokens = this.open<Tokens>(
        "account",
        account.id,
        account.invite,
        account.sealed,
      );
      return {
        disconnected: true,
        revoked:
          this.available() &&
          (await this.revoke(tokens.refresh, tokens.clientId)),
      };
    } catch {
      return { disconnected: true, revoked: false };
    }
  }
  prune() {
    this.store.prune(this.now(), this.deps.active);
  }
  nextExpiry() {
    return this.store.nextExpiry();
  }
}
