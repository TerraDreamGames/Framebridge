import type { DurableObjectStorage } from "@cloudflare/workers-types";
import { VISION_LIMITS } from "../../core/src/vision-review";
import type { VisionSettings } from "../src/vision-provider";
import { PublicError } from "../src/roblox";
export type VisionIdentity = {
  account: string;
  invite: string;
  userId: string;
};
/** Stores only quota amounts and hashed attempt IDs. No screenshots, metadata, provider output or keys. */
export class VisionStore {
  constructor(private storage: DurableObjectStorage) {
    storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS vision_attempts (id TEXT PRIMARY KEY, account TEXT, invite TEXT, state TEXT, expires REAL);
      CREATE INDEX IF NOT EXISTS vision_attempts_expiry ON vision_attempts(expires);
      CREATE TABLE IF NOT EXISTS vision_budget (scope TEXT PRIMARY KEY, count INTEGER, cost INTEGER, expires REAL);
      CREATE INDEX IF NOT EXISTS vision_budget_expiry ON vision_budget(expires);
      CREATE TABLE IF NOT EXISTS vision_cancellations (id TEXT PRIMARY KEY, account TEXT, invite TEXT, user TEXT, expires REAL);
      CREATE INDEX IF NOT EXISTS vision_cancellations_expiry ON vision_cancellations(expires);`);
  }
  private scopes(identity: VisionIdentity, settings: VisionSettings) {
    const day = Math.floor(Date.now() / 86400000);
    return [
      {
        scope: day + ":global",
        count: VISION_LIMITS.dailyGlobal,
        cost: settings.dailyCost,
      },
      {
        scope: day + ":invite:" + identity.invite,
        count: VISION_LIMITS.dailyInvite,
        cost: settings.inviteCost,
      },
      {
        scope: day + ":user:" + identity.invite + ":" + identity.userId,
        count: VISION_LIMITS.dailyUser,
        cost: settings.userCost,
      },
    ];
  }
  remaining(identity: VisionIdentity, settings: VisionSettings) {
    const values = this.scopes(identity, settings).map((limit) => {
      const row = this.storage.sql
        .exec("SELECT count,cost FROM vision_budget WHERE scope=?", limit.scope)
        .toArray()[0];
      return {
        count: Math.max(0, limit.count - Number(row?.count ?? 0)),
        cost: Math.max(0, limit.cost - Number(row?.cost ?? 0)),
      };
    });
    return {
      remainingRequests: Math.min(
        ...values.map((v) =>
          Math.min(v.count, Math.floor(v.cost / settings.costMicros)),
        ),
      ),
      remainingCostMicros: Math.min(...values.map((v) => v.cost)),
      resetsAt: (Math.floor(Date.now() / 86400000) + 1) * 86400000,
    };
  }
  reserve(id: string, identity: VisionIdentity, settings: VisionSettings) {
    this.storage.transactionSync(() => {
      if (
        this.storage.sql
          .exec(
            "SELECT id FROM vision_cancellations WHERE id=? AND expires>?",
            id,
            Date.now(),
          )
          .toArray().length
      )
        throw new PublicError(
          "This review was cancelled before submission. Prepare a new review before retrying.",
          409,
        );
      if (
        this.storage.sql
          .exec("SELECT id FROM vision_attempts WHERE id=?", id)
          .toArray().length
      )
        throw new PublicError(
          "This review was already submitted. Prepare a new review before retrying.",
          409,
        );
      const active = this.storage.sql
        .exec(
          "SELECT COUNT(*) AS n FROM vision_attempts WHERE state='pending' AND expires>?",
          Date.now(),
        )
        .toArray()[0];
      if (Number(active.n) >= VISION_LIMITS.concurrent)
        throw new PublicError(
          "AI review capacity is busy. Try again later or review locally.",
          429,
        );
      const limits = this.scopes(identity, settings);
      for (const limit of limits) {
        const row = this.storage.sql
          .exec(
            "SELECT count,cost FROM vision_budget WHERE scope=?",
            limit.scope,
          )
          .toArray()[0];
        if (
          Number(row?.count ?? 0) >= limit.count ||
          Number(row?.cost ?? 0) + settings.costMicros > limit.cost
        )
          throw new PublicError(
            "AI review daily allowance reached. Local review remains available until the 00:00 UTC reset.",
            429,
          );
      }
      for (const limit of limits)
        this.storage.sql.exec(
          "INSERT INTO vision_budget VALUES (?,1,?,?) ON CONFLICT(scope) DO UPDATE SET count=count+1,cost=cost+excluded.cost",
          limit.scope,
          settings.costMicros,
          (Math.floor(Date.now() / 86400000) + 2) * 86400000,
        );
      this.storage.sql.exec(
        "INSERT INTO vision_attempts VALUES (?,?,?,'pending',?)",
        id,
        identity.account,
        identity.invite,
        Date.now() + VISION_LIMITS.timeoutMs + 5000,
      );
    });
  }
  finish(id: string, state: "complete" | "failed" | "cancelled") {
    this.storage.sql.exec(
      "UPDATE vision_attempts SET state=?,expires=? WHERE id=? AND state='pending'",
      state,
      Date.now() + 86400000,
      id,
    );
  }
  cancel(id: string, identity: VisionIdentity) {
    this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec("SELECT account FROM vision_attempts WHERE id=?", id)
        .toArray()[0];
      if (row) {
        if (row.account !== identity.account)
          throw new PublicError("Review request not found.", 404);
        this.finish(id, "cancelled");
        return;
      }
      if (
        this.storage.sql
          .exec(
            "SELECT id FROM vision_cancellations WHERE id=? AND expires>?",
            id,
            Date.now(),
          )
          .toArray().length
      )
        return;
      // Cancellation may arrive before the review body. Keep only bounded,
      // account-scoped opaque tombstones; never charge an unsent provider call.
      const limits = [
        ["", [], VISION_LIMITS.dailyGlobal],
        [" AND invite=?", [identity.invite], VISION_LIMITS.dailyInvite],
        [
          " AND invite=? AND user=?",
          [identity.invite, identity.userId],
          VISION_LIMITS.dailyUser,
        ],
      ] as const;
      for (const [where, values, maximum] of limits) {
        const count = this.storage.sql
          .exec(
            "SELECT COUNT(*) AS n FROM vision_cancellations WHERE expires>?" +
              where,
            Date.now(),
            ...values,
          )
          .toArray()[0];
        if (Number(count.n) >= maximum)
          throw new PublicError(
            "AI cancellation capacity reached. Local review remains available.",
            429,
          );
      }
      this.storage.sql.exec(
        "INSERT OR REPLACE INTO vision_cancellations VALUES (?,?,?,?,?)",
        id,
        identity.account,
        identity.invite,
        identity.userId,
        Date.now() + 86400000,
      );
    });
  }
  prune() {
    this.storage.sql.exec(
      "DELETE FROM vision_attempts WHERE expires<=?",
      Date.now(),
    );
    this.storage.sql.exec(
      "DELETE FROM vision_budget WHERE expires<=?",
      Date.now(),
    );
    this.storage.sql.exec(
      "DELETE FROM vision_cancellations WHERE expires<=?",
      Date.now(),
    );
  }
}
