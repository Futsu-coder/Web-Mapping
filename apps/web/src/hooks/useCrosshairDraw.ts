import { useState } from "react";
import { distance, selfIntersects } from "../lib/measure";
import type { DrawShape } from "../lib/types";

/** วาดบนมือถือ: เลื่อนแผนที่ให้กากบาทกลางจอตรงตำแหน่งที่ต้องการ แล้วกด Add point (จุดเป็น [lng, lat]) */
export type MobileDraw = { shape: DrawShape; points: GeoJSON.Position[]; redo: GeoJSON.Position[]; warning: string | null };

export const MIN_POINTS: Record<DrawShape, number> = { Marker: 1, Line: 2, Polygon: 3 };

export function useCrosshairDraw() {
  const [draw, setDraw] = useState<MobileDraw | null>(null);
  const update = (fn: (d: MobileDraw) => MobileDraw) => setDraw((d) => (d ? fn(d) : d));

  return {
    draw,
    start: (shape: DrawShape) => setDraw({ shape, points: [], redo: [], warning: null }),
    cancel: () => setDraw(null),
    addPoint: (p: GeoJSON.Position) =>
      update((d) => {
        if (d.shape === "Marker") return { ...d, points: [p], redo: [], warning: null };
        const last = d.points[d.points.length - 1];
        if (last && distance(last, p) < 0.5) return { ...d, warning: "จุดนี้ซ้ำกับจุดก่อนหน้า เลื่อนแผนที่ก่อนแล้วกดใหม่" };
        if (d.shape === "Polygon" && selfIntersects([...d.points, p])) {
          return { ...d, warning: "ขอบพื้นที่ตัดกันเอง เลื่อนแผนที่แล้วเลือกตำแหน่งใหม่" };
        }
        return { ...d, points: [...d.points, p], redo: [], warning: null };
      }),
    undo: () =>
      update((d) => {
        const last = d.points[d.points.length - 1];
        return last ? { ...d, points: d.points.slice(0, -1), redo: [...d.redo, last], warning: null } : d;
      }),
    redo: () =>
      update((d) => {
        const next = d.redo[d.redo.length - 1];
        return next ? { ...d, points: [...d.points, next], redo: d.redo.slice(0, -1), warning: null } : d;
      }),
    clear: () => update((d) => ({ ...d, points: [], redo: [], warning: null })),
  };
}
