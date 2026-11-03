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
