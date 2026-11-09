import { useEffect, useRef } from "react";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { MapCtx } from "../components/MapView";
import { CLUSTER_LAYER, HIT_LAYERS, POINTS } from "../lib/mapLayers";

type DrawFeature = GeoJSON.Feature & { id: string };

export type MapHandlers = {
  /** คลิก feature ที่บันทึกแล้ว */
  onFeatureClick: (id: number, lngLat: [number, number]) => void;
  /** คลิกพื้นที่ว่าง */
  onMapClick: () => void;
  onHover: (id: number | null) => void;
  /** วาดเสร็จ 1 ชิ้น (mapbox-gl-draw) */
  onDrawCreate: (f: DrawFeature) => void;
  /** ลากจุด / ย้ายทั้งก้อนเสร็จ — action = "change_coordinates" | "move" */
  onDrawUpdate: (f: DrawFeature, action: string) => void;
  /** สิ่งที่เลือกใน draw เปลี่ยน (เช่น คลิกพื้นที่ว่างระหว่างแก้ = ไม่มีอะไรถูกเลือก) */
  onDrawSelectionChange: (selected: DrawFeature[]) => void;
  /** draw เปลี่ยนโหมดเอง (วาดเสร็จ / กด Esc → กลับเป็น simple_select) */
  onDrawModeChange: (mode: string) => void;
};

const fidOf = (e: MapMouseEvent, ctx: MapCtx) => {
  const f = ctx.map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS })[0];
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

    const onClick = async (e: MapMouseEvent) => {
      if (drawing()) return;
      // คลิก cluster = ซูมเข้าจนกลุ่มแตก
      const cluster = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })[0];
      if (cluster) {
        const source = map.getSource(POINTS) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(Number(cluster.properties.cluster_id));
        map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        return;
      }
      const id = fidOf(e, ctx);
      if (id !== null) h.current.onFeatureClick(id, [e.lngLat.lng, e.lngLat.lat]);
      else h.current.onMapClick();
    };

    let hovered: number | null = null;
    const onMove = (e: MapMouseEvent) => {
      const id = drawing() ? null : fidOf(e, ctx);
      const overCluster = !drawing() && map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] }).length > 0;
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
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      for (const [type, fn] of drawHandlers) drawEvents.off(type, fn);
    };
  }, [ctx]);
}
