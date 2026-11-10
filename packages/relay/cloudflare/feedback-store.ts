import type {
  DurableObjectStorage,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import type { FeedbackStore, FeedbackRecord } from "../src/feedback";
export function sqliteFeedback(storage: DurableObjectStorage): FeedbackStore {
  const sql = storage.sql;
  sql.exec(`
    CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, owner TEXT UNIQUE, invite TEXT, expires REAL, bytes INTEGER, data TEXT, report TEXT);
    CREATE INDEX IF NOT EXISTS feedback_expiry ON feedback(expires);
    CREATE TABLE IF NOT EXISTS feedback_retired (owner TEXT PRIMARY KEY, expires REAL);
  `);
  const rows = (query: string, ...values: SqlStorageValue[]) =>
    sql.exec(query, ...values).toArray();
  const record = (r?: Record<string, SqlStorageValue>) =>
    r ? (JSON.parse(String(r.data)) as FeedbackRecord) : undefined;
  return {
    owner: (owner) =>
      record(rows("SELECT data FROM feedback WHERE owner=?", owner)[0]),
    find: (id) => record(rows("SELECT data FROM feedback WHERE id=?", id)[0]),
    records: () => rows("SELECT data FROM feedback").map((r) => record(r)!),
    usage(invite) {
      const [u] = rows(
        "SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS bytes,COALESCE(SUM(CASE WHEN invite=? THEN 1 ELSE 0 END),0) AS per FROM feedback",
        invite,
      );
      return {
        count: Number(u.n),
        perInvite: Number(u.per),
        bytes: Number(u.bytes),
      };
    },
    save: (r, raw) => {
      sql.exec(
        "INSERT INTO feedback VALUES (?,?,?,?,?,?,?)",
        r.id,
        r.owner,
        r.invite,
        r.expiresAt,
        r.bytes,
        JSON.stringify(r),
        raw,
      );
    },
    read: (id) =>
      String(
        rows("SELECT report FROM feedback WHERE id=?", id)[0]?.report ?? "",
      ),
    remove(r) {
      storage.transactionSync(() => {
        sql.exec("DELETE FROM feedback WHERE id=?", r.id);
        sql.exec(
          "INSERT OR REPLACE INTO feedback_retired VALUES (?,?)",
          r.owner,
          r.expiresAt,
        );
      });
    },
    retired: (owner) =>
      rows("SELECT owner FROM feedback_retired WHERE owner=?", owner).length >
      0,
    pruneRetired: (now) => {
      // Only hashes and expiry remain after cancellation; report content is removed.
      sql.exec("DELETE FROM feedback_retired WHERE expires<=?", now);
    },
    retire: (owner, expires) => {
      sql.exec(
        "INSERT OR REPLACE INTO feedback_retired VALUES (?,?)",
        owner,
        expires,
      );
    },
  };
}
