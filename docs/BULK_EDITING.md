# Edit several exported layers together

In **Layers**, use **⌘ / Ctrl click** to add or remove a layer from the selection. **Shift click** selects a range of visible rows; Shift + Up/Down also extends a range. A range includes any visible modifiers between its endpoints. Search by name or class and use **Select matching** to select matching rows without their contextual ancestors. Selected layers remain selected when a search hides them. **Keep only** returns to the primary layer.

The inspector shows the selected count and Roblox classes. It offers only properties whose types are compatible on every selected layer. Generated screens, modifiers and ordinary GUI elements have different schemas, so selecting unrelated types may leave no shared properties. Layers inside a baked image cannot be edited separately; change the parent's rendering first.

**Mixed** means the selected values differ. Choosing a number, color, text, boolean or enum applies that property to every selected layer. Expand Position, Size, anchors, dimensions or Font to change individual components. Changing X scale preserves each layer's X offset and both Y components; changing font weight preserves each font family and style. Focusing a mixed field and leaving it untouched applies no value. Reset restores each source-derived value independently.

Use the × inside a mixed text field to clear that property on every selected layer. For a mixed color, **Use** applies the displayed swatch; the color picker chooses a different color. Both are explicit actions so simply opening and closing a picker leaves the selection untouched.

**Export setup → Instance type** offers only classes supported by every selected source layer. Frames and text can share TextButton; image layers share ImageLabel and ImageButton. Generated ScreenGui and modifiers keep their types. Automatic restores source classification. Incompatible class shortcuts report an explanation and apply no changes.

When the Layers tree is focused:

| Shortcut | Class |
| --- | --- |
| Alt + 0 | Automatic |
| Alt + 1 | Frame |
| Alt + 2 | TextLabel |
| Alt + 3 | ImageLabel |
| Alt + 4 | TextButton |
| Alt + 5 | ImageButton |
| Alt + 6 | ScrollingFrame |

On macOS, Alt means Option. Physical digit keys are used so Option's alternate symbols do not break assignment. The collapsed **Class shortcuts** reminder is below the tree. Shortcuts apply only within the plugin's tree.

**Undo** and **Redo** restore a whole batch in one action. **⌘ / Ctrl + Z** and **⌘ / Ctrl + Shift + Z** work while the plugin editor is focused, except inside typing controls, where normal text undo remains available. Adding a modifier and clearing its previous direct overrides is also one transaction. History keeps up to 50 edits for the current plugin session; reopening restores saved configuration but starts a fresh history. These are plugin configuration actions, separate from Figma artwork editing.

Each batch compiles once before application. Invalid values or cross-property constraints leave the previous configuration intact. The Roblox preview updates, then one debounced analysis saves the batch in the document. Wait for analysis to finish before closing. Packages, models and source modules use the resulting configuration. Studio's Scale and Pixels modes still convert final geometry; Source retains authored units. Changing an imported instance's class can require **New copy** in Studio. Updates preserve matching instances and custom scripts.
