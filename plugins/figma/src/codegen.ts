import { compile } from "../../../packages/core/src/compiler";
import {
  generateSource,
  isSourceFormat,
  sourceAssetManifest,
} from "../../../packages/core/src/source-code";
import {
  DEFAULT_OPTIONS,
  type ExportOptions,
} from "../../../packages/core/src/types";
import { snapshot } from "./snapshot";
import { hasBehaviors } from "../../../packages/core/src/behaviors";
import { selectBehaviorRuntime } from "../../../packages/core/src/behavior-runtime.mjs";
import { hasThemes } from "../../../packages/core/src/theme-tokens";
import { hasParticles } from "../../../packages/core/src/particles";

export function startCodegenController(api: PluginAPI) {
  // Dev Mode is read-only. Never open the classic editor, render scratch nodes,
  // send a design, write plugin data, or include private upload settings here.
  api.codegen.on("generate", async ({ node, language }) => {
    try {
      if (!isSourceFormat(language))
        throw new Error("Choose a Framebridge source language.");
      let count = 0;
      const stack: [SceneNode, number][] = [[node, 0]];
      while (stack.length) {
        const [current, depth] = stack.pop()!;
        if (++count > 10000 || depth > 128)
          throw new Error(
            "Choose a smaller, shallower selection for Dev Mode.",
          );
        if ("children" in current)
          current.children.forEach((child) => stack.push([child, depth + 1]));
      }
      const saved = await api.clientStorage.getAsync("framebridge-options");
      let overrides = {};
      try {
        overrides = JSON.parse(
          api.root.getPluginData("framebridge-layer-overrides") || "{}",
        );
      } catch {
        /* An older document may have unreadable overrides. */
      }
      const layout = api.codegen.preferences.customSettings.layout;
      const options: ExportOptions = {
        ...DEFAULT_OPTIONS,
        ...saved,
        layerOverrides: overrides,
        layout: layout === "exact" ? "exact" : "responsive",
      };
      const pkg = compile(
        [snapshot(node)],
        api.root.getPluginData("framebridge-source") || `figma:${node.id}`,
        options,
      );
      const source = generateSource(pkg, language);
      const pending = pkg.assets.filter((asset) => !asset.robloxId).length;
      const notes = [
        "Generated layout and visuals use the selected Dev Mode layout preference and your saved Framebridge overrides.",
        ...(language === "fusion"
          ? ["Fusion output targets 0.3; pass a caller-owned Fusion scope."]
          : []),
        ...(pkg.assets.length
          ? [
              "Dev Mode does not render or upload artwork, so raster bounds are estimated. Use Analyze → Export source in the regular plugin for PNGs and measured raster bounds.",
            ]
          : []),
        ...(pending
          ? [
              `${pending} image(s) need Roblox asset IDs. Link the manifest images or pass existing image bindings.`,
            ]
          : []),
        ...pkg.issues.map((issue) => `${issue.nodeName}: ${issue.message}`),
      ];
      return [
        {
          title: language === "tsx" ? "Design.tsx" : "Design.luau",
          language: language === "tsx" ? "TYPESCRIPT" : "PLAINTEXT",
          code: source,
        },
        {
          title: "asset-manifest.json",
          language: "JSON",
          code: JSON.stringify(sourceAssetManifest(pkg), null, 2),
        },
        ...(language === "tsx" && hasBehaviors(pkg)
          ? [
              {
                title: "FramebridgeInteractions.luau",
                language: "PLAINTEXT" as const,
                code: selectBehaviorRuntime(
                  hasThemes(pkg),
                  hasParticles(pkg.roots),
                ),
              },
            ]
          : []),
        {
          title: "Conversion notes",
          language: "PLAINTEXT",
          code: notes.join("\n\n"),
        },
      ] satisfies CodegenResult[];
    } catch (error) {
      return [
        {
          title: "Framebridge",
          language: "PLAINTEXT",
          code:
            error instanceof Error
              ? error.message
              : "Could not generate source for this selection.",
        },
      ];
    }
  });
}
