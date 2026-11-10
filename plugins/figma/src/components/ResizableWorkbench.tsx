import {
  useEffect,
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
} from "react";
import { useSidebarLayout } from "../useSidebarLayout";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { Layers, SlidersHorizontal, X } from "./Glyph";
import { Button } from "./ui/button";

const CloseInspectorContext = createContext<() => void>(() => {});

export function CloseInspectorButton() {
  const close = useContext(CloseInspectorContext);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Close inspector"
      title="Close inspector"
      onClick={close}
    >
      <X size={15} />
    </Button>
  );
}

// Own resize state here so dragging does not rebuild the layer tree or inspector.
export function ResizableWorkbench({
  children: [layers, preview, properties],
  onKeyDown,
  tourPanel,
  propertyReveal = 0,
  onSearchProperties,
}: {
  children: [ReactNode, ReactNode, ReactNode];
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  tourPanel?: "layers" | "properties" | "preview";
  propertyReveal?: number;
  onSearchProperties?: () => void;
}) {
  const sidebar = useSidebarLayout();
  const [layersOpen, setLayersOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(
    () => window.innerWidth > 1100,
  );
  useEffect(() => {
    if (!tourPanel) return;
    setLayersOpen(tourPanel === "layers");
    setPropertiesOpen(tourPanel === "properties");
  }, [tourPanel]);
  useEffect(() => {
    if (!propertyReveal) return;
    setLayersOpen(false);
    setPropertiesOpen(true);
  }, [propertyReveal]);
  return (
    <div
      className="layer-workbench"
      data-layers-open={layersOpen}
      data-properties-open={propertiesOpen}
      ref={sidebar.workbench}
      style={
        {
          "--layers-width": `${sidebar.layout.layers}px`,
          "--properties-width": `${sidebar.layout.properties}px`,
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          event.stopPropagation();
          setLayersOpen(false);
          setPropertiesOpen(true);
          onSearchProperties?.();
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLInputElement>(
                '#framebridge-properties-pane input[aria-label="Search properties"]',
              )
              ?.focus();
          });
        }
      }}
      onClick={(event) => {
        if (
          window.innerWidth > 1100 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        const target = event.target as HTMLElement;
        if (
          target.closest(".explorer-row") &&
          !target.closest(".tree-chevron")
        ) {
          setLayersOpen(false);
          setPropertiesOpen(true);
        }
      }}
    >
      <div className="workbench-panels" aria-label="Workspace panels">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle layers panel"
          aria-expanded={layersOpen}
          aria-controls="framebridge-layers-pane"
          onClick={() => {
            setLayersOpen(!layersOpen);
            if (!layersOpen && window.innerWidth <= 1100)
              setPropertiesOpen(false);
          }}
        >
          <Layers size={15} />
          <span>Layers</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle properties panel"
          aria-expanded={propertiesOpen}
          aria-controls="framebridge-properties-pane"
          onClick={() => {
            setPropertiesOpen(!propertiesOpen);
            if (!propertiesOpen && window.innerWidth <= 1100)
              setLayersOpen(false);
          }}
        >
          <SlidersHorizontal size={15} />
          <span>Properties</span>
        </Button>
      </div>
      {layers}
      <SidebarResizeHandle
        side="layers"
        width={sidebar.layout.layers}
        {...sidebar.range("layers")}
        onResize={(width, persist) => sidebar.resize("layers", width, persist)}
        onReset={() => sidebar.reset("layers")}
      />
      {preview}
      <SidebarResizeHandle
        side="properties"
        width={sidebar.layout.properties}
        {...sidebar.range("properties")}
        onResize={(width, persist) =>
          sidebar.resize("properties", width, persist)
        }
        onReset={() => sidebar.reset("properties")}
      />
      <CloseInspectorContext.Provider value={() => setPropertiesOpen(false)}>
        {properties}
      </CloseInspectorContext.Provider>
    </div>
  );
}
