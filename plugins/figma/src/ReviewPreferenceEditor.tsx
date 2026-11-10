import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { SelectControl } from "./components/SelectControl";
import { useState } from "react";
import {
  REVIEW_CLASSES,
  type ReviewDecision,
} from "../../../packages/core/src/structure-review";
import type { useReviewPreferences } from "./review-preferences";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
export function ReviewPreferenceEditor({
  memory,
}: {
  memory: ReturnType<typeof useReviewPreferences>;
}) {
  const prefs = memory.preferences;
  const [phrase, setPhrase] = useState(""),
    [kind, setKind] =
      useState<Exclude<ReviewDecision["kind"], "name">>("class"),
    [choice, setChoice] = useState("TextButton");
  const busy = memory.loading || memory.saving || !!memory.error;
  const choices =
    kind === "class"
      ? REVIEW_CLASSES
      : kind === "layout"
        ? ["source", "free", "list-y", "list-x", "grid"]
        : kind === "role"
          ? ["source", "panel", "tabGroup"]
          : ["X", "Y", "XY"];
  return (
    <Disclosure className="structure-memory editor-preferences">
      <DisclosureSummary>Naming and review hints</DisclosureSummary>
      <p>Naming hints suggest changes; they never apply automatically.</p>
      <label>
        Export naming style{" "}
        <SelectControl
          aria-label="Export naming style"
          disabled={busy}
          value={prefs.naming?.style ?? "source"}
          onChange={(e) =>
            void memory.save({
              ...prefs,
              naming: {
                prefix: prefs.naming?.prefix ?? "",
                style: e.target.value as any,
              },
            })
          }
        >
          <option value="source">Source names</option>
          <option value="pascal">PascalCase</option>
          <option value="camel">camelCase</option>
          <option value="snake">snake_case</option>
        </SelectControl>
      </label>
      <label>
        Export name prefix{" "}
        <Input
          key={prefs.naming?.prefix ?? ""}
          aria-label="Export name prefix"
          maxLength={24}
          disabled={busy}
          defaultValue={prefs.naming?.prefix ?? ""}
          onBlur={(e) => {
            if (/^(?:[A-Za-z_][A-Za-z0-9_]{0,23})?$/.test(e.target.value)) {
              if (e.target.value !== (prefs.naming?.prefix ?? ""))
                void memory.save({
                  ...prefs,
                  naming: {
                    style: prefs.naming?.style ?? "source",
                    prefix: e.target.value,
                  },
                });
            } else e.target.value = prefs.naming?.prefix ?? "";
          }}
        />
      </label>
      <p>
        Match literal layer-name phrases. Keep private project details out of
        shared hints.
      </p>
      <label>
        Name contains{" "}
        <Input
          aria-label="Review hint phrase"
          value={phrase}
          maxLength={64}
          disabled={busy}
          onChange={(e) => setPhrase(e.target.value)}
        />
      </label>
      <label>
        Suggest{" "}
        <SelectControl
          aria-label="Review hint kind"
          disabled={busy}
          value={kind}
          onChange={(e) => {
            const k = e.target.value as typeof kind;
            setKind(k);
            setChoice(
              k === "class"
                ? "TextButton"
                : k === "scroll"
                  ? "Y"
                  : k === "role"
                    ? "panel"
                    : "list-y",
            );
          }}
        >
          <option value="class">Class</option>
          <option value="scroll">Scrolling</option>
          <option value="layout">Layout</option>
          <option value="role">Role</option>
        </SelectControl>
        <SelectControl
          aria-label="Review hint choice"
          disabled={busy}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {choices.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </SelectControl>
      </label>
      <Button
        size="sm"
        disabled={
          busy ||
          !/^[A-Za-z][A-Za-z0-9 _-]{0,63}$/.test(phrase) ||
          (prefs.hints?.length ?? 0) >= 32
        }
        onClick={() => {
          void memory
            .save({
              ...prefs,
              hints: [
                ...(prefs.hints ?? []),
                {
                  phrase,
                  sourceType: "*",
                  decision: { kind, value: choice } as any,
                },
              ],
            })
            .then((ok) => {
              if (ok) setPhrase("");
            });
        }}
      >
        Add review hint
      </Button>
      {(prefs.hints ?? []).map((h, i) => (
        <div className="structure-memory-rule" key={i}>
          <span>
            {h.phrase} → {h.decision.kind}: {h.decision.value}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={"Remove review hint " + h.phrase}
            disabled={busy}
            onClick={() =>
              void memory.save({
                ...prefs,
                hints: prefs.hints!.filter((_, j) => i !== j),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </Disclosure>
  );
}
