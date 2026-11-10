import { expect, it } from "vitest";
import { node } from "../packages/core/src/demo";
import { artworkRenderContext } from "../plugins/figma/src/artwork-render-context";

const tree = node("parent", {
  id: "parent",
  children: [
    node("child", {
      id: "child",
      children: [node("grandchild", { id: "grandchild", type: "TEXT" })],
    }),
    node("Decoration [skip]", { id: "tagged", type: "TEXT" }),
  ],
});
it("scopes omission changes to the rendered subtree and ignores unrelated render/preparation edits", () => {
  const before = artworkRenderContext(tree, {}, new Set());
  expect(before).toBe('["tagged"]');
  expect(
    artworkRenderContext(
      tree,
      {
        elsewhere: { renderMode: "skip" },
        child: { renderMode: "image", imageProcessing: { whiteMask: true } },
      },
      new Set(["elsewhere"]),
    ),
  ).toBe(before);
  expect(
    artworkRenderContext(
      tree.children[0],
      { tagged: { renderMode: "native" } },
      new Set(),
    ),
  ).toBe("[]");
});
it("invalidates subtree and shadow artwork for nested skips and consumed scrollbar parts", () => {
  expect(
    artworkRenderContext(
      tree,
      { grandchild: { renderMode: "skip" } },
      new Set(),
    ),
  ).toBe('["grandchild","tagged"]');
  expect(artworkRenderContext(tree, {}, new Set(["child"]), "shadow")).toBe(
    '["child","tagged"]',
  );
  // Hidden parents already omit all of their children.
  expect(
    artworkRenderContext(
      tree,
      { child: { renderMode: "skip" }, grandchild: { renderMode: "skip" } },
      new Set(),
    ),
  ).toBe('["child","tagged"]');
});
it.each(["native", "image"] as const)(
  "restores tagged source artwork when explicitly set to %s",
  (mode) => {
    expect(
      artworkRenderContext(tree, { tagged: { renderMode: mode } }, new Set()),
    ).toBe("[]");
  },
);
it.each(["fills", "blend"] as const)(
  "keeps own-paint %s renders cached despite child omission changes",
  (mode) => {
    expect(
      artworkRenderContext(
        tree,
        { child: { renderMode: "skip" } },
        new Set(["tagged"]),
        mode,
      ),
    ).toBe("");
  },
);
