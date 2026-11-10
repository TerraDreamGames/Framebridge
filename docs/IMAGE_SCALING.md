# Nine-slice images and repeated textures

After analysis, select an ImageLabel or ImageButton in **Layers → Image**. **Image fit** offers Stretch, Fit, Crop, Slice and Tile. In Common, only the controls for the selected sizing mode appear. All, Changed and search can expose the other controls without changing the mode.

## Preserve borders with Slice

Slice divides one texture into nine regions. Its four corners retain their shape, the edges stretch along one axis, and the center stretches along both axes. It still exports one PNG and one image binding.

**Slice guides** starts as a compact `{left, top, right, bottom}` row. Expand it to edit the four source pixel coordinates independently. Right and bottom are coordinates of the center's far edge, not border widths. For a 64 × 64 texture with 16px borders, use `{16, 16, 48, 48}`. **Border scale** multiplies the border thickness: 1 keeps its source size, 0.5 halves it.

Expand **Edit slice guides** to view the analyzed PNG and move the guides directly. Arrow keys move the focused guide by one source pixel; Shift + arrow moves ten. A pointer drag commits once when released, so one property Undo restores the whole drag. A canceled drag restores the authored guides. **Start with 25% borders** supplies a starting point; it does not infer where your artwork's borders are.

Coordinates use the actual exported texture dimensions, not the Figma layer dimensions. A 2× export of a 100px layer can produce a 200px texture, with additional pixels for effects. The controller reads the rendered PNG header and records its dimensions in the package. Ordered nonnegative guides outside those known dimensions block export until corrected. Invalid coordinate ordering is rejected by the inspector. A center with zero width or height remains an accepted native value, but the browser asks for nonempty guides before drawing a slice preview.

For a manually linked texture whose original PNG is unavailable, enter its source coordinates numerically. Framebridge does not download the Roblox texture to discover its size. Check the uploaded image in Studio: Roblox processing can change its dimensions, and a manual asset replacement may use different artwork.

## Repeat artwork with Tile

**Tile size** uses `{X scale, X offset}, {Y scale, Y offset}`. Scale is relative to this image element's dimensions; offset adds pixels. For example, `{0, 24}, {0, 24}` repeats a 24 × 24px texture, while `{0.25, 0}, {0.25, 0}` makes each tile one quarter of the element on each axis. Both axes must resolve to a positive size, and negative components are rejected. Pixel offsets follow Roblox's integer UDim behavior.

**Use texture pixel size** fills the offsets from the analyzed PNG. Tile sizing is independent of the object's Size: resizing the object changes how many tiles appear. Studio import's Source, Scale and Pixels modes convert object geometry while preserving the configured TileSize, SliceCenter and SliceScale.

Tile retains saved Slice guides without using them. Their texture-bounds warning appears only in Slice mode; returning to Slice restores that validation against the known PNG dimensions. This does not relax coordinate-order validation when editing the guides.

## Preview, export and updates

Expand **Preview resizing** to try temporary width and height values without changing the exported Size. The main Roblox preview uses the configured object geometry. Both previews approximate native image rendering; narrow bounds, filtering, tint on ordinary colored images and Roblox image processing still need native visual review. White-mask images use the existing tint preview. The guide canvas keeps the texture's aspect ratio.

The image properties work with multiple-layer editing, individual reset buttons and Undo/Redo. Mixed values retain each layer's untouched components. Export packages include unchanged PNGs, and all four source formats use the same property values. Model export writes SliceCenter as a Roblox Rect2D. The importer validates coordinates and known texture bounds before insertion; reimport reuses matching instances and preserves user scripts and event connections. Removing an override restores the native property default.
