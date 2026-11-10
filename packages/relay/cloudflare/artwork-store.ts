import { createHash, randomBytes } from "node:crypto";
import type {
  DurableObjectStorage,
  R2Bucket,
  SqlStorageValue,
} from "@cloudflare/workers-types";
import { PublicError } from "../src/roblox";
import {
  ARTWORK_LIMITS as L,
  artworkId,
  artworkName,
  type ArtworkSnapshot,
} from "../../core/src/cloud-artwork";
import { validReviewVersion } from "../../core/src/review-cloud";
import { libraryPng } from "../../core/src/image-processing";
import type { ReviewIdentity } from "./review-store";
const hash = (s: string | Uint8Array) =>
    createHash("sha256").update(s).digest("hex"),
  id = () => randomBytes(16).toString("hex"),
  DAY = 86400000;
type Guard = () => Promise<ReviewIdentity>;
const exact = (v: any, keys: string[]) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => keys.includes(k));
const name = (v: unknown, max?: number) => {
  try {
    return artworkName(v, max);
  } catch (e) {
    throw new PublicError((e as Error).message, 400);
  }
};
/** Metadata reservations count before asynchronous R2 writes; tombstones retain failed deletions. */
export class ArtworkStore {
  private uploads = new Set<string>();
  constructor(
    private storage: DurableObjectStorage,
    private bucket: R2Bucket | undefined,
    private active: (invite: string) => boolean,
    private now = Date.now,
  ) {
    storage.sql
      .exec(`CREATE TABLE IF NOT EXISTS artwork_libraries (id TEXT PRIMARY KEY,invite TEXT,kind TEXT,owner TEXT,label TEXT,generation TEXT,revision INTEGER,expires REAL,state TEXT);
      CREATE INDEX IF NOT EXISTS artwork_library_expiry ON artwork_libraries(expires);
      CREATE TABLE IF NOT EXISTS artwork_grants (id TEXT PRIMARY KEY,account TEXT,library TEXT,expires REAL);
      CREATE INDEX IF NOT EXISTS artwork_grant_account ON artwork_grants(account);
      CREATE INDEX IF NOT EXISTS artwork_grant_expiry ON artwork_grants(expires);
      CREATE TABLE IF NOT EXISTS artwork_cancellations (id TEXT PRIMARY KEY,account TEXT,expires REAL);
      CREATE TABLE IF NOT EXISTS artwork_folders (id TEXT PRIMARY KEY,library TEXT,name TEXT);
      CREATE INDEX IF NOT EXISTS artwork_folder_library ON artwork_folders(library);
      CREATE TABLE IF NOT EXISTS artwork_images (id TEXT PRIMARY KEY,library TEXT,folder TEXT,name TEXT,sha TEXT,size INTEGER,width INTEGER,height INTEGER,created REAL,state TEXT,retry REAL,attempts INTEGER);
      CREATE INDEX IF NOT EXISTS artwork_image_library ON artwork_images(library,state);
      CREATE INDEX IF NOT EXISTS artwork_image_cleanup ON artwork_images(state,retry);
      CREATE TABLE IF NOT EXISTS artwork_leases (image TEXT PRIMARY KEY,expires REAL);
      CREATE TABLE IF NOT EXISTS artwork_deletion (library TEXT PRIMARY KEY,cursor TEXT,retry REAL,attempts INTEGER);
      CREATE TABLE IF NOT EXISTS artwork_gc (id INTEGER PRIMARY KEY,cursor TEXT,retry REAL,attempts INTEGER);`);
    storage.sql.exec(
      "INSERT OR IGNORE INTO artwork_gc VALUES (1,'',?,0)",
      this.now() + DAY,
    );
  }
  private rows(q: string, ...p: SqlStorageValue[]) {
    return this.storage.sql.exec(q, ...p).toArray();
  }
  private key(i: ReviewIdentity) {
    return hash(i.invite + ":" + i.scope.kind + ":" + i.scope.id);
  }
  private object(library: string, image: string) {
    return "framebridge-artwork-v1/" + library + "/" + image;
  }
  private count(q: string, ...p: SqlStorageValue[]) {
    return Number(this.rows(q, ...p)[0]?.n ?? 0);
  }
  grant(token: string, account: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError("Connect the private artwork library first.", 401);
    const row = this.rows(
      "SELECT g.library,l.kind,l.owner,l.invite,l.state,l.expires FROM artwork_grants g JOIN artwork_libraries l ON l.id=g.library WHERE g.id=? AND g.account=? AND g.expires>?",
      hash(token),
      account,
      this.now(),
    )[0];
    if (
      !row ||
      !this.active(String(row.invite)) ||
      row.state !== "active" ||
      Number(row.expires) <= this.now()
    )
      throw new PublicError("Artwork access ended. Connect again.", 401);
    return {
      library: String(row.library),
      group: row.kind === "group" ? String(row.owner) : undefined,
    };
  }
  private library(token: string, identity: ReviewIdentity) {
    const access = this.grant(token, identity.account);
    if (access.library !== this.key(identity))
      throw new PublicError("Artwork scope does not match this account.", 403);
    return this.rows(
      "SELECT * FROM artwork_libraries WHERE id=?",
      access.library,
    )[0];
  }
  private bump(key: string) {
    this.storage.sql.exec(
      "UPDATE artwork_libraries SET revision=revision+1,expires=? WHERE id=?",
      this.now() + L.retentionDays * DAY,
      key,
    );
  }
  private expected(row: any, v: unknown) {
    if (!validReviewVersion(v))
      throw new PublicError(
        "Fetch the last artwork version before editing.",
        400,
      );
    return (
      row.generation === v.generation && Number(row.revision) === v.revision
    );
  }
  private folder(key: string, folder: unknown): string | null {
    if (folder === null) return null;
    if (
      !artworkId(folder) ||
      !this.rows(
        "SELECT id FROM artwork_folders WHERE id=? AND library=?",
        folder,
        key,
      ).length
    )
      throw new PublicError("Choose an existing folder in this library.", 400);
    return folder;
  }
  private snapshot(key: string): ArtworkSnapshot {
    const row = this.rows(
      "SELECT * FROM artwork_libraries WHERE id=? AND state='active'",
      key,
    )[0];
    if (!row)
      throw new PublicError(
        "The cloud library was deleted. Connect again.",
        410,
      );
    const usage = this.rows(
      "SELECT COUNT(*) AS items,COALESCE(SUM(size),0) AS bytes,COALESCE(SUM(state='pending'),0) AS pending,COALESCE(SUM(state='deleting'),0) AS cleanup FROM artwork_images WHERE library=?",
      key,
    )[0];
    return {
      generation: String(row.generation),
      revision: Number(row.revision),
      scope: {
        kind: row.kind as "personal" | "group",
        id: String(row.owner),
        label: String(row.label),
      },
      folders: this.rows(
        "SELECT id,name FROM artwork_folders WHERE library=? ORDER BY name,id",
        key,
      ).map((f) => ({ id: String(f.id), name: String(f.name) })),
      items: this.rows(
        "SELECT * FROM artwork_images WHERE library=? AND state='ready' ORDER BY created DESC,id",
        key,
      ).map((i) => ({
        id: String(i.id),
        name: String(i.name),
        folder: i.folder === null ? null : String(i.folder),
        sha256: String(i.sha),
        bytes: Number(i.size),
        width: Number(i.width),
        height: Number(i.height),
        savedAt: Number(i.created),
      })),
      usage: {
        items: Number(usage.items),
        bytes: Number(usage.bytes),
        pending: Number(usage.pending),
        cleanup: Number(usage.cleanup),
      },
    };
  }
  async connect(identity: ReviewIdentity, guard: Guard, proposal = "") {
    if (proposal && !/^[a-f0-9]{64}$/.test(proposal))
      throw new PublicError("Invalid artwork connection request.", 400);
    await this.cleanup(this.key(identity));
    const fresh = await guard();
    if (
      this.key(fresh) !== this.key(identity) ||
      fresh.account !== identity.account
    )
      throw new PublicError("Artwork account changed.", 403);
    return this.storage.transactionSync(() => {
      const key = this.key(fresh);
      if (proposal) {
        if (
          this.rows(
            "SELECT id FROM artwork_cancellations WHERE id=? AND expires>?",
            hash(proposal),
            this.now(),
          ).length
        )
          throw new PublicError(
            "This artwork connection was cancelled. Connect again with a new request.",
            409,
          );
        const previous = this.rows(
          "SELECT * FROM artwork_grants WHERE id=?",
          hash(proposal),
        )[0];
        if (previous) {
          if (
            previous.account !== fresh.account ||
            previous.library !== key ||
            Number(previous.expires) <= this.now()
          )
            throw new PublicError(
              "Artwork connection request belongs to another session.",
              401,
            );
          return { grantToken: proposal, snapshot: this.snapshot(key) };
        }
        if (
          this.count("SELECT COUNT(*) AS n FROM artwork_cancellations") >=
            L.cancellations ||
          this.count(
            "SELECT COUNT(*) AS n FROM artwork_cancellations WHERE account=?",
            fresh.account,
          ) >= L.accountCancellations
        )
          throw new PublicError(
            "Too many recent artwork connection requests. Retry later.",
            429,
          );
      }
      let library = this.rows(
        "SELECT * FROM artwork_libraries WHERE id=?",
        key,
      )[0];
      if (library?.state === "deleting")
        throw new PublicError(
          "Cloud deletion is still awaiting storage cleanup. Retry connecting later.",
          503,
        );
      if (!library) {
        if (
          this.count("SELECT COUNT(*) AS n FROM artwork_libraries") >=
            L.libraries ||
          this.count(
            "SELECT COUNT(*) AS n FROM artwork_libraries WHERE invite=?",
            fresh.invite,
          ) >= L.inviteLibraries
        )
          throw new PublicError(
            "Private artwork scopes are full. Delete an unused library first.",
            429,
          );
        this.storage.sql.exec(
          "INSERT INTO artwork_libraries VALUES (?,?,?,?,?,?,?,?,?)",
          key,
          fresh.invite,
          fresh.scope.kind,
          fresh.scope.id,
          fresh.scope.label,
          id(),
          0,
          this.now() + L.retentionDays * DAY,
          "active",
        );
      }
      if (
        this.count("SELECT COUNT(*) AS n FROM artwork_grants") >= L.grants ||
        this.count(
          "SELECT COUNT(*) AS n FROM artwork_grants WHERE account=?",
          fresh.account,
        ) >= L.accountGrants
      )
        throw new PublicError(
          "Too many artwork connections. Revoke an old one first.",
          429,
        );
      const grantToken = proposal || randomBytes(32).toString("hex");
      this.storage.sql.exec(
        "INSERT INTO artwork_grants VALUES (?,?,?,?)",
        hash(grantToken),
        fresh.account,
        key,
        this.now() + 90 * DAY,
      );
      return { grantToken, snapshot: this.snapshot(key) };
    });
  }
  read(token: string, identity: ReviewIdentity) {
    const row = this.library(token, identity);
    return this.snapshot(String(row.id));
  }
  revoke(token: string, account: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new PublicError("Invalid artwork connection.", 400);
    const previous = this.rows(
      "SELECT account FROM artwork_grants WHERE id=?",
      hash(token),
    )[0];
    if (previous && previous.account !== account)
      throw new PublicError(
        "Artwork connection belongs to another session.",
        401,
      );
    this.storage.transactionSync(() => {
      if (
        !this.rows(
          "SELECT id FROM artwork_cancellations WHERE id=?",
          hash(token),
        ).length &&
        (this.count("SELECT COUNT(*) AS n FROM artwork_cancellations") >=
          L.cancellations ||
          this.count(
            "SELECT COUNT(*) AS n FROM artwork_cancellations WHERE account=?",
            account,
          ) >= L.accountCancellations)
      ) {
        if (previous) {
          this.storage.sql.exec(
            "DELETE FROM artwork_grants WHERE id=?",
            hash(token),
          );
          return;
        }
        throw new PublicError(
          "Too many recent artwork cancellations. New proposals are also blocked; retry later.",
          429,
        );
      }
      this.storage.sql.exec(
        "INSERT OR REPLACE INTO artwork_cancellations VALUES (?,?,?)",
        hash(token),
        account,
        this.now() + 600000,
      );
      this.storage.sql.exec(
        "DELETE FROM artwork_grants WHERE id=?",
        hash(token),
      );
    });
    return { revoked: true };
  }
  disconnect(account: string) {
    this.storage.sql.exec(
      "DELETE FROM artwork_grants WHERE account=?",
      account,
    );
  }
  mutate(token: string, identity: ReviewIdentity, body: unknown) {
    const v = body as any;
    if (!exact(v, ["expected", "action", "id", "name", "folder"]))
      throw new PublicError("Invalid artwork edit.", 400);
    const fields: Record<string, string[]> = {
      "create-folder": ["name"],
      "rename-folder": ["id", "name"],
      "delete-folder": ["id"],
      "edit-image": ["id", "name", "folder"],
      "delete-image": ["id"],
      "delete-library": [],
    };
    if (
      typeof v.action !== "string" ||
      !Object.prototype.hasOwnProperty.call(fields, v.action) ||
      !exact(v, ["expected", "action", ...fields[v.action]])
    )
      throw new PublicError("Choose a known typed artwork edit.", 400);
    return this.storage.transactionSync(() => {
      const library = this.library(token, identity),
        key = String(library.id);
      if (!this.expected(library, v.expected))
        return { conflict: true, snapshot: this.snapshot(key) };
      if (Number(library.revision) >= Number.MAX_SAFE_INTEGER)
        throw new PublicError(
          "Delete and reconnect to this library before editing again.",
          409,
        );
      if (v.action === "create-folder") {
        if (
          Object.keys(v).some(
            (k) => !["action", "name", "expected"].includes(k),
          )
        )
          throw new PublicError("Invalid folder creation.");
        const label = name(v.name, 64);
        if (
          this.count(
            "SELECT COUNT(*) AS n FROM artwork_folders WHERE library=?",
            key,
          ) >= L.folders ||
          this.count("SELECT COUNT(*) AS n FROM artwork_folders") >=
            L.globalFolders
        )
          throw new PublicError("The cloud folder limit is reached.", 429);
        if (
          this.rows(
            "SELECT id FROM artwork_folders WHERE library=? AND lower(name)=lower(?)",
            key,
            label,
          ).length
        )
          throw new PublicError("A folder with that name already exists.", 409);
        this.storage.sql.exec(
          "INSERT INTO artwork_folders VALUES (?,?,?)",
          id(),
          key,
          label,
        );
      } else if (v.action === "rename-folder" || v.action === "delete-folder") {
        if (
          !artworkId(v.id) ||
          !this.rows(
            "SELECT id FROM artwork_folders WHERE id=? AND library=?",
            v.id,
            key,
          ).length
        )
          throw new PublicError("Folder not found.", 404);
        if (v.action === "rename-folder") {
          const label = name(v.name, 64);
          if (
            this.rows(
              "SELECT id FROM artwork_folders WHERE library=? AND lower(name)=lower(?) AND id<>?",
              key,
              label,
              v.id,
            ).length
          )
            throw new PublicError(
              "A folder with that name already exists.",
              409,
            );
          this.storage.sql.exec(
            "UPDATE artwork_folders SET name=? WHERE id=? AND library=?",
            label,
            v.id,
            key,
          );
        } else {
          if (
            this.count(
              "SELECT COUNT(*) AS n FROM artwork_images WHERE library=? AND folder=?",
              key,
              v.id,
            )
          )
            throw new PublicError(
              "Move or delete every image before deleting this folder.",
              409,
            );
          this.storage.sql.exec(
            "DELETE FROM artwork_folders WHERE id=? AND library=?",
            v.id,
            key,
          );
        }
      } else if (v.action === "edit-image" || v.action === "delete-image") {
        if (
          !artworkId(v.id) ||
          !this.rows(
            "SELECT id FROM artwork_images WHERE id=? AND library=? AND state='ready'",
            v.id,
            key,
          ).length
        )
          throw new PublicError("Image not found.", 404);
        if (v.action === "edit-image")
          this.storage.sql.exec(
            "UPDATE artwork_images SET name=?,folder=? WHERE id=? AND library=?",
            name(v.name),
            this.folder(key, v.folder),
            v.id,
            key,
          );
        else
          this.storage.sql.exec(
            "UPDATE artwork_images SET state='deleting',retry=? WHERE id=? AND library=?",
            this.now(),
            v.id,
            key,
          );
      } else if (v.action === "delete-library") {
        this.storage.sql.exec(
          "UPDATE artwork_libraries SET state='deleting',expires=? WHERE id=?",
          this.now(),
          key,
        );
        this.storage.sql.exec(
          "UPDATE artwork_images SET state='deleting',retry=? WHERE library=?",
          this.now(),
          key,
        );
        this.storage.sql.exec(
          "DELETE FROM artwork_grants WHERE library=?",
          key,
        );
        return {
          deleted: true,
          pendingCleanup: this.count(
            "SELECT COUNT(*) AS n FROM artwork_images WHERE library=?",
            key,
          ),
        };
      } else throw new PublicError("Choose a known artwork edit.", 400);
      this.bump(key);
      return { snapshot: this.snapshot(key) };
    });
  }
  async upload(
    token: string,
    identity: ReviewIdentity,
    body: unknown,
    guard: Guard,
    admit: (scope: string) => void,
    reserved: () => Promise<void> = async () => {},
  ) {
    if (!this.bucket)
      throw new PublicError("Private artwork storage is disabled.", 503);
    const v = body as any;
    if (
      !exact(v, ["name", "folder", "png"]) ||
      typeof v.png !== "string" ||
      v.png.length > Math.ceil((L.pngBytes * 4) / 3) + 4 ||
      v.png.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(v.png)
    )
      throw new PublicError("Choose a bounded PNG file.", 400);
    if (Buffer.from(v.png, "base64").toString("base64") !== v.png)
      throw new PublicError("Invalid PNG encoding.");
    const raw = new Uint8Array(Buffer.from(v.png, "base64"));
    let png: ReturnType<typeof libraryPng>;
    try {
      png = libraryPng(raw);
    } catch (e) {
      throw new PublicError((e as Error).message, 400);
    }
    const label = name(v.name),
      sha = hash(png.bytes);
    const reservation = this.storage.transactionSync(() => {
      const library = this.library(token, identity),
        key = String(library.id),
        folder = this.folder(key, v.folder);
      const existing = this.rows(
        "SELECT id,state FROM artwork_images WHERE library=? AND sha=?",
        key,
        sha,
      )[0];
      if (existing) {
        if (existing.state !== "ready")
          throw new PublicError(
            "This PNG is still saving or deleting. Fetch the library before retrying.",
            409,
          );
        return { id: String(existing.id), key, existing: true };
      }
      const usage = this.rows(
          "SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM artwork_images WHERE library=?",
          key,
        )[0],
        global = this.rows(
          "SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM artwork_images",
        )[0],
        invite = this.rows(
          "SELECT COUNT(*) AS n,COALESCE(SUM(i.size),0) AS bytes FROM artwork_images i JOIN artwork_libraries l ON i.library=l.id WHERE l.invite=?",
          identity.invite,
        )[0];
      if (
        Number(usage.n) >= L.items ||
        Number(usage.bytes) + png.bytes.length > L.scopeBytes ||
        Number(global.n) >= L.globalItems ||
        Number(global.bytes) + png.bytes.length > L.globalBytes ||
        Number(invite.n) >= L.inviteItems ||
        Number(invite.bytes) + png.bytes.length > L.inviteBytes
      )
        throw new PublicError(
          "Private artwork storage is full. Delete unused images before uploading.",
          429,
        );
      admit(key);
      const image = id();
      this.storage.sql.exec(
        "INSERT INTO artwork_images VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        image,
        key,
        folder,
        label,
        sha,
        png.bytes.length,
        png.width,
        png.height,
        this.now(),
        "pending",
        this.now() + 600000,
        0,
      );
      this.storage.sql.exec(
        "INSERT INTO artwork_leases VALUES (?,?)",
        image,
        this.now() + 600000,
      );
      return { id: image, key, existing: false };
    });
    if (reservation.existing)
      return {
        snapshot: this.snapshot(reservation.key),
        itemId: reservation.id,
        reused: true,
      };
    this.uploads.add(reservation.id);
    try {
      await reserved();
      await this.bucket.put(
        this.object(reservation.key, reservation.id),
        png.bytes,
        {
          httpMetadata: { contentType: "image/png" },
          customMetadata: { sha256: sha },
        },
      );
      const fresh = await guard();
      this.library(token, fresh);
      this.storage.transactionSync(() => {
        const row = this.rows(
          "SELECT * FROM artwork_images WHERE id=? AND library=? AND state='pending'",
          reservation.id,
          reservation.key,
        )[0];
        if (!row)
          throw new PublicError(
            "The upload was cancelled by deletion. Fetch the library.",
            409,
          );
        this.folder(reservation.key, row.folder);
        this.storage.sql.exec(
          "UPDATE artwork_images SET state='ready',retry=0 WHERE id=?",
          reservation.id,
        );
        this.bump(reservation.key);
      });
      return {
        snapshot: this.snapshot(reservation.key),
        itemId: reservation.id,
        reused: false,
      };
    } catch (e) {
      this.storage.sql.exec(
        "UPDATE artwork_images SET state='deleting',retry=? WHERE id=?",
        this.now(),
        reservation.id,
      );
      throw e instanceof PublicError
        ? e
        : new PublicError(
            "Artwork could not be saved. Its reserved storage is awaiting cleanup; fetch before retrying.",
            503,
          );
    } finally {
      this.uploads.delete(reservation.id);
      this.storage.sql.exec(
        "DELETE FROM artwork_leases WHERE image=?",
        reservation.id,
      );
      await this.cleanup();
    }
  }
  async download(
    token: string,
    identity: ReviewIdentity,
    image: string,
    guard: Guard,
  ) {
    if (!this.bucket || !artworkId(image))
      throw new PublicError("Image not found.", 404);
    const library = this.library(token, identity),
      key = String(library.id),
      row = this.rows(
        "SELECT * FROM artwork_images WHERE id=? AND library=? AND state='ready'",
        image,
        key,
      )[0];
    if (!row) throw new PublicError("Image not found.", 404);
    const object = await this.bucket.get(this.object(key, image));
    if (!object || object.size !== Number(row.size) || object.size > L.pngBytes)
      throw new PublicError(
        "Artwork storage is unavailable or corrupt. Retry later.",
        503,
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    const fresh = await guard();
    this.library(token, fresh);
    if (
      !this.rows(
        "SELECT id FROM artwork_images WHERE id=? AND state='ready' AND library=?",
        image,
        key,
      ).length
    )
      throw new PublicError("This image was deleted during download.", 410);
    let png: ReturnType<typeof libraryPng>;
    try {
      png = libraryPng(bytes);
    } catch {
      throw new PublicError("The stored artwork failed PNG validation.", 503);
    }
    if (
      hash(bytes) !== String(row.sha) ||
      png.width !== Number(row.width) ||
      png.height !== Number(row.height) ||
      hash(png.bytes) !== String(row.sha)
    )
      throw new PublicError("The stored artwork failed integrity checks.", 503);
    return bytes;
  }
  async cleanup(forceLibrary?: string) {
    this.storage.transactionSync(() => {
      for (const row of this.rows(
        "SELECT id,invite FROM artwork_libraries WHERE state='active'",
      ))
        if (!this.active(String(row.invite)))
          this.storage.sql.exec(
            "UPDATE artwork_libraries SET state='deleting',expires=? WHERE id=?",
            this.now(),
            row.id,
          );
      this.storage.sql.exec(
        "UPDATE artwork_libraries SET state='deleting' WHERE expires<=?",
        this.now(),
      );
      this.storage.sql.exec(
        "INSERT OR IGNORE INTO artwork_deletion SELECT id,'',?,0 FROM artwork_libraries WHERE state='deleting'",
        this.now(),
      );
      this.storage.sql.exec(
        "DELETE FROM artwork_grants WHERE expires<=? OR library IN (SELECT id FROM artwork_libraries WHERE state='deleting') OR NOT EXISTS (SELECT 1 FROM oauth_accounts a WHERE a.id=artwork_grants.account)",
        this.now(),
      );
      this.storage.sql.exec(
        "DELETE FROM artwork_cancellations WHERE expires<=? OR NOT EXISTS (SELECT 1 FROM oauth_accounts a WHERE a.id=artwork_cancellations.account)",
        this.now(),
      );
      this.storage.sql.exec(
        "UPDATE artwork_images SET state='deleting',retry=? WHERE state<>'deleting' AND library IN (SELECT id FROM artwork_libraries WHERE state='deleting')",
        this.now(),
      );
      for (const row of this.rows(
        "SELECT id FROM artwork_images WHERE state='pending' AND retry<=?",
        this.now(),
      ))
        if (!this.uploads.has(String(row.id)))
          this.storage.sql.exec(
            "UPDATE artwork_images SET state='deleting',retry=? WHERE id=?",
            this.now(),
            row.id,
          );
    });
    const candidates = this.rows(
      forceLibrary
        ? "SELECT i.* FROM artwork_images i LEFT JOIN artwork_leases w ON w.image=i.id WHERE i.state='deleting' AND i.library=? AND COALESCE(w.expires,0)<=? ORDER BY i.retry,i.id LIMIT 500"
        : "SELECT i.* FROM artwork_images i LEFT JOIN artwork_leases w ON w.image=i.id WHERE i.state='deleting' AND i.retry<=? AND COALESCE(w.expires,0)<=? ORDER BY i.retry,i.id LIMIT 500",
      forceLibrary ?? this.now(),
      this.now(),
    )
      .filter((r) => !this.uploads.has(String(r.id)))
      .slice(0, 20);
    let failed = false;
    if (candidates.length && !this.bucket) {
      failed = true;
      for (const row of candidates)
        this.storage.sql.exec(
          "UPDATE artwork_images SET retry=? WHERE id=?",
          this.now() + 21600000,
          row.id,
        );
    }
    if (candidates.length && this.bucket)
      try {
        await this.bucket.delete(
          candidates.map((r) => this.object(String(r.library), String(r.id))),
        );
        this.storage.transactionSync(() => {
          for (const row of candidates)
            this.storage.sql.exec(
              "DELETE FROM artwork_images WHERE id=? AND state='deleting'",
              row.id,
            );
        });
      } catch {
        failed = true;
        for (const row of candidates)
          this.storage.sql.exec(
            "UPDATE artwork_images SET attempts=attempts+1,retry=? WHERE id=?",
            this.now() +
              Math.min(
                21600000,
                60000 * 2 ** Math.min(9, Number(row.attempts)),
              ),
            row.id,
          );
      }
    this.storage.sql.exec(
      "DELETE FROM artwork_leases WHERE NOT EXISTS (SELECT 1 FROM artwork_images i WHERE i.id=artwork_leases.image)",
    );
    // Deletion includes physical orphan reconciliation, not just SQL rows.
    // Keep the generation tombstone until every bounded R2 page succeeds.
    const deletion = this.rows(
      forceLibrary
        ? "SELECT d.* FROM artwork_deletion d WHERE d.library=? AND NOT EXISTS (SELECT 1 FROM artwork_images i WHERE i.library=d.library) LIMIT 1"
        : "SELECT d.* FROM artwork_deletion d WHERE d.retry<=? AND NOT EXISTS (SELECT 1 FROM artwork_images i WHERE i.library=d.library) ORDER BY d.retry,d.library LIMIT 1",
      forceLibrary ?? this.now(),
    )[0];
    if (deletion) {
      try {
        if (!this.bucket) throw Error("Private storage unavailable");
        const page = await this.bucket.list({
          prefix: "framebridge-artwork-v1/" + deletion.library + "/",
          limit: 20,
          ...(deletion.cursor ? { cursor: String(deletion.cursor) } : {}),
        });
        const owned = page.objects.filter((o) =>
          /^framebridge-artwork-v1\/[a-f0-9]{64}\/[a-f0-9]{32}$/.test(o.key),
        );
        if (owned.length) await this.bucket.delete(owned.map((o) => o.key));
        if (page.truncated)
          this.storage.sql.exec(
            "UPDATE artwork_deletion SET cursor=?,retry=?,attempts=0 WHERE library=?",
            page.cursor,
            this.now() + 60000,
            deletion.library,
          );
        else
          this.storage.transactionSync(() => {
            this.storage.sql.exec(
              "DELETE FROM artwork_folders WHERE library=?",
              deletion.library,
            );
            this.storage.sql.exec(
              "DELETE FROM artwork_libraries WHERE id=? AND state='deleting'",
              deletion.library,
            );
            this.storage.sql.exec(
              "DELETE FROM artwork_deletion WHERE library=?",
              deletion.library,
            );
          });
      } catch {
        failed = true;
        this.storage.sql.exec(
          "UPDATE artwork_deletion SET attempts=attempts+1,retry=? WHERE library=?",
          this.now() +
            Math.min(
              21600000,
              60000 * 2 ** Math.min(9, Number(deletion.attempts)),
            ),
          deletion.library,
        );
      }
    }
    // Reconcile our reserved namespace to remove an orphan after an interrupted
    // object write. Twenty keys per pass and a durable cursor bound R2 work.
    const gc = this.rows("SELECT * FROM artwork_gc WHERE id=1")[0];
    if (
      this.bucket &&
      !deletion &&
      (forceLibrary || Number(gc.retry) <= this.now())
    )
      try {
        const page = await this.bucket.list({
          prefix:
            "framebridge-artwork-v1/" +
            (forceLibrary ? forceLibrary + "/" : ""),
          limit: 20,
          ...(!forceLibrary && gc.cursor ? { cursor: String(gc.cursor) } : {}),
        });
        const orphans = page.objects.filter((o) => {
          const match =
            /^framebridge-artwork-v1\/([a-f0-9]{64})\/([a-f0-9]{32})$/.exec(
              o.key,
            );
          return (
            !!match &&
            !this.rows(
              "SELECT id FROM artwork_images WHERE id=? AND library=?",
              match[2],
              match[1],
            ).length
          );
        });
        if (orphans.length) await this.bucket.delete(orphans.map((o) => o.key));
        if (!forceLibrary)
          this.storage.sql.exec(
            "UPDATE artwork_gc SET cursor=?,retry=?,attempts=0 WHERE id=1",
            page.truncated ? page.cursor : "",
            this.now() + (page.truncated ? 60000 : DAY),
          );
      } catch {
        failed = true;
        if (!forceLibrary)
          this.storage.sql.exec(
            "UPDATE artwork_gc SET attempts=attempts+1,retry=? WHERE id=1",
            this.now() +
              Math.min(21600000, 60000 * 2 ** Math.min(9, Number(gc.attempts))),
          );
      }
    return { failed };
  }
  remaining(key: string) {
    const images = this.count(
      "SELECT COUNT(*) AS n FROM artwork_images WHERE library=?",
      key,
    );
    return (
      images ||
      this.count(
        "SELECT COUNT(*) AS n FROM artwork_libraries WHERE id=? AND state='deleting'",
        key,
      )
    );
  }
  nextCleanup() {
    const times = [
      ...this.rows(
        "SELECT expires FROM artwork_libraries WHERE state='active'",
      ),
      ...this.rows("SELECT expires FROM artwork_grants"),
      ...this.rows("SELECT expires FROM artwork_cancellations"),
      ...this.rows(
        "SELECT i.id,MAX(i.retry,COALESCE(w.expires,0)) AS expires FROM artwork_images i LEFT JOIN artwork_leases w ON w.image=i.id WHERE i.state IN ('pending','deleting')",
      ).map((r) => ({
        ...r,
        expires: this.uploads.has(String(r.id))
          ? Math.max(Number(r.expires), this.now() + 60000)
          : r.expires,
      })),
      ...this.rows(
        "SELECT retry AS expires FROM artwork_deletion d WHERE NOT EXISTS (SELECT 1 FROM artwork_images i WHERE i.library=d.library)",
      ),
    ]
      .map((r) => Number(r.expires))
      .filter(Number.isFinite);
    if (this.bucket)
      times.push(
        Number(this.rows("SELECT retry FROM artwork_gc WHERE id=1")[0].retry),
      );
    return times.length ? Math.min(...times) : undefined;
  }
}
