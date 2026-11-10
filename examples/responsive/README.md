# Responsive inventory

Import `inventory.framebridge.json` with Framebridge for Studio into the approved blank test place. The example has twelve supply cards in a native scrolling grid, an editable header and optional detail-panel actions. It needs no image uploads, API keys or external assets.

Use the Figma plugin's Roblox preview presets to check the example at different UI canvas sizes. Its fixed 132 × 116 cards and 12px gaps produce two columns at 390 × 844, six at 1024 × 768, twelve at 1920 × 1080 and five at 844 × 390. At 240 × 400 it has one column and scrolling reaches the last card.

In Studio Play, the Details buttons open the shared panel and Back to supplies closes it. Add purchasing and inventory logic in your own scripts. General layout/property editing belongs in Studio Explorer and Properties.

The browser preview approximates the native result. Check fonts, safe areas and physical input in Studio and on your target devices. See [Device preview](../../docs/DEVICE_PREVIEW.md).
