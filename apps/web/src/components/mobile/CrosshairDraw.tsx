import { useEffect } from "react";
import { ScaleControl, type Map as MlMap } from "maplibre-gl";
import type { MobileDraw } from "../../hooks/useCrosshairDraw";
import { setCrosshairData } from "../../lib/mapLayers";

const line = (coordinates: GeoJSON.Position[], props: Record<string, unknown>): GeoJSON.Feature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates },
  properties: props,
});

/** วาด preview ของรูปที่กำลังวาด + เส้นประไปยังตำแหน่งกลางจอ (อัปเดตตอนเลื่อนแผนที่) */
export default function CrosshairDraw({ map, draw }: { map: MlMap | null; draw: MobileDraw | null }) {
  useEffect(() => {
    if (!map || !draw) return;

    const render = () => {
      const pts = draw.points;
      const features: GeoJSON.Feature[] = [];
      if (draw.shape === "Polygon" && pts.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] },
          properties: { kind: "fill" },
        });
      } else if (draw.shape !== "Marker" && pts.length >= 2) {
        features.push(line(pts, { kind: "line" }));
      }
      if (draw.shape !== "Marker" && pts.length) {
        const c = map.getCenter();
        const center = [c.lng, c.lat];
        features.push(line([pts[pts.length - 1], center], { kind: "guide", width: 2.5, opacity: 1 }));
        if (draw.shape === "Polygon" && pts.length >= 2) {
          features.push(line([center, pts[0]], { kind: "guide", width: 1.5, opacity: 0.45 }));
        }
      }
      for (const p of pts) {
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { kind: "vertex" } });
      }
      setCrosshairData(map, features);
    };

    render();
    map.on("move", render);
    return () => {
      map.off("move", render);
      setCrosshairData(map, []);
    };
  }, [map, draw]);

  return null;
}

/** สเกลบาร์ (เมตร) มุมซ้ายล่างตามดีไซน์มือถือ */
export function MobileScale({ map }: { map: MlMap | null }) {
  useEffect(() => {
    if (!map) return;
    const control = new ScaleControl({ unit: "metric" });
    map.addControl(control, "bottom-left");
    return () => void map.removeControl(control);
  }, [map]);
  return null;
}

/** กากบาทกลางจอ (ตำแหน่งที่ Add point จะวาง) */
export function Crosshair() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
      <div className="relative flex items-center justify-center w-[6.25rem] h-[6.25rem]">
        <div className="absolute inset-0 rounded-full border border-zinc-600/50 shadow-sm bg-white/5" />
        <div className="absolute inset-0 rounded-full border border-white/80 scale-[0.98]" />
        <div className="absolute w-full h-px bg-zinc-600/40" />
        <div className="absolute h-full w-px bg-zinc-600/40" />
        <div className="absolute w-4 h-0.5 bg-primary" />
        <div className="absolute h-4 w-0.5 bg-primary" />
        <div className="w-2 h-2 rounded-full bg-primary border border-white shadow-sm z-10" />
      </div>
    </div>
  );
}
