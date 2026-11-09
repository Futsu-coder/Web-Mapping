import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { GeomType, Item } from "./types";
import { CATEGORIES, CATEGORY_STYLE } from "./categories";
import { LABEL_FONT, TERRAIN_EXAGGERATION, TERRAIN_TILES } from "./mapStyle";

// source ของ feature ที่บันทึกแล้ว — Point แยก source เพราะต้องรวมเป็น cluster
export const SHAPES = "shapes";
export const POINTS = "points";
// preview ตอนวาดด้วยกากบาทบนมือถือ
export const CROSSHAIR = "crosshair";
// ความสูงภูมิประเทศ (ใช้ทั้งยกพื้นแผนที่เป็นภูเขา และวาดเงาภูเขา hillshade)
export const DEM = "terrain-dem";
const HILLSHADE = "hillshade";

/** layer ที่คลิก/hover แล้วถือว่าโดน feature */
export const HIT_LAYERS = ["shape-fill", "shape-line", "point"];
export const CLUSTER_LAYER = "cluster";

export const sourceOf = (type: GeomType) => (type === "Point" ? POINTS : SHAPES);

const TEAL = "#0f766e";
// สีตามหมวดหมู่ (ตรงกับจุดสีในรายการ) — หมวดที่ไม่รู้จักใช้สี Other
const categoryColor: ExpressionSpecification = [
  "match",
  ["get", "category"],
  ...CATEGORIES.flatMap((c) => [c, CATEGORY_STYLE[c].hex]),
  CATEGORY_STYLE.Other.hex,
] as unknown as ExpressionSpecification;
const hover: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
const active: ExpressionSpecification = ["any", hover, selected];
const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * ใส่ source/layer ของเราลงแผนที่ — ต้องเรียกก่อน addControl(draw) ให้ layer ของ draw อยู่บนสุด
 * hover / selected ใช้ feature-state (id = properties.fid เป็น string เพราะ id ของโหมดทดลองติดลบ)
 */
export function addFeatureLayers(map: MlMap) {
  // ภูเขา: ใส่ source ไว้ก่อน แต่ยังไม่โหลด tile จนกว่าจะเปิด 3D (setTerrain + เปิด hillshade ใน setTerrainEnabled)
  map.addSource(DEM, { type: "raster-dem", tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 15, encoding: "terrarium" });
  // เงาภูเขาอยู่ใต้ชื่อสถานที่/ถนนของแผนที่ฐาน (ก่อน symbol layer แรก)
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: HILLSHADE,
      type: "hillshade",
      source: DEM,
      layout: { visibility: "none" },
      paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5a5a5a" },
    },
    firstSymbol,
  );

  map.addSource(SHAPES, { type: "geojson", data: empty, promoteId: "fid" });
  // ซูมถึงระดับ 17 แล้วหมุดแยกออกหมด
  map.addSource(POINTS, { type: "geojson", data: empty, promoteId: "fid", cluster: true, clusterMaxZoom: 16, clusterRadius: 50 });
  map.addSource(CROSSHAIR, { type: "geojson", data: empty });

  map.addLayer({
    id: "shape-fill",
    type: "fill",
    source: SHAPES,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": categoryColor, "fill-opacity": ["case", active, 0.32, 0.2] },
  });
  // halo: เส้นกว้างโปร่งใสใต้เส้นหลัก โผล่เมื่อ hover / เลือก
  map.addLayer({
    id: "shape-halo",
    type: "line",
    source: SHAPES,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": categoryColor, "line-width": 12, "line-opacity": ["case", active, 0.25, 0] },
  });
  map.addLayer({
    id: "shape-line",
    type: "line",
    source: SHAPES,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": categoryColor,
      "line-width": ["case", hover, 5, selected, 5, 3],
    },
  });
  map.addLayer({
    id: CLUSTER_LAYER,
    type: "circle",
    source: POINTS,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#14b8a6", 10, "#0f766e", 100, "#134e4a"],
      "circle-radius": ["step", ["get", "point_count"], 15, 10, 18, 100, 22],
      "circle-stroke-width": 5,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.6,
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: POINTS,
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": LABEL_FONT, "text-size": 12 },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "point-halo",
    type: "circle",
    source: POINTS,
    filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": categoryColor, "circle-radius": 16, "circle-opacity": ["case", active, 0.28, 0] },
  });
  map.addLayer({
    id: "point",
    type: "circle",
    source: POINTS,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": categoryColor,
      "circle-radius": ["case", hover, 10, selected, 10, 8],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // preview ตอนวาดบนมือถือ: รูปที่วางจุดแล้ว (fill/line) + เส้นประไปยังกากบาท (guide) + จุดยอด (vertex)
  map.addLayer({
    id: "crosshair-fill",
    type: "fill",
    source: CROSSHAIR,
    filter: ["==", ["get", "kind"], "fill"],
    paint: { "fill-color": TEAL, "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: "crosshair-line",
    type: "line",
    source: CROSSHAIR,
    filter: ["in", ["get", "kind"], ["literal", ["fill", "line"]]],
    paint: { "line-color": TEAL, "line-width": 3 },
  });
  map.addLayer({
    id: "crosshair-guide",
    type: "line",
    source: CROSSHAIR,
    filter: ["==", ["get", "kind"], "guide"],
    paint: { "line-color": TEAL, "line-width": ["get", "width"], "line-opacity": ["get", "opacity"], "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "crosshair-vertex",
    type: "circle",
    source: CROSSHAIR,
    filter: ["==", ["get", "kind"], "vertex"],
    paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": TEAL, "circle-stroke-width": 2.5 },
  });
}

const setData = (map: MlMap, source: string, features: GeoJSON.Feature[]) =>
  (map.getSource(source) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });

/** วาด feature ที่บันทึกแล้วตาม items (ไม่รวมตัวที่ซ่อน / กำลังแก้อยู่ใน draw) */
export function setFeatureData(map: MlMap, items: Item[]) {
  const toFeature = (i: Item): GeoJSON.Feature => ({
    type: "Feature",
    geometry: i.geometry,
    properties: { fid: String(i.id), name: i.props.name, category: i.props.category ?? "Other" },
  });
  setData(map, POINTS, items.filter((i) => i.type === "Point").map(toFeature));
  setData(map, SHAPES, items.filter((i) => i.type !== "Point").map(toFeature));
}

export const setCrosshairData = (map: MlMap, features: GeoJSON.Feature[]) => setData(map, CROSSHAIR, features);

/** เปิด/ปิดภูเขา (ยกพื้นตามความสูง + เงาภูเขา) — ปิดอยู่ = ไม่โหลด tile ความสูงเลย */
export function setTerrainEnabled(map: MlMap, on: boolean) {
  if (!map.getSource(DEM)) return;
  map.setTerrain(on ? { source: DEM, exaggeration: TERRAIN_EXAGGERATION } : null);
  map.setLayoutProperty(HILLSHADE, "visibility", on ? "visible" : "none");
}

/** ตั้ง/ล้าง feature-state ของ feature (hover / selected) */
export function setItemState(map: MlMap, item: Pick<Item, "id" | "type">, state: Record<string, boolean>) {
  if (!map.getSource(sourceOf(item.type))) return;
  map.setFeatureState({ source: sourceOf(item.type), id: String(item.id) }, state);
}
