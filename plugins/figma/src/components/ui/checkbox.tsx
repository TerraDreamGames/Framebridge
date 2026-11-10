import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check, Minus } from "../Glyph";
import { cn } from "../../lib/utils";
import "./checkbox.css";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn("property-checkbox fb-checkbox", className)}
      {...props}
    >
      <span data-slot="checkbox-box" aria-hidden="true">
        <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
          <Check className="fb-checkbox-check" size={12} strokeWidth={1.8} />
          <Minus className="fb-checkbox-minus" size={12} strokeWidth={1.8} />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}
