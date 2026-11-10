import { IMAGE_BATCH_LIMITS } from "../../core/src/image-batches";
import { validateThemes } from "../../core/src/theme-tokens";
import { validateImageBindings } from "../../core/src/image-bindings";
import { scrollbarSlice } from "../../core/src/scrollbar";
import { validateWorldRoots } from "../../core/src/world-space";
import type { TransferPackage } from "../../core/src/types";
import { PublicError } from "./roblox";
import { validateTextDecorations } from "../../core/src/text-decoration";
import { validateBehaviors } from "../../core/src/behaviors";
import { validateMaskBases } from "../../core/src/native-clipping";
import {
  validateDecorations,
  validateDecorationAsset,
} from "../../core/src/decoration";

// Match the Studio importer's instance budget before any recursive feature
// validator runs. A sender capability must not permit a stack/memory exhaustion
// payload, nor carry executable instances through the data-only relay.
const UI_CLASSES = new Set(
  `SurfaceGui BillboardGui ScreenGui ScrollingFrame TextBox Frame CanvasGroup
  ViewportFrame TextLabel TextButton ImageLabel ImageButton UICorner UIStroke
  UIShadow UIGradient UIAspectRatioConstraint UISizeConstraint UITextSizeConstraint
  UIScale UIGridLayout UIListLayout UIFlexItem UIPadding`.split(/\s+/),
);
function validateStructure(pkg: TransferPackage) {
  const pending = pkg.roots.map((node) => ({ node, depth: 0 }));
  const seen = new Set<object>();
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      seen.has(node) ||
      depth > 128 ||
      !UI_CLASSES.has(node.className) ||
      !node.properties ||
      typeof node.properties !== "object" ||
      Array.isArray(node.properties) ||
      Object.keys(node.properties).some((key) =>
        ["Source", "Parent", "RunContext", "ScriptGuid", "Disabled"].includes(
          key,
        ),
      ) ||
      !Array.isArray(node.children)
    )
      throw new PublicError("Invalid or unsupported UI instance data.");
    seen.add(node);
    if (seen.size + pending.length + node.children.length > 15_000)
      throw new PublicError("Package exceeds the 15,000-instance limit.");
    for (const child of node.children)
      pending.push({ node: child, depth: depth + 1 });
  }
}
export function validatePackage(pkg: TransferPackage) {
  const allowed = new Set([
    "format",
    "version",
    "sourceId",
    "name",
    "createdAt",
    "options",
    "roots",
    "assets",
    "issues",
    "stats",
  ]);
  if (
    !pkg ||
    typeof pkg !== "object" ||
    Object.keys(pkg).some((k) => !allowed.has(k)) ||
    pkg.format !== "framebridge" ||
    pkg.version !== 1 ||
    !Array.isArray(pkg.roots) ||
    !pkg.roots.length ||
    pkg.roots.length > 100 ||
    !Array.isArray(pkg.assets) ||
    pkg.assets.length > IMAGE_BATCH_LIMITS.references ||
    !Array.isArray(pkg.issues)
  )
    throw new PublicError("Invalid Framebridge package.");
  if (
    pkg.assets.some(
      (asset) => !asset || typeof asset !== "object" || Array.isArray(asset),
    ) ||
    pkg.issues.some(
      (issue) => !issue || typeof issue !== "object" || Array.isArray(issue),
    )
  )
    throw new PublicError("Invalid Framebridge package.");
  validateStructure(pkg);
  if (pkg.issues.some((i) => i.severity === "error"))
    throw new PublicError("Resolve conversion errors before sending.");
  try {
    validateImageBindings(pkg);
    pkg.assets.forEach(validateDecorationAsset);
    validateDecorations(pkg.roots, pkg.assets);
    validateTextDecorations(pkg.roots);
    for (const asset of pkg.assets)
      if (asset.scrollbarSlice !== undefined)
        scrollbarSlice(asset.scrollbarSlice);
    validateBehaviors(pkg.roots);
    validateThemes(pkg.roots);
    validateMaskBases(pkg.roots);
    validateWorldRoots(pkg.roots);
  } catch {
    throw new PublicError("Invalid UI interaction data.");
  }
  if (
    pkg.assets.some(
      (a) => !/^(rbxassetid:\/\/)?[1-9]\d{0,19}$/.test(a.robloxId ?? ""),
    )
  )
    throw new PublicError(
      "Upload or link every image before sending to Studio.",
    );
  if (
    new Set(pkg.assets.map((a) => a.robloxId?.replace(/^rbxassetid:\/\//, "")))
      .size > IMAGE_BATCH_LIMITS.unique
  )
    throw new PublicError(
      "A design can contain at most 1,000 unique Roblox images.",
    );
  const raw = JSON.stringify(pkg);
  if (
    /"(?:apiKey|api_key|png|senderToken|receiverToken|ownerToken|receiptToken|loginToken|accountToken|oauthToken|access_token|refresh_token|client_secret|sealingKey)"\s*:/i.test(
      raw,
    )
  )
    throw new PublicError(
      "Credentials and image payloads cannot be included in a package.",
    );
}
