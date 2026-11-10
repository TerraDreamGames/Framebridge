import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StructureReview } from "../plugins/figma/src/StructureReview";
import { VisionReview } from "../plugins/figma/src/VisionReview";
import { createOverrideHistory } from "../plugins/figma/src/override-history";
import { EMPTY_REVIEW_PREFERENCES } from "../packages/core/src/structure-review";

const memory = {
  preferences: EMPTY_REVIEW_PREFERENCES,
  loading: false,
  saving: false,
  error: "",
  save: async () => true,
  restore: async () => {},
};
const undoButton = (html: string, label: string) => {
  const button = html.match(
    new RegExp(`<button\\b[^>]*>${label}</button>`),
  )?.[0];
  expect(button).toBeDefined();
  return button!;
};

describe("review correction Undo availability", () => {
  it("keeps shared review Undo usable when an accepted correction marks analysis stale", () => {
    const history = createOverrideHistory(),
      edits = { layer: { name: "ClaimButton" } };
    history.record({}, edits);
    const render = (undoDisabled: boolean) =>
      renderToStaticMarkup(
        <StructureReview
          overrides={edits}
          disabled
          memory={memory}
          apply={() => false}
          inspect={() => {}}
          canUndo={history.canUndo}
          undoDisabled={undoDisabled}
          undo={() => {
            history.undo(edits);
          }}
        />,
      );
    expect(undoButton(render(false), "Undo correction")).not.toContain(
      "disabled=",
    );
    expect(undoButton(render(true), "Undo correction")).toContain("disabled=");
    expect(history.undo(edits)).toEqual({});
    expect(undoButton(render(false), "Undo correction")).toContain("disabled=");
  });

  it("offers direct shared-history Undo after AI results clear, with busy and empty-history guards", () => {
    const history = createOverrideHistory(),
      edits = { layer: { name: "ClaimButton" } };
    history.record({}, edits);
    const render = (undoDisabled: boolean) =>
      renderToStaticMarkup(
        <VisionReview
          overrides={edits}
          account={{
            loading: false,
            busy: false,
            retry: false,
            error: "",
            notice: "",
          }}
          disabled
          apply={() => false}
          inspect={() => {}}
          download={() => {}}
          canUndo={history.canUndo}
          undoDisabled={undoDisabled}
          undo={() => {
            history.undo(edits);
          }}
        />,
      );
    expect(undoButton(render(false), "Undo reviewed correction")).not.toContain(
      "disabled=",
    );
    expect(undoButton(render(true), "Undo reviewed correction")).toContain(
      "disabled=",
    );
    expect(history.undo(edits)).toEqual({});
    expect(undoButton(render(false), "Undo reviewed correction")).toContain(
      "disabled=",
    );
  });
});
