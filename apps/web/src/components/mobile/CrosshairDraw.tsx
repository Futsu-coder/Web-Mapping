import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { MobileDraw } from "../../hooks/useCrosshairDraw";

const TEAL = "#0f766e";
const base = { pmIgnore: true, interactive: false } as const;

/** อยู่ใน MapContainer: วาด preview ของรูปที่กำลังวาด + เส้นประไปยังตำแหน่งกลางจอ (อัปเดตตอนเลื่อนแผนที่) */
export default function CrosshairDraw({ draw }: { draw: MobileDraw | null }) {
  const map = useMap();

  useEffect(() => {
    if (!draw) return;
    const group = L.layerGroup().addTo(map);

    const render = () => {
      group.clearLayers();
      const pts = draw.points;
      if (draw.shape === "Marker") {
        for (const p of pts) L.marker(p, base).addTo(group);
        return;
      }
      if (draw.shape === "Polygon" && pts.length >= 3) {
        L.polygon(pts, { ...base, color: TEAL, weight: 3, fillColor: TEAL, fillOpacity: 0.18 }).addTo(group);
      } else if (pts.length >= 2) {
        L.polyline(pts, { ...base, color: TEAL, weight: 3 }).addTo(group);
      }
      if (pts.length) {
        const center = map.getCenter();
        L.polyline([pts[pts.length - 1], center], { ...base, color: TEAL, weight: 2.5, dashArray: "6 4" }).addTo(group);
        if (draw.shape === "Polygon" && pts.length >= 2) {
          L.polyline([center, pts[0]], { ...base, color: TEAL, weight: 1.5, dashArray: "4 4", opacity: 0.45 }).addTo(group);
        }
      }
      for (const p of pts) {
        L.circleMarker(p, { ...base, radius: 6, color: TEAL, weight: 2.5, fillColor: "#fff", fillOpacity: 1 }).addTo(group);
      }
    };

    render();
    map.on("move", render);
    return () => {
      map.off("move", render);
      group.remove();
    };
  }, [map, draw]);

  return null;
}

/** สเกลบาร์ (เมตร) มุมซ้ายล่างตามดีไซน์มือถือ */
export function MobileScale() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
    return () => void control.remove();
  }, [map]);
  return null;
}

/** กากบาทกลางจอ (ตำแหน่งที่ Add point จะวาง) */
export function Crosshair() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
      <div className="relative flex items-center justify-center w-[6.25rem] h-[6.25rem]">
        <div className="absolute inset-0 rounded-full border border-slate-600/50 shadow-sm bg-white/5" />
        <div className="absolute inset-0 rounded-full border border-white/80 scale-[0.98]" />
        <div className="absolute w-full h-px bg-slate-600/40" />
        <div className="absolute h-full w-px bg-slate-600/40" />
        <div className="absolute w-4 h-0.5 bg-teal-700" />
        <div className="absolute h-4 w-0.5 bg-teal-700" />
        <div className="w-2 h-2 rounded-full bg-teal-700 border border-white shadow-sm z-10" />
      </div>
    </div>
  );
}
