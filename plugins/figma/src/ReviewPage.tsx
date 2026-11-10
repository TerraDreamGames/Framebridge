import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Search,
  X,
} from "./components/Glyph";
import { Button } from "./components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import "./review-pages.css";

export function ReviewSearch(props: {
  label: string;
  placeholder?: string;
  value: string;
  change(value: string): void;
}) {
  return (
    <InputGroup className="review-search">
      <InputGroupAddon>
        <Search size={14} />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={props.label}
        placeholder={props.placeholder ?? "Search findings or layers…"}
        value={props.value}
        onChange={(event) => props.change(event.target.value)}
      />
      {props.value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={`Clear ${props.label.toLowerCase()}`}
            onClick={() => props.change("")}
          >
            <X size={13} />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export function ReviewFilters(props: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  change(value: string): void;
}) {
  return (
    <ToggleGroup
      className="review-filters"
      type="single"
      aria-label={props.label}
      value={props.value}
      onValueChange={(value) => value && props.change(value)}
    >
      {props.options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
          <span>{option.count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ReviewEmpty(props: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="review-zero" role="status">
      {props.icon ?? <CheckCheck size={26} />}
      <strong>{props.title}</strong>
      {props.children}
    </div>
  );
}

export function ReviewPagination(props: {
  page: number;
  total: number;
  change(page: number): void;
}) {
  const pages = Math.ceil(props.total / 20);
  if (pages <= 1) return null;
  return (
    <nav className="review-pagination" aria-label="Review result pages">
      <Button
        variant="ghost"
        size="sm"
        disabled={props.page === 0}
        onClick={() => props.change(props.page - 1)}
      >
        <ArrowLeft size={13} /> Previous
      </Button>
      <span>
        {props.page * 20 + 1}–{Math.min((props.page + 1) * 20, props.total)} of{" "}
        {props.total}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={props.page + 1 >= pages}
        onClick={() => props.change(props.page + 1)}
      >
        Next <ArrowRight size={13} />
      </Button>
    </nav>
  );
}
