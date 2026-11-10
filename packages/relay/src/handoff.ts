import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { TransferPackage } from "../../core/src/types";
import { PublicError } from "./roblox";
import { validatePackage } from "./protocol";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const HANDOFF_LIMITS = {
  active: 20,
  perInvite: 4,
  bytes: 64_000_000,
  packageBytes: 8_000_000,
  claims: 50,
};
export type HandoffRecord = {
  id: string;
  owner: string;
  code: string;
  invite: string;
  expires: number;
  ttlMinutes: number;
  fingerprint: string;
  name: string;
  bytes: number;
};
export type HandoffClaim = {
  token: string;
  handoff: string;
  invite: string;
  status: "opened" | "ready" | "queued" | "imported" | "failed";
  at: number;
  message?: string;
};
export interface HandoffStore {
  records(): HandoffRecord[];
  save(record: HandoffRecord, raw: string): void;
  read(id: string): string;
  remove(record: HandoffRecord, retiredUntil: number): void;
  retired(owner: string): boolean;
  pruneRetired(now: number): void;
  claims(id: string): HandoffClaim[];
  claim(token: string): HandoffClaim | undefined;
  saveClaim(claim: HandoffClaim): void;
}
export function memoryHandoffs(): HandoffStore {
  const records = new Map<string, HandoffRecord>(),
    packages = new Map<string, string>(),
    claims = new Map<string, HandoffClaim>(),
    retired = new Map<string, number>();
  return {
    records: () => [...records.values()],
    save: (record, raw) => {
      records.set(record.id, record);
      packages.set(record.id, raw);
    },
    read: (id) => packages.get(id) ?? "",
    remove: (record, until) => {
      records.delete(record.id);
      packages.delete(record.id);
      retired.set(record.owner, until);
      for (const [key, claim] of claims)
        if (claim.handoff === record.id) claims.delete(key);
    },
    retired: (owner) => retired.has(owner),
    pruneRetired: (now) => {
      for (const [owner, until] of retired)
        if (until <= now) retired.delete(owner);
    },
    claims: (id) => [...claims.values()].filter((c) => c.handoff === id),
    claim: (token) => claims.get(token),
    saveClaim: (claim) => {
      claims.set(claim.token, claim);
    },
  };
}
const capability = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new PublicError("Invalid handoff access.", 401);
  return value;
};
const code = (value: unknown) => {
  const normalized =
    typeof value === "string" && value.length <= 80
      ? value.replace(/[\s-]/g, "").toUpperCase()
      : "";
  if (!/^FB[A-F0-9]{24}$/.test(normalized))
    throw new PublicError(
      "This design code is invalid, expired or revoked.",
      404,
    );
  return normalized;
};
const publicCode = (ownerToken: string, id: string) =>
  "FB-" +
  hash("framebridge-handoff:" + id + ":" + ownerToken)
    .slice(0, 24)
    .toUpperCase()
    .match(/.{6}/g)!
    .join("-");
export class Handoffs {
  constructor(
    private store: HandoffStore,
    private dependencies: {
      now(): number;
      active(invite: string): boolean;
      count(scope: string, maximum: number, window: number): void;
      created?(invite: string): void;
    },
  ) {}
  prune() {
    const now = this.dependencies.now();
    this.store.pruneRetired(now);
    for (const record of this.store.records())
      if (record.expires <= now || !this.dependencies.active(record.invite))
        this.store.remove(record, now + 86_400_000);
  }
  private daily(scope: string, maximum: number) {
    const now = this.dependencies.now(),
      day = Math.floor(now / 86_400_000);
    this.dependencies.count(
      `${day}:${scope}`,
      maximum,
      (day + 1) * 86_400_000 - now,
    );
  }
  private active(invite: string) {
    if (!this.dependencies.active(invite))
      throw new PublicError("Private beta access required.", 403);
  }
  create(invite: string, input: unknown) {
    this.prune();
    this.active(invite);
    const body = input as {
      ownerToken?: unknown;
      package?: unknown;
      ttlMinutes?: unknown;
    };
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some(
        (k) => !["ownerToken", "package", "ttlMinutes"].includes(k),
      )
    )
      throw new PublicError("Invalid handoff request.");
    const token = capability(body.ownerToken),
      ttl = body.ttlMinutes ?? 60;
    if (ttl !== 60 && ttl !== 1440)
      throw new PublicError("Choose a one-hour or 24-hour expiry.");
    const pkg = body.package as TransferPackage;
    validatePackage(pkg);
    if (
      typeof pkg.name !== "string" ||
      !pkg.name.length ||
      pkg.name.length > 1000
    )
      throw new PublicError("Enter a design name under 1,000 characters.");
    const raw = JSON.stringify(pkg),
      bytes = Buffer.byteLength(raw);
    if (bytes > HANDOFF_LIMITS.packageBytes)
      throw new PublicError("Design exceeds the 8 MB handoff limit.", 413);
    const owner = hash(token),
      fingerprint = hash(raw),
      records = this.store.records(),
      existing = records.find((r) => r.owner === owner);
    if (this.store.retired(owner))
      throw new PublicError(
        "This handoff attempt is expired or revoked. Create a new code.",
        410,
      );
    if (
      existing &&
      (existing.invite !== invite ||
        existing.fingerprint !== fingerprint ||
        existing.ttlMinutes !== ttl)
    )
      throw new PublicError(
        "This handoff attempt already belongs to another snapshot. Create a new code.",
        409,
      );
    let record = existing;
    if (!record) {
      if (
        records.length >= HANDOFF_LIMITS.active ||
        records.reduce((n, r) => n + r.bytes, 0) + bytes > HANDOFF_LIMITS.bytes
      )
        throw new PublicError(
          "Private handoff storage is full. Revoke an old code or wait for expiry.",
          503,
        );
      if (
        records.filter((r) => r.invite === invite).length >=
        HANDOFF_LIMITS.perInvite
      )
        throw new PublicError(
          "You have four active design codes. Revoke one before creating another.",
          429,
        );
      this.daily("handoff-creates", 50);
      this.daily("handoff-creates:" + invite, 20);
      this.dependencies.created?.(invite);
      const id = "handoff:" + randomUUID();
      record = {
        id,
        owner,
        code: hash(code(publicCode(token, id))),
        invite,
        expires: this.dependencies.now() + ttl * 60_000,
        ttlMinutes: ttl,
        fingerprint,
        name: pkg.name,
        bytes,
      };
      this.store.save(record, raw);
    }
    return {
      code: publicCode(token, record.id),
      expiresAt: record.expires,
      name: record.name,
    };
  }
  open(invite: string, input: unknown) {
    this.prune();
    this.active(invite);
    const body = input as { code?: unknown; receiptToken?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some((k) => !["code", "receiptToken"].includes(k))
    )
      throw new PublicError("Invalid design-code request.");
    const normalized = code(body.code),
      token = capability(body.receiptToken),
      record = this.store.records().find((r) => r.code === hash(normalized));
    if (!record)
      throw new PublicError(
        "This design code is invalid, expired or revoked.",
        404,
      );
    const tokenHash = hash(token),
      existing = this.store.claim(tokenHash);
    if (
      existing &&
      (existing.handoff !== record.id || existing.invite !== invite)
    )
      throw new PublicError("Invalid handoff access.", 401);
    if (!existing) {
      if (this.store.claims(record.id).length >= HANDOFF_LIMITS.claims)
        throw new PublicError(
          "This design code has reached its 50-open limit. Ask for a new code.",
          429,
        );
      this.daily("handoff-opens", 1000);
      this.daily("handoff-opens:" + invite, 200);
      this.store.saveClaim({
        token: tokenHash,
        handoff: record.id,
        invite,
        status: "opened",
        at: this.dependencies.now(),
      });
    }
    return {
      package: JSON.parse(this.store.read(record.id)) as TransferPackage,
      expiresAt: record.expires,
      name: record.name,
    };
  }
  owner(ownerToken: string) {
    this.prune();
    const owner = hash(capability(ownerToken)),
      record = this.store.records().find((r) => r.owner === owner);
    if (!record)
      throw new PublicError("This design code is expired or revoked.", 404);
    return {
      record,
      summary: {
        code: publicCode(ownerToken, record.id),
        name: record.name,
        expiresAt: record.expires,
        receipts: this.store
          .claims(record.id)
          .map(({ status, at, message }) => ({
            status,
            at,
            ...(message ? { message } : {}),
          })),
      },
    };
  }
  revoke(ownerToken: string) {
    const { record } = this.owner(ownerToken);
    this.store.remove(record, this.dependencies.now() + 86_400_000);
    return { ok: true };
  }
  receipt(receiptToken: string, input: unknown) {
    this.prune();
    const claim = this.store.claim(hash(capability(receiptToken)));
    if (!claim || !this.dependencies.active(claim.invite))
      throw new PublicError("This handoff receipt is expired or revoked.", 401);
    const body = input as { status?: unknown; message?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some((k) => !["status", "message"].includes(k)) ||
      typeof body.status !== "string" ||
      !["ready", "queued", "imported", "failed"].includes(body.status) ||
      (body.message !== undefined && typeof body.message !== "string")
    )
      throw new PublicError("Invalid handoff receipt.");
    if (
      ["imported", "failed"].includes(claim.status) &&
      claim.status !== body.status
    )
      throw new PublicError("The handoff already has a final receipt.", 409);
    if (claim.status !== body.status)
      this.store.saveClaim({
        ...claim,
        status: body.status as HandoffClaim["status"],
        at: this.dependencies.now(),
        ...(body.message
          ? { message: (body.message as string).slice(0, 500) }
          : {}),
      });
    return { ok: true };
  }
}
export const newHandoffCapability = () => randomBytes(32).toString("hex");
