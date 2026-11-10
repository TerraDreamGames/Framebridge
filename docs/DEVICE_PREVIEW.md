# Device preview

After analyzing a frame, switch its preview to **Roblox**. Choose **Phone** (390 × 844), **Tablet** (1024 × 768), **Desktop** (1920 × 1080), or **Original design**. The rotate button swaps the dimensions. Edit W or H for a custom viewport from 64 to 8192 pixels; Enter saves, Escape cancels, and invalid input restores the last size.

These are logical UI canvas sizes, not hardware emulation. The viewport recalculates exported Scale/Offset geometry and supported list/grid/flex arrangements; zoom only changes how large that canvas appears in the plugin. Its bounds clip offscreen content, and scrolling remains available. Safe-area insets, native font metrics and device input need review in Studio's Device Simulator and Play.

The preview uses the package's conversion settings. **Preserve geometry** retains authored pixel sizes and can clip on smaller viewports. Choose **Responsive layout** under Conversion settings and analyze again to convert supported constraints and layouts. A preserved-geometry notice explains this when a different viewport is selected. Existing aspect and size constraints remain effective.

Viewport choices survive switching between Source/Roblox and plugin sections during that opening. They do not change Figma layers, source dimensions, overrides, exports, or Studio import sizing. **Design screen** follows the active package's screen reference: the configured export screen for standalone panels, or the selected frame's authored dimensions in full-screen mode. Set the export reference under **Conversion settings → Design screen**; choosing a preview device only changes the local preview. Device controls apply to ScreenGui; world-space UI uses its authored canvas.

**Test UI** remains available at each size. Rotating or resizing a running preview keeps open panels and the selected tab. Returning to Source ends the local test; reopening Test UI starts a fresh simulation. Gameplay data and audio remain Roblox runtime concerns.

## Responsive inventory example

[inventory.framebridge.json](../examples/responsive/inventory.framebridge.json) contains native scrolling, a fixed-cell UIGridLayout, twelve supply cards and optional detail-panel actions. It uses no images or external assets. Phone fits two columns, tablet six, desktop twelve, and phone landscape five. A narrower 240 × 400 custom viewport fits one column and scrolls to the final card.
