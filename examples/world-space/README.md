# World-space examples

The three packages use native UI and need no image uploads. Open one in the matching Framebridge Studio plugin. Use a blank test place to try the examples.

- **surface.framebridge.json:** select a Part in Workspace before importing; the design appears on its Front face. Keep CanQuery enabled for pointer input.
- **billboard.framebridge.json:** select a Part or Attachment in Workspace; the label is four studs wide and retains its authored aspect ratio as the camera moves.
- **prompt.framebridge.json:** select a Part or Attachment; importing creates a Custom-style ProximityPrompt. Press E for half a second to complete its hold interaction. The action/object/key labels and green hold bar follow the native prompt. Connect Triggered in your own server script for gameplay.

Reimport with Update existing to retain the target and application scripts. The World UI utility can bind an exported model to another target or to an existing Custom-style game prompt. See [the configuration and validation guide](../../docs/WORLD_SPACE.md).

Generate fresh local packages, models, source modules and native test fixtures with `npx tsx scripts/world-space-fixtures.ts`. The tracked examples use stable source identifiers and timestamps.
