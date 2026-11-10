# World-space UI

World-space output and Studio binding tools are integrated into the private development code. They are not yet part of the matching installed private release. Public publication is outside this work.

## Configure in Figma

Select the design's top frame or its generated UI root and expand **Output location** in Properties. Choose Player screen, Part surface, World label or Proximity prompt. The setting is document-scoped and uses the existing Undo/Redo history.

Numeric edits save on Enter or blur. Empty, non-finite and out-of-range input shows its allowed bounds and restores the saved value. Escape cancels an edit. Derived billboard dimensions are validated against the authored canvas before the setting is saved.

| Output | Configuration |
| --- | --- |
| ScreenGui | Normal responsive screen output. |
| SurfaceGui | Part face, draw through walls, lighting influence and render distance. The authored design size becomes its fixed canvas. |
| BillboardGui | Width in studs, a three-axis world offset, lighting and render distance. Height follows the authored aspect ratio. |
| Custom ProximityPrompt | Billboard settings, action/object text, keyboard/gamepad keys, hold time, activation distance, line of sight and mouse clicks. Optional native text labels and a fixed hold-progress layer. |

The preview shows the authored 2D artwork. Test world placement, distance and input in Studio Play. SurfaceGui cannot render CanvasGroup; the editor asks you to use Frames before choosing that output. Screen-coordinate cursor magnet is inactive on world output, with a conversion notice. Hold progress cannot have motion, automatic sizing, layout ownership or size constraints.

## Import and bind in Studio

Before the first import, select a Part in Workspace for a surface, or a Part/Attachment for a billboard or prompt. Surface targets need CanQuery enabled for pointer input. The UI stays in StarterGui, with Adornee pointing at the world target, so its client scripts and native buttons run in PlayerGui.

Updates reuse the binding when no new target is selected. Generated prompts are ordinary Custom-style ProximityPrompt instances under the target. Matching updates retain their instance identity and custom scripts. Connect `Triggered` in a server script to perform your game's action; UI export does not implement rewards or other gameplay.

**UI tools → World UI → Bind world target** works on an imported design or an unbound world model. Ctrl/Cmd-select the UI and its target in Explorer. An unbound prompt model creates an owned prompt from its saved settings. Binding an existing Custom-style game prompt uses its actual text and input settings, preserving its properties, parent, attributes and scripts. It also supports prompts under a Model with a PrimaryPart. Reimport keeps that explicit game-prompt binding even when an unrelated Part is selected.

When replacing a generated prompt with a game prompt, the generated one is disabled and retained with its scripts. Reimport updates its Figma-controlled settings while it remains inactive. Binding to a Part again restores and moves that generated prompt with the latest settings; the game prompt stays unchanged. Binding and rebinding have native Undo/Redo. A game prompt must have Custom style before it can be linked.

The billboard contains one fixed authored canvas and one runtime distance scale. Studio's Scale sizing option converts the design inside that canvas, while retaining the canvas's pixel dimensions. This prevents applying camera-dependent scaling twice to text and artwork.

Generated owned prompts refresh their client-side visibility once after subscribing, covering prompts already shown before StarterGui scripts load. Their server Enabled value is unchanged. External game prompts in source integrations should be mounted before enabling. Native show/hide and hold signals drive the UI. Destroying a target hides the UI and releases its runtime helpers.

## Screen / surface conversion

Select a ScreenGui and a Part, then use **ScreenGui to Part surface**. Imported designs prefill their original canvas dimensions; enter those dimensions for hand-built UI. Choose a Part face. Use **SurfaceGui to player screen** for the reverse operation.

Conversion preserves the actual child instances, their scripts, attributes and UI properties. Screen settings are saved for the reverse conversion. The root must be replaced because Roblox instance classes cannot change. Update game references to the old root. Every conversion and binding operation has a native Undo step. Failed mutations restore the original hierarchy.

Match Figma's Output location to the converted root class before reimporting. A class mismatch remains a preflight error, avoiding silent replacement of a root used by application code.

## Source and model output

World configuration and authored canvas metadata travel through JSON, model and all four source formats. Models contain an empty `FramebridgeWorldTarget` ObjectValue and wait for binding. Bind them through the Studio utility; native Insert from File acceptance is still pending.

Source constructors accept actual Instances through `WorldTargets` (React/TypeScript props) or a `worldTargets` argument (Fusion/vanilla). Keys are the exported collector's FramebridgeId, such as `screen:world`. Supply a Part for a surface, a Part/Attachment for a billboard, or a Custom-style ProximityPrompt for prompt UI. React and TypeScript rebind the existing UI when supplied a new `WorldTargets` table, cleaning up the previous controller. Targets are not encoded as paths in transfer data. Keep world GUI roots under PlayerGui and create server-side targets separately. Mount external custom prompt UI before enabling that prompt.
