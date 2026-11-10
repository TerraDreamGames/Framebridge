import type {
  DurableObjectStorage,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import type { OAuthAccount, OAuthLogin, OAuthStore } from "../src/roblox-oauth";

/** Only AES-GCM ciphertext stores provider credentials and PKCE verifiers. */
export function sqliteOAuth(storage: DurableObjectStorage): OAuthStore {
  const sql = storage.sql;
  sql.exec(`
    CREATE TABLE IF NOT EXISTS oauth_logins (id TEXT PRIMARY KEY, state TEXT UNIQUE, invite TEXT, expires REAL, data TEXT);
    CREATE INDEX IF NOT EXISTS oauth_logins_expiry ON oauth_logins(expires);
    CREATE TABLE IF NOT EXISTS oauth_accounts (id TEXT PRIMARY KEY, invite TEXT, expires REAL, data TEXT);
    CREATE INDEX IF NOT EXISTS oauth_accounts_expiry ON oauth_accounts(expires);
  `);
  const rows = (query: string, ...values: SqlStorageValue[]) =>
    sql.exec(query, ...values).toArray();
  const record = <T>(
    table: string,
    field: string,
    key: string,
  ): T | undefined => {
    const row = rows(`SELECT data FROM ${table} WHERE ${field}=?`, key)[0];
    return row ? (JSON.parse(String(row.data)) as T) : undefined;
  };
  return {
    login: (id) => record<OAuthLogin>("oauth_logins", "id", id),
    loginState: (state) => record<OAuthLogin>("oauth_logins", "state", state),
    saveLogin: (value) => {
      sql.exec(
        "INSERT OR REPLACE INTO oauth_logins VALUES (?,?,?,?,?)",
        value.id,
        value.state,
        value.invite,
        value.expires,
        JSON.stringify(value),
      );
    },
    removeLogin: (id) => {
      sql.exec("DELETE FROM oauth_logins WHERE id=?", id);
    },
    account: (id) => record<OAuthAccount>("oauth_accounts", "id", id),
    saveAccount: (value) => {
      sql.exec(
        "INSERT OR REPLACE INTO oauth_accounts VALUES (?,?,?,?)",
        value.id,
        value.invite,
        value.expires,
        JSON.stringify(value),
      );
    },
    removeAccount: (id) => {
      storage.transactionSync(() => {
        sql.exec("DELETE FROM oauth_accounts WHERE id=?", id);
        sql.exec("DELETE FROM oauth_logins WHERE json_extract(data, '$.account')=?", id);
      });
    },
    count: (invite, kind) =>
      Number(
        rows(
          `SELECT COUNT(*) AS n FROM oauth_${kind === "login" ? "logins" : "accounts"}${invite === "*" ? "" : " WHERE invite=?"}`,
          ...(invite === "*" ? [] : [invite]),
        )[0].n,
      ),
    prune(now, active) {
      storage.transactionSync(() => {
        // Also handles a failed save between account creation and ready-login storage.
        sql.exec(
          `DELETE FROM oauth_accounts WHERE json_extract(data, '$.pendingLogin') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM oauth_logins WHERE oauth_logins.id=json_extract(oauth_accounts.data, '$.pendingLogin') AND oauth_logins.expires>?)`,
          now,
        );
        for (const table of ["oauth_logins", "oauth_accounts"]) {
          sql.exec(`DELETE FROM ${table} WHERE expires<=?`, now);
          for (const row of rows(`SELECT DISTINCT invite FROM ${table}`))
            if (!active(String(row.invite)))
              sql.exec(`DELETE FROM ${table} WHERE invite=?`, row.invite);
        }
      });
    },
    nextExpiry() {
      const row = rows(
        "SELECT MIN(expires) AS next FROM (SELECT expires FROM oauth_logins UNION ALL SELECT expires FROM oauth_accounts)",
      )[0];
      return row?.next ? Number(row.next) : undefined;
    },
  };
}
