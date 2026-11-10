# Install and use Framebridge

Framebridge uses a Figma plugin and a matching Roblox Studio plugin. Connected transfers use a background HTTPS service; users do not need Node.js or a local server.

## Install a development release

1. Extract the plugin ZIP.
2. In Figma desktop, use **Plugins → Development → Import plugin from manifest** and select `figma/manifest.json`.
3. Install `studio/Framebridge.rbxmx` as a local Studio plugin. You can insert the model into a blank place, right-click its Script and choose **Save as Local Plugin**, then remove the installation Script from the place.
4. Restart Studio if replacing an installed plugin, then open **Framebridge** from the Plugins ribbon.

A published release can be installed through the platform stores. Development installation does not publish either plugin.

## Connect and import

1. Open Framebridge in Studio and click **Connect to Figma**. No tester access code is needed.
2. In Figma, open **Connect Studio**, paste Studio's code and connect. Pairing codes expire after ten minutes; paired connections last up to two hours. The headers show remaining time.
3. Select a UI frame and **Analyze** it. Review native layers, artwork, properties and the Source/Roblox preview.
4. For unlinked artwork, connect Roblox or configure the authorized Open Cloud image owner under **Images**. Upload under the group that owns your group experience.
5. Click **Send to Studio**. Review the received design and import it into `StarterGui`.

**Generated scripts** are off by default in Studio. Enable **Add generated scripts** before importing a design that needs configured interactions, themes, particles, world UI or live visual adjustments in-game. A plain button or panel does not add an interaction script. The choice is saved separately for each design and applies to automatic transfers too.

To clean an existing import, select its screen or a layer in Explorer, then open **UI tools → Framebridge cleanup**. **Unused data** removes stale behavior attributes and unnecessary generated scripts while keeping sync identities and active visual metadata. **Detach import** removes known Framebridge attributes and untouched generated scripts, ending sync and scripted features while preserving UI, custom scripts and custom attributes. Both show a preview and support Undo. Screens containing edited generated scripts or custom children inside generated scripts are skipped.

Click the Studio pairing code or its **Copy** button to copy it. The links under **Guides & documentation** work the same way. The whole value stays selectable; if Studio cannot copy automatically, use the device-specific keyboard shortcut shown below the field. Opening the panel or changing guide topics does not copy anything by itself.

Review is the default. **Auto-import designs** applies future deliveries with your saved configuration. During Play, new designs wait until Edit resumes. Disconnecting clears pending deliveries. A delivery completes after Studio reports its import receipt.

## Size the design correctly

Choose **Scale**, **Pixels** or **Source** sizing in Studio. Scale is the default. Set the reference screen size in Figma when exporting a smaller panel, such as a settings window designed for a 1920 × 1080 screen. Its dimensions are scaled against that reference rather than stretched to fill the screen. Nested content uses its parent coordinate system.

Use the device preview for an initial check, then inspect safe areas, text, scrolling and layout in Studio. See [the editor guide](EDITOR.md).

## Download without a connection

Use **Download a copy** in Figma, then **Open package** in Studio. Native-only designs and artwork with existing Roblox IDs can import directly. Unlinked artwork is included as PNGs: upload those images and assign their IDs, or explicitly enable placeholders while reviewing.

Try [the layout examples](../examples/layouts/README.md) or `examples/Store.framebridge.json` without an upload account.

## Update existing UI

**Update existing** reuses matching Framebridge instances and preserves custom scripts and descendants. **New copy** creates separate screens. Imports participate in Studio Undo/Redo; unsafe removal or modification of protected content blocks the update.

Use Studio's **UI tools** for sizing, anchor points, constraints and instance conversion. Continue general UI editing through Explorer and Properties.

## Accounts and artwork

Roblox moderation can delay visibility even after an upload succeeds. Verify the image owner and the target experience's permissions before retrying. Unchanged artwork reuses matching upload results; changed artwork receives a new asset.

API keys and connection settings are stored locally, separately from design data. **Clear key** removes the saved API key. Credentials are excluded from exported packages. Uploads already accepted by Roblox cannot be retracted by cancelling a transfer.

See [Roblox sign-in](ROBLOX_SIGN_IN.md), [image preparation](IMAGE_TOOLS.md) and [getting started](ONBOARDING.md).

## Build from source

Use `npm ci`, `aftman install` and `npm run check`. Import `dist/figma/manifest.json` and install the complete `dist/studio/Framebridge.rbxmx` hierarchy. The Studio model contains separate ModuleScripts and comes with a self-contained Rojo project. The default build includes Roblox sign-in and Studio sync using `framebridge.config.json`. `npm run build:offline` deliberately omits those connected controls. See [Studio development](STUDIO_DEVELOPMENT.md) and [release setup](RELEASE.md).
