import {
  DEFAULT_OPTIONS,
  type ExportOptions,
} from "../../../packages/core/src/types";

/** Existing programmatic examples retain their explicit authored canvases. */
export const DEFAULT_FIGMA_OPTIONS: ExportOptions = {
  ...DEFAULT_OPTIONS,
  screenSize: [1920, 1080],
  rootPlacement: "center",
};
