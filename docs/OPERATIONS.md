# Private activity dashboard

Framebridge includes an operator dashboard for Cloudflare traffic, recent Studio activity, retained pairings, daily service limits, upload jobs and storage. It runs on your computer and reads the existing production backend. It does not add a public page to the plugin or website.

Set `CLOUDFLARE_ACCOUNT_ID` to the account that owns your relay Worker. Run `npm run dashboard:setup` once to generate an owner-only token file under ignored `.artifacts/operations` and store its SHA-256 hash as the Worker secret `OPERATIONS_ADMIN_HASH`. Deploy the reviewed backend with the normal release workflow, then run `npm run dashboard`. Open <http://127.0.0.1:4319/>. Stop the terminal process to stop the dashboard. Use `npm run dashboard -- --port 4320` for another port. The Cloudflare API uses your existing Wrangler login; `npx wrangler login` renews it when needed.

For self-hosted deployments, use your own Worker configuration, service origin and account. The command accepts `--account`, `--origin` and `--token-file`; it never accepts a raw token argument. Repeating setup reuses the existing token rather than rotating it. Keep the token out of source control, screenshots and chat. Rotate by deliberately replacing the owner-only token file and repeating setup. Never expose the loopback server through a tunnel or bind it to the public network.

## Measurements

- Traffic: Cloudflare `workersInvocationsAdaptive`, scoped to the relay Worker and selected rolling period. Hourly bins can be partial. Cloudflare reporting may lag and use adaptive sampling. Runtime exceptions are not all HTTP error responses. Operator and health requests are included.
- Studio online: authenticated Studio activity within 90 seconds, persisted at most once every 30 seconds. This is a session count, not unique users or WebSockets. Presence starts when monitoring is enabled; pre-existing sessions appear when they next poll.
- Paired sessions: unexpired pairings. A saved pairing does not mean both apps are open. Upload-only sessions consume capacity but do not count as Studio online.
- Daily usage: existing Framebridge quota counters with a midnight UTC reset. Requests exclude the operator endpoint and health checks; transfers count reservations and uploads count attempted creates, including failures. These limits are not Cloudflare billing quotas.
- Upload results: retained jobs in unexpired sessions, grouped by state. They disappear when sessions are removed and are not lifetime totals.
- Storage: actual SQLite database size. Optional cloud artwork shows tracked object metadata, including pending uploads and cleanup. Use Cloudflare R2 for billable bucket storage and operations. Images uploaded to Roblox are stored by Roblox. Dashboard reads do not scan design payloads or list bucket objects.

The browser refreshes every 30 seconds while visible. Application snapshots are cached for 10 seconds, traffic for two minutes, and concurrent reads are coalesced. Closing the page stops its automatic requests. No extra traffic-event log, cron job, paid analytics service or R2 listing loop is added.

## Access and privacy

`GET /v1/operations` requires the separate operator bearer token and returns only aggregates. Ordinary Studio/Figma capabilities cannot read it. Unauthorized requests fail before waking the Durable Object. The endpoint stays readable when public service quotas are exhausted. Cloudflare credentials and the operator token stay in the local server; neither is sent to the browser. The server binds only to `127.0.0.1`, checks Host/Origin and fetch metadata, disallows cross-site reads, disables caching and framing, and serves only dashboard files.

Unavailable sources show an error and an unknown value, never a fabricated zero. Cloudflare API access requires permission to read the selected account's Worker analytics. R2 does not need additional credentials for tracked application metadata; Cloudflare's own R2 and billing pages use your dashboard login.
