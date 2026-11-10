import type { LayerOverride } from "../../../packages/core/src/types";
type Overrides = Record<string, LayerOverride>;
const clone = (value: Overrides): Overrides =>
  JSON.parse(JSON.stringify(value));
export function createOverrideHistory(limit = 50) {
  const past: Overrides[] = [],
    future: Overrides[] = [];
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    peekUndo() {
      return past.length ? clone(past[past.length - 1]) : undefined;
    },
    peekRedo() {
      return future.length ? clone(future[future.length - 1]) : undefined;
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
    record(before: Overrides, next: Overrides) {
      if (JSON.stringify(before) === JSON.stringify(next)) return false;
      past.push(clone(before));
      if (past.length > limit) past.shift();
      future.length = 0;
      return true;
    },
    undo(current: Overrides) {
      const next = past.pop();
      if (!next) return;
      future.push(clone(current));
      return next;
    },
    redo(current: Overrides) {
      const next = future.pop();
      if (!next) return;
      past.push(clone(current));
      return next;
    },
  };
}
