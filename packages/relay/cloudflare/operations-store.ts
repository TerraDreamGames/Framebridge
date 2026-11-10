import { createHash, timingSafeEqual } from "node:crypto";
import type { DurableObjectStorage } from "@cloudflare/workers-types";

export function operationsAuthorized(request: Request, expected = "") {
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  return (
    /^[a-f0-9]{64}$/.test(token) &&
    /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(
      Buffer.from(createHash("sha256").update(token).digest("hex")),
      Buffer.from(expected),
    )
  );
}

/** Aggregate operator data only; never return identities, capabilities or artwork. */
export class OperationsStore {
  private touched = new Map<string, number>();
  constructor(
    private storage: DurableObjectStorage,
    private now = Date.now,
  ) {
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS operations_presence
      (session TEXT PRIMARY KEY, studio REAL NOT NULL DEFAULT 0, figma REAL NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS operations_meta (id INTEGER PRIMARY KEY, started REAL NOT NULL);`);
    storage.sql.exec(
      "INSERT OR IGNORE INTO operations_meta VALUES (1,?)",
      now(),
    );
  }
  touch(session: string, sender: boolean) {
    const key = session + (sender ? ":f" : ":s"),
      now = this.now();
    if (now - (this.touched.get(key) ?? 0) < 30_000) return;
    const column = sender ? "figma" : "studio";
    this.storage.sql.exec(
      `INSERT INTO operations_presence (session,${column}) VALUES (?,?)
      ON CONFLICT(session) DO UPDATE SET ${column}=excluded.${column}`,
      session,
      now,
    );
    this.touched.set(key, now);
    if (this.touched.size > 2000)
      for (const [id, seen] of this.touched)
        if (seen < now - 90_000) this.touched.delete(id);
  }
  remove(session: string) {
    this.storage.sql.exec(
      "DELETE FROM operations_presence WHERE session=?",
      session,
    );
    this.touched.delete(session + ":s");
    this.touched.delete(session + ":f");
  }
  snapshot(
    limits: {
      requests: number;
      transfers: number;
      uploads: number;
      sessions: number;
    },
    artworkEnabled: boolean,
  ) {
    const now = this.now(),
      day = Math.floor(now / 86_400_000),
      rows = (sql: string, ...args: (string | number)[]) =>
        this.storage.sql.exec(sql, ...args).toArray(),
      scalar = (sql: string, ...args: (string | number)[]) =>
        Number(rows(sql, ...args)[0]?.n ?? 0);
    const sessions = rows(
      `SELECT COUNT(*) AS total,
      COALESCE(SUM(json_extract(s.data,'$.uploadOnly')=1),0) AS uploadOnly,
      COALESCE(SUM(s.sender IS NOT NULL),0) AS paired,
      COALESCE(SUM(COALESCE(json_extract(s.data,'$.uploadOnly'),0)=0 AND p.studio>?),0) AS online
      FROM sessions s LEFT JOIN operations_presence p ON s.id=p.session WHERE s.expires>?`,
      now - 90_000,
      now,
    )[0];
    const jobs = rows(
      `SELECT j.state,COUNT(*) AS count FROM jobs j JOIN sessions s ON j.session=s.id
      WHERE s.expires>? GROUP BY j.state`,
      now,
    );
    const images =
      rows(`SELECT state,COUNT(*) AS objects,COALESCE(SUM(size),0) AS bytes
      FROM artwork_images GROUP BY state`);
    const quotas = Object.entries(limits)
      .filter(([name]) => name !== "sessions")
      .map(([name, maximum]) => ({
        name,
        used: scalar(
          "SELECT count AS n FROM counters WHERE scope=? AND expires>?",
          `${day}:${name}`,
          now,
        ),
        maximum,
      }));
    return {
      observedAt: new Date(now).toISOString(),
      monitoringSince: new Date(
        scalar("SELECT started AS n FROM operations_meta WHERE id=1"),
      ).toISOString(),
      connections: {
        studioOnline: Number(sessions.online),
        paired: Number(sessions.paired),
        retained: Number(sessions.total),
        uploadOnly: Number(sessions.uploadOnly),
        capacity: limits.sessions,
        activeWindowSeconds: 90,
      },
      quotas,
      quotaResetsAt: new Date((day + 1) * 86_400_000).toISOString(),
      uploads: {
        retained: jobs.map((r) => ({
          state: String(r.state),
          count: Number(r.count),
        })),
      },
      accounts: scalar(
        "SELECT COUNT(*) AS n FROM oauth_accounts WHERE expires>?",
        now,
      ),
      storage: {
        sqliteBytes: this.storage.sql.databaseSize,
        cloudArtworkEnabled: artworkEnabled,
        artwork: images.map((r) => ({
          state: String(r.state),
          objects: Number(r.objects),
          bytes: Number(r.bytes),
        })),
      },
    };
  }
}
