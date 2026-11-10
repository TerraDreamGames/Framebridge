# Download an editable Roblox UI model

After analyzing your Figma selection, open **More options → Connection & export → Export Roblox model** and choose **Download .rbxmx**. In Studio, right-click **StarterGui**, choose **Insert from File**, and select the downloaded model. The ordinary UI works without the Framebridge Studio plugin or a runtime library. Explicitly configured [UI interactions](UI_BEHAVIORS.md) include a trusted LocalScript in each interactive ScreenGui; they execute in Play and clean up when destroyed.

The model contains the converted instance hierarchy, text, fonts, layout modifiers, appearance, and linked Roblox image IDs. Choose **Responsive** in Conversion settings before analysis when you want responsive sizing. This export uses the conversion settings, including per-layer overrides; it does not use the Studio import sizing switch.

Upload or link every image in **Images** first. The model download stays unavailable while images are unlinked; **Link images** takes you to those controls. The normal package download remains available with unresolved PNGs. A model references Roblox image assets; it does not embed PNGs or bypass image ownership, experience permissions, or moderation.

Each imported instance keeps its Framebridge source, layer, asset, and property-ownership attributes. These allow the companion importer to recognize the model during a later update. Manual model insertion itself does not synchronize subsequent Figma edits. Imported controls still need game behavior supplied by your scripts. A ViewportFrame keeps its UI children and lighting; add its model and Camera in Studio.

World-space models need an actual target after insertion. Set SurfaceGui.Adornee to a Workspace Part, or BillboardGui.Adornee to a Part or Attachment. For custom prompt output, bind FramebridgeWorldTarget.Value to a Custom-style ProximityPrompt. The matching Studio plugin's **UI tools → World UI → Bind world target** handles these bindings and can create a prompt from the exported settings. Keep these UI roots in StarterGui so their client scripts run in PlayerGui. See [world-space setup](WORLD_SPACE.md).

XML preserves quotes, rich-text markup, Unicode, whitespace, and line breaks. Unrepresentable XML control characters receive a clear error with the package-download alternative. Offsets and integer properties use the same truncation as native Roblox setters. Screen insets and corner radii use their current serialized properties, avoiding legacy setter ordering.
