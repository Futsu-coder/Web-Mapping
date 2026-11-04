import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import type { BaseLayerId } from "../lib/baseLayers";
import type { DrawShape } from "../lib/types";
import LayersPicker from "./LayersPicker";

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
        active
          ? "bg-teal-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className="material-symbols-outlined text-[19px]">{icon}</span>
    </button>
  );
}

export default function Toolbar({
  mapRef,
  activeTool,
  moveActive,
  baseLayerId,
  onBaseLayerChange,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  activeTool: DrawShape | null;
  moveActive: boolean;
  baseLayerId: BaseLayerId;
  onBaseLayerChange: (id: BaseLayerId) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!layersOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [layersOpen]);

  const toggleDraw = (shape: DrawShape) => {
    const map = mapRef.current;
    if (!map) return;
    const pm = map.pm as unknown as { enableDraw: (shape: DrawShape) => void; disableDraw: () => void };
    if (activeTool === shape) {
      pm.disableDraw();
    } else {
      if (map.pm.globalDragModeEnabled()) map.pm.disableGlobalDragMode(); // วาดกับ Move เปิดพร้อมกันไม่ได้
      pm.enableDraw(shape);
    }
  };

  // Move = ย้ายทั้งก้อน (global drag mode ของ Geoman)
  const toggleMove = () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.pm.globalDragModeEnabled()) {
      map.pm.disableGlobalDragMode();
    } else {
      map.pm.disableDraw();
      map.pm.enableGlobalDragMode();
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-4 left-4 z-20 flex flex-col gap-1 p-1 bg-white border border-slate-200 rounded-lg shadow-md"
    >
      <ToolButton icon="location_on" label="Draw Point" active={activeTool === "Marker"} onClick={() => toggleDraw("Marker")} />
      <ToolButton icon="timeline" label="Draw Polyline" active={activeTool === "Line"} onClick={() => toggleDraw("Line")} />
      <ToolButton icon="polyline" label="Draw Polygon" active={activeTool === "Polygon"} onClick={() => toggleDraw("Polygon")} />
      <ToolButton icon="open_with" label="Move Feature" active={moveActive} onClick={toggleMove} />

      <div className="w-full h-px bg-slate-200 my-1" />

      <ToolButton icon="add" label="Zoom In" onClick={() => mapRef.current?.zoomIn()} />
      <ToolButton icon="remove" label="Zoom Out" onClick={() => mapRef.current?.zoomOut()} />

      <div className="relative">
        <ToolButton icon="layers" label="Toggle Base Layers" active={layersOpen} onClick={() => setLayersOpen((o) => !o)} />
        {layersOpen && (
          <LayersPicker
            baseLayerId={baseLayerId}
            onSelect={(id) => {
              onBaseLayerChange(id);
              setLayersOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
