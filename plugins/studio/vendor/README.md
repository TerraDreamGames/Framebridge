# React Lua runtime

`react-lua-17.2.1.json.gz` contains the unmodified ModuleScript sources and hierarchy from the official production [JSdotLua React Lua v17.2.1 release](https://github.com/jsdotlua/react-lua/releases/tag/v17.2.1), asset `react-lua.rbxm`.

Upstream asset SHA-256: `bd2d1f9cc041ec22a962a7b64f48738ff1aed3f07755628f499ef95c9881d73f`.

Compressed source snapshot SHA-256: `72a6665e75719dc94e51738b883ec167db1f2227ab326102106dbdcbe31434c6`. The Studio builder verifies this hash. Updating the vendor requires reviewing its original sources, licenses and dependency notices again.

The binary model was deserialized with Lune 0.10.4 into records containing `name`, `className`, `source`, and `children`, then compressed with gzip. Empty child lists are normalized to arrays. No runtime source was rewritten. See [the upstream MIT license](../../../docs/licenses/React-Lua.txt) and [dependency notices](../../../docs/licenses/React-Lua-dependencies.txt). These include the MIT polyfills, original React copyrights and Apache-2.0 Roact-derived portions identified in the source headers.

`scripts/studio-tree.mjs` verifies and expands the snapshot at build time. `scripts/studio-project.mjs` preserves its sources and hierarchy in a Rojo project, built as native ModuleScripts that resolve their existing `script.Parent` / `WaitForChild` paths. The Studio installation is self-contained, with no runtime decompression, custom loader, downloads, asset requires, or dependency setup for users. React and ReactRoblox are the actual upstream implementations. `scripts/studio-bundle.mjs` is a test-fixture adapter only and is excluded from releases.
