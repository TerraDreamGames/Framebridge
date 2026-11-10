# Self-hosting Framebridge

Self-hosting uses your Cloudflare account, Roblox OAuth app and Figma plugin listing. No production credentials are included in this repository. The default plugins connect to the configured Framebridge service; override their origin to use your deployment.

## Relay service

Install Node.js 22 or newer and run `npm ci`. Copy `wrangler.self-host.example.jsonc` to the ignored `wrangler.self-host.jsonc`. Choose a new Worker name. Run `npx wrangler login` for your account, then:

```sh
npx wrangler deploy --config wrangler.self-host.jsonc --dry-run
npx wrangler deploy --config wrangler.self-host.jsonc
```

This creates the Worker and its SQLite Durable Object. Record the returned HTTPS origin. Do not reuse another operator's account ID or Worker name. The checked-in production configs and `release:deploy` command are for the existing operator's deployment; forks should use their own config explicitly.

The public access mode supports Studio pairing and design transfers without an invitation. Request, session and daily upload ceilings bound service work; they do not guarantee zero cost at any scale. Review Cloudflare usage and quotas before raising them. AI review and optional R2 artwork storage stay disabled in this example.

## Roblox sign-in

Register your own OAuth app in [Roblox Creator Dashboard](https://create.roblox.com/docs/cloud/auth/oauth2-registration). Request only `openid`, `profile`, `asset:read` and `asset:write`. Add a callback accepted by Roblox. Local testing can use `http://localhost:8787/oauth/roblox/callback`; production needs an accepted HTTPS domain. Broad public sign-in requires Roblox's app review.

For a callback on your Cloudflare-managed domain, copy `wrangler.oauth-self-host.example.jsonc` to the ignored `wrangler.oauth-self-host.jsonc`. Replace the example domain, zone and relay origin. Scope the route to `/oauth/roblox/*` so the website's other pages remain with the website. The gateway and relay must use the same exact callback URI.

Store these on the **relay** with `npx wrangler secret put NAME --config wrangler.self-host.jsonc` (each command prompts for the value):

| Name | Value |
| --- | --- |
| `ROBLOX_OAUTH_CLIENT_ID` | Your OAuth app's client ID |
| `ROBLOX_OAUTH_CLIENT_SECRET` | Your app's confidential client secret |
| `ROBLOX_OAUTH_REDIRECT_URI` | Registered callback URI |
| `ROBLOX_OAUTH_SEALING_KEY` | A new 32-byte hexadecimal encryption key |
| `ROBLOX_OAUTH_GATEWAY_SECRET` | A separate new 32-byte hexadecimal gateway credential |

Create random keys in a password manager or with a cryptographic random generator. Never paste real values into issues, source files or shell command arguments. Keep a private recovery copy of the sealing key: replacing it invalidates decryption of saved accounts.

Store the **same gateway credential** as `ROBLOX_OAUTH_GATEWAY_SECRET` on the callback Worker, using `npx wrangler secret put ROBLOX_OAUTH_GATEWAY_SECRET --config wrangler.oauth-self-host.jsonc`. Deploy the gateway with `npx wrangler deploy --config wrangler.oauth-self-host.jsonc`. If the domain and relay belong to different accounts, explicitly select the correct account per command with `CLOUDFLARE_ACCOUNT_ID`.

For local Worker testing, copy `.dev.vars.example` to `.dev.vars`, fill only your development app's credentials and generated keys, and run `npx wrangler dev --config wrangler.self-host.jsonc --port 8787`. The ignored file is server-only and never belongs in a plugin package. The optional loopback Node helper (`npm run relay`) handles local transfer development; it does not provide persisted production OAuth storage.

## Build your plugins

Use your relay origin and your Figma-assigned plugin ID:

```sh
FRAMEBRIDGE_RELAY_URL=https://your-relay.your-subdomain.workers.dev FIGMA_PLUGIN_ID=your_assigned_id npm run check
npm run check:secrets
```

On Windows, set those environment variables through PowerShell before running `npm run check`. The build embeds the same public origin in both plugins and Figma's network allowlist. Build scripts do not automatically load `.env`; `.env.example` lists public settings for reference. Keep `FRAMEBRIDGE_PRIVATE_BETA=0` for public access.

Install `dist/figma/manifest.json` and `dist/studio/Framebridge.rbxmx`, or distribute `dist/Framebridge-plugins.zip`. End users need no Node.js. Validate pairing, repeated transfers, reconnecting and personal/group upload permissions against your deployment. `/health` confirms the relay responds; `/v1/roblox/config` confirms sign-in configuration is available, without returning client secrets.

Keep each deployed relay's Worker name, Durable Object identity, migration history and sealing key stable across updates. Back up operator credentials privately. Use [SECURITY](../SECURITY.md) and [third-party notices](../THIRD_PARTY_NOTICES.md) when preparing releases; optional integration setup remains in the corresponding user guides.
