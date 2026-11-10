# Optional UI interactions

Framebridge can generate button states, panel open/close/toggle actions, tabs, and live labels. Configure these in the collapsed **Interactions** section of the Figma Properties inspector. They execute on the client in Roblox Play mode. The browser preview shows layout and appearance; it does not run Roblox interaction scripts.

## Configure a design

1. Analyze the design, select a container, expand Interactions, and choose **Custom settings**.
2. Set **Container role → Panel** for a panel you want to open or close. Choose its initial visibility. A hidden tagged/configured panel is retained even when ordinary hidden layers are excluded.
3. Select a button and choose **On activate → Open panel**, **Close panel**, or **Toggle panel**. Targets are panels in the same screen, stored by stable layer identity. Close can use the nearest parent panel. Automatic instance selection creates a button; an explicit Frame class must be changed to a button or its action removed.
4. For tabs, mark a container **Tab group**, with panels directly inside it. Set a button's action to **Select tab** and choose a panel in that group. The runtime keeps exactly one managed panel visible, initially the first visible panel or the first panel if all are hidden.
5. Put state artwork in groups inside its owning button. Assign one group per **State visual**: Default, Hover, Pressed, Disabled or Selected. State visuals remain non-button content so their owner receives input.

**Use layer tags** reads the design's explicit tags; **Custom settings** replaces them; **Off for this layer** disables them. Settings use existing document storage and property Undo/Redo. Normal names such as Panel or Open shop do not imply application actions.

State priority is Disabled, Pressed, Selected, Hover, Default. A missing variant falls back to Default. Disabled follows the owning button's Active and Interactable flags. Selected follows a tab's panel or the button's boolean FramebridgeSelected attribute. GuiState supplies mouse hover/press; native Activated handles activation. Touch and physical gamepad acceptance remain pending.

## Layer tags

| Tag | Behavior |
| --- | --- |
| `[panel]` | Managed panel |
| `[tabgroup]` | Container for mutually exclusive direct-child panels |
| `[open:Shop]`, `[close:Shop]`, `[toggle:Shop]` | Resolve a unique panel named Shop in this screen |
| `[close]` | Close nearest parent panel |
| `[tab:Inventory]` | Select a panel directly in a tab group |
| `[state:default]`, `[state:hover]`, `[state:pressed]`, `[state:disabled]`, `[state:selected]` | Visual inside the nearest owning button |
| `[bind:attribute.Coins]` | Read LocalPlayer attribute Coins; text must contain `{Coins}` or `{value}` |
| `[bind:leaderstats.Coins]` | Read LocalPlayer.leaderstats.Coins with a placeholder |
| Text such as `Coins: {Coins}` | Infer one leaderstats binding and replace that placeholder |

Underscore aliases include `_panel`, `_tabgroup`, `_open:Shop`, `_close`, `_toggle:Shop`, `_tab:Inventory`, `_default`, `_hover`, `_clicked`/`_pressed`, `_disabled`, and `_active`/`_selected`. Bracket tags are clearer when combining settings or naming targets with spaces. Use Custom settings when a target name is ambiguous; it stores its identity instead. Cross-screen or excluded targets, duplicate state visuals, non-button actions and explicitly rasterized interaction hierarchies block export with a diagnostic.

## Live labels

On a native text layer, choose **Live text → Player attribute** or **Leaderstats value**, a simple key such as Coins, and a **Label template** such as `Coins: {value}`. This version supports one key per label, with any number of occurrences of `{value}`. Your game owns and supplies that data; the runtime does not grant currency or execute server actions.

Missing values display an em dash until available. Attribute and leaderstats updates are event-driven, including late creation, replacement and removal of stats. Supported leaderstats types are IntValue, NumberValue, StringValue and BoolValue. RichText escapes the rendered template and value; it does not interpret data as markup. Arbitrary paths, expressions, prototype code and executable package fields are unsupported.

Renaming a value or its leaderstats container away makes the label missing; renaming it back restores the binding. Existing children renamed into the required key or `leaderstats` are detected too. Name observation is capped at 1,024 direct children on the player and leaderstats container. Overflow displays missing data and emits a diagnostic; reducing the topology within the ceiling restores observation. Nested binding observers are included in the runtime's connection count and disconnected on rebuild/disposal.

## Import, update and export

The Studio importer adds a trusted, versioned LocalScript named **FramebridgeInteractions** to each interactive ScreenGui. Transfer packages remain data-only and cannot provide script source. Normal import/update validation checks targets and state ownership before applying changes. Matching GUI and generated script instances are reused; your event listeners and custom scripts remain attached. Removing all interactions detaches an untouched generated script. If you edited that script, update/removal stops before mutations and explains how to keep your edits.

All four source formats and .rbxmx include the configured interactions. React Lua and roblox-ts mount/clean up through an effect; Fusion registers cleanup in its scope; vanilla cleans up when its root is destroyed. roblox-ts includes **FramebridgeInteractions.luau**: install it as a sibling ModuleScript named FramebridgeInteractions beside the compiled Design module. Dev Mode returns that companion snippet too. Models embed the known client runtime as a LocalScript, so they need no companion plugin or framework at runtime.

## Examples

[Interaction examples](../examples/interactions/README.md) demonstrate panels, tabs and button states.
