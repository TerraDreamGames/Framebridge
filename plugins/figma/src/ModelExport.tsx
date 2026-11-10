import React from "react";
import { ArrowDownToLine } from "./components/Glyph";
import { buildModelExport } from "../../../packages/core/src/model-export";
import type { AnalysisResult } from "../../../packages/core/src/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";
import { Button } from "./components/ui/button";

export function ModelExport({
  result,
  disabled,
  onDownload,
  onOpenImages,
  onError,
  beforeExport,
}: {
  result: AnalysisResult | undefined;
  disabled: boolean;
  onDownload: (name: string, data: Uint8Array, mime: string) => void;
  onOpenImages: () => void;
  onError: (message: string) => void;
  beforeExport?: () => boolean;
}) {
  const pending =
    result?.package.assets.filter((asset) => !asset.robloxId).length ?? 0;
  return (
    <Accordion type="single" collapsible className="source-export export-panel">
      <AccordionItem value="model">
        <AccordionTrigger>Roblox model</AccordionTrigger>
        <AccordionContent>
          <div className="source-export-controls">
            <p className="muted">
              In Studio, right-click StarterGui → Insert from File. Link images
              before downloading.
            </p>
            {result?.package.roots.some((root) => root.worldUI) && (
              <p className="source-export-notice">
                After inserting world UI, set SurfaceGui.Adornee to a Workspace
                Part, or BillboardGui.Adornee to a Part or Attachment. For
                prompt UI, set FramebridgeWorldTarget’s Value to your
                Custom-style ProximityPrompt. You can also bind targets with
                Framebridge’s Studio UI tools.
              </p>
            )}
            {pending > 0 && (
              <div className="source-export-notice">
                <span>
                  {pending} image{pending === 1 ? " needs" : "s need"} a Roblox
                  asset ID.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenImages}
                  disabled={disabled}
                >
                  Link images
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !result || pending > 0}
              onClick={() => {
                if (disabled || !result || beforeExport?.() === false) return;
                try {
                  const file = buildModelExport(result);
                  onDownload(file.name, file.data, file.mime);
                } catch (error) {
                  onError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              }}
            >
              <ArrowDownToLine size={15} /> Download .rbxmx
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
