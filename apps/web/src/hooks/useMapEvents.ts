import { useEffect, useRef } from "react";
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent, PointLike } from "maplibre-gl";
import type { MapCtx } from "../components/MapView";
import { clusterLayerIds, hitLayerIds } from "../lib/mapLayers";

type DrawFeature = GeoJSON.Feature & { id: string };

export type MapHandlers = {
  /** คลิก feature ที่บันทึกแล้ว */
  onFeatureClick: (id: number, lngLat: [number, number]) => void;
  /** คลิกพื้นที่ว่าง (ไม่โดน feature และไม่โดนรูปใน draw) */
  onMapClick: () => void;
  onHover: (id: number | null) => void;
  /** วาดเสร็จ 1 ชิ้น (mapbox-gl-draw) */
  onDrawCreate: (f: DrawFeature) => void;
  /** ลากจุดเสร็จ — action = "change_coordinates" */
  onDrawUpdate: (f: DrawFeature, action: string) => void;
  /** สิ่งที่เลือกใน draw เปลี่ยน (เช่น คลิกพื้นที่ว่างระหว่างแก้ = ไม่มีอะไรถูกเลือก) */
  onDrawSelectionChange: (selected: DrawFeature[]) => void;
  /** draw เปลี่ยนโหมดเอง (วาดเสร็จ / กด Esc → กลับเป็น simple_select) */
  onDrawModeChange: (mode: string) => void;
};

type XY = { x: number; y: number };

/** ระยะรอบจุดแตะ (px): นิ้วกดไม่แม่นเท่าเมาส์ จึงค้นเป็นกล่องแทนจุดเดียว */
const TOUCH_R = 10;
/** ให้เท่ากับระยะที่ mapbox-gl-draw นับว่าโดนจุดยอด/รูป (TAP_TOLERANCE) */
const DRAW_R = 25;
/** แตะ = ขยับไม่เกิน TAP_MOVE px และกดสั้นกว่า TAP_MS */
const TAP_MOVE = 10;
const TAP_MS = 500;

/** จุดเดียว (เมาส์) หรือกล่องรอบจุดแตะ (r > 0) */
const around = (p: XY, r: number): PointLike | [PointLike, PointLike] =>
  r ? [[p.x - r, p.y - r], [p.x + r, p.y + r]] : [p.x, p.y];

const fidOf = (p: XY, ctx: MapCtx, r = 0) => {
  const f = ctx.map.queryRenderedFeatures(around(p, r), { layers: hitLayerIds(ctx.map) })[0];
  return f ? Number(f.properties.fid) : null;
};

/** ผูก event ของแผนที่และ mapbox-gl-draw — เก็บ handler ล่าสุดไว้ใน ref เพื่อไม่ต้องผูกใหม่ทุกครั้งที่ state ใน App เปลี่ยน */
export function useMapEvents(ctx: MapCtx | null, handlers: MapHandlers) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });

  useEffect(() => {
    if (!ctx) return;
    const { map, draw } = ctx;
    const drawing = () => draw.getMode().startsWith("draw_");

    // คลิก (เมาส์) และแตะ (จอสัมผัส) ใช้ logic เดียวกัน
    const handleTap = async (point: XY, lngLat: { lng: number; lat: number }, touch: boolean) => {
      if (drawing()) return;
      const r = touch ? TOUCH_R : 0;
      // คลิก cluster = ซูมเข้าจนกลุ่มแตก — แต่ต้องเป็นตัวบนสุดตรงจุดนั้น (ถ้า polygon ของ layer ที่อยู่เหนือทับอยู่ = เลือก polygon)
      const top = map.queryRenderedFeatures(around(point, r), { layers: [...clusterLayerIds(map), ...hitLayerIds(map)] })[0];
      const cluster = top && top.properties.cluster_id !== undefined ? top : undefined;
      if (cluster) {
        const source = map.getSource(cluster.source) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(Number(cluster.properties.cluster_id));
        map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        return;
      }
      const id = fidOf(point, ctx, r);
      if (id !== null) return h.current.onFeatureClick(id, [lngLat.lng, lngLat.lat]);
      // รูปที่กำลังแก้อยู่ใน draw (ตัวรูป / จุดยอด / จุดกึ่งกลาง) ไม่นับเป็นพื้นที่ว่าง — ให้ draw จัดการเอง
      const onDraw = map
        .queryRenderedFeatures(around(point, touch ? DRAW_R : 0))
        .some((f) => f.source.startsWith("mapbox-gl-draw"));
      if (!onDraw) h.current.onMapClick();
    };

    // mapbox-gl-draw เรียก preventDefault ตอนยกนิ้ว → browser ไม่ยิง click บนจอสัมผัส
    // จึงจับการแตะเองจาก touchstart/touchend (touch event ยังส่งถึง MapLibre ตามปกติ)
    let touchStart: (XY & { t: number }) | null = null;
    let lastTap = 0;
    const onTouchStart = (e: MapTouchEvent) => {
      touchStart = e.points.length === 1 ? { x: e.point.x, y: e.point.y, t: Date.now() } : null; // นิ้วที่ 2 = pinch ไม่ใช่แตะ
    };
    const onTouchEnd = (e: MapTouchEvent) => {
      const s = touchStart;
      if (!s || e.originalEvent.touches.length > 0) return;
      touchStart = null;
      const moved = Math.hypot(e.point.x - s.x, e.point.y - s.y);
      if (moved > TAP_MOVE || Date.now() - s.t > TAP_MS) return; // ลาก/กดค้าง ไม่ใช่แตะ
      lastTap = Date.now();
      void handleTap(e.point, e.lngLat, true);
    };
    const onClick = (e: MapMouseEvent) => {
      if (Date.now() - lastTap < 700) return; // browser บางตัวยังยิง click ตามหลังการแตะ — ไม่นับซ้ำ
      void handleTap(e.point, e.lngLat, false);
    };

    let hovered: number | null = null;
    const onMove = (e: MapMouseEvent) => {
      const id = drawing() ? null : fidOf(e.point, ctx);
      const overCluster = !drawing() && map.queryRenderedFeatures(e.point, { layers: clusterLayerIds(map) }).length > 0;
      map.getCanvas().style.cursor = id !== null || overCluster ? "pointer" : "";
      if (id === hovered) return;
      hovered = id;
      h.current.onHover(id);
    };
    const onOut = () => {
      if (hovered === null) return;
      hovered = null;
      h.current.onHover(null);
    };

    const onCreate = (e: { features: DrawFeature[] }) => h.current.onDrawCreate(e.features[0]);
    const onUpdate = (e: { features: DrawFeature[]; action: string }) => h.current.onDrawUpdate(e.features[0], e.action);
    const onSelection = (e: { features: DrawFeature[] }) => h.current.onDrawSelectionChange(e.features);
    const onMode = (e: { mode: string }) => h.current.onDrawModeChange(e.mode);

    map.on("click", onClick);
    map.on("touchstart", onTouchStart);
    map.on("touchend", onTouchEnd);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    // event ของ draw ไม่อยู่ใน type ของ MapLibre
    const drawEvents = map as unknown as {
      on(type: string, fn: (e: never) => void): void;
      off(type: string, fn: (e: never) => void): void;
    };
    const drawHandlers = [
      ["draw.create", onCreate],
      ["draw.update", onUpdate],
      ["draw.selectionchange", onSelection],
      ["draw.modechange", onMode],
    ] as const;
    for (const [type, fn] of drawHandlers) drawEvents.on(type, fn);
    return () => {
      map.off("click", onClick);
      map.off("touchstart", onTouchStart);
      map.off("touchend", onTouchEnd);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      for (const [type, fn] of drawHandlers) drawEvents.off(type, fn);
    };
  }, [ctx]);
}
