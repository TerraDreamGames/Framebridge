# Conditional UI rules and layer selection

The combined version 11 runtime now initializes in a generated child ModuleScript. Native Play deletion checks restore rule-owned text/transparency and disconnect updates; source-edit guards and version 9 migration retain identity. Conditional/theme and conditional/tooltip ownership conflicts are rejected. See [RUNTIME_CLEANUP.md](RUNTIME_CLEANUP.md). Historical inline-bootstrap diagnostics below refer to the prior runtime.

Choose an editable layer in Framebridge's Layers view and expand **Conditional rules**. Add a rule, then configure IF, optional ELSE IF branches, THEN actions, and optional ELSE actions. Rules are saved with the normal Figma document layer overrides and use the existing Undo / Redo history. Targets are stable layer IDs; renaming a layer does not break them. Off in Interactions removes that layer's configured rules along with its other interactions.

Each branch tests **all** conditions (AND) or **any** condition (OR). The first matching branch wins. Conditions read a player attribute, a direct child value in `leaderstats`, or `workspace.CurrentCamera.ViewportSize` width/height. Supported leaderboard value classes are IntValue, NumberValue, StringValue and BoolValue. Your game supplies these values; Framebridge never writes them. Missing data fails ordinary comparisons; use Exists/Missing when absence matters. Number, text and boolean equality is strict: `100` differs from `"100"`. Ordered comparisons require numbers.

Leaderstats value and container renames are observed, including existing children renamed into a requested key or into `leaderstats`. Value-change subscriptions remain limited to requested supported values. Name observation accepts at most 1,024 direct player children and 1,024 direct leaderstats children. Exceeding either ceiling treats leaderstats as missing and emits a diagnostic; observing resumes when the topology returns within the ceiling. The same policy applies to live text and data-bound controls.

Actions set visibility, button Interactable, literal text, flat native background/text/image colors, or their transparencies. Text is escaped when RichText is enabled. There are no expressions, property paths, scripts, remote events, network calls, loops or actions that change rule inputs. This keeps UI feedback cycles out of the schema. Conditional visibility follows a generated motion slot so hidden animated layers release their reserved cells.

Only one rule may own a target property. Multiple branches of that rule may set the same property. Validation blocks competing state visuals, tab visibility, live-text bindings, hover tint and animated fade ownership. Conditional colors need a flat fill. A target must be a compatible GUI layer in the same screen; generated mask/background/layout helpers are excluded. Compiler errors, export validation, the relay and the Studio importer all enforce these boundaries.

When a matching branch does not assign a previously controlled property, the runtime restores its baseline. The compiler fingerprints the relevant design values so rebuilding after an import cannot restore an obsolete baseline over the new design. Explicit runtime disposal restores properties it still controls and preserves later application edits. React/Fusion/source renderers use their normal disposal/unmount paths. Runtime subscriptions are event driven, coalesced, and disconnected on disposal/rebuild; there is no polling loop for rules.

Limits: eight rules per author layer, 32 per screen, eight branches per rule, eight tests per branch and eight actions per branch/ELSE. Text action/comparison values are capped at 4,096 UTF-8 bytes. Rule JSON is capped at 12 KiB per layer and total behavior metadata at 16 KiB. Unknown fields and invalid types are rejected. The UI avoids default duplicate property actions and lets you collapse individual rules.

## Preview and layer matching

Select Roblox preview → **Test UI**. **Sample rule data** lets you supply local typed attribute/leaderstats values or mark them missing. Device/custom preview dimensions supply viewport inputs. These samples never leave the browser or modify the transfer package. Image tint approximation supports white masks; final native artwork/color/device rendering still needs Studio review.

In the layer explorer, **Select by rule** matches all/any tests against Figma layer names, exported names/classes, source types/text/dimensions, compiled visibility, baked status and saved overrides. Name/text tests are case insensitive literal comparisons, not regular expressions. **Select in editor** feeds the existing shared property/class editor, preserving other overrides and creating one Undo step for each bulk edit. **Select in Figma** resolves at most 1,000 distinct source layers on the current page before replacing native selection; missing/stale targets, cancellation, another selection request or a page change leave the old selection intact. Matching is bounded to 15,000 analyzed layers and eight tests.

## Examples

[Conditional rule examples](../examples/conditional-rules/README.md) include a store interface with live player data.
