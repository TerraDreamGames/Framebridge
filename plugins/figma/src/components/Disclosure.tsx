import { Children, forwardRef, type ComponentProps } from "react";
import { ChevronRight } from "./Glyph";
import { cn } from "../lib/utils";

/** One native disclosure anatomy across resource, review and editor panels. */
export const Disclosure = forwardRef<
  HTMLDetailsElement,
  ComponentProps<"details">
>(function Disclosure({ children, className, ...props }, ref) {
  const [summary, ...body] = Children.toArray(children);
  return (
    <details ref={ref} className={cn("fb-disclosure", className)} {...props}>
      {summary}
      <div className="fb-disclosure-body">{body}</div>
    </details>
  );
});

export function DisclosureSummary({
  children,
  className,
  ...props
}: ComponentProps<"summary">) {
  return (
    <summary className={cn("fb-disclosure-trigger", className)} {...props}>
      <ChevronRight size={13} className="fb-disclosure-chevron" />
      {children}
    </summary>
  );
}
