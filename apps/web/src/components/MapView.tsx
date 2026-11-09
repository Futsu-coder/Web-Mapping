import { useEffect, useRef } from "react";
import { Map as MlMap, prewarm, setWorkerUrl, type IControl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { addFeatureLayers } from "../lib/mapLayers";
import { INITIAL_ZOOM, OSM_RASTER_STYLE, VECTOR_STYLE, WORLD_BOUNDS } from "../lib/mapStyle";

// MapLibre 6 แยกไฟล์ worker (ใช้แปลง vector tile) และหาที่อยู่เองจากไฟล์หลัก — แต่ Vite ย้ายไฟล์หลักไปไว้ที่อื่นตอน pre-bundle
// จึงหา worker ไม่เจอ ("Worker failed to load") → บอกที่อยู่ให้ตรง ๆ
setWorkerUrl(workerUrl);
// สร้าง worker ไว้ก่อนตั้งแต่โหลดไฟล์ (เริ่มโหลด worker ขนานไปกับการ render ของ React) และเก็บไว้ตลอด
prewarm();

export type MapCtx = { map: MlMap; draw: MapboxDraw };

const TEAL = "#0f766e";
const isFeature = ["==", ["get", "meta"], "feature"];

// หน้าตาของรูปที่กำลังวาด/แก้ใน mapbox-gl-draw (ใช้ expression แบบใหม่ — MapLibre ไม่รับ filter แบบเก่าของ draw)
const DRAW_STYLES = [
  {
    id: "draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", ["geometry-type"], "Polygon"], isFeature],
    paint: { "fill-color": TEAL, "fill-opacity": 0.18 },
  },
  {
    id: "draw-lines",
    type: "line",
    filter: ["all", ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]], isFeature],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": TEAL, "line-width": 3 },
  },
  {
    id: "draw-midpoint",
    type: "circle",
    filter: ["==", ["get", "meta"], "midpoint"],
    paint: { "circle-radius": 4, "circle-color": TEAL },
  },
  {
    id: "draw-vertex",
    type: "circle",
    filter: ["==", ["get", "meta"], "vertex"],
    paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": TEAL, "circle-stroke-width": 2.5 },
  },
  {
    id: "draw-point",
    type: "circle",
    filter: ["all", ["==", ["geometry-type"], "Point"], isFeature],
    paint: { "circle-radius": 9, "circle-color": TEAL, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  },
];

/**
 * แผนที่ MapLibre + mapbox-gl-draw (ไม่ใช้ปุ่มของ draw เอง — Toolbar ของเราสั่ง changeMode แทน)
 * - เริ่มเป็น 2D (ปิดการหมุน/เอียง) — โหมด 3D เปิดจาก Toolbar (ตึก 3D ของ style Liberty เห็นตั้งแต่ซูม 14)
 * - เห็นโลกใบเดียว: ไม่วาดโลกซ้ำ + จำกัดขอบที่ WORLD_BOUNDS
 * - พร้อมใช้ (โหลด style + ใส่ layer + draw เสร็จ) แล้วเรียก onReady
 */
export default function MapView({ className, onReady }: { className?: string; onReady: (ctx: MapCtx | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });

  useEffect(() => {
    const map = new MlMap({
      container: container.current!,
      style: VECTOR_STYLE,
      center: [100.5, 13.75],
      zoom: INITIAL_ZOOM,
      renderWorldCopies: false,
      maxBounds: WORLD_BOUNDS,
      // เริ่มเป็น 2D: ปิดการหมุน/เอียง — App เปิดให้เองตอนกดปุ่ม 3D (ดู effect โหมด 3D ใน App.tsx)
      dragRotate: false,
      touchPitch: false,
      attributionControl: { compact: true }, // ย่อเป็นปุ่ม (i) — กันข้อความเครดิตบังแผนที่บนมือถือ
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    // โหลด style ของ OpenFreeMap ไม่ได้ → ใช้รูป PNG ของ OSM แทน
    // นับเฉพาะ error ก่อน style โหลดเสร็จ (error ของ tile ทีหลังไม่นับ — isStyleLoaded() ใช้ไม่ได้เพราะเป็น false ตลอดที่ tile ยังโหลดอยู่)
    let styleReady = false;
    map.once("style.load", () => {
      styleReady = true;
    });
    map.on("error", () => {
      if (styleReady) return;
      styleReady = true;
      map.setStyle(OSM_RASTER_STYLE);
    });

    map.on("load", () => {
      addFeatureLayers(map);
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        keybindings: false, // ไม่ให้ปุ่ม Delete/Backspace ลบรูปที่กำลังแก้
        boxSelect: false,
        styles: DRAW_STYLES as object[],
      });
      map.addControl(draw as unknown as IControl);
      ready.current({ map, draw });
    });

    // กล่องแผนที่เปลี่ยนขนาดโดยไม่มี window resize (เช่น แถบ error โผล่/ปิด) → ให้แผนที่คำนวณขนาดใหม่
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current!);

    return () => {
      ro.disconnect();
      ready.current(null);
      map.remove();
    };
  }, []);

  return <div ref={container} className={className} />;
}
