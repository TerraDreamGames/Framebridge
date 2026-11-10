# Custom scrollbar artwork

Select a container in Layers, then expand **Custom scrollbar** in Properties. This is optional: opening the section or cancelling its draft does not change the export.

## Configure the relationship

1. Choose the visible viewport, usually an inventory, player list, rewards row or settings panel.
2. Choose **Thumb artwork**. Names such as `Inventory ScrollBar` and thin artwork appear first as suggestions. Other visible, unrotated artwork in the same selected screen can be chosen manually.
3. Keep **Existing viewport children**, or choose a separate **Moving content** holder. A separate holder moves into the viewport only in the exported snapshot, preserving measured geometry. An empty viewport can use external content. Shared content owners, hierarchy cycles and incompatible rotated ancestors are rejected.
4. Choose Vertical or Horizontal, the two cap percentages and thickness in pixels. Cap percentages divide the full rendered PNG, including effects. Each cap and the middle segment must contain at least one rendered pixel after rounding; increase the cap, remaining middle span or image resolution when necessary. **Confirm scrollbar** stays disabled while a segment would round to zero pixels.
5. Click **Confirm scrollbar**, then inspect the three PNG pieces. Upload or link all three in Images before sending.

The viewport becomes an editable `ScrollingFrame` with native scrolling, clipping, direction and automatic canvas sizing. The artwork source becomes three assets bound to `TopImage`, `MidImage` and `BottomImage`; its decorative copy is omitted from the exported hierarchy. Figma layers and their original parent relationships remain intact. **Remove scrollbar** restores ordinary artwork export; property Undo/Redo also works.

For a previously imported viewport with a different Roblox class, use **New copy** when importing. Matching `ScrollingFrame` updates preserve the instance and custom scripts. Removing its custom bindings restores Roblox's default scrollbar images on reimport.

## Rendering and images

Roblox determines native thumb length and placement and stretches the middle image. A detailed pattern can stretch; this feature does not preserve a painted track or an authored fixed thumb position. Horizontal pieces are rotated during PNG preparation to compensate for Roblox's native horizontal rendering. See the [ScrollingFrame reference](https://create.roblox.com/docs/reference/engine/classes/ScrollingFrame).

One original Figma PNG render supplies all three pieces. Unchanged source renders are reused when caps change, while changed crops get new asset identities. Alpha and sample precision are preserved; tintable white masks and transparent-edge cleanup remain available on the artwork source. The normal image upload, moderation, saved-image reuse, manual linking and partial-failure workflow applies to each piece.

All four source formats, model export, transfer validation, Studio import/reimport, recent-import history and gallery usage selection retain the three bindings. Browser previews show the generated PNG pieces; browser scrollbar drawing is an approximation and does not demonstrate native uploaded artwork fidelity.
