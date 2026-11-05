import L from "leaflet";
import type { ApiFeature, FeatureProps, GeomType } from "../api";

export type GeoLayer = L.Layer & { toGeoJSON(): GeoJSON.Feature };

// id / ชนิด / ข้อมูลที่กรอก / รูปทรงล่าสุดที่บันทึกแล้ว ของแต่ละ layer บนแผนที่ (ตรงกับข้อมูลใน database)
export type Meta = { id: number; type: GeomType; props: FeatureProps; saved: GeoJSON.Geometry };
export const meta = new WeakMap<L.Layer, Meta>();

// ดึงฟิลด์ที่ผู้ใช้กรอกออกจาก properties ของ GeoJSON Feature ที่ API ตอบมา
export const propsOf = (f: ApiFeature): FeatureProps => ({
  name: f.properties.name,
  category: f.properties.category,
  description: f.properties.description,
});

const roundCoords = (c: unknown): unknown =>
  Array.isArray(c) ? c.map(roundCoords) : typeof c === "number" ? Math.round(c * 1e6) / 1e6 : c;

// เทียบรูปทรงที่ความละเอียด 6 ทศนิยม (Leaflet toGeoJSON ปัดที่ 6 ส่วน PostGIS ตอบมาได้ละเอียดกว่า)
export const sameGeometry = (a: GeoJSON.Geometry, b: GeoJSON.Geometry) =>
  a.type === b.type &&
  JSON.stringify(roundCoords((a as GeoJSON.Point).coordinates)) ===
    JSON.stringify(roundCoords((b as GeoJSON.Point).coordinates));

export const geometryOf = (layer: L.Layer) => (layer as GeoLayer).toGeoJSON().geometry;

// คืนรูปทรงของ layer กลับเป็นค่าที่บันทึกไว้ (ใช้ตอน API ไม่รับการแก้ไข)
export function restoreGeometry(layer: L.Layer, geometry: GeoJSON.Geometry) {
  if (layer instanceof L.Marker && geometry.type === "Point") {
    layer.setLatLng(L.GeoJSON.coordsToLatLng(geometry.coordinates as [number, number]));
  } else if (layer instanceof L.Polygon && geometry.type === "Polygon") {
    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(geometry.coordinates, 1));
  } else if (layer instanceof L.Polyline && geometry.type === "LineString") {
    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(geometry.coordinates, 0));
  }
}

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// กลุ่มที่ layer อยู่ (Point อยู่ใน cluster, Line/Polygon อยู่ใน featureGroup) — ลบต้องลบออกจากกลุ่ม ไม่ใช่จากแผนที่
export const ownerGroup = new WeakMap<L.Layer, L.LayerGroup>();

export function detach(layer: L.Layer) {
  const group = ownerGroup.get(layer);
  if (group) group.removeLayer(layer);
  else layer.remove();
}

/** แก้ไม่ได้ = ให้ Geoman ข้าม layer นี้ (เครื่องมือ Move / ลากจุด ใช้กับ layer นี้ไม่ได้) */
export function setEditable(layer: L.Layer, editable: boolean) {
  (layer.options as { pmIgnore?: boolean }).pmIgnore = !editable;
}

// ใส่ layer คืนกลุ่มเดิม (ใช้ตอนกดแสดง feature ที่ซ่อนไว้)
export function attach(layer: L.Layer) {
  ownerGroup.get(layer)?.addLayer(layer);
}

// ไฮไลต์ตอน hover: เส้น/รูปเปลี่ยนสีและหนาขึ้น, หมุดใช้ class ใน index.css
const HIGHLIGHT: L.PathOptions = { color: "#f59e0b", weight: 6 };
const beforeHighlight = new WeakMap<L.Path, L.PathOptions>();

export function setHighlight(layer: L.Layer, on: boolean) {
  if (layer instanceof L.Path) {
    if (on) {
      beforeHighlight.set(layer, { color: layer.options.color, weight: layer.options.weight });
      layer.setStyle(HIGHLIGHT);
      layer.bringToFront();
    } else {
      layer.setStyle(beforeHighlight.get(layer) ?? {});
    }
  } else if (layer instanceof L.Marker) {
    layer.getElement()?.classList.toggle("marker-hover", on);
  }
}
