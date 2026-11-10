# Review export structure

Optional screenshot/metadata AI review in the hosted private build requires explicit sharing consent and an allowance for each request. It starts disabled and retains local review. See [optional AI review](VISION_REVIEW.md) for privacy, configuration and acceptance boundaries.

Analyze a selection, then open **More options → Review structure**. The optional pane explains the actual exported class for each source layer and offers reviewable corrections. Search by name, class or reason; switch from Suggestions to All layers to inspect existing classifications. Cards start collapsed, and the pane scrolls independently of the export footer. Twenty source layers appear per page; scans stop at 10,000 and explain when a smaller selection is needed.

Expand a card to see the evidence, expected effect and compatible class, layout, role and Roblox-name choices. **Inspect layer** opens the normal Properties inspector. The review changes export configuration, leaving the Figma artwork and layer names intact. Changes reanalyze automatically. **Undo correction** restores the previous configuration as one operation, including child LayoutOrder changes when accepting a list/grid.

## Suggestions and limits

| Choice | Evidence and result |
| --- | --- |
| Button | A compact container with a short action label may become TextButton. It keeps its content editable; inferred child labels remain TextLabel once their parent is explicitly a button. Explicit child buttons still win. Configure the action separately. |
| Scrolling | Axis-aligned children overflowing a clipped editable container suggest X, Y or XY scrolling. Clipping might be decoration, so this is a **Possible** suggestion. Accepting creates ScrollingFrame, ScrollingDirection and automatic canvas sizing. |
| List/grid | Consistent alignment and spacing suggest a list; equal cells in regular consecutive rows suggest a grid. Native layouts own child positions. Grid cells and gaps use the measured dimensions, and LayoutOrder follows visual order. Review padding: layouts start at the container's padding, which can differ from authored absolute positions. Uneven, overlapping, rotated and sparse arrangements require manual configuration instead. |
| Role | Panel/dialog names may suggest a panel action target. This marks a target for configured open/close/toggle actions; it does not create gameplay. Tab-group roles can also be chosen explicitly. |
| Name | Visible text may suggest a useful export name for generically named layers. Only the Roblox name changes. |

The pane uses local source metadata, measured geometry and the actual compiled package. **Possible** and **Likely** describe evidence strength, not measured probabilities. It does not use screenshot-based AI, send designs to a model, infer arbitrary gameplay or certify intent. Existing explicit choices take priority. Source auto layouts and existing native helper layouts are preserved. Children baked into an image are marked unavailable for separate corrections; keep that parent editable first.

Vectors and image artwork retain their normal automatic ImageLabel/ImageButton conversion. The explanation uses the converter's actual image reason. A user can still explicitly request a different class or rendering mode.

## Optional saved choices

Check **Remember this class, scroll, layout or role choice** before applying a correction. Meaningful source names are required; naming a Roblox export does not rename its Figma source. Saved rules match the normalized source name, exact Figma node type and content kind, even if a new source node has a different ID. They appear as **Saved choice** recommendations and require Apply each time. They never silently rewrite a design or override an explicit setting.

**Saved choices** lets you disable recommendations, remove one rule or reset local review preferences. The limit is 200. A later choice replaces the matching category, with class and scrolling sharing a category. **Naming and review hints** adds optional local naming conventions and up to 32 manually authored literal-name hints. Each remains a recommendation requiring review. Undo affects document configuration; it does not erase an intentionally saved preference.

Production preferences live in this plugin's Figma clientStorage, separately from document plugin data. Browser development uses localStorage. Records contain the matching name/type/content kind, known typed choices, authored hints and naming conventions. They exclude source IDs, artwork, Roblox asset IDs, upload keys and executable code; export packages do not contain the preference collection. Document-specific accepted overrides continue through the ordinary configuration/export path. Optional [private preference sync](REVIEW_PREFERENCE_SYNC.md) adds explicitly consented Personal/Roblox-group sharing, manual fetch/publish, version conflicts and reset/revoke/delete controls. Local storage remains the default and should not be treated as account-isolated sharing on a shared Figma installation.

Storage errors are visible. A correction can still affect the export when saving its future preference fails; retry storage before changing saved rules. Writes are serialized and acknowledged, and loading waits for pending writes. Plugin close waits for them too.
