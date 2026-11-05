import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import type { BaseLayerId } from "../lib/baseLayers";
import type { DrawShape } from "../lib/types";
import LayersPicker from "./LayersPicker";

const TOOL_ICON: Record<DrawShape, string> = { Marker: "location_on", Line: "timeline", Polygon: "polyline" };

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
  collapsible = false,
  onDrawSelect,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  activeTool: DrawShape | null;
  moveActive: boolean;
  baseLayerId: BaseLayerId;
  onBaseLayerChange: (id: BaseLayerId) => void;
  /** มือถือ: แสดงเป็นปุ่มเดียว (ไอคอนเครื่องมือที่ใช้อยู่ + ลูกศร) กดแล้วกางรายการเครื่องมือ */
  collapsible?: boolean;
  /** ถ้าส่งมา จะเรียกแทน Geoman enableDraw (มือถือวาดด้วยกากบาทกลางจอ) */
  onDrawSelect?: (shape: DrawShape) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const showTools = !collapsible || expanded;

  useEffect(() => {
    if (!layersOpen && !(collapsible && expanded)) return;
    // capture: Leaflet อาจหยุด event ของแผนที่ไม่ให้ลอยขึ้นมาถึง document
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
        if (collapsible) setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, [layersOpen, collapsible, expanded]);

  const toggleDraw = (shape: DrawShape) => {
    if (onDrawSelect) {
      onDrawSelect(shape);
      setExpanded(false);
      return;
    }
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

  const triggerActive = activeTool !== null || moveActive;
  const triggerIcon = activeTool ? TOOL_ICON[activeTool] : moveActive ? "open_with" : "edit_location_alt";

  return (
    <div
      ref={containerRef}
      className="absolute top-3 left-3 md:top-4 md:left-4 z-20 flex flex-col gap-1 p-1 bg-white border border-slate-200 rounded-lg shadow-md"
    >
      {!showTools && (
        <button
          type="button"
          title="เครื่องมือวาด"
          aria-label="เปิดเครื่องมือวาด"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className="flex flex-col items-center gap-0.5 w-9 active:scale-95 transition-transform"
        >
          <span
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              triggerActive ? "bg-teal-700 text-white shadow-sm" : "text-slate-700"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{triggerIcon}</span>
          </span>
          <span className="material-symbols-outlined text-[16px] text-slate-500 leading-none">expand_more</span>
        </button>
      )}

      {showTools && (
        <>
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

          {collapsible && (
            <button
              type="button"
              aria-label="ย่อเครื่องมือ"
              onClick={() => {
                setExpanded(false);
                setLayersOpen(false);
              }}
              className="w-8 h-6 flex items-center justify-center text-slate-500"
            >
              <span className="material-symbols-outlined text-[18px]">expand_less</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
