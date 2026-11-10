import { useRef, useState } from "react";

export type PropertyDraftIssue = { label: string; message: string };
export type PropertyDraftEntry = PropertyDraftIssue & { id: number };
export type PropertyDraftReport = (
  owner: object,
  issue: PropertyDraftIssue | undefined,
) => void;

/** Registrations belong to mounted fields, never to the analyzed package. */
export function createPropertyDraftRegistry(
  changed: (issues: PropertyDraftEntry[]) => void,
) {
  const fields = new Map<object, PropertyDraftEntry>();
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  return {
    report: ((owner, issue) => {
      const before = fields.get(owner);
      if (before?.label === issue?.label && before?.message === issue?.message)
        return;
      if (issue) {
        let id = ids.get(owner);
        if (id === undefined) {
          id = ++nextId;
          ids.set(owner, id);
        }
        fields.set(owner, { ...issue, id });
      } else fields.delete(owner);
      changed([...fields.values()]);
    }) satisfies PropertyDraftReport,
    isBlocked: () => fields.size > 0,
  };
}

export function usePropertyDrafts() {
  const [issues, setIssues] = useState<PropertyDraftEntry[]>([]);
  const registry = useRef<ReturnType<typeof createPropertyDraftRegistry>>(null);
  if (!registry.current)
    registry.current = createPropertyDraftRegistry(setIssues);
  return { ...registry.current, issues, blocked: issues.length > 0 };
}
