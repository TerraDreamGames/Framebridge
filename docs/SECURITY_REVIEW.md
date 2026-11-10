# Security review — November 10, 2026

This review prepares the initial public source snapshot. It is an engineering review and a record of checks, not a guarantee that the project has no vulnerabilities. Results apply to the reviewed revision and dependency lockfile; later advisories and changes require new checks.

## Scope

- Figma controller/UI message sources, local credential storage, public build configuration and export boundaries.
- Cloudflare relay routing, receiver/sender capabilities, pairing attempts, expiry, quota admission and rechecks after asynchronous work.
- Roblox OAuth state and PKCE, exact callback routing, provider redirects, issuer/client binding, refresh/revocation, AES-256-GCM token storage and creator authorization.
- Image upload validation and credential scoping, private artwork grants/storage/integrity checks, consent-gated optional services and administrator-only aggregate operations data.
- Studio instance/property allowlists, bounded import structures, trusted bundled runtimes, explicit script opt-in and preservation of user scripts.
- Tracked source, Git history, built plugin archive, dependency advisories, redistributable licenses and CI permissions.

## Remediation

1. Updated Vite to 6.4.6, Vitest to 4.1.12, Wrangler to 4.160.0 and Miniflare to 5.20261110.0-beta, including Undici 7.30.1. Refreshed the lockfile and shipped dependency notices. The private design prototype was also updated and checked, but is not part of this public plugin repository.
2. Added an iterative transfer structure check before recursive feature validation. The relay rejects more than 15,000 nodes, nesting beyond 128 levels, malformed/cyclic child collections, unsupported/executable classes and script/control properties before storing the package. Studio's independent data-only importer remains the final import boundary. Added 18 regression tests, including real HTTP and workerd/SQLite checks that rejected content is not retained.
3. Made the CI dependency gate fail on advisories at every severity. Retained read-only CI repository permissions, SHA-pinned Actions and checksum-verified build/secret-scan tooling. No production credentials are needed by CI.
4. Published only a clean source snapshot with MIT and third-party notices. Runtime state, credentials, generated builds, design experiments, screenshots/evidence and the prior private development history are excluded. Maintainer commits use a GitHub noreply address.

## Local verification

- 127 TypeScript test files: 1,944 tests passed.
- Production Figma/Studio build, type checking, dependency notices and release-bundle validation passed: 465 bundled files, 29 examples, 50 local documentation links.
- Independent Rojo model readback: 381 script sources matched, all compiled; largest source 143,217 bytes. Pure Studio configuration/controller checks passed.
- Model export checks passed for 60 models and 1,314 instances, including independent XML/property validation.
- Worker and OAuth gateway dry-run builds passed.
- npm audit of the complete public dependency tree: zero known advisories on the review date; production-only audit also clean.
- Gitleaks 8.30.1 checks cover the source, complete publishable Git history and built plugin ZIP. No broad exclusions or public-history exemptions are used.

The GitHub Security tab records ongoing CodeQL, dependency and secret-scanning results. An unfinished or failed scan must not be interpreted as a clean result. Report new issues privately using [SECURITY.md](../SECURITY.md).

## Limits and operating assumptions

Capabilities are bearer credentials. Their secrecy, expiry and revocation matter; never attach tokens, pairing codes or private designs to public issues. Server-only secrets must be configured independently by each operator. Default service URLs, OAuth client identifiers and plugin IDs are public identifiers, not credentials.

This review uses isolated fixtures and mocked provider responses for adversarial cases. It is not a third-party penetration test of production, Figma, Roblox, Cloudflare or dependencies. Native cross-device behavior and moderation are separate from a source-security assessment. Optional AI review remains disabled by default. Luau is reviewed/tested separately because CodeQL does not analyze that language.

## Advisory references

- [Vitest mock registration](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)
- [Vite/launch-editor Windows command handling](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
- [Undici cross-origin redirects](https://github.com/advisories/GHSA-4w7w-5xrc-9h26)
