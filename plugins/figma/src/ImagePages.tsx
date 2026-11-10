import { Button } from "./components/ui/button";
import type { imagePage } from "./image-pages";
export function ImagePages({
  value,
  onChange,
  label,
}: {
  value: ReturnType<typeof imagePage>;
  onChange(page: number): void;
  label: string;
}) {
  if (value.pages === 1) return null;
  return (
    <nav className="image-pages" aria-label={label}>
      <Button
        variant="outline"
        size="sm"
        disabled={value.page === 0}
        onClick={() => onChange(value.page - 1)}
      >
        Previous
      </Button>
      <span aria-live="polite">
        {value.start + 1}–{value.end} of {value.total}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={value.page === value.pages - 1}
        onClick={() => onChange(value.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
