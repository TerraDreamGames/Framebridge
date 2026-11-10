# Voluntary issue reports

Open **More options → Report an issue**. Add a summary and describe what happened. Review the report before exporting JSON locally or sending it privately. If file downloads are unavailable, **Copy report JSON** provides the same reviewed payload, with a selectable-text fallback when clipboard access fails.

No report is sent when you open this window, analyze a design or use the plugin normally. Availability is checked only while this window is open; there is no background report polling.

Layout details are optional and unchecked by default. The snapshot uses anonymous tree paths, Roblox class names, geometry, conversion options, counts and issue codes. It excludes layer names, text contents, original/document/source IDs, image links, fonts, scripts, behavior bindings and conversion issue messages. The snapshot is bounded to 300 instances and 100 issues and says when truncated. It represents the last analyzed export, not a live recording.

A screenshot is optional and manually selected. Use a cropped PNG of at most 512 KiB and 4,194,304 pixels. PNG metadata, including text, EXIF and color profiles, is removed; the sanitized image is shown for review. Color-profile removal can change its displayed colors. Screenshot pixels are not OCR-redacted: remove private information before selecting the file. The payload includes pixels and dimensions, not the file name or path.

Recognized credential patterns and currently known device credentials are removed from notes before review. Unknown secrets, names and private URLs cannot be reliably detected, so review notes and pixels carefully. The review checkbox is required for export and private submission. The local account-library build offers local export only; it contains no authenticated report controls or network code.

## Delivery and withdrawal

Private submission requires an active tester invitation and an enabled collector. The plugin saves an origin-bound random report capability and the reviewed snapshot in device-local storage before sending. A pending report remains there after timeouts or closing. **Check status** recovers the delivery receipt; **Review pending report** lets you inspect it and **Retry same report** sends the same attempt, without creating a duplicate. A pending attempt must be resolved or withdrawn before creating another. There are at most five saved reports on a device across service origins.

Pending device snapshots expire two weeks after the latest explicit send attempt, with a minute of grace for bounded request deadlines. Retrying saves the same capability with a refreshed recovery window before sending; the confirmed server receipt replaces that provisional expiry.

After confirmation, the device keeps only receipt metadata and its private capability; it removes the saved report content. A receipt confirms delivery, not review or a promised fix. Its capability stays in device storage and never enters exported JSON, screenshots, document data or release files. Device storage is not encrypted by Framebridge.

**Withdraw → Confirm withdrawal** removes notes and screenshot from the active service record and clears the device record after confirmation. Pending cancellation requires the tester invitation and prevents a delayed submission from recreating the attempt while its cancellation hash is retained. Failed withdrawals preserve the saved handle for retry. A withdrawn received attempt cannot be reused until its original receipt expiry; cancellation of an unknown pending attempt keeps its hash for 14 days after cancellation. Expired attempts must be replaced with a new report. Withdrawal cannot retract local exports or copies a maintainer has already downloaded.

Reports expire 14 days after receipt. Revoking a tester invitation causes their stored reports to be removed during cleanup or the next report operation. Storage is private Durable Object SQLite; payloads are not additionally encrypted by this application. Raw report capabilities are never persisted on the service: only hashes, invitation hashes, bounded metadata and the reviewed report are stored. After withdrawal only a capability hash and its expiry remain until cleanup. Request logging remains disabled.

The collector permits at most five new attempts per invitation/day and 30 globally/day, including cancellation of unknown pending attempts. Confirmed duplicate retries do not consume another report quota. Active storage is capped at ten reports per invitation, 100 globally and 16 MB of report JSON. Each report is limited to 800,000 UTF-8 bytes. Report operations also use the existing global request budget. These limits bound application storage; they do not guarantee zero hosting cost or a hard billing cap.

## Private operator setup

Collection is disabled by default. To enable it in a future authorized private backend release, generate a separate 32-byte random capability into an owner-only file, then configure its SHA-256 hash as the Worker secret `FEEDBACK_ADMIN_HASH`. Do not use a tester invitation, Roblox key, OAuth secret or connection capability. Store the raw capability securely outside Git and release bundles. No new Durable Object namespace is required. The local Node helper intentionally has no collector; local report export still works.

This source change has not enabled or deployed collection on the production beta. Follow the existing private release workflow when deployment is authorized, build a matching connected plugin, and verify the availability, delivery receipt and withdrawal in Figma before inviting testers to submit reports.

```sh
npm run beta:reports -- list --token-file /private/path/report-operator.txt
npm run beta:reports -- get --token-file /private/path/report-operator.txt --id REPORT_UUID --out /private/path/report.json
```

List pages contain at most twenty receipt summaries; use `--page 0` through `5`. Full reports must be saved with `--out`; files are created owner-only and existing files are never overwritten. Treat downloaded notes and screenshots as private. Only the separate operator capability can list or read all reports; a tester's capability reads or withdraws its own report.
