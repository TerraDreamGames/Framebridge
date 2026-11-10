import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "../lib/utils";

// Preserve the existing option declarations while using Radix's accessible select.
const EMPTY_VALUE = "__framebridge_empty__";
function textContent(value: React.ReactNode): string {
  return React.Children.toArray(value)
    .map((child) =>
      React.isValidElement<{ children?: React.ReactNode }>(child)
        ? textContent(child.props.children)
        : String(child),
    )
    .join("");
}
function optionsFrom(
  children: React.ReactNode,
): React.ReactElement<React.ComponentProps<"option">>[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<React.ComponentProps<"option">>(child)) return [];
    return child.type === "option"
      ? [child]
      : optionsFrom(child.props.children);
  });
}
export function SelectControl({
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  id,
  "aria-label": label,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  renderOption,
}: React.ComponentProps<"select"> & {
  renderOption?: (value: string, label: string) => React.ReactNode;
}) {
  const options = optionsFrom(children);
  const selected = String(
    value ??
      defaultValue ??
      options[0]?.props.value ??
      (options[0] ? textContent(options[0].props.children) : ""),
  );
  const selectedLabel = options.find(
    (option) =>
      String(option.props.value ?? textContent(option.props.children)) ===
      selected,
  );
  return (
    <Select
      value={selected || EMPTY_VALUE}
      disabled={disabled}
      onValueChange={(next) =>
        onChange?.({
          target: { value: next === EMPTY_VALUE ? "" : next },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectTrigger
        size="sm"
        id={id}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        title={
          selectedLabel ? textContent(selectedLabel.props.children) : undefined
        }
        className={cn("w-full min-w-0", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {options.map((option, index) => {
            const label = textContent(option.props.children);
            const value = String(option.props.value ?? label);
            return (
              <SelectItem
                key={value || index}
                value={value || EMPTY_VALUE}
                textValue={label}
                title={label}
                disabled={option.props.disabled}
              >
                {renderOption?.(value, label) ?? label}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
