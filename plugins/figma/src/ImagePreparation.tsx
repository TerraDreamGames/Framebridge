import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import React from "react";
import { ChevronRight } from "./components/Glyph";
import type { ImageProcessing } from "../../../packages/core/src/types";
import { exportImageProcessing } from "../../../packages/core/src/image-processing";
import { Switch } from "./components/ui/switch";
import { Field, FieldLabel } from "./components/ui/field";

export function ImagePreparation({
  value,
  allowWhiteMask = true,
  onChange,
}: {
  value?: ImageProcessing;
  allowWhiteMask?: boolean;
  onChange: (value: ImageProcessing) => void;
}) {
  const settings = exportImageProcessing(value);
  const tools = [
    ...(allowWhiteMask ? [["whiteMask", "Tintable white mask"] as const] : []),
    ["edgeCleanup", "Clean transparent edges"] as const,
  ];
  return (
    <Disclosure className="export-setup image-preparation">
      <DisclosureSummary>
        <span>Image preparation</span>
      </DisclosureSummary>
      {tools.map(([key, label]) => (
        <Field className="property-row" key={key}>
          <FieldLabel htmlFor={`prepare-${key}`}>{label}</FieldLabel>
          <Switch
            id={`prepare-${key}`}
            aria-label={label}
            checked={settings?.[key] === true}
            onCheckedChange={(checked) =>
              onChange({ ...value, [key]: checked })
            }
          />
        </Field>
      ))}
      <p className="property-note">
        Transparent-edge cleanup is on by default. You can turn it off for this
        layer. Alpha and bounds stay unchanged.
        {allowWhiteMask &&
          " White masks remove colors for Roblox's Image tint."}
        {" Changing preparation needs a matching image upload or link."}
      </p>
    </Disclosure>
  );
}
