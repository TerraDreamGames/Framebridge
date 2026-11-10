import { strToU8, zipSync } from "fflate";
import type { AnalysisResult } from "./types";
import { hasBehaviors } from "./behaviors";
import { hasThemes } from "./theme-tokens";
import { hasParticles } from "./particles";
import { selectBehaviorRuntime } from "./behavior-runtime.mjs";
import {
  generateSource,
  sourceAssetManifest,
  SOURCE_FORMATS,
  type SourceFormat,
  type SourceOptions,
} from "./source-code";

export function sourceReadme(format: SourceFormat) {
  return (
    `FRAMEBRIDGE SOURCE EXPORT\n\n${SOURCE_FORMATS.find((f) => f.id === format)!.label}\n\n` +
    "Design uses your conversion settings. Choose Responsive layout before analysis for responsive output; Studio import sizing controls do not change this source. Fonts, beta UI properties and image moderation still need review in your target Studio version.\n\n" +
    "Images: asset-manifest.json lists image identities and existing Roblox IDs. Upload unresolved images/ PNGs using Roblox Asset Manager, then pass an Assets mapping (keys are manifest IDs; values are rbxassetid://123). Unlinked images raise a clear error instead of silently disappearing. Linked IDs are included in the module.\n\n" +
    (format === "react"
      ? "Install React Lua and ReactRoblox in ReplicatedStorage/Packages. Save Design.luau as a ModuleScript. In a LocalScript, require it and mount React.createElement(Design, { Assets = bindings }) with ReactRoblox.createPortal into PlayerGui. Unmount the React root when finished. Adjust the require path if your packages live elsewhere.\n"
      : format === "fusion"
        ? "Install Fusion 0.3 in ReplicatedStorage/Packages. Save Design.luau as a ModuleScript. Create scope = Fusion.scoped(Fusion), call require(Design)(scope, bindings), and parent returned UI collectors to PlayerGui. The caller owns the scope: call Fusion.doCleanup(scope) when finished. Adjust the require path for your project. Fusion 0.2 has a different API.\n"
        : format === "tsx"
          ? "Use a roblox-ts project with @rbxts/react and @rbxts/react-roblox. Set jsx to react, jsxFactory to React.createElement, jsxFragmentFactory to React.Fragment. Import Design.tsx and mount <Design Assets={bindings} /> through a ReactRoblox portal to PlayerGui. The generated TSX needs your project's compiler and current Roblox type definitions; it is not executable JavaScript.\n"
          : "Save Design.luau as a ModuleScript. In a LocalScript, call require(Design)(PlayerGui, bindings). It returns an array of UI collectors. Destroy these roots when finished. Passing nil as the parent builds a detached hierarchy.\n") +
    "\nWorld UI: pass actual Instances keyed by collector ID (for example screen:123:456). React/TSX use WorldTargets; Fusion and vanilla take worldTargets as the third argument. SurfaceGui needs a BasePart with CanQuery enabled; BillboardGui needs a BasePart or Attachment. Custom prompt UI needs a ProximityPrompt already created by your server with Style=Custom. Parent collectors to PlayerGui for interactive input. This source does not create or configure server gameplay objects. Configure the prompt properties from your exported world settings, mount before enabling the prompt, and connect Triggered in your game.\n" +
    "\nTheme tokens: if configured, set FramebridgeTheme on each exported root or widget to a named mode (for example Dark). Definitions and only used tokens travel with this module. Application edits to managed properties take precedence until remount/configuration changes; keep your own logic in separate scripts.\n" +
    "\nParticles: configured built-in confetti and 2D emitters run on the client with bounded capacity. Increment FramebridgeParticleBurst/FramebridgeParticlesClear attributes on the emitter to burst/cancel. Installed Emitter2D requires your reviewed, exact-version script-free template and installed client; missing/mismatched dependencies report status and suppress emission. See UI_PARTICLES.md in the plugin bundle for the contract and retry.\n" +
    "\nEditable text shadows retain authored capture only while native text/font/geometry agree; live edits and bindings use bounded native glyph contours. Blur and negative spread are approximations. Keep the generated runtime with your UI.\n" +
    "\nConfigured interactions run on the client: button states, panel actions, tabs and live text. Your game supplies Player attributes or leaderstats values. React cleans up on unmount; Fusion on scope cleanup; vanilla Luau on root destruction. For TSX with interactions, keep FramebridgeInteractions.luau next to the compiled Design ModuleScript. Keep application logic in your own project. These source modules do not participate in Framebridge's instance-update tracking.\n"
  );
}

export function buildSourceExport(
  result: AnalysisResult,
  format: SourceFormat,
  options: SourceOptions = {},
) {
  const source = generateSource(result.package, format, options);
  const files: Record<string, Uint8Array> = {
    [`Design.${format === "tsx" ? "tsx" : "luau"}`]: strToU8(source),
    "asset-manifest.json": strToU8(
      JSON.stringify(sourceAssetManifest(result.package), null, 2),
    ),
    "conversion-report.json": strToU8(
      JSON.stringify(result.package.issues, null, 2),
    ),
    "READ_ME.txt": strToU8(
      options.component ? componentReadme(format) : sourceReadme(format),
    ),
  };
  if (format === "tsx" && hasBehaviors(result.package))
    files["FramebridgeInteractions.luau"] = strToU8(
      selectBehaviorRuntime(
        hasThemes(result.package),
        hasParticles(result.package.roots),
      ) + "\n",
    );
  for (const asset of result.package.assets.filter((a) => !a.robloxId)) {
    const bytes = result.assets[asset.id];
    if (!bytes?.length)
      throw new Error(`The image for ${asset.name} is missing. Analyze again.`);
    if (!/^[a-zA-Z0-9_-]+\.png$/.test(asset.filename))
      throw new Error("Invalid image filename.");
    const path = `images/${asset.filename}`;
    if (files[path]) throw new Error("Duplicate source image filename.");
    files[path] = new Uint8Array(bytes);
  }
  const base = (result.package.name || "design")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  return {
    name: `${base}.${format}.zip`,
    data: zipSync(files),
    mime: "application/zip",
  };
}

export function componentReadme(format: SourceFormat) {
  return (
    `FRAMEBRIDGE REUSABLE COMPONENT\n\n${SOURCE_FORMATS.find((f) => f.id === format)!.label}\n\n` +
    "This module creates one GuiObject, with native editable children. Mount it inside an existing ScreenGui/SurfaceGui/BillboardGui, or inside another GuiObject. Each mounted copy owns its interaction runtime; copies may share artwork without sharing button state. It is a snapshot, with no live link to Figma or Framebridge reimport tracking. External interaction dependencies must be included in the extracted subtree.\n\n" +
    "RootProps supports Name, Position, Size, AnchorPoint, Rotation, LayoutOrder, ZIndex, Visible, Active and Interactable. Position defaults to (0, 0), Size to the authored pixel bounds. Internal layout uses the conversion settings of your analysis. Set a suitable Size for each parent and test it at your target resolutions. State families use equal-sized visuals under one button. Disabled follows Active/Interactable; Selected uses the FramebridgeSelected attribute; hover/press follow native button input. Missing states show Default. Game actions remain in your project.\n\n" +
    (format === "react"
      ? "Install React Lua/ReactRoblox in ReplicatedStorage/Packages. Save Design.luau as a ModuleScript and render React.createElement(Component, {Assets=bindings, RootProps={Size=UDim2.fromOffset(160,48), Position=UDim2.fromScale(0.5,0.5)}}) inside your screen. Unmount the React root when finished.\n"
      : format === "fusion"
        ? "Install Fusion 0.3 in ReplicatedStorage/Packages. With scope=Fusion.scoped(Fusion), call require(Design)(scope, bindings, {Size=UDim2.fromOffset(160,48)}). Parent the returned GuiObject to your screen/container. Call Fusion.doCleanup(scope) when finished.\n"
        : format === "tsx"
          ? "Use roblox-ts with @rbxts/react and @rbxts/react-roblox. Render <Component Assets={bindings} RootProps={{ Size: UDim2.fromOffset(160,48) }} /> inside your existing screen. Compile Design.tsx with your project. If included, place FramebridgeInteractions.luau alongside the compiled component ModuleScript. Unmount to clean up.\n"
          : "Save Design.luau as a ModuleScript. Call require(Design)(container, bindings, {Size=UDim2.fromOffset(160,48)}); it returns one GuiObject. Call it again for another independent copy. Destroy each returned widget to clean up its runtime. Passing nil builds a detached widget.\n") +
    "\nTheme tokens: when configured, each widget copy has its used definitions. Set the copy's FramebridgeTheme attribute to a named mode such as Dark. Runtime cleanup follows the same ownership as other interactions.\n" +
    "\nImages: asset-manifest.json includes linked IDs. Upload unresolved images/ PNGs to Roblox and pass bindings keyed by manifest ID, with rbxassetid://123 values. Unlinked artwork fails clearly. Dependencies are installed by your game, not downloaded by the component. Review fonts, beta properties, image permissions/moderation and input behavior before shipping.\n"
  );
}
