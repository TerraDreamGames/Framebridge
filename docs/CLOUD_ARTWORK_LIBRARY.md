# Private cloud artwork

Images → **Optional private cloud artwork** stores explicitly reviewed PNG files, image names and folders for reuse across devices. Local saved Roblox image links remain separate. Importing cloud artwork creates a new Figma image rectangle; it does not assign a Roblox asset ID. Review/export or upload that layer through the normal owner-authorized artwork workflow.

Cloud storage defaults to disabled. Local PNG import, image-link reuse and offline export remain available without an account or R2. Users do not need Node to use the plugin.

## Review and reuse

1. Sign in through Images → Roblox sign-in. Choose Personal or a listed shared Roblox group and explicitly consent to private PNG/name storage. Roblox groups are separate from Figma teams.
2. Create a folder, then choose/drop a PNG. Inspect its local canonical preview and name before **Save reviewed PNG privately**. No file bytes are transmitted while choosing or previewing the local file.
3. Search by image/folder name, filter folders, rename or move files. Exact identical canonical PNGs reuse one stored item, retaining its existing name/folder.
4. Another authorized installation connects to the same scope and invitation partition, fetches metadata, then explicitly previews, downloads or imports a file. Drag a cloud item to the review drop zone to fetch/validate it before import. Thumbnails are fetched on demand to control requests.
5. A cloud version conflict retains the local view/edit fields and blocks mutations until **Fetch artwork** returns the current version. Review it before editing again.

Local and cloud PNG import both validate the actual bytes. Files are limited to 512 KiB, 1024 px per edge and 1,048,576 pixels. Static PNG only: checksum, chunk ordering, pixel/decompression bounds, palette/transparency and decoded samples are checked. Ancillary metadata, including text, EXIF and color profiles, is stripped; pixel samples and alpha remain. Review the resulting appearance. Native Figma import appends one image-filled rectangle at the viewport center, selects it and commits one Undo boundary. Failed insertion removes only the newly created rectangle and restores selection.

## Ownership, permissions and recovery

The server derives personal user IDs from its Roblox OAuth record; group ownership requires a fresh provider creator-resource grant. Artwork operations also verify fresh provider userinfo against the account identity. Every private request checks the account capability, active private invitation and scoped artwork grant. Metadata mutations authenticate after the bounded body is read; reads/writes recheck after asynchronous provider/storage work. The shared OAuth account-removal callback immediately revokes artwork/review grants and cancels owned AI work before provider revocation awaits. It covers sign-out, acknowledged replacement and ready-but-unacknowledged login cancellation; retained accounts keep their own grants. PNG responses contain bytes only, with no public/signed object URLs or embedded credentials.

Scopes are partitioned by server invitation + owner kind/ID. Two invitations do not implicitly share artwork, even for the same Roblox user/group. Connections are private capabilities bound to one account session; stored local access is bound to service origin and user. The proposed capability is persisted before connect so a lost response can recover the same grant rather than mint another. Cancel uses the captured original account token and a bounded server cancellation record to stop late admission. Serialized local storage reconciliation prevents a cancelled old account from clearing a newer account's connection. Automatic restore resumes only a previously consented pending connect; it never sends a PNG automatically.

**Revoke this artwork connection** removes this installation's grant. **Forget** removes its local access record when service/auth recovery is unavailable; it cannot promise remote revocation. OAuth disconnect clears every grant for that account session. Cloud image/library deletion requires an explicit named confirmation. Deleting a shared group library revokes all connections to that scope, and does not delete already imported/downloaded copies. Empty folders alone can be deleted.

Cancelled/sent edits or uploads can already have committed. Their late UI results are ignored; fetch before retrying. New PNG writes reserve storage before awaiting R2 and schedule durable recovery immediately. A ten-minute durable write lease protects an interrupted operation across process loss. Failed writes/deletes remain reserved until physical cleanup confirms success. Retry cleanup while connected; after library deletion, retry connecting to advance cleanup. A deleting library retains its generation tombstone and bounded namespace-scan cursor until all object pages succeed, including orphan bytes; replacement generations are blocked while that physical cleanup is pending. A pending-cleanup indicator describes outstanding work, not an exact count of untracked orphan objects.

## Limits and backend opt-in

| Boundary                  | Default                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| Per scope                 | 100 images, 16 MiB, 20 folders                                    |
| Per invitation            | 200 images, 32 MiB, 20 scopes                                     |
| Entire beta room          | 500 images, 64 MiB, 100 folders, 50 scopes                        |
| Grants                    | 200 total, 8 per account session, 90-day lifetime                 |
| Recent cancellations      | 200 total, 32 per account, ten-minute expiry                      |
| New PNG saves per UTC day | 10/account, 20/scope, 50/beta room                                |
| Downloads per UTC day     | 100/account; preview/import also download                         |
| Artwork requests          | 120/account/hour; existing global relay daily budget also applies |
| Explicit cleanup          | 10/account/day                                                    |
| Retention                 | 180 days after the latest successful upload/metadata edit         |

Pending/deleting reservations count against item/byte quotas; live files are never evicted to admit new uploads. Upload counters and reservations are transactional. Global orphan reconciliation scans only this feature's generated reserved namespace, 20 keys/pass, with a durable cursor; scans run daily and continue truncated pages after a minute. Failed cleanup backs off from one minute to six hours. Overdue active-write alarms are scheduled in the future to avoid immediate loops. Physical bytes can temporarily outlive logical metadata during interrupted remote I/O; these are bounded admission/recovery controls, not a billing guarantee or physical bucket hard cap. Review R2/Worker traffic and billing before increasing limits.

The checked-in Wrangler config deliberately has no artwork bucket or enable flag. An operator may opt in with an **existing private R2 bucket** and the current private OAuth/invitation backend:

```jsonc
// Merge deliberately into an operator-owned configuration; this is not provisioning.
"vars": { /* existing vars */ "ARTWORK_ENABLED": "1" },
"r2_buckets": [{ "binding": "ARTWORK_BUCKET", "bucket_name": "YOUR_EXISTING_PRIVATE_BUCKET" }]
```

The bucket must have public access disabled. Reserve `framebridge-artwork-v1/` for generated objects; do not put unrelated files there. No bucket is created by this source change. Setting the flag without the binding stays disabled. Removing only the flag stops file access/uploads while retaining cleanup against a still-bound bucket. Removing the binding prevents physical deletion; durable tombstones retain reservations until it returns. OAuth secrets/provider tokens remain in backend configuration/encrypted OAuth records; metadata tables store capability/account hashes and reviewed file metadata only. Existing beta invitation limits are unchanged.
