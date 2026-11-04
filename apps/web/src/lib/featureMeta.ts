import L from "leaflet";
import type { GeomType } from "../api";

export type GeoLayer = L.Layer & { toGeoJSON(): GeoJSON.Feature };

// id / ชื่อ / ชนิด / รูปทรงล่าสุดที่บันทึกแล้ว ของแต่ละ layer บนแผนที่ (ตรงกับข้อมูลใน database)
export type Meta = { id: number; name: string; type: GeomType; saved: GeoJSON.Geometry };
export const meta = new WeakMap<L.Layer, Meta>();

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

// เทียบรูปทรงโดยปัดพิกัดเหลือ 6 ตำแหน่ง (Leaflet กับ PostGIS ให้ทศนิยมไม่เท่ากัน)
const rounded = (_: string, v: unknown) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v);
export const sameGeometry = (a: GeoJSON.Geometry, b: GeoJSON.Geometry) =>
  JSON.stringify(a, rounded) === JSON.stringify(b, rounded);
