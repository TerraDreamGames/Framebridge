# Large image batches

Framebridge supports up to 1,000 unique rendered PNGs and 10,000 image references in one design. Repeated, byte-identical PNGs share an upload. Frames, text and layout instances remain native where supported.

## Using batches

1. Analyze a selection. In Images, search by layer or filename and browse 40 images at a time.
2. Select the correct Roblox creator and upload. Progress reports unique uploads separately from linked references. At most two uploads run together.
3. Keep completed links when an upload stops. Retry in the same session to check accepted jobs; saved, confirmed links can be reused in another session for the same creator. Manual assignments take precedence.
4. Export or send once the images have Roblox IDs. Roblox moderation and experience permissions still determine whether the artwork displays.

Saved images retain up to 1,000 reference entries within a 2 MB storage budget. Optional thumbnails yield to reference metadata. Search, target selection, library cards and expanded matching-layer lists use bounded pages. Forgetting a saved entry removes the local reference, not the Roblox asset. The library stores no API keys or full PNGs.

The local ZIP fallback includes each unlinked PNG and the matching JSON manifest. Extract the ZIP and supply image IDs in Studio. Sending through the relay requires linked artwork.

## Bounds and hosting allowances

- Each PNG is limited to 20 MB and must satisfy existing PNG/dimension validation. Unique encoded analysis artwork is limited to 64 MiB; this is a payload budget, not a total JavaScript heap limit.
- Transient and retained render caches are bounded separately. Source previews have a 1,000px longest edge and a combined 16 MiB encoded budget. Oversized previews are omitted with a warning; export artwork remains available.
- Relay sessions allow at most 1,000 unique jobs and two active uploads. Cached retries reuse their job without consuming another upload allowance. Studio checks the limits for both package links and manually supplied bindings.
- Hosted daily allowances are separate. The private backend defaults remain **40 new uploads per tester/day and 200 globally/day**, resetting at 00:00 UTC. A 1,000-image design does not grant a 1,000-upload daily allowance. `DAILY_UPLOADS_PER_TESTER` is an optional operator override; raising it also requires planning the global allowance and service costs. No live quota was changed by this implementation.
- Quota failures retain confirmed progress and identify the actual allowance/reset time. Failed or uncertain accepted jobs remain in their session; check their status before creating another session to retry them.

Existing Cloudflare jobs are migrated transactionally into indexed state/creation columns and a per-session counter. Upload admission reads bounded records rather than decoding every stored job. Tester/global daily reservations and job creation occur in one transaction, so a denied tester does not consume another tester's global allowance.
