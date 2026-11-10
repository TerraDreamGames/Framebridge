# Develop and export the Studio plugin

Framebridge ships one entry Script with separate ModuleScripts for the importer,
connection, editor, UI tools and React Lua. The release model contains readable
source and the actual instance hierarchy. It uses Roblox's native `require`.

## Build from this repository

Install Node.js 22 or newer and Aftman, then run:

```sh
npm ci
aftman install
npm run studio:build
```

`aftman.toml` pins Rojo and Lune. The build prepares the trusted runtime sources
and uses Rojo to produce `dist/studio/Framebridge.rbxmx`. It preserves Roblox
sign-in and Studio sync from `framebridge.config.json`. Use `ROJO_BIN` to select
an already-installed compatible Rojo executable when needed.

The complete `npm run build` also includes the Figma plugin, examples, guides and
licenses in `dist/Framebridge-plugins.zip`. Its `studio/` directory includes a
self-contained Rojo project and all source files used for that model.

## Sync into Studio

Open a blank development place and install the Rojo Studio plugin. Run:

```sh
npm run studio:serve
```

Connect Rojo in Studio to `localhost:34873`. The `serve.project.json` project puts
Framebridge under **ServerStorage** and preserves other place content. The plugin
Script stays out of the running game. Right-click the entire **Framebridge**
Script and choose **Save as Local Plugin** to test it through the Plugins ribbon.
Restart Studio when replacing an installed copy.

Edit hand-written modules in `plugins/studio/src/`; Rojo watches those files
directly. When changing `Plugin.server.luau`, shared runtimes or build settings,
run `npm run studio:prepare` again to refresh the generated sources. Generated
files live in `plugins/studio/generated/` and stay out of Git.

## Export the plugin model

After preparing the project, Rojo can export it directly:

```sh
rojo build plugins/studio/default.project.json --output dist/studio/Framebridge.rbxmx
```

The ZIP's `studio/default.project.json` can also be built on its own:

```sh
rojo build default.project.json --output Framebridge.rbxmx
```

For Studio's own export or publishing workflow, select the root **Framebridge**
Script together with its descendants. Export or publish that complete hierarchy;
copying only its Source leaves out its required ModuleScripts. End users can
install the finished model or Creator Store plugin without Node.js or Rojo.

## Verify the package

```sh
npm run test:studio:package
npm run test:studio
```

The package check independently reads Rojo's model, compares every instance and
Source with the shipped projects, and compiles every script. The importer and
connection tests use local fixture adapters that are excluded from releases.

React Lua's pinned snapshot is expanded at build time with its original module
names and sources. Runtime templates are readable source parts that reconstruct
the trusted generated game code exactly. The installation contains no runtime
decompression, custom module loader or remote dependency download. Required
copyright and license notices remain in the model and release archive.

See [installation](INSTALL.md) and [release setup](RELEASE.md).
