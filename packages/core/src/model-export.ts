import { imageReferences } from "./image-bindings";
import { hasParticles } from "./particles";
import { strToU8 } from "fflate";
import { validAssetId } from "./geometry";
import { exportProperties, validateExportPackage } from "./export-package";
import {
  selectBehaviorClient,
  BEHAVIOR_VERSION,
  BEHAVIOR_BOOTSTRAP_SOURCE,
  behaviorModuleSource,
} from "./behavior-runtime.mjs";
import { isGuiRoot, worldAttributes } from "./world-space";
import { flatten } from "./types";
import { MODEL_ENUM_VALUES, MODEL_INTEGER_PROPERTIES } from "./model-metadata";
import type { AnalysisResult, RbxNode, TransferPackage, Value } from "./types";

function xml(text: string): string {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (!(
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
    ))
      throw new Error(
        "A layer name or text contains characters that Roblox XML cannot represent. Remove the control character or download the Framebridge package instead.",
      );
  }
  return text.replace(
    /[&<>"'\r]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
        "\r": "&#13;",
      })[char]!,
  );
}
function number(value: number, integer = false): string {
  if (!Number.isFinite(value)) throw new Error("Model values must be finite.");
  // Native integer setters and UDim constructors truncate towards zero.
  return String(integer ? Math.trunc(value) : Object.is(value, -0) ? 0 : value);
}
function enumNumber(family: string, item: string): number {
  const value = MODEL_ENUM_VALUES[family]?.[item];
  if (value === undefined)
    throw new Error(`Unsupported model enum: ${family}.${item}.`);
  return value;
}
function property(name: string, value: Value): string {
  const element = (tag: string, body: string) =>
    `<${tag} name="${name}">${body}</${tag}>`;
  if (typeof value === "boolean") return element("bool", String(value));
  if (typeof value === "number") {
    const integer = MODEL_INTEGER_PROPERTIES.includes(name);
    return element(integer ? "int" : "float", number(value, integer));
  }
  if (typeof value === "string")
    return ["Image", "TopImage", "MidImage", "BottomImage"].includes(name)
      ? element(
          "ContentId",
          value ? `<url>${xml(value)}</url>` : "<null></null>",
        )
      : element("string", xml(value));
  if (value.type === "Enum")
    return element("token", String(enumNumber(...value.value)));
  if (value.type === "Font")
    return element(
      "Font",
      `<Family><url>${xml(value.family)}</url></Family><Weight>${enumNumber("FontWeight", value.weight)}</Weight><Style>${xml(value.style)}</Style>`,
    );
  if (value.type === "Rect")
    return element(
      "Rect2D",
      `<min><X>${number(value.value[0])}</X><Y>${number(value.value[1])}</Y></min><max><X>${number(value.value[2])}</X><Y>${number(value.value[3])}</Y></max>`,
    );
  if (value.type === "ColorSequence" || value.type === "NumberSequence")
    return element(
      value.type,
      value.value
        .map((point) => [...point, 0].map((n) => number(n)).join(" "))
        .join(" ") + " ",
    );
  const fields = {
    Color3: ["R", "G", "B"],
    Vector2: ["X", "Y"],
    Vector3: ["X", "Y", "Z"],
    UDim: ["S", "O"],
    UDim2: ["XS", "XO", "YS", "YO"],
  }[value.type];
  return element(
    value.type,
    fields
      .map(
        (key, index) =>
          `<${key}>${number((value.value as number[])[index], key === "O" || key === "XO" || key === "YO")}</${key}>`,
      )
      .join(""),
  );
}

// Roblox AttributesSerialize: count, then UTF-8 name / string type 0x02 / value.
// Lengths are little-endian byte counts, not JavaScript character counts.
// https://github.com/rojo-rbx/rbx-dom/tree/master/rbx_types/src/attributes
function attributes(values: Record<string, string>): string {
  const parts: Uint8Array[] = [];
  const u32 = (value: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    parts.push(bytes);
  };
  const string = (value: string) => {
    const bytes = strToU8(value);
    u32(bytes.length);
    parts.push(bytes);
  };
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  u32(entries.length);
  for (const [name, value] of entries) {
    string(name);
    parts.push(new Uint8Array([2]));
    string(value);
  }
  const bytes = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const encoded: string[] = [];
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index],
      b = bytes[index + 1],
      c = bytes[index + 2];
    encoded.push(
      alphabet[a >> 2] +
        alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] +
        (b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) +
        (c === undefined ? "=" : alphabet[c & 63]),
    );
  }
  return `<BinaryString name="AttributesSerialize">${encoded.join("")}</BinaryString>`;
}

export function generateModel(pkg: TransferPackage): string {
  validateExportPackage(pkg);
  const pending = pkg.assets.filter((asset) => !validAssetId(asset.robloxId));
  if (pending.length)
    throw new Error(
      `Link ${pending.length} image${pending.length === 1 ? "" : "s"} in Images before downloading a Roblox model. Use Upload all images or enter their Roblox asset IDs.`,
    );
  const assets = new Map(
    pkg.assets.map((asset) => [asset.id, validAssetId(asset.robloxId)!]),
  );
  let referent = 0;
  const item = (node: RbxNode, depth: number): string => {
    const indent = "  ".repeat(depth);
    const id = `RBX${++referent}`;
    const props = exportProperties(node).flatMap(
      ([name, value]): [string, Value][] => {
        if (node.className === "ScreenGui" && name === "IgnoreGuiInset")
          return [
            [
              "ScreenInsets",
              {
                type: "Enum",
                value: [
                  "ScreenInsets",
                  value ? "DeviceSafeInsets" : "CoreUISafeInsets",
                ],
              },
            ],
          ];
        if (node.className === "UICorner" && name === "CornerRadius")
          return [
            "TopLeftRadius",
            "TopRightRadius",
            "BottomLeftRadius",
            "BottomRightRadius",
          ].map((key) => [key, value]);
        return [[name, value]];
      },
    );
    const values = props.map(([name, value]) => property(name, value));
    for (const [key, ref] of imageReferences(node))
      values.push(property(key, assets.get(ref)!));
    values.push(
      attributes({
        ...(pkg.roots.includes(node) && hasParticles([node])
          ? { FramebridgeParticles: "1" }
          : {}),
        ...worldAttributes(node),
        ...(node.themes
          ? { FramebridgeThemes: JSON.stringify(node.themes) }
          : {}),
        ...(node.theme
          ? { FramebridgeThemeBinding: JSON.stringify(node.theme) }
          : {}),
        ...(node.textDecoration
          ? { FramebridgeTextDecoration: JSON.stringify(node.textDecoration) }
          : {}),
        FramebridgeId: node.id,
        FramebridgeSource: pkg.sourceId,
        FramebridgeProperties: JSON.stringify(
          Object.keys(node.properties).sort(),
        ),
        ...(node.assetRef ? { FramebridgeAsset: node.assetRef } : {}),
        ...(node.maskBasis ? { FramebridgeMaskBasis: node.maskBasis } : {}),
        ...(node.layoutCanvas ? { FramebridgeLayoutCanvas: "true" } : {}),
        ...(node.decorationRect
          ? { FramebridgeDecorationRect: JSON.stringify(node.decorationRect) }
          : {}),
        ...Object.fromEntries(
          Object.entries(node.assetBindings ?? {}).map(([key, ref]) => [
            `FramebridgeAsset_${key}`,
            ref,
          ]),
        ),
        ...(node.behavior
          ? { FramebridgeBehavior: JSON.stringify(node.behavior) }
          : {}),
      }),
    );
    const worldReference = node.worldUI
      ? `${indent}  <Item class="ObjectValue" referent="RBX${++referent}"><Properties><string name="Name">FramebridgeWorldTarget</string><Ref name="Value">null</Ref>${attributes({ FramebridgeId: node.id + "/world-target", FramebridgeSource: pkg.sourceId, FramebridgeProperties: '["Value"]' })}</Properties></Item>\n`
      : "";
    const clientSource = selectBehaviorClient(
      !!node.themes,
      hasParticles([node]),
    );
    const moduleSource = behaviorModuleSource(clientSource);
    const runtime =
      (isGuiRoot(node.className) ||
        (pkg.roots.includes(node) && hasParticles([node]))) &&
      (node.worldUI ||
        node.themes ||
        flatten([node]).some(
          (child) =>
            child.behavior ||
            child.maskBasis ||
            child.decorationRect ||
            child.textDecoration ||
            child.layoutCanvas,
        ))
        ? `${indent}  <Item class="LocalScript" referent="RBX${++referent}"><Properties><string name="Name">FramebridgeInteractions</string><ProtectedString name="Source">${xml(BEHAVIOR_BOOTSTRAP_SOURCE)}</ProtectedString>${attributes({ FramebridgeId: node.id + "/behavior-runtime", FramebridgeSource: pkg.sourceId, FramebridgeProperties: '["Source"]', FramebridgeRuntime: BEHAVIOR_VERSION, FramebridgeGeneratedSource: BEHAVIOR_BOOTSTRAP_SOURCE })}</Properties><Item class="ModuleScript" referent="RBX${++referent}"><Properties><string name="Name">FramebridgeRuntime</string><ProtectedString name="Source">${xml(moduleSource)}</ProtectedString>${attributes({ FramebridgeId: node.id + "/behavior-runtime/module", FramebridgeSource: pkg.sourceId, FramebridgeProperties: '["Source"]', FramebridgeRuntime: BEHAVIOR_VERSION, FramebridgeGeneratedSource: moduleSource })}</Properties></Item></Item>\n`
        : "";
    return `${indent}<Item class="${node.className}" referent="${id}">\n${indent}  <Properties>\n${values.map((value) => indent + "    " + value).join("\n")}\n${indent}  </Properties>\n${node.children.map((child) => item(child, depth + 1)).join("")}${worldReference}${runtime}${indent}</Item>\n`;
  };
  // Match Studio's header: some Roblox tooling detects XML by <roblox itself.
  return `<roblox version="4">\n  <Meta name="ExplicitAutoJoints">true</Meta>\n${pkg.roots.map((root) => item(root, 1)).join("")}</roblox>\n`;
}

export function buildModelExport(result: AnalysisResult) {
  const base = (result.package.name || "design")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  return {
    name: `${base}.rbxmx`,
    data: strToU8(generateModel(result.package)),
    mime: "application/xml",
  };
}
