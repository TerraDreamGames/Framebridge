import type { DesignNode, LayerOverride } from "./types";

const hint = /\[button\]|(?:^|[_\s-])(?:button|btn|textbutton|imagebutton)$/i;
const explicitName = /(?:^|[_\s-])(?:button|btn|cta)(?:$|[_\s-])/i;
const containerName =
  /\b(?:container|group|row|list|grid|panel|section|toolbar|bar|label|text|icon|background|states|variants)\b/i;
const actionName =
  /^(?:buy|purchase|play|start|continue|join|equip|unequip|claim|collect|submit|confirm|cancel|close|back|next|previous|save|apply|accept|decline|retry|upgrade|open|toggle|select|send)(?:\s+(?:now|game|item|all|menu|shop|settings|inventory|reward|rewards|changes))?$/i;
const clean = (name: string) => name.replace(/[_-]/g, " ").trim();
const visible = (n: DesignNode) => n.children.filter((c) => c.visible);

export type ButtonDetection = {
  button: boolean;
  className?: "TextButton" | "ImageButton";
  reason?: string;
};
/** Share content-based class inference with controls, themes and motion input. */
export function preferredButtonClass(
  n: DesignNode,
): "TextButton" | "ImageButton" {
  return buttonClass(n, visible(n));
}
function buttonClass(
  n: DesignNode,
  children: DesignNode[],
): "TextButton" | "ImageButton" {
  const hasText = !!n.text || children.some((c) => !!c.text);
  const hasArt =
    children.some((c) =>
      [
        "VECTOR",
        "BOOLEAN_OPERATION",
        "STAR",
        "POLYGON",
        "ELLIPSE",
        "LINE",
      ].includes(c.type),
    ) || n.fills.some((p) => p.visible !== false && p.type === "IMAGE");
  return /(?:^|[_\s-])imagebutton$/i.test(n.name) || (!hasText && hasArt)
    ? "ImageButton"
    : "TextButton";
}
/** Intention comes from names plus structure. Explicit instance choices always win. */
export function detectButton(
  n: DesignNode,
  parent: DesignNode | undefined,
  override: LayerOverride | undefined,
  enabled = true,
  parentOverride?: LayerOverride,
): ButtonDetection {
  return createButtonDetector()(n, parent, override, enabled, parentOverride);
}
/** A fresh detector belongs to one immutable snapshot, never a later analysis. */
export function createButtonDetector(): typeof detectButton {
  const childrenByNode = new WeakMap<DesignNode, DesignNode[]>();
  const simpleByNode = new WeakMap<DesignNode, boolean>();
  const parentButtons = new WeakMap<DesignNode, boolean>();
  const visibleChildren = (node: DesignNode) => {
    let children = childrenByNode.get(node);
    if (!children) {
      children = visible(node);
      childrenByNode.set(node, children);
    }
    return children;
  };
  const simpleControl = (candidate: DesignNode): boolean => {
    const cached = simpleByNode.get(candidate);
    if (cached !== undefined) return cached;
    const simple = !visibleChildren(candidate).some(
      (child) =>
        !!child.layout ||
        (visibleChildren(child).length > 0 &&
          !["GROUP", "VECTOR", "BOOLEAN_OPERATION"].includes(child.type)),
    );
    simpleByNode.set(candidate, simple);
    return simple;
  };
  const named = (candidate: DesignNode) =>
    explicitName.test(candidate.name) &&
    !containerName.test(clean(candidate.name));
  const automaticParentButton = (parent: DesignNode) => {
    const cached = parentButtons.get(parent);
    if (cached !== undefined) return cached;
    const button =
      hint.test(parent.name) ||
      (named(parent) && simpleControl(parent)) ||
      (actionName.test(clean(parent.name)) &&
        simpleControl(parent) &&
        visibleChildren(parent).some((child) => !!child.text));
    parentButtons.set(parent, button);
    return button;
  };
  return (n, parent, override, enabled = true, parentOverride) => {
    if (override?.className)
      return { button: override.className.endsWith("Button") };
    const children = visibleChildren(n);
    const className = buttonClass(n, children);
    if (hint.test(n.name))
      return { button: true, className, reason: "button hint" };
    if (!enabled) return { button: false };
    // Labels and icons inside a named button stay content, so there is one input target.
    if (
      parent &&
      (parentOverride?.className?.endsWith("Button") ||
        automaticParentButton(parent))
    )
      return { button: false };
    const simple = simpleControl(n);
    const content =
      !!n.text ||
      children.some(
        (c) =>
          !!c.text ||
          [
            "VECTOR",
            "BOOLEAN_OPERATION",
            "STAR",
            "POLYGON",
            "ELLIPSE",
            "LINE",
          ].includes(c.type),
      ) ||
      n.fills.some((p) => p.visible !== false && p.type === "IMAGE");
    if (named(n) && simple)
      return { button: true, className, reason: "interactive layer name" };
    if (parent && simple && content && actionName.test(clean(n.name)))
      return {
        button: true,
        className,
        reason: "action name and button content",
      };
    return { button: false };
  };
}

export function buttonLayerName(name: string): string {
  return (
    name
      .replace(/\[(?:button|raster|skip)\]/gi, "")
      .replace(/[_\s-](?:textbutton|imagebutton|button|btn)$/i, "")
      .trim() || "Layer"
  );
}
