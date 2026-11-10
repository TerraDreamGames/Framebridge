# Scale native visual styles with the UI

In Figma, open **More options → Conversion settings → Style sizing**. Choose **Scale with UI**, then analyze the selection again. **Keep pixel values** remains the default for existing designs.

The option converts supported native corner radii, borders, and shadow blur/offset/spread to proportional values. Borders use `UIStroke.StrokeSizingMode = ScaledSize`: a border follows the element's smaller dimension, while a contextual text outline follows its text size. Text fitting remains a separate choice in Properties. Unsupported artwork still uses the existing appearance fallback.

With **Responsive layout**, generated list/grid gaps and padding also become proportional where native sizing is stable. Their reference accounts for the final native parent, its padding, explicit overrides, and manual scrolling canvases. Studio uses a viewport-based style reference for a scrolling parent even when its reported canvas extent is larger; exports and the approximate preview account for this distinction.

Content-sized axes retain fixed padding and gaps. Automatic scrolling axes retain fixed padding so adding rows does not change the spacing that determines content height. The conversion report explains these decisions. Decorated scrolling containers keep editable content in a content holder, with fixed spacing on its Hug axes.

Automatic list/grid canvases with proportional gaps include the trusted Framebridge layout helper. It measures visible native entries and trailing padding, preserves an authored minimum, and corrects the canvas extent when entries grow, shrink, hide, or scroll. It coalesces property events rather than polling every frame. Teardown disconnects its listeners and restores its canvas contribution. GUI instances and their native layout modifiers remain editable in Studio.

Explicit layer/modifier property overrides take precedence. Flexible grid offsets round down to native whole pixels, so columns fit; a small remainder can remain at the trailing edge. Zero-sized style references keep pixel values.

The option applies to regular companion imports, model downloads, and Luau/React Lua/Fusion/roblox-ts source exports. Packages requiring the layout helper use generated runtime version **8**. Build/install matching Figma and Studio plugins together; older installed companions do not supply this helper. Source/model output includes the helper when required. This does not require Node.js for testers.
