import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { createFeature, deleteFeature, listFeatures, updateFeature, type ApiFeature } from "../api";
import { geometryOf, meta, restoreGeometry, type Meta } from "../lib/featureMeta";
import type { DrawShape, GeomType, Item } from "../lib/types";

/**
 * ผูก layer บนแผนที่กับ feature ใน database
 * - โหลด feature ทั้งหมดตอน mount
 * - วาดเสร็จ → POST, แก้รูปทรง → PUT (ไม่ผ่านก็คืนรูปเดิม), ลบด้วย Geoman → DELETE
 * - ไม่ mount toolbar ของ Geoman เอง (ใช้ Toolbar ของเราสั่ง enableDraw แทน)
 */
export default function DrawTools({
  onItemsChange,
  onActiveToolChange,
  onError,
}: {
  onItemsChange: (fn: (items: Item[]) => Item[]) => void;
  onActiveToolChange: (shape: DrawShape | null) => void;
  onError: (err: unknown) => void;
}) {
  const map = useMap();

  useEffect(() => {
    // Polygon ที่ขอบตัดกันเองบันทึกไม่ได้ (PostGIS ถือว่า invalid)
    (map.pm.Draw.Polygon as L.PM.DrawShape).setOptions({ allowSelfIntersection: false });

    const group = L.featureGroup().addTo(map);
    let alive = true;

    // คืนรูปทรงเดิมแล้ว sync จุดแก้ไขของ Geoman ให้ตรงกับรูปทรงใหม่
    const revert = (layer: L.Path | L.Marker) => {
      const editing = layer.pm.enabled();
      if (editing) layer.pm.disable();
      restoreGeometry(layer, meta.get(layer)!.saved);
      if (editing) layer.pm.enable();
    };

    const register = (layer: L.Layer, f: ApiFeature) => {
      const info: Meta = { id: f.id, name: f.properties.name, type: f.geometry.type as GeomType, saved: f.geometry };
      meta.set(layer, info);
      layer.bindPopup(info.name);
      if (layer instanceof L.Polygon) layer.pm.setOptions({ allowSelfIntersection: false });
      // pm:edit ยิงทุกครั้งที่ลากจุด/เพิ่ม-ลบจุด/ย้าย layer เสร็จ → บันทึกทันที
      layer.on("pm:edit", () => {
        const m = meta.get(layer)!;
        const geometry = geometryOf(layer);
        updateFeature(m.id, geometry, m.name)
          .then(() => meta.set(layer, { ...meta.get(layer)!, saved: geometry }))
          .catch((err) => {
            revert(layer as L.Path | L.Marker);
            onError(err);
          });
      });
      layer.on("pm:remove", () => {
        const m = meta.get(layer)!;
        group.removeLayer(layer);
        deleteFeature(m.id)
          .then(() => onItemsChange((items) => items.filter((i) => i.id !== m.id)))
          .catch((err) => {
            group.addLayer(layer);
            onError(err);
          });
      });
      group.addLayer(layer);
      // ไม่มีปุ่ม Edit Mode ของ Geoman แล้ว → เปิดให้ลากจุดแก้ไขได้ทันทีทุก layer
      (layer as L.Path | L.Marker).pm?.enable();
      onItemsChange((items) => [...items, { ...info, layer }]);
    };

    const handleCreate = async (e: { layer: L.Layer }) => {
      const geometry = geometryOf(e.layer);
      const name = window.prompt("ตั้งชื่อ", geometry.type) || geometry.type;
      try {
        register(e.layer, await createFeature(geometry, name));
      } catch (err) {
        map.removeLayer(e.layer);
        onError(err);
      }
    };

    const handleDrawStart = (e: { shape: DrawShape }) => onActiveToolChange(e.shape);
    const handleDrawEnd = () => onActiveToolChange(null);
    const drawStartHandler = handleDrawStart as unknown as L.LeafletEventHandlerFn;

    listFeatures()
      .then((features) => {
        if (!alive) return;
        for (const f of features) register(L.GeoJSON.geometryToLayer(f), f);
      })
      .catch(onError);

    map.on("pm:create", handleCreate);
    map.on("pm:drawstart", drawStartHandler);
    map.on("pm:drawend", handleDrawEnd);
    return () => {
      alive = false;
      map.off("pm:create", handleCreate);
      map.off("pm:drawstart", drawStartHandler);
      map.off("pm:drawend", handleDrawEnd);
      group.remove();
      onItemsChange(() => []);
    };
  }, [map, onItemsChange, onActiveToolChange, onError]);

  return null;
}
