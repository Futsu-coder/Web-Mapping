import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { createFeature, deleteFeature, getFeature, listFeatures, updateFeature, type ApiFeature } from "../api";
import { detach, geometryOf, meta, ownerGroup, restoreGeometry, sameGeometry, type Meta } from "../lib/featureMeta";
import { subscribeFeatures, type FeatureChange } from "../lib/realtime";
import type { DrawShape, GeomType, Item } from "../lib/types";

/**
 * ผูก layer บนแผนที่กับ feature ใน database
 * - โหลด feature ทั้งหมดตอน mount
 * - วาดเสร็จ → POST, แก้รูปทรง → PUT (ไม่ผ่านก็คืนรูปเดิม), ลบด้วย Geoman → DELETE
 * - Point รวมเป็น cluster เมื่ออยู่ใกล้กัน
 * - ฟัง Realtime: browser อื่นเพิ่ม/แก้/ลบ → อัปเดตแผนที่ตาม
 * - ไม่ mount toolbar ของ Geoman เอง (ใช้ Toolbar ของเราสั่ง enableDraw แทน)
 */
export default function DrawTools({
  onItemsChange,
  onActiveToolChange,
  onHover,
  onError,
}: {
  onItemsChange: (fn: (items: Item[]) => Item[]) => void;
  onActiveToolChange: (shape: DrawShape | null) => void;
  onHover: (id: number | null) => void;
  onError: (err: unknown) => void;
}) {
  const map = useMap();

  useEffect(() => {
    // Polygon ที่ขอบตัดกันเองบันทึกไม่ได้ (PostGIS ถือว่า invalid)
    (map.pm.Draw.Polygon as L.PM.DrawShape).setOptions({ allowSelfIntersection: false });

    const shapes = L.featureGroup().addTo(map);
    // ซูมถึงระดับ 17 แล้วหมุดแยกออกหมด (focus จากรายการบินไปที่ระดับนี้)
    const points = L.markerClusterGroup({ disableClusteringAtZoom: 17, showCoverageOnHover: false }).addTo(map);
    const byId = new Map<number, L.Layer>();
    const creating = new Set<Promise<unknown>>();
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
      const group = layer instanceof L.Marker ? points : shapes;
      meta.set(layer, info);
      ownerGroup.set(layer, group);
      byId.set(f.id, layer);
      layer.bindPopup(info.name);
      if (layer instanceof L.Polygon) layer.pm.setOptions({ allowSelfIntersection: false });
      layer.on("mouseover", () => onHover(info.id));
      layer.on("mouseout", () => onHover(null));
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
      // ไม่มีปุ่ม Edit Mode ของ Geoman แล้ว → เปิดให้ลากจุดแก้ไขได้ทันทีทุก layer
      // หมุดใน cluster ยังไม่อยู่บนแผนที่ → เปิดตอนที่ cluster แตกออกมาแสดง (event "add")
      if (layer instanceof L.Marker) layer.on("add", () => layer.pm.enable());
      group.addLayer(layer);
      if (!(layer instanceof L.Marker)) (layer as L.Path).pm.enable();
      onItemsChange((items) => [...items, { ...info, layer }]);
    };

    const handleCreate = async (e: { layer: L.Layer }) => {
      const geometry = geometryOf(e.layer);
      const name = window.prompt("ตั้งชื่อ", geometry.type) || geometry.type;
      const request = createFeature(geometry, name);
      creating.add(request);
      try {
        const f = await request;
        map.removeLayer(e.layer); // layer ที่ Geoman วาดไว้บนแผนที่ → ย้ายเข้ากลุ่มของมันใน register
        if (!byId.has(f.id)) register(e.layer, f);
      } catch (err) {
        map.removeLayer(e.layer);
        onError(err);
      } finally {
        creating.delete(request);
      }
    };

    // การเปลี่ยนแปลงจาก Realtime (รวมของเราเองที่สะท้อนกลับมา — ข้ามถ้าตรงกับที่มีอยู่แล้ว)
    const applyChange = async ({ type, id }: FeatureChange) => {
      // รอ POST ของเราที่ค้างอยู่ก่อน ไม่งั้น INSERT ของเราเองจะถูกวาดซ้ำ
      await Promise.allSettled([...creating]);
      if (!alive) return;

      if (type === "DELETE") {
        const layer = byId.get(id);
        if (!layer) return;
        byId.delete(id);
        detach(layer);
        onItemsChange((items) => items.filter((i) => i.id !== id));
        return;
      }

      let f: ApiFeature;
      try {
        f = await getFeature(id);
      } catch {
        return; // ถูกลบไปแล้วระหว่างรอ
      }
      if (!alive) return;

      const layer = byId.get(id);
      if (!layer) {
        register(L.GeoJSON.geometryToLayer(f), f);
        return;
      }
      const m = meta.get(layer)!;
      if (m.name !== f.properties.name) {
        meta.set(layer, { ...m, name: f.properties.name });
        layer.setPopupContent(f.properties.name);
        onItemsChange((items) => items.map((i) => (i.id === id ? { ...i, name: f.properties.name } : i)));
      }
      if (!sameGeometry(m.saved, f.geometry)) {
        meta.set(layer, { ...meta.get(layer)!, saved: f.geometry });
        revert(layer as L.Path | L.Marker);
      }
    };

    const handleDrawStart = (e: { shape: DrawShape }) => onActiveToolChange(e.shape);
    const handleDrawEnd = () => onActiveToolChange(null);
    const drawStartHandler = handleDrawStart as unknown as L.LeafletEventHandlerFn;

    listFeatures()
      .then((features) => {
        if (!alive) return;
        for (const f of features) if (!byId.has(f.id)) register(L.GeoJSON.geometryToLayer(f), f);
      })
      .catch(onError);
    const unsubscribe = subscribeFeatures((change) => void applyChange(change));

    map.on("pm:create", handleCreate);
    map.on("pm:drawstart", drawStartHandler);
    map.on("pm:drawend", handleDrawEnd);
    return () => {
      alive = false;
      unsubscribe();
      map.off("pm:create", handleCreate);
      map.off("pm:drawstart", drawStartHandler);
      map.off("pm:drawend", handleDrawEnd);
      shapes.remove();
      points.remove();
      onItemsChange(() => []);
    };
  }, [map, onItemsChange, onActiveToolChange, onHover, onError]);

  return null;
}
