# Conditional store

Import `store.framebridge.json` with a matching Framebridge Studio plugin. Review it in Play. Read [the conditional rules guide](../../docs/CONDITIONAL_RULES.md) for authoring, limits and limitations.

Copy `DemoData.server.luau` into your game's ServerScriptService to provide demonstration Coins, Ready and VIP values. Edit/remove that script for production gameplay. The generated UI only reads these native inputs.

The purchase button becomes interactable when Coins is at least 100 and Ready is boolean true. Otherwise it shows an ELSE IF message while Coins exists, or an ELSE message while player data is missing. The VIP panel follows the player attribute; the compact message follows the actual camera viewport width. The browser preview uses independent local samples.
