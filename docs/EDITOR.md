# Configure UI in Figma and Studio

After analysis, **More options → Review structure** explains the actual exported classes and offers optional intent/layout/name corrections. Accepting uses the normal configuration and Undo path. Saved choices require review and remain separate local preferences, with disable/remove/reset controls. See [structure review](STRUCTURE_REVIEW.md).

After analysis, **More options → Check usability** offers optional local checks for names, contrast, touch targets, text fit and non-color state cues. Expand a finding to inspect or locate its layer. Findings do not modify the design or block export; uncertain visuals require review. See [the usability-check guide](USABILITY_CHECKS.md).

Use ⌘ / Ctrl click or Shift range selection in Layers to edit several compatible layers together. Shared properties show Mixed values; coordinate and font component edits preserve each layer's other components. Class shortcuts and whole-batch Undo/Redo are described in [the bulk editing guide](BULK_EDITING.md).

Source modules are available under **More options → Export options → Export source code** after analysis. Pick React Lua, Fusion 0.3, roblox-ts JSX or vanilla Luau. Download includes the module, image manifest, unresolved PNGs and mounting instructions; Copy code has the same manual-copy fallback as JSON. Preview code is read-only and collapsed by default. Choose Responsive in conversion settings before analyzing if the generated UI should use responsive layout; Studio import sizing does not change source modules. See [the source export guide](SOURCE_EXPORT.md) for framework dependencies, image bindings, mounting and cleanup.

## Figma workspace

Automatic rendering recognizes vector paths, boolean shapes, polygons, stars, lines, arcs, image fills and pure vector groups as artwork. These export as ImageLabel (or ImageButton for explicit buttons) in either appearance mode. Pure vector groups become a single image; groups mixing text and artwork keep their native hierarchy with separate text and image children. Supported solid rectangles, circles and UI containers remain native. **Prefer editable layers** controls optional effect approximations, rather than replacing artwork with empty frames. Export setup explains why an automatic image was chosen. Explicit render/instance choices and configured descendants take precedence; protected containers with complex backgrounds still need review.

Drag the bottom-right corner handle to resize the plugin. Focus the handle and use arrow keys to resize by 20px, or Shift + arrow keys for 100px. The chosen size is remembered on this device. The window supports sizes from 600 × 420 to 1800 × 1400; dragging also respects the available screen space.

Analyze your Figma selection, then open **Layers**. The left sidebar shows the exported hierarchy, including Roblox UI modifiers, with color-coded class icons. The same glyphs appear in the selected-layer header, **Instance type** menu and **Add UI modifier** menu. Search by layer name or instance type; matching ancestors stay visible for context. The count shows matching layers while searching. Clear search with its × button or Escape. Rows inside baked images or excluded from export have distinct status icons and labels.

Select a layer to edit its properties. Its name, Roblox class and parent path remain visible as properties scroll. Up/Down and Home/End navigate visible layers; Right opens a container or enters its first child; Left closes a container or returns to its parent. Typing a layer-name prefix moves to a visible matching layer. The target icon locates the source artwork in Figma. Added modifiers are revealed, selected and focused automatically. Property search resets when selecting another layer; unmatched searches show a clear recovery action. The search and property-view controls stay above the scrolling fields.

The dark workspace keeps the layer tree, preview canvas and properties in separate panes. At narrow widths the canvas moves above the editor. **Images** opens the upload controls; the toolbar settings icon opens conversion settings; **More options** contains review notes, connection/export controls and help. Property sections collapse, and the most relevant section opens first.

Choose **Render as** for individual source layers:

- **Automatic** follows the conversion settings and source tags.
- **Editable UI** uses native Roblox instances with review notes for unsupported effects.
- **Image / bake appearance** exports the original Figma layer and its children as a PNG. This preserves outlined text and other effects. Text edits in the property inspector apply to editable text; they do not change the baked Figma artwork.
- **Exclude from export** removes the layer and its descendants. Excluded children are also omitted from a parent's baked PNG.

Choose an **Instance type** to make text a TextLabel, TextButton or TextBox; a container a Frame, CanvasGroup, ScrollingFrame, ViewportFrame or TextButton; or artwork an ImageLabel or ImageButton. ScrollingFrame starts with an automatic vertical canvas. TextBox exposes placeholder, multiline and editability options. ViewportFrame exposes 3D lighting and rendered-image appearance; add the model and Camera in Studio. See [the ViewportFrame guide](VIEWPORT_FRAME.md). Button properties configure interaction flags. The optional **Interactions** section configures state visuals, panels, tabs and live labels; see [setup and runtime limits](UI_BEHAVIORS.md). Your own scripts supply gameplay logic and data.

The inspector starts in **Common**, showing frequently used properties for the selected Roblox class. **All** shows every supported property, including ordering, interaction flags and automatic sizing. **Changed** shows only direct property overrides and their individual reset buttons; its count does not include export choices or added modifiers. The chosen view remains active when switching layers. Search checks all supported properties, regardless of view, by readable label, Roblox name, group or guidance. Matching groups open automatically. Hover a label to see its Roblox property name and a short explanation; the help icon opens an explanation of the views and editing controls. **Center in parent** and **Fill parent** appear within Layout in Common and All, and supply common layout presets. A parent's list or grid takes control of child positioning. Names, render strategy and instance type live in a collapsed **Export setup** section, keeping everyday property editing in view.

Properties use compact rows. Position and Size show `{X scale, X offset}, {Y scale, Y offset}` summaries; anchors, dimensions and fonts also start collapsed. Click a compound row, or press Enter/Space while it is focused, to expand its fields. Values remain exact in the summary and are editable independently. Expanded dimensions explain relative scale and pixel offsets; anchor points explain top-left and center. Numeric fields commit on blur or Enter, with pixel/degree units on relevant simple values. Invalid entries keep the fields open for correction. Simple properties such as Rotation remain directly editable on one row. Summaries truncate visually when necessary; hover to see the full value. Rows stack only when the Properties pane itself is too narrow.

An invalid mounted Properties draft shows a banner naming the affected fields and blocks export or sending until resolved. Ordinary blur retains the rejected draft and the last saved value; it does not dismiss the warning. Correct the value, choose **Revert**, press Escape in the field, or use its Reset control. Each field clears only its own draft warning, so another invalid field still blocks export. Changing layers, navigating away or hiding a field through search/property view unmounts it and discards its unfinished draft; saved values stay intact. Separate configuration forms with Confirm keep their own validation. This draft guard is independent of conversion errors; successful edits and analysis retain the existing general-error clearing behavior.

**Constraints & modifiers** lists attached modifiers with readable names and class icons; select one to edit it. Its **Add a modifier** menu shows readable names alongside Roblox class names and creates a UICorner, UIStroke, UIShadow, UIAspectRatioConstraint, UISizeConstraint, UITextSizeConstraint, UIScale, UIPadding, UIListLayout or UIGridLayout. New modifiers are selected automatically and open in Common so their controls are immediately available. **Back to** returns to the parent layer; removing a modifier also returns to its parent. Select a modifier in the layer sidebar to edit it later. A list and grid replace each other rather than competing. Existing generated gradients remain in the exported hierarchy; gradient stops are not currently editable here. Remove a modifier from its inspector, or use the reset button to restore a layer's source-derived properties and generated modifiers. Blue dots identify customized layers; individual overridden properties have reset buttons.

Edits immediately update the **Roblox** preview, then analysis refreshes automatically. Wait for analysis to finish before closing the plugin. Successful analysis saves overrides in the Figma document; global conversion preferences remain separate. Reanalysis preserves uploaded image IDs when the source, asset identity and PNG bytes are unchanged. Altered artwork requires a new upload.

**Source** shows the Figma artwork. **Roblox** previews the configured hierarchy and common layout/style properties approximately. Font metrics, automatic sizing, rich text, flex layouts, gradients, image tint and slicing still require review in Studio. Review the imported instances with Studio's native editor and device emulator. Export and Send to Studio both use the configured package; new PNGs follow the existing upload flow. In **Images**, **Upload all** uploads unlinked PNGs and links their Roblox IDs without requiring a Studio connection.

Image layers expose a collapsed **Image preparation** section. **Tintable white mask** makes RGB white while keeping alpha so Image tint can recolor an icon. **Clean transparent edges** extends nearby RGB into fully transparent pixels without changing alpha or bounds. Cleanup is on by default and can be disabled per layer; white masks start off. Both choices persist per layer. Background/effect owners expose cleanup for their generated artwork too. Changing preparation clears an explicit Image override and requires a matching uploaded/linkable variant. See [IMAGE_TOOLS.md](IMAGE_TOOLS.md).

Choose Slice or Tile in **Image fit** for preserved borders or repeated patterns. Slice has compact source-pixel coordinates, Border scale and optional draggable guides; Tile has scale/offset dimensions and a texture-size preset. Preview resizing is local to the inspector. Common shows the controls for the current mode; All, Changed and search expose inactive settings when needed. Actual PNG dimensions are used for known slice bounds. See [IMAGE_SCALING.md](IMAGE_SCALING.md) for coordinates, updates and preview limits.

Save your work and restart Studio once to load the updated local importer. If a layer already exists with a different Roblox class, choose **New copy** when importing the changed type. Update mode protects existing references and custom scripts rather than replacing their instances. Review-first import mode is available when a connected transfer needs this choice.

These settings leave the source Figma artwork intact. The plugin only stores its configuration in document plugin data and creates temporary raster-export clones, which it removes after analysis.

## Studio import and UI tools

The Studio companion uses React Lua and ReactRoblox, with two focused tabs. Save your work and restart Studio after replacing the local plugin.

**Import** receives designs from Figma or opens an exported package. Choose **Scale**, **Pixels** or **Source**, review image links, then import into StarterGui. Scale is the default: sizes and positions become parent proportions, with padding and authored grid cell bounds accounted for. Exported constraints remain intact; grid cell sizing and spacing convert with the global mode. Unknown or zero bounds retain source geometry with a conversion note. **New copy** creates screens; **Update existing** updates matching screens and preserves attached scripts. Image links, connection controls, conversion notes and pasted JSON use collapsible sections. Received designs wait for review unless **Auto-import designs** is enabled under **Figma connection**.

Continue ordinary editing in Roblox's **Explorer** and **Properties** panels. The plugin has no layer browser, duplicate property inspector or preview canvas.

**UI tools** acts on the current Studio selection, even without a loaded Figma package:

- Convert **Size**, **Position** or **Both** between scale and pixels while preserving the current geometry.
- Keep the current aspect ratio with **UIAspectRatioConstraint**; add or update **UISizeConstraint** minimum/maximum bounds.
- Enable **TextScaled** with a bounded **UITextSizeConstraint** for text labels, buttons and boxes.
- Apply nine anchor presets, optionally keeping the same visual position, or fit an element to its parent.

**Include descendants** is off by default. Enable it to process a selected ScreenGui or container subtree. Overlapping selections are deduplicated. Existing constraints are reused. Actions support Studio Undo; invalid inputs are rejected before changes, and failed applications roll back. List/grid/table layouts keep ownership of controlled geometry; automatic sizes, zero parent bounds and rotated keep-position anchors are skipped with an explanation.

Import sizing saves locally per source design. Legacy per-layer overrides from the previous Studio editor remain compatible and are explicitly shown with **Clear saved overrides**. Selection tools modify native Studio instances rather than the incoming package; reimporting managed source properties can replace those manual changes. These tools do not modify Figma artwork.

Scale preserves proportions; it does not infer breakpoints or rearrange rows into columns. Review the finished UI with Studio's device emulator and configure layout behavior in the native editor.

### Main frame size and design screen

**Conversion settings → Design screen** sets the logical screen against which
the selected interface is scaled. The Figma plugin defaults to **Desktop ·
1920 × 1080**, with centered main-frame placement. An 800 × 600 settings panel
therefore exports with Size `{0.416667, 0}, {0.555556, 0}`, rather than filling
the screen. At a 1920 × 1080 viewport its upper-left corner is `(560, 240)`;
its content stays relative to that panel. Figma page coordinates never become
screen positions. Studio's default **Scale** import converts the descendants
against their own parent dimensions.

Choose another preset or enter a custom width and height for interfaces designed
against a different screen. Choose **Selected frame is the full screen** only
when the selection represents the whole UI canvas. Main-frame placement can be
centered or top-left; explicit per-layer property overrides remain authoritative.
The selected host keeps its measured dimensions, while internal native Hug/Fill
layouts retain their sizing behavior. World-space UI keeps its authored canvas.
Scale may stretch proportions on a different screen aspect ratio; configure
aspect/size constraints and layouts for the intended devices.

To repair an existing full-screen panel import, update the Figma plugin, select
the correct design screen, run **Analyze** again and send it to Studio. Import
using **Scale → Update existing**. The existing Studio importer already reads
the screen reference; this correction does not require a Studio plugin update.
Programmatic exports that omit a design screen retain their authored-canvas
behavior for compatibility with existing examples.

### Figma canvas positions and groups

The selected UI uses its own local canvas, regardless of where it sits on a
large Figma page. Nested groups are exported relative to their direct Roblox
parent. Figma's group and boolean-operation children report their coordinates
relative to the enclosing frame/page, so the adapter resolves their absolute
transforms into the group's local coordinate system before compilation. Text,
editable frames, rendered vector images and cached crop bounds use that same
coordinate system. Frames inside groups retain their own local child coordinates;
nested and rotated groups are handled as well.

If an older export put a group's contents off-screen, update the Figma plugin,
run **Analyze** again, then send and import using **Update existing**. Studio's
default **Scale** mode converts the corrected local sizes and positions into
parent proportions. Moving the source UI to Figma's page origin or manually
centering every child is unnecessary. An existing JSON package cannot recover
the missing group coordinate basis; reanalysis is required. Existing explicit
Position overrides still take precedence; reset an affected override if it was
saved to compensate for the older coordinates.

Regression checks cover selected frames/groups at distant positive and negative
canvas positions, rotated/nested groups, native text, cropped vector artwork,
render-cache reuse, and Studio sizing in Scale/Pixels/Source at four viewport
dimensions. They verify geometry and conversion; review the specific finished
design in Studio for font metrics and device-specific layout.

See [Figma's container-parent transform behavior](https://developers.figma.com/docs/plugins/api/properties/nodes-relativetransform/).

## Functional layouts and examples

Use **More options → Create layout examples** in Figma to create a separate page with editable vertical/horizontal scrolling lists, an inventory grid and nested lists. Analyze and export using the normal workflow. [Layout examples](../examples/layouts/README.md) explains the settings, Studio import modes and reproducible native verification. The packages also ship in `dist/examples/layouts/`.

For your own scrolling container, choose ScrollingFrame in Export setup, set Automatic canvas size and Scrolling direction to the intended axis, and add List layout or Grid layout under Constraints & modifiers. Search can find canvas, scrolling and grid controls and their guidance. Scale import keeps content dimensions in pixels along automatically sized scroll axes to keep the final entries reachable.

### Editable native appearance

Supported filled-box drop shadows become UIShadow. Individual corner radii become native UICorner properties. Supported stacked solid/linear-gradient fills and borders remain editable instead of flattening the panel; decoration is kept outside its content layout. Select Drop shadow in the modifier menu to add or change blur, color, transparency, offset and spread. Corner radius sets all four corners together; individual corner fields customize one corner.

Text silhouettes, unfilled content-shaped glows, inner shadows, smoothed corners and unsupported paints still require image fallback or a reported approximation. Roblox previews approximate shadows; review the final appearance in Studio. UIShadow uses a licensed SVG class icon, like the other modifiers.

### Automatic button recognition

Detect buttons is on by default in conversion settings. Interactive names such as Buy now, Play and Close are combined with text/icon structure to choose TextButton or ImageButton. Neutral containers and labels inside a recognized control stay separate non-button content. Explicit instance choices take precedence; turn Detect buttons off to disable inference while retaining explicit [button], _button and _btn hints. Review notes explain automatic decisions.

Changing a previously imported Frame to a button changes its Roblox class. Use New copy for that migration, then reconnect application scripts as needed. Later imports preserve matching button instances and their custom scripts.

## Responsive layouts

Choose **Responsive layout** in Conversion settings to translate Figma layouts into editable native Roblox layouts. Ordinary rows and columns use UIListLayout. Variable-size wrapping uses UIListLayout.Wraps; uniform wrapping and uniform fixed/flex Figma Grid tracks use UIGridLayout. Hug maps to AutomaticSize and responds to text wrapping and content additions/removals. Fill uses UIFlexItem with proportional GrowRatio; fixed siblings keep their basis. The Flexible sizing modifier exposes these controls with its class icon.

Freeform frames can also convert automatically: three or more aligned items with consistent gaps become a UIListLayout; four or more equal-size items in regular rows and columns become a UIGridLayout. Framebridge measures the item order and all four padding edges, including a partially filled final grid row. This works in ordinary frames as well as scrolling frames and does not change the Figma source. Review notes identify detected layouts. Overlaps, rotated/skewed items, deliberate holes and irregular spacing retain their authored placement. Explicit layout modifiers take priority. **Preserve geometry** disables automatic conversion; choose **Responsive layout** and analyze again to enable it.

Figma Prototype overflow becomes a ScrollingFrame with the selected axis. `_scroll`, `_ScrollingFrame` and `[scroll]` are optional naming hints. Evenly spaced consecutive cards inside a scrolling frame infer an editable grid, including runtime canvas growth. A gap in the middle of a manually positioned grid prevents this inference so intentionally empty space is retained.

Absolute-positioned children stay in an **Absolute** helper while normal items reflow in **Flow**. The Absolute helper is a disabled, unclipped ScrollingFrame: it provides a native measurement boundary, so overflowing absolute elements remain visible and interactive without inflating a Hug container. Rasterized or rotated items use named slot Frames to keep artwork overflow from changing list spacing. Stacked fills stay outside content layouts.

Studio's Source, Scale and Pixels modes convert surrounding geometry. Native Fixed/Hug/Fill sizes keep their authored sizing semantics in every mode, including fixed grid gaps. Per-layer property edits remain authoritative. The browser preview approximates native flow and uses source measurements for Hug; review final font metrics and layout in Studio.

Unequal/content-sized/spanning grid tracks, deliberate empty grid cells, overlapping/baseline layouts and variable-size wrapping with unequal row/column gaps retain measured geometry with a review note. This release does not expand repeat groups or reproduce native rounded masks yet. Containers with unsupported appearance can still require image fallback; preserving functional containers while baking only their decoration remains part of the native-structure work.

The Images tab also has a collapsed [saved-image library](IMPORT_HISTORY.md) for searching, exact PNG matching, manual assignment and source usage navigation. Automatic upload reuse is isolated by Roblox owner and prepared PNG bytes.
