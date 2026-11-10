# Saved images and recent imports

Framebridge now keeps a small local image library in Figma and a recent-import list in Studio. These are independent of pairing tokens and do not create a public account or publish designs.

## Reuse uploaded images

Successful uploads save the Roblox image ID, creator type/ID, SHA-256 of the prepared PNG, moderation status, dimensions, name and optional 48px thumbnail. The library holds at most 200 unique owner/image entries and conservatively stays below 750 KB. It contains no API keys, access codes, full-resolution PNGs or remote image URLs.

Upload all and Send to Studio look for an identical PNG under the selected Roblox owner before creating an asset. Reopening the plugin or receiving a new helper/pairing session does not discard these records. A different owner, white-mask/edge-cleanup variant, or changed PNG uses a different entry. Explicit image links remain authoritative. Exact bytes are required: visually identical PNGs with different encodings may upload separately.

Open **Images → Saved images** to search the gallery, choose an image layer and assign a saved reference. You can also drag a library card onto an image row. **Show use** selects the corresponding layer in the Roblox preview; **Show matching layer** locates identical, currently unlinked artwork. Choose/drop a PNG to filter the library to an exact content match before assigning. Owner labels remain visible; manual assignment does not grant experience permissions. Forget/clear removes local library references without deleting Roblox assets or clearing current design links.

A remembered moderation approval is historical; moderation, permissions, asset deletion and Roblox processing remain outside Framebridge. Storage failures are reported without blocking completed uploads. Read failures do not overwrite unread library data. The library can be retried; keys never enter it or exported packages.

## Reopen an import in Studio

**Import → Recent imports** saves successful imports only, up to 12 entries and 2 MB in local plugin settings. Individual snapshots over 600 KB are skipped with a message; keep the exported package for large designs. Entries contain authored geometry, effective image links and validated import sizing/legacy overrides. Reimporting the same export refreshes one entry; a different exported revision gets its own entry.

Reopening an entry validates the package, cancels a queued received design, restores that entry's configuration and opens it for review. It starts in **New copy** mode. Choose **Update existing** explicitly when appropriate. Reopening does not import, touch the place, change auto-import preferences or resume a historical transfer. Normal missing-image, play-test, staging, update-preservation and Undo safeguards remain in place. Clearing history only removes local references.

## Match artwork inserted through Asset Manager

In **Image links → Inserted image gallery**, choose **Scan inserted images** after inserting uploaded artwork. The scan reads image references in ServerStorage, ReplicatedStorage and Workspace, bounded to 10,000 instances and 200 distinct image IDs. It does not upload or modify objects.

Only absent links with one exact source/asset identity or exported filename candidate are filled. Conflicting candidates require a manual choice. Existing links and deliberately cleared rows are retained. Identity/name matching is a heuristic, not proof of matching pixels or ownership; review the thumbnails when reusing artwork from an older export.

Select an image row's name, then click **Assign** on a gallery entry, or drag its thumbnail onto the target row. Entering a Roblox ID remains available. **Locate** selects imported instances with the current package's source and asset identities in native Explorer, excluding unrelated screens.
