# Studio commands

Open **Tools → Search UI commands…** in the Studio companion. The small floating popup searches a fixed catalog of 29 native UI commands: 21 instance classes and eight sizing/constraint utilities. Search uses literal words and never evaluates Luau. Type to search, press Enter to run the selected result, press Escape to close, or select a row and click **Run command**. The footer previews the target before an action can run.

The plugin registers **Framebridge commands** as a bindable Studio PluginAction. Assign your preferred keyboard shortcut in Studio's shortcut customization. There is no built-in global key combination. The popup owns keyboard input only while its search field is focused.

Create ScreenGui adds to StarterGui. Other objects require exactly one attached UI container selected in Explorer. Modifiers require a GuiObject; a text-size constraint requires text. Duplicate modifiers or an existing list/grid layout are blocked so users can edit the existing helper in Properties. Created GuiObjects use scale-based Size and Position; scrolling containers default to automatic vertical canvas sizing. Creation selects the new object for further native editing.

The sizing commands use the existing selection tools for Scale/Pixels, aspect ratio, fill-parent, centered anchor with retained position, and scaled text with a 12–32 point constraint. Select 1–200 attached GuiObjects; layout-controlled or automatic geometry is reported as skipped. Every successful creation/utility is recorded for native Undo/Redo. Play mode, a busy import, invalid classes/parents, changed targets and active history recordings block changes. A failed creation rolls back the instance and selection. Custom scripts are not modified.

The popup is resizable, scrolls its short result list, and keeps the selected command in view. Explorer and Properties remain the main editor. A command action cannot run arbitrary source, create scripts/remotes, or change imported package configuration.
