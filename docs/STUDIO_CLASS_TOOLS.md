# Change an instance's UI type in Studio

Open **UI tools → Change instance type** after selecting UI instances in Roblox Explorer. Choose the class, review any properties that will be discarded, then click **Convert**. This works on ordinary Studio UI as well as imported Framebridge UI; no Figma connection or loaded package is required.

Supported classes: **Frame, CanvasGroup, ScrollingFrame, TextLabel, TextButton, TextBox, ImageLabel and ImageButton**. Only selected instances change type. Existing descendants retain their own classes. You can select a parent and child together. Instances already using the target class retain their identity and do not create an extra Undo operation.

The section starts collapsed. Image selections initially suggest ImageButton; other selections suggest TextButton. An explicitly chosen target persists for the plugin session, including after conversion and later Explorer selections. The action count includes only instances that will change.

## What conversion preserves

Roblox ClassName is immutable, so conversion creates replacement instances, copies compatible writable properties and moves the existing children. It preserves names, geometry, compatible appearance and text/image settings, tags and attributes. Children, modifiers and custom scripts keep their original instance identities. New buttons accept input, become selectable and have AutoButtonColor disabled; an existing disabled Interactable setting remains disabled. New TextBoxes keep their authored text on focus. Converting a non-text object to a text class creates empty text rather than adding Roblox's default label.

ImageLabel ↔ ImageButton retains image IDs, tint, transparency, crop rectangles, nine-slice and tile settings. TextLabel/TextButton/TextBox retain shared text, RichText and FontFace settings. Class-specific properties that the target cannot hold are discarded; the review lists nondefault values before conversion. For example, ScrollingFrame → Frame loses CanvasSize and scrolling behavior, while ImageLabel → TextButton loses its image properties.

The implementation uses native ReflectionService metadata to compare property types and read/write access. It excludes deprecated aliases, incompatible enum types and engine-owned Instance fields. Older Studio versions without the reflection API show an actionable error instead of guessing a property list. ViewportFrame scene conversion and ScreenGui/world-root conversion are separate workflows; this utility does not convert those classes.

## References, scripts and updates

Conversion replaces the selected instance's identity. Writable instance references inside the selected subtrees, including ObjectValue.Value and GUI navigation references, are remapped to replacements. References outside those subtrees and references stored in script tables or closures are not remapped. Event listeners attached to the old instance are not transferred. Reconnect those references/listeners in your application code; moving a LocalScript does not migrate its existing event connections.

Framebridge source identities remain attached. Imported property metadata is filtered to compatible properties, and obsolete image/scrollbar asset bindings are removed. **Match the corresponding Figma layer's instance type before reimporting.** An update with the old class is rejected by the normal importer; a matching update can reuse the converted instance and its preserved children/scripts. Generated behavior metadata is retained as attributes, but converting classes does not validate or regenerate an existing behavior runtime.

## Undo and failure handling

One conversion batch uses one native Studio change recording. **Ctrl/Cmd+Z** restores the original instances, children and remapped references; Redo restores the replacements. Originals are detached rather than destroyed so Studio can restore their exact identities.

Unsupported mixed selections, detached instances and selections larger than 200 instances are rejected. The reference scope is limited to 10,000 instances. Stop Play before converting. A stale plan, active recording or failure cancels the conversion; the mutation journal restores changed parents/references. If the engine refuses a rollback write, the error identifies that incomplete rollback and staged instances are retained to avoid deleting children.
