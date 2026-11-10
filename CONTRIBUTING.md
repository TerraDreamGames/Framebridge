# Contributing

Use Node.js 22.12 or newer and Aftman for the pinned Rojo/Lune tools. A fresh checkout needs no production credentials:

```sh
npm ci
aftman install
npm run check
npm run dev
```

The browser preview uses a sample design. Build outputs and installation instructions are in [README](README.md) and [INSTALL](docs/INSTALL.md). The default build retains Roblox sign-in and Studio sync through the configured Framebridge service. Use `npm run build:offline` for a package without connected features, or follow [self-hosting](docs/SELF_HOSTING.md) for your own service and OAuth app.

The TypeScript tests use fixtures and mock providers, without making real uploads. Run `npm run test:studio:package`, `npm run test:studio` and `npm run test:models` for importer and model changes. See [Studio development](docs/STUDIO_DEVELOPMENT.md) for Rojo sync and export. Changes affecting Figma or Studio behavior also need testing in the actual application; a browser preview cannot verify native behavior or Roblox moderation.

Keep pull requests focused. Describe the problem, resulting behavior and validation. Include a meaningful regression test for behavior or security changes. Check UI changes in both themes and at narrow panel widths. Preserve Roblox sign-in, Studio pairing, saved connections and user-authored scripts unless a change explicitly requires different behavior.

Only contribute assets you created or can redistribute under a compatible license. Keep attribution and full notices. After changing runtime dependencies, run `npm run licenses:update` and commit the updated notices and lockfile.

Before preparing a release, run:

```sh
npm run check
npm audit --audit-level=low
npm run check:secrets
```

The secret check scans Git history and the built plugin ZIP using a pinned, checksum-verified Gitleaks binary. It downloads the tool on first use; an existing binary can be supplied with `GITLEAKS_BIN`. Only a reviewed, exact historical false positive is exempted. Never add broad secret-scan exclusions.

Do not commit `.env`, `.dev.vars`, tokens, tester invitations, private design files, account-specific screenshots or raw production diagnostics. Example environment files contain placeholders only. Public service origins, plugin IDs and OAuth client IDs are identifiers; client secrets and capability tokens are credentials. Report vulnerabilities privately using [SECURITY](SECURITY.md).

Contributions are provided under the project's MIT license. Forks should configure their own Figma plugin ID and server credentials rather than borrowing the operator's OAuth app.
