# Interaction example

In a separate blank Studio place, import `panels-tabs-states.framebridge.json` with the matching Framebridge Studio plugin, then press Play.

- Open shop shows a hidden panel; Close hides its nearest panel; Toggle shop opens and closes it.
- Open shop has default, hover, pressed and disabled visuals. Set the button's `Interactable` to false in Play to see disabled.
- Inventory and Settings tabs select one panel in a tab group. The selected Inventory visual follows the panel's visibility.
- The Coins label reads `leaderstats.Coins`. Missing data displays an em dash. To supply demo data, create a Script in ServerScriptService and paste `DemoData.server.luau` there before Play.

The importer adds a generated LocalScript named FramebridgeInteractions. Keep application code in your own scripts. Reimport updates the existing objects and preserves custom scripts. An edited generated script blocks updating/removal, with instructions to keep it in a new copy or move your edits to application code.

These examples need no image uploads or API key. Runtime interactions work in Play; the Figma browser preview shows layout and appearance. See `UI_BEHAVIORS.md` in the plugin ZIP for configuring your own designs.
