# Optional usability checks

Analyze the selection, then open **More options → Check usability → Run checks**. The scan runs locally on the design snapshot and configured export. It does not send designs to AI, make a backend request, change Figma artwork, alter the transfer package or block export.

Each finding starts collapsed with its source layer and a short reason. Expand it for the full reason, suggested next step and navigation actions. **Inspect layer** opens that layer in the plugin's Properties pane; **Locate in Figma** selects the real source layer. Related duplicate names or state candidates have a **Compare** action. Use search and the warnings/visual-review filter to keep a dense report manageable.

The choices under **Checks & target size** are optional and persist while the plugin session stays open. Reports remain available when you return from Properties. A changed analysis or check setting marks the previous report out of date; run the scan again before downloading it. Reports contain names and findings, without full artwork or upload credentials.

## What is checked

| Check | Behavior and limits |
| --- | --- |
| Names | Flags drawing-tool defaults, exact duplicate exported sibling names and path-like punctuation. Uses configured export names; baked decorative descendants and generated modifier names are excluded. Punctuation is advisory because Roblox permits it. |
| Text contrast | Uses sRGB luminance and unrounded comparison against 4.5:1, or 3:1 for authored sizes at least 24px or bold sizes at least 18⅔px. Reads configured native colors, generated RichText runs and transparency over known solid backgrounds. |
| Touch targets | Compares TextButton, ImageButton and TextBox bounds against a selectable 44×44 or 24×24 reference. Uses configured size, scale, aspect/size constraints and estimated native layout at the authored canvas. Smaller controls may have adequate spacing or another equivalent control; this is a review warning, not a compliance failure. |
| Text fit | Flags small authored text, unbounded text scaling and boxes smaller than an estimate for explicit lines. Fixed-height wrapped text needs visual review because actual line count, glyph metrics and localization vary in Roblox. Automatic height is respected. |
| Color cues | Reviews similarly named red/green state candidates. Identical configured non-color structure/text prompts a suggestion to add labels, icons or shapes. Distinct configured text/shape is retained as a cue. Unlinked artwork cannot establish icon meaning and is marked for review. The scan cannot prove that candidates are alternative states. |

Contrast over images, gradients, unknown backgrounds, overlaps, out-of-bounds text, group compositing, blending or rotated content is explicitly **unverified**. Baked text requires image review. A report without warnings does not certify accessibility or validate fonts at every screen size.

The references follow [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Figma units and Roblox layout values are not guaranteed CSS pixels on a player's device. The 12px readability warning is a local review heuristic. Test the final game on phone, tablet and desktop and with its actual input methods.

Findings are bounded to 500, with an omitted count and a smaller-selection suggestion when necessary. Contrast overlap work is bounded; uncertain cases remain unverified. Duplicate-name references are bounded and state candidates are indexed by non-color structure, avoiding repeated pairwise comparisons. Conversion diagnostics remain separate so a usability warning cannot turn a valid export into a failure.
