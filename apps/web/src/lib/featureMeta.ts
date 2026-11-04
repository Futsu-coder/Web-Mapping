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
