import { useRef, useState, type ComponentProps } from "react";
import { Upload } from "./Glyph";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function FilePicker({
  onChange,
  disabled,
  className = "",
  buttonLabel = "Choose PNG",
  showFilename = true,
  ...props
}: Omit<ComponentProps<"input">, "type" | "size" | "ref"> & {
  buttonLabel?: string;
  showFilename?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  return (
    <div className={`file-picker ${className}`}>
      <Input
        {...props}
        ref={input}
        type="file"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setFilename(file.name);
          onChange?.(event);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label={props["aria-label"] ?? "Choose PNG"}
        onClick={() => input.current?.click()}
      >
        <Upload size={14} /> {buttonLabel}
      </Button>
      {showFilename && filename && (
        <span className="file-picker-name" title={filename}>
          {filename}
        </span>
      )}
    </div>
  );
}
