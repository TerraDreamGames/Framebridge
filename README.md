# Framebridge

Source: [TerraDreamGames/Framebridge](https://github.com/TerraDreamGames/Framebridge) · [Security reports](SECURITY.md)

Turn Figma designs into editable Roblox UI. Framebridge pairs a Figma plugin with a Roblox Studio plugin to analyze designs, prepare artwork and import interfaces into Studio.

## Features

- Editable frames, text, images, scrolling frames and native layout modifiers.
- Responsive size and position, reference screen sizes, list/grid layouts and UI constraints.
- Compact layer hierarchy, searchable properties, resizable sidebars and dark/light appearance.
- Source and Roblox previews with device sizes and interactive UI testing.
- Automatic image uploads, personal/group ownership, saved image reuse, transparent-edge cleanup and nine-slice artwork.
- Connected transfers, delivery receipts, optional sync and updates that preserve custom scripts.
- Optional interactions, theme tokens, motion, advanced controls and world-space UI.
- JSON/PNG packages, Roblox models and source modules for React Lua, Fusion, roblox-ts or vanilla Luau.

## Use the plugins

1. Select your UI frame in Figma and **Analyze** it.
2. Review Layers, Properties and the Roblox preview. Set the design screen size when the selected frame is a panel within a larger screen.
3. Open Framebridge in Studio and **Connect to Figma**. Enter its pairing code in Figma's **Connect Studio** panel.
4. Connect your Roblox account or configure image uploads when the design contains unlinked artwork.
5. **Send to Studio**, review the import and apply it to `StarterGui`. Continue editing with Studio's Explorer and Properties.

You can also download a package in Figma and use **Open package** in Studio. End users do not need Node.js. Development builds require local plugin installation; store publication is a separate step.

See [installation](docs/INSTALL.md), [the feature tour](docs/ONBOARDING.md), [the editor guide](docs/EDITOR.md) and [image preparation](docs/IMAGE_TOOLS.md).

## Develop

Use Node.js 22.12 or newer and install the pinned Rojo/Lune tools with Aftman:

```sh
npm ci
aftman install
npm run check
```

Build outputs:

- `dist/figma/manifest.json` — Figma development plugin entrypoint.
- `dist/studio/Framebridge.rbxmx` — Studio plugin model.
- `dist/studio/default.project.json` — self-contained Rojo project with readable module sources.
- `dist/Framebridge-plugins.zip` — plugins, examples, user guides and required notices.

The default build includes Roblox sign-in, Studio pairing and sync using `framebridge.config.json`, with no tester access code required. This file contains the service origin and access mode, never credentials. Use `npm run build:offline` only for an export-only package, or override `FRAMEBRIDGE_RELAY_URL` for another configured service. See [release setup](docs/RELEASE.md).

`npm run studio:build` exports the modular Studio model. `npm run studio:serve` syncs the plugin into a blank Studio place through Rojo. See [Studio development](docs/STUDIO_DEVELOPMENT.md) for project files and export instructions.

`npm run dev` runs a sample editor preview. `npm run test:studio` checks the Luau importer, controls and packaged module hierarchy with Lune. `npm run test:models` validates model exports. `npm run fixtures` generates native test programs under the ignored `.artifacts/` directory.

```text
packages/core/       Design model, conversion, geometry and exports
plugins/figma/       Figma adapter and editor
plugins/studio/      Studio importer and UI tools
packages/relay/      Transfer and upload service
examples/            Example interfaces and integration scripts
scripts/             Build and development utilities
tests/               Automated and native test fixtures
docs/                User guides and maintainer setup
```

See [architecture](docs/ARCHITECTURE.md) for conversion and ownership rules, [contributing](CONTRIBUTING.md) for checks and [self-hosting](docs/SELF_HOSTING.md) to deploy your own backend. Report vulnerabilities privately using [SECURITY](SECURITY.md).

Backend maintainers can use the [private activity dashboard](docs/OPERATIONS.md) to monitor Cloudflare traffic, recent Studio connections, uploads, storage and service limits.

## Conversion limits

Complex vectors and unsupported effects use image fallback. Native fonts, line breaks, texture sampling and safe areas can differ from Figma; review the result in Studio and the target experience. Responsive output follows authored layouts and constraints rather than inventing a new layout.

Gameplay logic and arbitrary prototype behavior are supplied by your game. Optional generated interactions use bounded configuration. Imported updates preserve custom descendants and scripts and reject unsafe changes to protected content.

Image visibility depends on Roblox moderation and owner permissions. Connected features require a configured service; optional cloud artwork and AI review require separate server configuration. AI review starts disabled.

## Third-party notices

Framebridge is open source under the [MIT license](LICENSE). Bundled dependencies retain their own licenses in [third-party notices](THIRD_PARTY_NOTICES.md). Required notices also ship with the plugin archive. Framebridge is an independent plugin; these resources do not imply affiliation with Figma or Roblox.

The [website demo workflow](docs/WEBSITE_DEMO.md) builds interactive examples from
these React components and captures matching light/dark documentation screenshots.
