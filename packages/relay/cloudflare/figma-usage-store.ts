import type { DurableObjectStorage } from "@cloudflare/workers-types";
import {
  FIGMA_USAGE_DAYS,
  ONBOARDING_EVENTS,
  ONBOARDING_EVENT_NAMES,
  ONBOARDING_FOLLOW_UP_DAYS,
  UTC_DAY_MS,
  utcDay,
  type OnboardingEvent,
  type readFigmaUsage,
} from "../../core/src/figma-usage";

export class FigmaUsageStore {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS figma_usage_seen (
        day INTEGER NOT NULL, id TEXT NOT NULL, PRIMARY KEY(day,id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS figma_usage_daily (
        day INTEGER PRIMARY KEY, installations INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS figma_onboarding_seen (
        day INTEGER NOT NULL, id TEXT NOT NULL, events INTEGER NOT NULL, PRIMARY KEY(day,id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS figma_onboarding_daily (
        day INTEGER NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,event)
      ) WITHOUT ROWID;
    `);
  }

  add(report: NonNullable<ReturnType<typeof readFigmaUsage>>) {
    const { day, key, onboarding } = report;
    const sql = this.storage.sql;
    this.storage.transactionSync(() => {
      if (
        sql
          .exec(
            "INSERT OR IGNORE INTO figma_usage_seen VALUES (?,?) RETURNING 1",
            day,
            key,
          )
          .toArray().length
      ) {
        sql.exec(
          `INSERT INTO figma_usage_daily VALUES (?,1)
          ON CONFLICT(day) DO UPDATE SET installations=installations+1`,
          day,
        );
      }
      if (!onboarding) return;
      const previous = Number(
        sql
          .exec(
            "SELECT events FROM figma_onboarding_seen WHERE day=? AND id=?",
            onboarding.day,
            onboarding.key,
          )
          .toArray()[0]?.events ?? 0,
      );
      const added = onboarding.events & ~previous;
      if (!added) return;
      sql.exec(
        `INSERT INTO figma_onboarding_seen VALUES (?,?,?)
        ON CONFLICT(day,id) DO UPDATE SET events=excluded.events`,
        onboarding.day,
        onboarding.key,
        previous | added,
      );
      for (const event of ONBOARDING_EVENT_NAMES) {
        if (!(added & ONBOARDING_EVENTS[event])) continue;
        sql.exec(
          `INSERT INTO figma_onboarding_daily VALUES (?,?,1)
          ON CONFLICT(day,event) DO UPDATE SET count=count+1`,
          onboarding.day,
          event,
        );
      }
    });
  }

  snapshot(now: number) {
    const day = utcDay(now);
    const oldest = day - FIGMA_USAGE_DAYS + 1;
    const sql = this.storage.sql;
    const usage = new Map(
      sql
        .exec(
          "SELECT day,installations FROM figma_usage_daily WHERE day BETWEEN ? AND ?",
          oldest,
          day,
        )
        .toArray()
        .map((row) => [Number(row.day), Number(row.installations)]),
    );
    const funnel = new Map<number, Partial<Record<OnboardingEvent, number>>>();
    for (const row of sql.exec(
      "SELECT day,event,count FROM figma_onboarding_daily WHERE day BETWEEN ? AND ?",
      oldest,
      day,
    )) {
      const start = Number(row.day);
      const steps = funnel.get(start) ?? {};
      steps[row.event as OnboardingEvent] = Number(row.count);
      funnel.set(start, steps);
    }
    return {
      followUpDays: ONBOARDING_FOLLOW_UP_DAYS,
      days: Array.from({ length: FIGMA_USAGE_DAYS }, (_, i) => {
        const date = oldest + i;
        return {
          date: new Date(date * UTC_DAY_MS).toISOString().slice(0, 10),
          installations: usage.get(date) ?? null,
          onboarding: funnel.get(date) ?? {},
          followUpOpen: day < date + ONBOARDING_FOLLOW_UP_DAYS,
        };
      }),
    };
  }

  prune(day = utcDay()) {
    const sql = this.storage.sql;
    sql.exec("DELETE FROM figma_usage_seen WHERE day<?", day);
    sql.exec(
      "DELETE FROM figma_onboarding_seen WHERE day<?",
      day - ONBOARDING_FOLLOW_UP_DAYS + 1,
    );
    sql.exec(
      "DELETE FROM figma_usage_daily WHERE day<?",
      day - FIGMA_USAGE_DAYS + 1,
    );
    sql.exec(
      "DELETE FROM figma_onboarding_daily WHERE day<?",
      day - FIGMA_USAGE_DAYS + 1,
    );
  }

  nextCleanup() {
    const sql = this.storage.sql;
    const expiries = [
      ["figma_usage_seen", 1],
      ["figma_onboarding_seen", ONBOARDING_FOLLOW_UP_DAYS],
      ["figma_usage_daily", FIGMA_USAGE_DAYS],
      ["figma_onboarding_daily", FIGMA_USAGE_DAYS],
    ] as const;
    const next = Math.min(
      ...expiries.map(([table, days]) => {
        const oldest = sql
          .exec(`SELECT MIN(day) AS day FROM ${table}`)
          .toArray()[0]?.day;
        return oldest == null ? Infinity : (Number(oldest) + days) * UTC_DAY_MS;
      }),
    );
    return Number.isFinite(next) ? next : undefined;
  }
}
