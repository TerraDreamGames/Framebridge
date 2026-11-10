import { createHash, randomBytes } from "node:crypto";
import type {
  DurableObjectStorage,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import { PublicError } from "../src/roblox";
import {
  REVIEW_CLOUD_LIMITS as L,
  validReviewVersion,
  validateCloudPreferences,
  type ReviewSnapshot,
  type ReviewScope,
} from "../../core/src/review-cloud";
import { EMPTY_REVIEW_PREFERENCES } from "../../core/src/structure-review";
export type ReviewIdentity = {
  account: string;
  invite: string;
  scope: ReviewScope;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const DAY = 86400000;
/** One bounded beta room. No designs, assets, source IDs or provider tokens. */
export class ReviewStore {
  constructor(
    private storage: DurableObjectStorage,
    private active: (invite: string) => boolean,
    private now = Date.now,
  ) {
    storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS review_profiles (id TEXT PRIMARY KEY,invite TEXT,expires REAL,data TEXT);
      CREATE INDEX IF NOT EXISTS review_profiles_expiry ON review_profiles(expires);
      CREATE TABLE IF NOT EXISTS review_grants (id TEXT PRIMARY KEY,account TEXT,invite TEXT,profile TEXT,group_id TEXT,expires REAL);
      CREATE INDEX IF NOT EXISTS review_grants_expiry ON review_grants(expires);
      CREATE INDEX IF NOT EXISTS review_grants_account ON review_grants(account);`);
  }
  private rows(q: string, ...values: SqlStorageValue[]) {
    return this.storage.sql.exec(q, ...values).toArray();
  }
  private key(i: ReviewIdentity) {
    return hash(i.invite + ":" + i.scope.kind + ":" + i.scope.id);
  }
  private profile(key: string): ReviewSnapshot | undefined {
    const row = this.rows(
      "SELECT data FROM review_profiles WHERE id=? AND expires>?",
      key,
      this.now(),
    )[0];
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  grant(token: string, account: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError("Connect preference sync first.", 401);
    const row = this.rows(
      "SELECT * FROM review_grants WHERE id=? AND account=? AND expires>?",
      hash(token),
      account,
      this.now(),
    )[0];
    if (!row || !this.active(String(row.invite)))
      throw new PublicError(
        "Preference sync access ended. Connect again.",
        401,
      );
    return {
      key: String(row.profile),
      group: row.group_id ? String(row.group_id) : undefined,
    };
  }
  private save(key: string, invite: string, snapshot: ReviewSnapshot) {
    this.storage.sql.exec(
      "INSERT OR REPLACE INTO review_profiles VALUES (?,?,?,?)",
      key,
      invite,
      this.now() + L.days * DAY,
      JSON.stringify(snapshot),
    );
  }
  connect(identity: ReviewIdentity) {
    this.prune();
    return this.storage.transactionSync(() => {
      const key = this.key(identity);
      let snapshot = this.profile(key);
      if (!snapshot) {
        if (
          Number(this.rows("SELECT COUNT(*) AS n FROM review_profiles")[0].n) >=
            L.profiles ||
          Number(
            this.rows(
              "SELECT COUNT(*) AS n FROM review_profiles WHERE invite=?",
              identity.invite,
            )[0].n,
          ) >= L.perInvite
        )
          throw new PublicError(
            "Private preference storage is full. Delete unused preferences first.",
            429,
          );
        snapshot = {
          preferences: { ...EMPTY_REVIEW_PREFERENCES, rules: [] },
          scope: identity.scope,
          generation: randomBytes(16).toString("hex"),
          revision: 0,
          updatedAt: this.now(),
        };
        this.save(key, identity.invite, snapshot);
      }
      if (
        Number(this.rows("SELECT COUNT(*) AS n FROM review_grants")[0].n) >=
          L.grants ||
        Number(
          this.rows(
            "SELECT COUNT(*) AS n FROM review_grants WHERE account=?",
            identity.account,
          )[0].n,
        ) >= L.perAccount
      )
        throw new PublicError(
          "Too many preference connections. Revoke an old connection first.",
          429,
        );
      const grantToken = randomBytes(32).toString("hex");
      this.storage.sql.exec(
        "INSERT INTO review_grants VALUES (?,?,?,?,?,?)",
        hash(grantToken),
        identity.account,
        identity.invite,
        key,
        identity.scope.kind === "group" ? identity.scope.id : null,
        this.now() + 90 * DAY,
      );
      return { grantToken, snapshot };
    });
  }
  read(token: string, identity: ReviewIdentity) {
    const grant = this.grant(token, identity.account);
    if (grant.key !== this.key(identity))
      throw new PublicError(
        "Preference scope does not match this account.",
        403,
      );
    const snapshot = this.profile(grant.key);
    if (!snapshot)
      throw new PublicError(
        "These cloud preferences were deleted or expired. Connect again.",
        410,
      );
    return snapshot;
  }
  write(
    token: string,
    identity: ReviewIdentity,
    body: unknown,
    remove = false,
  ) {
    const v = body as { expected?: unknown; preferences?: unknown };
    if (
      !v ||
      typeof v !== "object" ||
      Object.keys(v).some(
        (k) => !["expected", ...(remove ? [] : ["preferences"])].includes(k),
      ) ||
      !validReviewVersion(v.expected)
    )
      throw new PublicError(
        "Expected the last fetched preference version.",
        400,
      );
    const expected = v.expected;
    let preferences;
    if (!remove)
      try {
        preferences = validateCloudPreferences(v.preferences);
      } catch (e) {
        throw new PublicError((e as Error).message, 400);
      }
    return this.storage.transactionSync(() => {
      const snapshot = this.read(token, identity),
        key = this.key(identity);
      if (
        snapshot.generation !== expected.generation ||
        snapshot.revision !== expected.revision
      )
        return { conflict: true as const, snapshot };
      if (remove) {
        this.storage.sql.exec("DELETE FROM review_profiles WHERE id=?", key);
        this.storage.sql.exec("DELETE FROM review_grants WHERE profile=?", key);
        return { deleted: true as const };
      }
      if (snapshot.revision >= Number.MAX_SAFE_INTEGER)
        throw new PublicError(
          "Delete and reconnect to this cloud record before publishing again.",
          409,
        );
      const next = {
        ...snapshot,
        preferences: preferences!,
        revision: snapshot.revision + 1,
        updatedAt: this.now(),
      };
      this.save(key, identity.invite, next);
      return { snapshot: next };
    });
  }
  revoke(token: string, account: string) {
    this.grant(token, account);
    this.storage.sql.exec("DELETE FROM review_grants WHERE id=?", hash(token));
    return { revoked: true };
  }
  disconnect(account: string) {
    this.storage.sql.exec("DELETE FROM review_grants WHERE account=?", account);
  }
  prune() {
    this.storage.transactionSync(() => {
      for (const table of ["review_profiles", "review_grants"]) {
        this.storage.sql.exec(
          `DELETE FROM ${table} WHERE expires<=?`,
          this.now(),
        );
        for (const row of this.rows(`SELECT DISTINCT invite FROM ${table}`))
          if (!this.active(String(row.invite)))
            this.storage.sql.exec(
              `DELETE FROM ${table} WHERE invite=?`,
              row.invite,
            );
      }
      this.storage.sql.exec(
        "DELETE FROM review_grants WHERE NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE oauth_accounts.id=review_grants.account)",
      );
      this.storage.sql.exec(
        "DELETE FROM review_grants WHERE NOT EXISTS (SELECT 1 FROM review_profiles WHERE review_profiles.id=review_grants.profile)",
      );
    });
  }
}
