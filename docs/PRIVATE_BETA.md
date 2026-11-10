# Private release operations

The default build and Worker now use public access. This guide applies only to a separately configured invitation-only deployment, with `ACCESS_MODE: private-beta` on its Worker and `FRAMEBRIDGE_PRIVATE_BETA=1` for its client builds. Use [public release setup](RELEASE.md) for the default service. The private deployment command refuses to deploy the public configuration.

Private releases use the same plugins with an invitation-protected service. Testers receive a plugin ZIP and their individual access code; they do not install Node.js.

## Maintainer commands

- `npm run beta:dry-run` validates the Worker build without deploying.
- `npm run beta:deploy` runs the guarded deployment workflow.
- `npm run beta:release` builds a private plugin archive against a verified matching deployment.
- `npm run beta:smoke` checks live pairing and transfer with an authorized invitation.
- `npm run beta:invite -- tester` creates an individual tester invitation.
- `npm run beta:revoke -- tester` revokes an invitation.

Use each command's supported arguments and local access setup. Keep generated invitation and capability files under ignored `.artifacts/`, and share them only with the intended tester.

## Installation and access

Follow [installation](INSTALL.md) with the private ZIP. Enter the access code in Studio before pairing. Image uploads without Studio pairing may also request the code in Figma.

Private release metadata records client/backend provenance. Changes to source inputs require rebuilding and verifying the matching release. A plain `npm run build` includes connected controls using `framebridge.config.json`, but does not attest a matching deployed release. Use `npm run beta:release` for that verification. `npm run build:offline` intentionally omits connected controls.

## Sign-in gateway

The OAuth gateway routes only `/oauth/roblox/*` on its configured domain. `/oauth/roblox/health` checks that scoped service. Configure its callback to match Roblox's registered redirect URI; preserve unrelated website routes. See [Roblox sign-in](ROBLOX_SIGN_IN.md).

Secrets stay in Cloudflare secret storage or ignored local environment files. Do not include access codes, tokens, credentials, live request journals or account-specific Figma file records in a repository or distribution archive.

No command in the source cleanup or ordinary build changes invitations, deploys the service or publishes a store listing.
