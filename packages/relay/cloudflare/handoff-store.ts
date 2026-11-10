import type {
  DurableObjectStorage,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import type { HandoffClaim, HandoffRecord, HandoffStore } from "../src/handoff";
import { textChunks } from "../src/chunks";

// Design JSON is chunked separately from small metadata rows. A handoff never
// overwrites a live session's inbox and survives Worker process restarts.
export function sqliteHandoffs(storage: DurableObjectStorage): HandoffStore {
  const sql = storage.sql;
  sql.exec(`
    CREATE TABLE IF NOT EXISTS handoffs (id TEXT PRIMARY KEY, owner TEXT UNIQUE, expires REAL, data TEXT);
    CREATE INDEX IF NOT EXISTS handoffs_expiry ON handoffs(expires);
    CREATE TABLE IF NOT EXISTS handoff_claims (token TEXT PRIMARY KEY, handoff TEXT, data TEXT);
    CREATE INDEX IF NOT EXISTS handoff_claims_design ON handoff_claims(handoff);
    CREATE TABLE IF NOT EXISTS handoff_retired (owner TEXT PRIMARY KEY, expires REAL);
    CREATE INDEX IF NOT EXISTS handoff_retired_expiry ON handoff_retired(expires);
  `);
  const rows = (query: string, ...values: SqlStorageValue[]) =>
    sql.exec(query, ...values).toArray();
  return {
    records: () =>
      rows("SELECT data FROM handoffs").map(
        (row) => JSON.parse(String(row.data)) as HandoffRecord,
      ),
    save(record, raw) {
      storage.transactionSync(() => {
        sql.exec(
          "INSERT INTO handoffs VALUES (?,?,?,?)",
          record.id,
          record.owner,
          record.expires,
          JSON.stringify(record),
        );
        // Chunks remain below SQLite's 2 MB row limit, including Unicode.
        for (const [part, chunk] of textChunks(raw).entries())
          sql.exec("INSERT INTO chunks VALUES (?,?,?)", record.id, part, chunk);
      });
    },
    read: (id) =>
      rows("SELECT data FROM chunks WHERE session=? ORDER BY part", id)
        .map((row) => String(row.data))
        .join(""),
    remove(record, retiredUntil) {
      storage.transactionSync(() => {
        sql.exec("DELETE FROM chunks WHERE session=?", record.id);
        sql.exec("DELETE FROM handoff_claims WHERE handoff=?", record.id);
        sql.exec("DELETE FROM handoffs WHERE id=?", record.id);
        sql.exec(
          "INSERT OR REPLACE INTO handoff_retired VALUES (?,?)",
          record.owner,
          retiredUntil,
        );
      });
    },
    retired: (owner) =>
      rows("SELECT owner FROM handoff_retired WHERE owner=?", owner).length > 0,
    pruneRetired: (now) => {
      sql.exec("DELETE FROM handoff_retired WHERE expires<=?", now);
    },
    claims: (id) =>
      rows(
        "SELECT data FROM handoff_claims WHERE handoff=? ORDER BY token",
        id,
      ).map((row) => JSON.parse(String(row.data)) as HandoffClaim),
    claim(token) {
      const row = rows(
        "SELECT data FROM handoff_claims WHERE token=?",
        token,
      )[0];
      return row ? (JSON.parse(String(row.data)) as HandoffClaim) : undefined;
    },
    saveClaim: (claim) => {
      sql.exec(
        "INSERT OR REPLACE INTO handoff_claims VALUES (?,?,?)",
        claim.token,
        claim.handoff,
        JSON.stringify(claim),
      );
    },
  };
}
