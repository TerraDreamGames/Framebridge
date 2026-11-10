# Website demo and screenshots

The website embeds a separate static build of the plugin's real React controls.
It uses the local InventoryUI sample, without Figma messaging, Roblox accounts,
transfer tokens, uploads, telemetry, or a backend. The live preview defaults to
Roblox mode. Screenshots use Source artwork, which exports faithfully to images.
The build has a same-origin-only connection policy and keeps third-party notices.

## Refresh the website

From the plugin repository:

```sh
npm run demo:build -- --website /absolute/path/to/framebridge-website
```

This copies the demo into `public/plugin-demo/` in the website checkout. Start
that website's normal development server. Use its printed URL plus:

```text
/plugin-demo/index.html?capture=1
```

Choose **Download both themes**. The page captures every view, waits for fonts
and images, settles for at least 1.2 seconds per view, and downloads one ZIP.
A complete set contains 90 images across 45 views. For shorter capture runs, add
`&batch=0` through `&batch=7`: each batch contains at most six views in both themes.
A batch takes roughly 15–30 seconds on the test Mac. Import all batches for a complete refresh.
The screenshots contain neither a pointer nor Figma's window header. The tool
uses only bundled sample data; do not substitute customer designs or accounts.

Import the ZIP:

```sh
npm run media:import -- /absolute/path/to/framebridge-website-screenshots.zip --website /absolute/path/to/framebridge-website
```

For a small change, use **Capture this view** and import that ZIP; existing views
and the other theme are retained.

The importer creates JPEG screenshots, 768/1536px WebP variants and a manifest
with dimensions and content hashes. Website posters follow its light/dark theme.
Keep source PNGs in the downloaded ZIP when higher-resolution masters are needed.

## Embed a section

The website's `PluginDemo` component accepts a view such as `properties`, `layers`,
`images`, `settings`, `layout`, `studio`, `export`, `notes`, `usability`, `structure`,
`tutorial`, or the full `workspace`. `src/docs/live-demos.ts` maps guides to views.
A screenshot loads first; **Try it** loads the interactive example. Reset restores
the sample. Switching the website theme updates an active frame without discarding
its edits. Properties and Layers omit the surrounding plugin shell.

## Checks

Run `npm run check:demo`, `npm run check:guides`, `npm run check:shortcuts`,
`npm run lint` and `npm run build` in the website checkout. The plugin's
`tests/website-demo.test.ts` checks route validation and isolation.

Changes to this demo do not publish or modify either installed plugin. Build and
deploy the website through its normal static Cloudflare workflow when ready.

Every Figma guide must resolve to a current demo view. The website's `check:guides`
and `check:demo` tasks reject retired Figma screenshots and incomplete theme sets.
Native Studio captures are catalogued separately because they show a different
application. Advanced-control presets are compiled in `tests/website-demo.test.ts`
before capture so invalid sample settings cannot silently blank a capture run.
