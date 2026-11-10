# Private design codes

Design codes store an immutable, temporary snapshot independently of live pairing. The sender and recipient use the same configured Framebridge backend. The deployed private backend requires an active tester invitation; sharing a code does not make the design public or grant access to Roblox artwork.

## Share from Figma

Analyze the intended selection, then open **More options → Connection & export → Share a design code**. Enter the tester access code for the HTTPS backend, choose **1 hour** or **24 hours**, and click **Create design code**. The regular upload pipeline links missing artwork and reuses saved images. Native-only or fully linked designs need no Roblox API key for this step.

Copy the `FB-XXXXXX-XXXXXX-XXXXXX-XXXXXX` code to the intended tester. Each code has its own visible countdown and local expiry time. Creating another code does not renew an earlier snapshot. Later Figma changes require a new code; existing codes continue to represent their original design.

**Check status** retrieves the snapshot's opened/awaiting, imported and failed attempts. It does not continuously poll. **Revoke code** removes the server snapshot and its receipts. Revocation or expiry prevents future opens; it cannot remove a design that someone has already loaded or imported.

The plugin saves the management capability to device-local storage before requesting creation. If the response is lost, reopen the panel and use Check status to recover the code. A pending attempt stays saved until its outcome is checked; a confirmed expired record is pruned. This avoids discarding management access when uploads take longer than expected. Storage failures are visible and never silently overwrite unread records. Management records contain the backend origin, name, capability, expiry and optional code, not the design or PNGs. Local storage is not encrypted by Framebridge.

## Open in Studio

Under **Import → Import a design code**, enter the code and your tester access code, then choose **Open design code**. It loads the snapshot for review in **New copy** mode. Review sizing and image permissions, then click Import. Live auto-import does not automatically apply a code, and opening one does not replace or clear live pairing.

Every successful open receives a separate receipt capability. A transport retry reuses that attempt instead of consuming another open. The plugin reports ready after validating the package and imported only after the native importer succeeds. Selection utilities do not confirm imports. Replacing an unimported snapshot reports its cancelled attempt as failed; closing the plugin attempts to send the same status. Failed receipts retry while the plugin stays open, with a bounded in-memory queue. They are not persisted across a Studio restart, so a process crash can leave an attempt awaiting import until expiry.

A locally loaded snapshot remains usable after code expiry. Repeated opens can import new copies; repeated local imports of an already loaded design do not require another network open. Roblox asset ownership, experience permissions and moderation remain separate from code access.

## Bounded private-beta storage

Cloudflare persists snapshots and receipts in the existing SQLite Durable Object. It stores hashes of design, management and receipt capabilities. Session disconnect/expiry does not delete an independent handoff. Creator invitation revocation invalidates their codes; recipient invitation revocation blocks further opens and receipts for that recipient.

The current handoff limits are 20 active codes globally, four per tester, 8 MB JSON per snapshot, 64 MB aggregate snapshot JSON, and 50 distinct opens per code. There are also 50 creations globally / 20 per tester per UTC day, and 1,000 opens globally / 200 per tester per day. New snapshots consume the existing transfer budget too. Idempotent creation/open retries do not consume another creation/open allocation. The existing overall request and image-upload quotas still apply.

Expired and revoked snapshots, chunks and claims are removed. Hashed retired management attempts remain for 24 hours to reject delayed recreation retries; a later recreation uses a fresh identity so the old design code cannot become valid again. Snapshot text is chunked without splitting UTF-16 surrogate pairs before SQLite encoding, preserving emoji and other Unicode across restarts. The same chunk fix applies to live transfers.

The loopback Node helper stores codes in process memory and loses them on restart. Durable restart persistence applies to Cloudflare, not the local helper. These limits bound the beta; they are not a promise of unlimited free service or a hard billing cap.
