# Release setup

Build and distribute matching Figma and Studio plugins. Building an archive does not publish either plugin or change service access.

## Connected builds

Use Node.js 22 or newer, Aftman, an assigned Figma plugin ID and your HTTPS transfer origin:

```sh
npm ci
aftman install
FRAMEBRIDGE_RELAY_URL=https://your-service.example FIGMA_PLUGIN_ID=your_assigned_id npm run check
```

The default `npm run build` reads `framebridge.config.json` and includes Roblox sign-in, Studio pairing and automatic sync. The same origin is embedded in both plugins and Figma's network allowlist. Environment settings override the checked-in configuration. `npm run build:offline` explicitly produces an export-only package; `npm run build:local` uses the loopback helper. `npm run dev` uses the same configured origin for its editor preview.

The installation archive is `dist/Framebridge-plugins.zip`. It contains plugins, examples, user guides and required third-party notices. Studio ships as a Rojo-built Script/ModuleScript hierarchy, with its project and individual source files included. Select the complete root Script when exporting or publishing; the old single-file loader is no longer distributed. See [Studio development](STUDIO_DEVELOPMENT.md). Development journals, account-specific setup and design explorations are excluded.

## Hosting

The Cloudflare Worker uses durable SQLite state for sessions, receipts, upload jobs and quotas. The default configuration uses `ACCESS_MODE: public` and the plugins use `privateBeta: false`. Public users can pair Studio, sign in with Roblox, upload and share design codes without invitations. Keep OAuth credentials, encryption keys and the feedback administrator credential in Cloudflare secret storage.

Deploy reviewed, committed source to the existing relay account:

```sh
CLOUDFLARE_ACCOUNT_ID=your_relay_account_id npm run release:deploy
```

The command runs the checks, updates the configured Worker without replacing secrets or stored connections, verifies public HTTPS transfers and Roblox login availability, and creates `.artifacts/public-release/Framebridge-public-release.zip`. `npm run release:package` rebuilds only against a matching deployed backend; `npm run release:smoke` checks the live service without invitations. Release metadata identifies the client source and deployed Worker revision.

The legacy Worker hostname and room identity are retained so existing connections, OAuth accounts and design codes survive the upgrade. Old invitation secrets are retained only to validate already-issued capabilities; new users never need them. Invitation-only deployments remain an optional operator configuration described in `docs/PRIVATE_BETA.md`.

Public access retains connection/account capabilities, owner permissions, PKCE, token encryption and expiry. Anonymous usage is limited by a hash of the client address supplied by Cloudflare. The configured service budgets are 25,000 requests, 1,000 transfers and 2,000 image uploads per UTC day, with 500 uploads per client per day, 200 concurrent transfer/upload sessions and 1,000 saved Roblox accounts. These are service ceilings, not a promise of unlimited capacity or cost; review usage before raising them.

For local development, `npm run build:local` targets the loopback Node relay. A self-hosted Node deployment requires HTTPS, one persistent process, request limits and appropriate access controls. In-memory sessions expire on process restart. Never log credentials, authorization headers or upload request bodies.

Optional AI review is disabled unless explicitly configured with a server-only provider key and budgets. Cloud artwork and report collection also require server configuration.

## Distribution

Import the built manifest in Figma desktop for development. Publish through your Figma developer account when the release is ready. Install or distribute the matching Studio model through Roblox's plugin workflow. Users of packaged plugins do not need Node.js.

The source manifest includes Framebridge's assigned Figma plugin ID. Publish it through the Figma account that registered it. A fork or a separately owned listing needs its own Figma-assigned ID, supplied with `FIGMA_PLUGIN_ID` for that publication build. The manifest explains its HTTPS network access.

Roblox OAuth publication is separate from publishing the Studio plugin. A private OAuth app is limited to 10 unique users. Public authorization requires Roblox's review, including the app description, icon, HTTPS entry/privacy/terms URLs, a scope justification and a demo video of the complete sign-in flow. See [Roblox app registration](https://create.roblox.com/docs/cloud/auth/oauth2-registration). Required scopes are `openid`, `profile`, `asset:read` and `asset:write`; no additional scopes are needed for public access.

Before publishing, verify repeated import/update, reconnect, Play queues, cancellation, Undo/Redo, scrolling, responsive sizes, transparent artwork and owner permissions in the target experience. Keep store visibility and backend access policy under explicit release control.

## Credentials

API keys and creator settings are device-local. They never enter document data or exported designs. Clearing a key does not cancel an upload already accepted by Roblox. OAuth provider tokens remain on the backend; disconnect revokes the plugin's account capability.

Keep `.env`, `.dev.vars`, `.wrangler`, generated bundles, invitation files and QA artifacts out of source uploads. Required notices in `docs/licenses` must remain with redistributed dependencies and assets.
