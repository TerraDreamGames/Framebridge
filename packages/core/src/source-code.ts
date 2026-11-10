import { imageReferences } from "./image-bindings";
import { exportProperties, validateExportPackage } from "./export-package";
import { validAssetId } from "./geometry";
import { hasBehaviors } from "./behaviors";
import { worldAttributes } from "./world-space";
import { hasThemes } from "./theme-tokens";
import { hasParticles } from "./particles";
import { selectBehaviorRuntime } from "./behavior-runtime.mjs";
import type { RbxNode, TransferPackage, Value } from "./types";

export const SOURCE_FORMATS = [
  { id: "react", label: "React Lua", extension: "luau" },
  { id: "fusion", label: "Fusion 0.3", extension: "luau" },
  { id: "tsx", label: "roblox-ts JSX", extension: "tsx" },
  { id: "luau", label: "Vanilla Luau", extension: "luau" },
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number]["id"];
export const isSourceFormat = (value: unknown): value is SourceFormat =>
  SOURCE_FORMATS.some((format) => format.id === value);

// JSON's \u0000 escapes are not Luau string escapes. Fixed-width decimal
// escapes also keep a following digit from being absorbed into the escape.
export function quoteLuau(text: string) {
  return (
    '"' +
    text.replace(/["\\\x00-\x1f\x7f]/g, (c) =>
      c === '"' || c === "\\"
        ? "\\" + c
        : "\\" + c.charCodeAt(0).toString().padStart(3, "0"),
    ) +
    '"'
  );
}
// roblox-ts 3.0 preserves JSON-style \u0000 escapes in emitted Luau strings,
// where they are invalid. Emit uncommon controls as utf8.char expressions.
export function quoteTypeScript(text: string) {
  if (!/[\x00-\x08\x0b\x0c\x0e-\x1f\u2028\u2029]/.test(text))
    return JSON.stringify(text);
  const parts: string[] = [];
  let pending = "";
  for (const char of text) {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\u2028\u2029]/.test(char)) {
      if (pending) {
        parts.push(JSON.stringify(pending));
        pending = "";
      }
      parts.push(`utf8.char(${char.codePointAt(0)})`);
    } else pending += char;
  }
  if (pending) parts.push(JSON.stringify(pending));
  return parts.join(" + ");
}
const number = (n: number) => {
  if (!Number.isFinite(n)) throw new Error("Source values must be finite.");
  return String(Object.is(n, -0) ? 0 : n);
};
export function sourceValue(value: Value, typescript = false): string {
  const quote = typescript ? quoteTypeScript : quoteLuau;
  if (typeof value === "string") return quote(value);
  if (typeof value === "number") return number(value);
  if (typeof value === "boolean") return String(value);
  const constructor = (name: string, args: string[]) =>
    `${typescript ? "new " + name : name + ".new"}(${args.join(", ")})`;
  if (value.type === "Enum") return `Enum.${value.value[0]}.${value.value[1]}`;
  if (value.type === "Font")
    return constructor("Font", [
      quote(value.family),
      `Enum.FontWeight.${value.weight}`,
      `Enum.FontStyle.${value.style}`,
    ]);
  if (value.type === "ColorSequence" || value.type === "NumberSequence") {
    const points = value.value.map((point) =>
      constructor(
        `${value.type}Keypoint`,
        value.type === "ColorSequence"
          ? [
              number(point[0]),
              constructor("Color3", point.slice(1).map(number)),
            ]
          : point.map(number),
      ),
    );
    return constructor(value.type, [
      (typescript ? "[" : "{") + points.join(", ") + (typescript ? "]" : "}"),
    ]);
  }
  return constructor(value.type, (value.value as number[]).map(number));
}

export function sourceAssetManifest(pkg: TransferPackage) {
  return {
    format: "framebridge-assets",
    version: 1,
    assets: pkg.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      filename: asset.filename,
      robloxId: validAssetId(asset.robloxId) ?? null,
      ...(asset.processing ? { processing: asset.processing } : {}),
      ...(asset.renderMode ? { renderMode: asset.renderMode } : {}),
      ...(asset.backdrop ? { backdrop: asset.backdrop } : {}),
      ...(asset.scrollbarSlice ? { scrollbarSlice: asset.scrollbarSlice } : {}),
    })),
  };
}

export type SourceOptions = { component?: boolean };
const rootDefaults: Record<string, Value> = {
  Position: { type: "UDim2", value: [0, 0, 0, 0] },
  AnchorPoint: { type: "Vector2", value: [0, 0] },
  Rotation: 0,
  LayoutOrder: 0,
  ZIndex: 1,
  Visible: true,
  Active: false,
  Interactable: true,
};

export function generateSource(
  pkg: TransferPackage,
  format: SourceFormat,
  options: SourceOptions = {},
) {
  if (!isSourceFormat(format))
    throw new Error("Choose a supported source format.");
  validateExportPackage(pkg);
  if (
    options.component &&
    (pkg.roots.length !== 1 ||
      pkg.roots[0].className !== "ScreenGui" ||
      pkg.roots[0].children.length !== 1 ||
      pkg.roots[0].children[0].className.startsWith("UI") ||
      !pkg.roots[0].children[0].referenceSize)
  )
    throw new Error(
      "Extract one component template before exporting a widget module.",
    );
  const roots = options.component ? pkg.roots[0].children : pkg.roots;
  const rootIds = new Set(roots.map((n) => n.id));
  const mountRoot = (node: RbxNode) => rootIds.has(node.id);
  const properties = (node: RbxNode) => {
    const values = exportProperties(node);
    if (options.component && mountRoot(node))
      for (const [key, value] of Object.entries(rootDefaults))
        if (!values.some(([property]) => property === key))
          values.push([
            key,
            key === "Active" &&
            ["TextButton", "ImageButton", "TextBox"].includes(node.className)
              ? true
              : value,
          ]);
    return values;
  };
  const behaviors = hasBehaviors(pkg);
  const themeDefinitions = options.component ? pkg.roots[0].themes : undefined;
  const ts = format === "tsx";
  const quote = ts ? quoteTypeScript : quoteLuau;
  const indent = (level: number) => "  ".repeat(level);
  const defaults = pkg.assets.filter((a) => a.robloxId);
  const assetHelpers = ts
    ? [
        "const defaultAssets: { [id: string]: string | undefined } = {",
        ...defaults.map(
          (a) => `  [${quote(a.id)}]: ${quote(validAssetId(a.robloxId)!)},`,
        ),
        "};",
        "",
      ]
    : [
        "local defaultAssets = {",
        ...defaults.map(
          (a) => `  [${quote(a.id)}] = ${quote(validAssetId(a.robloxId)!)},`,
        ),
        "}",
        "",
        "local function image(assets, id)",
        "  local value = assets[id] or defaultAssets[id]",
        '  assert(type(value) == "string" and value:match("^rbxassetid://[1-9]%d*$") and #value <= 33, "Link the Roblox image in asset-manifest.json: " .. id)',
        "  return value",
        "end",
        "",
      ];
  const ordered: RbxNode[] = [];
  function order(node: RbxNode) {
    node.children.forEach(order);
    ordered.push(node);
  }
  roots.forEach(order);
  const indices = new Map(
    ordered.map((node, index) => [node.id, index + (ts ? 0 : 1)]),
  );
  const element = (node: RbxNode) => `elements[${indices.get(node.id)}]`;
  const propertyExpression = (node: RbxNode, key: string, value: Value) => {
    const fallback = sourceValue(value, ts);
    return options.component &&
      mountRoot(node) &&
      (key in rootDefaults || key === "Size" || key === "Name")
      ? ts
        ? `props.RootProps?.${key} ?? ${fallback}`
        : `rootProperty(rootProps, ${quote(key)}, ${fallback})`
      : fallback;
  };
  const metadata = (node: RbxNode, instance: string) => [
    ...Object.entries({
      ...(mountRoot(node) && hasParticles([node])
        ? { FramebridgeParticles: "1" }
        : {}),
      ...(node.themes || (mountRoot(node) && themeDefinitions)
        ? { FramebridgeThemes: JSON.stringify(node.themes ?? themeDefinitions) }
        : {}),
      ...(node.theme
        ? { FramebridgeThemeBinding: JSON.stringify(node.theme) }
        : {}),
      ...(node.textDecoration
        ? { FramebridgeTextDecoration: JSON.stringify(node.textDecoration) }
        : {}),
    }).map(
      ([key, value]) =>
        `${instance}${ts ? "." : ":"}SetAttribute(${quote(key)}, ${quote(value)})${ts ? ";" : ""}`,
    ),
    ...Object.entries(worldAttributes(node)).map(
      ([key, value]) =>
        `${instance}${ts ? "." : ":"}SetAttribute(${quote(key)}, ${quote(value)})${ts ? ";" : ""}`,
    ),
    `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeId")}, ${quote(node.id)})${ts ? ";" : ""}`,
    `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeSource")}, ${quote(pkg.sourceId)})${ts ? ";" : ""}`,
    ...(node.maskBasis
      ? [
          `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeMaskBasis")}, ${quote(node.maskBasis)})${ts ? ";" : ""}`,
        ]
      : []),
    ...(node.layoutCanvas
      ? [
          `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeLayoutCanvas")}, ${quote("true")})${ts ? ";" : ""}`,
        ]
      : []),
    ...(node.decorationRect
      ? [
          `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeDecorationRect")}, ${quote(JSON.stringify(node.decorationRect))})${ts ? ";" : ""}`,
        ]
      : []),
    ...(node.behavior
      ? [
          `${instance}${ts ? "." : ":"}SetAttribute(${quote("FramebridgeBehavior")}, ${quote(JSON.stringify(node.behavior))})${ts ? ";" : ""}`,
        ]
      : []),
  ];
  const reactNode = (node: RbxNode, level: number): string => {
    const space = indent(level);
    const values = properties(node).map(
      ([key, value]) =>
        `${space}  ${key} = ${propertyExpression(node, key, value)},`,
    );
    for (const [property, ref] of imageReferences(node))
      values.push(`${space}  ${property} = image(assets, ${quote(ref)}),`);
    if (behaviors)
      values.push(
        `${space}  ref = function(instance)\n${space}    if instance then\n${metadata(
          node,
          "instance",
        )
          .map((line) => `${space}      ${line}`)
          .join(
            "\n",
          )}\n${mountRoot(node) ? `${space}      refs.current[${quote(node.id)}] = instance\n` : ""}${space}    ${mountRoot(node) ? `else refs.current[${quote(node.id)}] = nil\n${space}    ` : ""}end\n${space}  end,`,
      );
    const children = node.children.map(
      (child) => `${space}  [${quote(child.id)}] = ${element(child)},`,
    );
    return `${space}React.createElement(${quote(node.className)}, {\n${values.join("\n")}\n${space}}${children.length ? `, {\n${children.join("\n")}\n${space}}` : ""})`;
  };
  const fusionNode = (node: RbxNode, level: number): string => {
    const space = indent(level);
    const values = properties(node).map(
      ([key, value]) =>
        `${space}  ${key} = ${propertyExpression(node, key, value)},`,
    );
    for (const [property, ref] of imageReferences(node))
      values.push(`${space}  ${property} = image(assets, ${quote(ref)}),`);
    if (node.children.length)
      values.push(
        `${space}  [Fusion.Children] = {\n${node.children.map((child) => indent(level + 2) + element(child) + ",").join("\n")}\n${space}  },`,
      );
    return `${space}scope:New(${quote(node.className)})({\n${values.join("\n")}\n${space}})`;
  };
  const jsxNode = (node: RbxNode, level: number): string => {
    const space = indent(level),
      tag = node.className.toLowerCase();
    const values = [
      `${space}  key={${quote(node.id)}}`,
      // rbxts React reserves Name; keep stable identity keys and set the
      // designer's readable instance name through its supported ref API.
      `${space}  ref={(instance) => { if (instance) { instance.Name = ${options.component && mountRoot(node) ? `props.RootProps?.Name ?? ${quote(node.name)}` : quote(node.name)}; ${behaviors ? metadata(node, "instance").join(" ") : ""}${behaviors && mountRoot(node) ? ` roots.current!.set(${quote(node.id)}, instance);` : ""} }${behaviors && mountRoot(node) ? ` else roots.current!.delete(${quote(node.id)});` : ""} }}`,
      ...properties(node)
        .filter(([key]) => key !== "Name")
        .map(
          ([key, value]) =>
            `${space}  ${key}={${propertyExpression(node, key, value)}}`,
        ),
    ];
    for (const [property, ref] of imageReferences(node))
      values.push(`${space}  ${property}={image(${quote(ref)})}`);
    return `${space}<${tag}\n${values.join("\n")}\n${space}${node.children.length ? `>\n${indent(level + 1)}{[${node.children.map(element).join(", ")}]}\n${space}</${tag}>` : "/>"}`;
  };
  let lines: string[] = [
    ts
      ? "// Generated by Framebridge. Layout and visuals; add game behavior in your project."
      : "-- Generated by Framebridge. Layout and visuals; add game behavior in your project.",
  ];
  if (behaviors && !ts)
    lines.push(
      `local Runtime = (function()\n${selectBehaviorRuntime(hasThemes(pkg), hasParticles(pkg.roots))}\nend)()`,
      "",
    );
  if (options.component && !ts)
    lines.push(
      "local function rootProperty(properties, key, fallback)",
      "  if properties and properties[key] ~= nil then return properties[key] end",
      "  return fallback",
      "end",
      "",
    );
  if (format === "react") {
    lines.push(
      'local React = require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("React"))',
      "",
      ...assetHelpers,
      "return function(props)",
      "  local assets = (props and props.Assets) or {}",
      ...(options.component
        ? ["  local rootProps = props and props.RootProps"]
        : []),
      ...(behaviors
        ? [
            "  local refs = React.useRef({})",
            "  React.useEffect(function()",
            "    local controllers = {}",
            '    for _, root in pairs(refs.current) do table.insert(controllers, Runtime.mount(root, {worldTarget = props and props.WorldTargets and props.WorldTargets[root:GetAttribute("FramebridgeId")] })) end',
            "    return function() for _, controller in ipairs(controllers) do controller.destroy() end end",
            "  end, {props and props.WorldTargets})",
          ]
        : []),
      "  local elements = {}",
      ...ordered.map(
        (node) => `  ${element(node)} = ${reactNode(node, 1).trimStart()}`,
      ),
      ...(options.component
        ? [`  return ${element(roots[0])}`]
        : [
            "  return React.createElement(React.Fragment, nil, {",
            ...roots.map(
              (root) => `    [${quote(root.id)}] = ${element(root)},`,
            ),
            "  })",
          ]),
      "end",
    );
  } else if (format === "fusion") {
    lines.push(
      'local Fusion = require(game:GetService("ReplicatedStorage"):WaitForChild("Packages"):WaitForChild("Fusion"))',
      "",
      ...assetHelpers,
      "-- The caller owns the Fusion 0.3 scope and calls Fusion.doCleanup(scope).",
      options.component
        ? "return function(scope, assets, rootProps)"
        : "return function(scope, assets, worldTargets)",
      "  assets = assets or {}",
      "  local elements = {}",
      ...ordered.map(
        (node) => `  ${element(node)} = ${fusionNode(node, 1).trimStart()}`,
      ),
      ...(behaviors
        ? ordered.flatMap((node) =>
            metadata(node, element(node)).map((line) => `  ${line}`),
          )
        : []),
      ...(behaviors
        ? roots.map(
            (root) =>
              `  table.insert(scope, Runtime.mount(${element(root)}, ${options.component ? "{}" : `{worldTarget = worldTargets and worldTargets[${quote(root.id)}]}`} ).destroy)`,
          )
        : []),
      ...(options.component
        ? [`  return ${element(roots[0])}`]
        : [
            "  return {",
            ...roots.map((root) => "    " + element(root) + ","),
            "  }",
          ]),
      "end",
    );
  } else if (format === "tsx") {
    lines.push(
      'import React from "@rbxts/react";',
      ...(behaviors
        ? [
            `const Runtime = require(script.Parent!.WaitForChild("FramebridgeInteractions") as ModuleScript) as { mount: (root: ${options.component ? "GuiObject" : "LayerCollector"}, options?: { worldTarget?: Instance }) => { destroy: () => void } };`,
          ]
        : []),
      "",
      ...assetHelpers,
      options.component
        ? "export interface DesignProps { Assets?: { [id: string]: string | undefined }; RootProps?: { Name?: string; Position?: UDim2; Size?: UDim2; AnchorPoint?: Vector2; Rotation?: number; LayoutOrder?: number; ZIndex?: number; Visible?: boolean; Active?: boolean; Interactable?: boolean; }; }"
        : "export interface DesignProps { Assets?: { [id: string]: string | undefined }; WorldTargets?: { [id: string]: Instance | undefined }; }",
      "",
      "export default function Design(props: DesignProps) {",
      "  const assets = props.Assets ?? {};",
      ...(behaviors
        ? [
            `  const roots = React.useRef(new Map<string, ${options.component ? "GuiObject" : "LayerCollector"}>());`,
            "  React.useEffect(() => {",
            "    const controllers = new Array<{ destroy: () => void }>();",
            options.component
              ? "    for (const [, root] of roots.current!) controllers.push(Runtime.mount(root));"
              : '    for (const [, root] of roots.current!) controllers.push(Runtime.mount(root, { worldTarget: props.WorldTargets?.[root.GetAttribute("FramebridgeId") as string] }));',
            "    return () => { for (const controller of controllers) controller.destroy(); };",
            options.component ? "  }, []);" : "  }, [props.WorldTargets]);",
          ]
        : []),
      "  function image(id: string): string {",
      "    const value = assets[id] ?? defaultAssets[id];",
      '    assert(value !== undefined && value.match("^rbxassetid://[1-9]%d*$")[0] !== undefined && value.size() <= 33, `Link the Roblox image in asset-manifest.json: ${id}`);',
      "    return value;",
      "  }",
      "  const elements: React.ReactElement[] = [];",
      ...ordered.map(
        (node) => `  ${element(node)} = (\n${jsxNode(node, 2)}\n  );`,
      ),
      ...(options.component
        ? [`  return ${element(roots[0])};`]
        : [
            "  return (",
            "    <>",
            ...roots.map((root) => "      {" + element(root) + "}"),
            "    </>",
            "  );",
          ]),
      "}",
    );
  } else {
    lines.push(
      ...assetHelpers,
      options.component
        ? "return function(parent, assets, rootProps)"
        : "return function(parent, assets, worldTargets)",
      "  assets = assets or {}",
      "  local created, roots, nodes = {}, {}, {}",
      "  local ok, result = pcall(function()",
    );
    let index = 0;
    const nodeLines = (node: RbxNode, parent?: string) => {
      const name = `nodes[${++index}]`;
      lines.push(
        `    ${name} = Instance.new(${quote(node.className)})`,
        `    table.insert(created, ${name})`,
      );
      for (const [key, value] of properties(node))
        lines.push(
          `    ${name}.${key} = ${propertyExpression(node, key, value)}`,
        );
      for (const [property, ref] of imageReferences(node))
        lines.push(`    ${name}.${property} = image(assets, ${quote(ref)})`);
      if (behaviors)
        lines.push(...metadata(node, name).map((line) => `    ${line}`));
      if (parent) lines.push(`    ${name}.Parent = ${parent}`);
      else lines.push(`    table.insert(roots, ${name})`);
      node.children.forEach((child) => nodeLines(child, name));
    };
    roots.forEach((root) => nodeLines(root));
    lines.push(
      "    for _, root in ipairs(roots) do root.Parent = parent end",
      ...(behaviors
        ? [
            options.component
              ? "    for _, root in ipairs(roots) do Runtime.mount(root) end"
              : '    for _, root in ipairs(roots) do Runtime.mount(root, {worldTarget = worldTargets and worldTargets[root:GetAttribute("FramebridgeId")]}) end',
          ]
        : []),
      options.component ? "    return roots[1]" : "    return roots",
      "  end)",
      "  if not ok then",
      "    for i = #created, 1, -1 do created[i]:Destroy() end",
      "    error(result, 0)",
      "  end",
      "  return result",
      "end",
    );
  }
  const source = lines.join("\n") + "\n";
  if (source.length > 4_000_000)
    throw new Error("Source exceeds 4 MB. Export smaller sections.");
  return source;
}
