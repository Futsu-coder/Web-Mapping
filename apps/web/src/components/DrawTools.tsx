import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { listFeatures, type ApiFeature } from "../api";
import { geometryOf, meta, propsOf, type Meta } from "../lib/featureMeta";
import type { DrawShape, GeomType, Item } from "../lib/types";

export type RegisterFn = (layer: L.Layer, f: ApiFeature) => void;

type Callbacks = {
  onItemsChange: (fn: (items: Item[]) => Item[]) => void;
  onActiveToolChange: (shape: DrawShape | null) => void;
  onError: (err: unknown) => void;
  onLayerClick: (id: number) => void;
  onMapClick: () => void;
  onDraft: (layer: L.Layer, type: GeomType) => void;
  /** ลาก/ย้าย/แก้จุดเสร็จ (pm:edit ยิงหลังลากจุด เพิ่ม-ลบจุด และย้ายทั้งก้อน) */
  onGeometryChange: (id: number, layer: L.Layer) => void;
  /** เครื่องมือ Move (ย้ายทั้งก้อน) เปิด/ปิด */
  onMoveModeChange: (enabled: boolean) => void;
};

/**
 * ผูก layer บนแผนที่กับ feature ใน database
 * - โหลด feature ทั้งหมดตอน mount (GeoJSON FeatureCollection จาก API)
 * - คลิก layer = เลือก (ยังไม่เปิดให้ลากแก้จนกว่าจะเลือก — App เป็นคนเปิด pm.enable)
 * - แก้/ย้ายเสร็จ = แจ้ง App ให้บันทึกตำแหน่งใหม่
 * - วาดเสร็จ = ส่ง layer ที่ยังไม่บันทึกขึ้นไปให้ App เปิดฟอร์ม (บันทึกเมื่อกด Save)
 * - ไม่ mount toolbar ของ Geoman เอง (ใช้ Toolbar ของเราสั่ง enableDraw แทน)
 */
export default function DrawTools({
  registerRef,
  ...callbacks
}: Callbacks & { registerRef: React.MutableRefObject<RegisterFn | null> }) {
  const map = useMap();
  // เก็บ callback ล่าสุดไว้ใน ref เพื่อไม่ให้ effect โหลดข้อมูลซ้ำทุกครั้งที่ state ใน App เปลี่ยน
  const cb = useRef<Callbacks>(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  useEffect(() => {
    // Polygon ที่ขอบตัดกันเองบันทึกไม่ได้ (PostGIS ถือว่า invalid)
    (map.pm.Draw.Polygon as L.PM.DrawShape).setOptions({ allowSelfIntersection: false });

    const group = L.featureGroup().addTo(map);
    let alive = true;

    const register: RegisterFn = (layer, f) => {
      const info: Meta = {
        id: f.id,
        type: f.geometry.type as GeomType,
        props: propsOf(f),
        saved: f.geometry,
      };
      meta.set(layer, info);
      layer.bindPopup(info.props.name);
      if (layer instanceof L.Polygon) layer.pm.setOptions({ allowSelfIntersection: false });
      layer.on("click", (e) => {
        L.DomEvent.stopPropagation(e); // ไม่ให้ไปเข้า map click (ยกเลิกการเลือก)
        if (map.pm.globalDrawModeEnabled()) return;
        cb.current.onLayerClick(info.id);
      });
      // pm:edit ยิงทั้งหลังแก้จุดและหลังลากทั้งก้อน (Geoman ยิง pm:dragend ตามด้วย pm:edit) จึงฟังแค่ pm:edit กัน PUT ซ้ำ
      layer.on("pm:edit", () => cb.current.onGeometryChange(info.id, layer));
      group.addLayer(layer);
      cb.current.onItemsChange((items) => [...items, { id: info.id, type: info.type, props: info.props, layer }]);
    };
    registerRef.current = register;

    const handleCreate = (e: { layer: L.Layer }) => {
      cb.current.onDraft(e.layer, geometryOf(e.layer).type as GeomType);
    };
    const handleDrawStart = (e: { shape: DrawShape }) => cb.current.onActiveToolChange(e.shape);
    const handleDrawEnd = () => cb.current.onActiveToolChange(null);
    const handleMapClick = () => {
      if (!map.pm.globalDrawModeEnabled()) cb.current.onMapClick();
    };
    const drawStartHandler = handleDrawStart as unknown as L.LeafletEventHandlerFn;
    // เครื่องมือ Move (global drag mode ของ Geoman) เปิด/ปิด
    const handleMoveToggled = ((e: { enabled: boolean }) =>
      cb.current.onMoveModeChange(e.enabled)) as unknown as L.LeafletEventHandlerFn;

    listFeatures()
      .then((features) => {
        if (!alive) return;
        for (const f of features) register(L.GeoJSON.geometryToLayer(f), f);
      })
      .catch((err) => cb.current.onError(err));

    map.on("pm:create", handleCreate);
    map.on("pm:drawstart", drawStartHandler);
    map.on("pm:drawend", handleDrawEnd);
    map.on("click", handleMapClick);
    map.on("pm:globaldragmodetoggled", handleMoveToggled);
    return () => {
      alive = false;
      registerRef.current = null;
      map.off("pm:create", handleCreate);
      map.off("pm:drawstart", drawStartHandler);
      map.off("pm:drawend", handleDrawEnd);
      map.off("click", handleMapClick);
      map.off("pm:globaldragmodetoggled", handleMoveToggled);
      group.remove();
      cb.current.onItemsChange(() => []);
    };
  }, [map, registerRef]);

  return null;
}
