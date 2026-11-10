# Security policy

## Report privately

Email [security@terradream.games](mailto:security@terradream.games). Include the affected version, reproduction steps, impact and a minimal redacted example. Do not publish exploit details, design data, account tokens or credentials in issues. You can also use **Security → Report a vulnerability** on the [public repository](https://github.com/TerraDreamGames/Framebridge/security).

The current `main` branch and latest release receive security fixes. Older builds should be upgraded. This policy does not promise a response deadline or bounty.

## Security boundaries

Roblox OAuth client secrets and token-encryption keys belong only on the server. The Cloudflare service encrypts persisted Roblox provider tokens. Plugin builds contain public service configuration, never those server credentials. Pairing/session/account capabilities are bearer credentials: anyone who obtains one may exercise its scope until expiration or revocation. Keep them out of screenshots, logs and exported designs.

Public registration allows users to create their own connections. It does not grant access to another connection's designs, upload authorization or saved artwork. Optional invitation restrictions are deployment policy, separate from Roblox login and Studio sync. Transfer packages and importer properties are validated against bounded schemas and class/property allowlists.

Imported interactions run on the game client. A game's server must authorize rewards, purchases and gameplay actions; client attributes and generated UI are not an authority for these decisions. Custom scripts remain the game developer's responsibility.

AI review starts disabled and needs explicit server configuration and user consent. Operators are responsible for provider privacy, quotas, billing and retention. IP-derived hashes used for public quotas are pseudonymous, not guaranteed anonymous. Review deployment policy before collecting or retaining diagnostics.

The loopback Node helper is a development tool, not a production internet service. Its connection state is held in memory and is lost on restart. Use the Cloudflare deployment for persisted connected workflows.

## Maintainer checks

Run the automated tests, dependency audit, license check and secret scan before releasing. Test affected behavior in Figma and Studio as well. CI has read-only repository permissions and needs no production secrets. Never expose deployment credentials to pull requests or upload private diagnostics as CI artifacts.

The public repository uses a clean source history. Keep local credentials, diagnostics, design explorations and generated artifacts out of commits. Private vulnerability reporting, secret scanning, push protection and code scanning complement the local checks; none guarantees that a revision is free of vulnerabilities.
