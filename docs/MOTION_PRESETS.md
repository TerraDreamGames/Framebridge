# Motion and sound

Select a layer and open **Motion & sound** in Properties. Every effect is optional. Enable a preset, expand its row, then change the compact fields. Edits join the existing document configuration and Undo/Redo history; invalid values return to the saved value. Interactions such as panel actions and live labels remain configured separately.

| Preset | Controls and behavior |
| --- | --- |
| Hover response | Scale multiplier, rotation, lift, transition time and optional tint. Responds to hover, keyboard/gamepad selection and selected tabs. |
| Press response | Scale multiplier and transition time. Returns smoothly when released or interrupted. |
| Float | Total travel, cycle time and direction; moves around the original position. |
| Spin | Degrees per second; negative values reverse rotation. |
| Pulse | Scale multiplier and cycle time. |
| Blink | Visible/hidden phases, fade time and delay. Fades artwork and descendants while retaining layout space and input. |
| Entrance | Fade, slide or pop, with time, delay, travel and direction. Replays when the element or an ancestor panel becomes visible. |
| Shine | Repeating sweep or one sweep on hover/focus, with cycle time, band width, opacity, angle and color. |
| Cursor magnet | Radius, pull distance and transition time. Mouse only; touch/gamepad retain the normal button response. |
| Texture drift | Pixels per second and direction, on an image configured with **Tile** image fit. |
| Sounds | Optional hover/press Roblox audio asset IDs and volume. Audio runs in Roblox and must be permitted for the target experience. |

Direction is 0° up, 90° right, 180° down and 270° left. Scale is a multiplier: 1 preserves size, 1.05 enlarges by 5%. Blinking is limited to fewer than or equal to three cycles per second; fade time cannot exceed either phase.

Input effects use the layer's native button or its nearest ancestor button. **Nearest parent button only** lets artwork respond without creating another input target. Explicit class overrides are respected; a Frame with no eligible parent button reports a configuration error for input effects. Idle effects work on regular frames, text and images.

The existing layer tags also enable presets: `[smooth]`, `[up]`, `[turn]`, `[lean]`, `[float]`, `[spin]`, `[pulse]`, `[blink]`, `[fadein]`, `[shiny]`, `[glint]`, `[magnet]`, `[drift]`, and their underscore forms. Smooth combines hover/press; lean uses the parent button; shiny repeats and glint runs once on hover/focus. Explicit interaction settings replace tag defaults, and Off disables them.

## Preview and exported UI

Switch the preview to **Roblox**, then choose **Test UI**. Buttons can open, close and toggle panels, change tabs and show state artwork. Motion runs locally in one animation loop, without a React render per frame. **Restart** restores initial state; **Reduce motion** settles motion while preserving the current panels/tabs. **Stop test** restores the authored appearance. Layer selection stays in the explorer during testing.

The preview approximates text measurement, fading and image effects. It does not run game scripts, fetch gameplay data or play audio. Ordinary image tint is only shown accurately for prepared white-mask artwork. Shine follows the element's rectangular/rounded bounds, rather than arbitrary opaque image pixels. Verify the result in Studio Play.

Exports contain bounded settings and a trusted generated client runtime. JSON import, vanilla Luau, Roblox React Lua, Fusion, roblox-ts React, and `.rbxmx` output carry the same configuration. Native list/grid/flex cells reserve a **Motion slot** around spatially animated content, so hover or idle movement does not push siblings. The editor hides those generated wrappers. Their real native instances remain inspectable in Studio.

Hug content is measured back into the reservation. Wrapped text uses [Roblox's documented bounds API](https://create.roblox.com/docs/reference/engine/classes/TextService#GetTextBoundsAsync) when text, font or available width changes. Measurement results are discarded after cleanup or a superseding edit. Existing UIScales, authored transparency and hierarchy are restored when the runtime is disposed.

Roblox's reduced-motion preference settles movement, entrances, blinking, shine and texture drift while keeping actions and state visuals available. Native buttons provide the touch/gamepad input path; cursor attraction remains mouse-only. Pointer coordinates follow Roblox's [CoreUISafeInsets coordinate space](https://create.roblox.com/docs/reference/engine/classes/GuiBase2d#AbsolutePosition), including screens that ignore the top inset. Physical device acceptance is still pending.

Updates preserve original layer identities, custom scripts and event listeners when motion wrappers are added, changed or removed. Application content attached directly to a removed wrapper blocks that update so it can be moved deliberately. Editing the generated runtime also retains the existing update protection. Put application logic in a separate script.

## Examples

Try `examples/motion/panels-idle-texture.framebridge.json` for panel entrances and idle texture effects.
