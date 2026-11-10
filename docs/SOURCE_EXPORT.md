# Export UI source code

Use source export when your game owns its UI through code. The regular Studio importer remains available for designers who want ordinary editable instances in Explorer.

## Download from Figma

1. Select and analyze the design in Framebridge. Choose Responsive in conversion settings before analysis if you want responsive output.
2. Open **More options → Export options → Export source code**.
3. Choose **React Lua**, **Fusion 0.3**, **roblox-ts JSX**, or **Vanilla Luau**.
4. Download source, copy the module, or open its read-only preview.

The ZIP contains Design.luau or Design.tsx, asset-manifest.json, conversion-report.json, READ_ME.txt and any unresolved images/ PNGs. Already linked Roblox image IDs are included in the module. Upload unresolved images through Asset Manager, then pass a binding map keyed by the manifest's image identities:

```lua
local assets = {
    ["image:your-layer-id"] = "rbxassetid://123456789",
}
```

Your map overrides included IDs. A missing/invalid binding raises a readable error. Upload processing, moderation and ownership permissions still apply. Source uses the analyzed conversion's geometry; the Studio import sizing selector does not alter it. Individual corner radii are normalized so an aggregate CornerRadius setter cannot overwrite them in a declarative renderer.

Generated modules cover layout, appearance and explicitly configured [UI interactions](UI_BEHAVIORS.md). Your game supplies application logic and data. They are independent of Framebridge's instance-update tracking; re-send through the companion importer does not update a UI mounted from source. React effects and Fusion scopes own interaction cleanup; destroying vanilla roots disconnects their runtime. Interactive roblox-ts exports include FramebridgeInteractions.luau, installed as a sibling ModuleScript beside the compiled Design module; Dev Mode includes this companion snippet too.

## React Lua

Optional [style sizing](STYLE_SIZING.md) is included in every source format. Proportional automatic scroll gaps include the trusted layout helper; install the emitted runtime companion for roblox-ts too.

Install React and ReactRoblox under ReplicatedStorage/Packages, save Design.luau as a ModuleScript beside your mounting LocalScript, and adjust paths to your project's package layout:

```lua
local Players = game:GetService("Players")
local Packages = game:GetService("ReplicatedStorage"):WaitForChild("Packages")
local React = require(Packages:WaitForChild("React"))
local ReactRoblox = require(Packages:WaitForChild("ReactRoblox"))
local Design = require(script.Parent:WaitForChild("Design"))
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local container = Instance.new("Folder")
local root = ReactRoblox.createRoot(container)
root:render(ReactRoblox.createPortal(React.createElement(Design, {
    Assets = assets, -- omit this when all images are already linked
}), playerGui))

-- When this UI is no longer needed:
-- root:unmount()
-- container:Destroy()
```

Generated keys use stable layer IDs. Roblox instance names keep the designer's readable names. Reference: [React Lua](https://github.com/Roblox/react-luau).

## Fusion 0.3

Install Fusion under ReplicatedStorage/Packages. This output uses 0.3's scope API; Fusion 0.2 requires a different API.

```lua
local Fusion = require(game:GetService("ReplicatedStorage").Packages.Fusion)
local Design = require(script.Parent.Design)
local playerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local scope = Fusion.scoped(Fusion)
local screens = Design(scope, assets)
for _, screen in ipairs(screens) do screen.Parent = playerGui end

-- The caller owns cleanup:
-- Fusion.doCleanup(scope)
```

References: [instance construction](https://elttob.uk/Fusion/0.3/tutorials/roblox/new-instances/) and [scopes](https://elttob.uk/Fusion/0.3/tutorials/fundamentals/scopes/).

## roblox-ts JSX

Use a roblox-ts project with `@rbxts/react`, `@rbxts/react-roblox` and Roblox type definitions compatible with the properties your design uses. Set these compiler options:

```json
{
  "jsx": "react",
  "jsxFactory": "React.createElement",
  "jsxFragmentFactory": "React.Fragment"
}
```

Import Design.tsx and mount it through the ReactRoblox renderer:

```tsx
import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import Design from "./Design";

const playerGui = game.GetService("Players").LocalPlayer.WaitForChild("PlayerGui");
const container = new Instance("Folder");
const root = ReactRoblox.createRoot(container);
root.render(ReactRoblox.createPortal(<Design Assets={assets} />, playerGui));

// When finished: root.unmount(); container.Destroy();
```

This is TypeScript for roblox-ts, rather than browser JavaScript. JSX reserves Name, so the generated ref sets each instance's readable name while its key preserves layer identity. Reference: [Roblox React TypeScript bindings](https://github.com/littensy/rbxts-react).

## Vanilla Luau

Save Design.luau as a ModuleScript and call it from a LocalScript:

```lua
local playerGui = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local screens = require(script.Parent.Design)(playerGui, assets)

-- When finished:
-- for _, screen in ipairs(screens) do screen:Destroy() end
```

Passing nil as the parent builds a detached hierarchy. Construction stages the full graph before parenting roots and destroys created objects if a property or image binding fails.

## Figma Dev Mode

The manifest registers the same four languages for Framebridge in the Dev Mode code menu. Select a frame and choose a language; its snippets include source, the asset manifest and conversion notes. The layout preference defaults to Responsive and can use Measured pixels. Saved conversion options and document layer overrides are read, while private upload/connection settings are excluded.

Dev Mode is read-only. It does not open the editor, create scratch layers, render images, upload, or save IDs/settings. Artwork bounds are estimated even if an asset is already linked. Use the normal plugin's analyzed export for measured PNG bounds. The generate callback checks selection depth/size before taking a snapshot. [Figma's codegen guide](https://developers.figma.com/docs/plugins/codegen-plugins/) describes the host workflow.
