# Optional theme tokens

In Conversion settings, expand **Theme tokens** and create the Light/Dark library. It starts with color, background, font, native shadow and hover examples. Edit a theme, duplicate it under a new name, add named tokens, or link a token to another token of the same kind using **Alias of**. The initial theme controls the exported resting appearance. Names use letters followed by letters, numbers, periods, hyphens or underscores.

In Layers, expand **Theme tokens** and bind the kinds you need. Color affects native text, image tint or a selected stroke; Background affects a GUI layer's native background. Font supplies a Roblox font family, weight, style and size. Shadow binds the first native UIShadow or creates an editable shadow when needed. Hover affects configured background, text or image colors while the layer's button or nearest ancestor button is hovered, pressed, or selected by gamepad. Disabled and hidden buttons keep their resting colors. Bindings do not change your Figma artwork.

Turn **Themed export** off to export the Figma appearance while retaining your library and layer bindings. The library is stored with Framebridge's local conversion preferences; layer assignments stay in document plugin data. Analyze after editing settings. Missing/invalid references block compilation with a layer-specific message. Libraries are versioned; an unknown version is preserved for review and requires an explicit replacement rather than being silently reset.

## Switch explicitly in your game

Imported models use the trusted generated client runtime. Application code stays in your own LocalScript:

```luau
local root = game:GetService("Players").LocalPlayer.PlayerGui:WaitForChild("Themes")
root:SetAttribute("FramebridgeTheme", "Dark")
-- Later:
root:SetAttribute("FramebridgeTheme", "Light")
```

Set the attribute independently on each exported root or component copy. There is no automatic platform dark-mode detection and no server/gameplay authority in theme settings. The root reports `FramebridgeThemeStatus` as `Ready` or `Unknown theme`. An unknown mode retains the last valid appearance until your script chooses a known mode. A newly mounted root starts with the configured initial theme unless an explicit attribute already exists.

The same attribute works on vanilla Luau, React Lua, Fusion 0.3, and roblox-ts JSX output. TSX's accompanying `FramebridgeInteractions.luau` contains the trusted runtime; retain it next to the compiled Design ModuleScript. Extracted widget modules include their own used theme definitions and each mounted copy owns its listeners. Native repeats remap hover owners to each copy. World UI and ScreenGui/SurfaceGui conversion retain the definitions and runtime.

Only referenced tokens are exported, aliases are resolved within each mode, and an unused/disabled theme library emits no theme runtime. Packages carry bounded resolved values and property references, never executable theme code. Limits are eight themes, 128 tokens per theme, and 60 KB of definitions per exported root; every theme must retain the same names, kinds and fields. Alias cycles and dangling aliases are rejected.

## Overrides and limits

Explicit property edits in Layers override tokens in every theme. Shadow modifier properties and direct edits to the selected native shadow take precedence; disabling its shadow modifier suppresses that binding. Your own scripts and their attachments survive normal Framebridge reimport. An edited generated interaction script blocks updates before changing the design, consistent with the existing importer safeguard.

At runtime, if application code changes a token-managed property, the theme controller relinquishes that property until a remount or changed theme/binding definitions. Switching other properties and components continues. Adding unrelated children does not reclaim that override. Cleanup disconnects listeners and restores unmodified resting properties. Reimport keeps an explicitly selected theme attribute; choose a valid replacement mode if you removed that mode from the library.

Theme colors and motion hover tint cannot manage the same property. Theme transparency also cannot share a property with an ancestor's entrance fade/blink or an image's texture drift. This includes native shadow transparency. Give motion ownership through an explicit transparency override, or isolate an ancestor fade using CanvasGroup. Spatial motion and generated shine overlays remain compatible. Rich text embeds font and color spans, so native font/color token bindings require plain text; background/shadow tokens remain available. Roblox fonts and permissions must work in your game. Shadow values are explicit native UDim/UDim2 values: enter scale and offset values appropriate for the design rather than relying on the source artwork's style calibration.

The browser's **Theme** picker approximates native colors, fonts and shadows; **Test UI** approximates hover/focus. Exact Roblox font metrics, normal-image multiplication tint, input devices, moderation and beta UIShadow rendering need native review.
