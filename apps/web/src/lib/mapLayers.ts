import type { ExpressionSpecification, GeoJSONSource, LayerSpecification, Map as MlMap } from "maplibre-gl";
import type { Layer } from "./layers";
import type { GeomType, Item } from "./types";
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
// สีของ layer ที่ feature อยู่ (ใส่ไว้ใน properties.color) — ไม่มี layer = สีเทา
const NO_LAYER_COLOR = "#71717a";
const layerColor: ExpressionSpecification = ["coalesce", ["get", "color"], NO_LAYER_COLOR];
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
    paint: { "fill-color": layerColor, "fill-opacity": ["case", active, 0.32, 0.2] },
  });
  // halo: เส้นกว้างโปร่งใสใต้เส้นหลัก โผล่เมื่อ hover / เลือก
  map.addLayer({
    id: "shape-halo",
    type: "line",
    source: SHAPES,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": layerColor, "line-width": 12, "line-opacity": ["case", active, 0.25, 0] },
  });
  map.addLayer({
    id: "shape-line",
    type: "line",
    source: SHAPES,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": layerColor,
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
    paint: { "circle-color": layerColor, "circle-radius": 16, "circle-opacity": ["case", active, 0.28, 0] },
  });
  map.addLayer({
    id: "point",
    type: "circle",
    source: POINTS,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": layerColor,
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

/**
 * วาด feature ที่บันทึกแล้วตาม items (ไม่รวมตัวที่ซ่อน / กำลังแก้อยู่ใน draw)
 * colorOf = สีของ layer ที่ feature อยู่ (ไม่มี = สีเทา)
 */
export function setFeatureData(map: MlMap, items: Item[], colorOf: (i: Item) => string | undefined = () => undefined) {
  const toFeature = (i: Item): GeoJSON.Feature => {
    const color = colorOf(i);
    return {
      type: "Feature",
      geometry: i.geometry,
      properties: color ? { fid: String(i.id), name: i.props.name, color } : { fid: String(i.id), name: i.props.name },
    };
  };
  // feature อยู่ source ของ layer ตัวเอง (ถ้ามีบนแผนที่) ไม่งั้นลง SHAPES/POINTS (ไม่มี layer)
  const groups = new Map<string, GeoJSON.Feature[]>([[POINTS, []], [SHAPES, []]]);
  for (const src of Object.keys(map.getStyle().sources)) if (src.startsWith("lyr-")) groups.set(src, []);
  for (const i of items) groups.get(featureSource(map, i))!.push(toFeature(i));
  for (const [source, features] of groups) setData(map, source, features);
}

/** source ที่ feature นี้อยู่: ของ layer (ถ้ามี) ไม่งั้นรวมกลุ่ม "ไม่มี layer" */
const featureSource = (map: MlMap, item: Pick<Item, "type" | "props">) => {
  const own = item.props.layerId === undefined ? undefined : lyrSource(item.props.layerId);
  return own && map.getSource(own) ? own : sourceOf(item.type);
};

export const setCrosshairData = (map: MlMap, features: GeoJSON.Feature[]) => setData(map, CROSSHAIR, features);

/** เปิด/ปิดภูเขา (ยกพื้นตามความสูง + เงาภูเขา) — ปิดอยู่ = ไม่โหลด tile ความสูงเลย */
export function setTerrainEnabled(map: MlMap, on: boolean) {
  if (!map.getSource(DEM)) return;
  map.setTerrain(on ? { source: DEM, exaggeration: TERRAIN_EXAGGERATION } : null);
  map.setLayoutProperty(HILLSHADE, "visibility", on ? "visible" : "none");
}

/** ตั้ง/ล้าง feature-state ของ feature (hover / selected) */
export function setItemState(map: MlMap, item: Pick<Item, "id" | "type" | "props">, state: Record<string, boolean>) {
  const source = featureSource(map, item);
  if (!map.getSource(source)) return;
  map.setFeatureState({ source, id: String(item.id) }, state);
}

// ---------- ชั้นต่อ layer (z-order ส่วนตัวของผู้ใช้) ----------
// แต่ละ layer มี source `lyr-<id>` + ชั้นย่อยตามชนิด วางติดกัน → ย้ายทั้งกลุ่มพร้อมกัน
// ชั้นของ feature ที่ไม่มี layer (SHAPES/POINTS ด้านบน) อยู่ล่างสุดเสมอ; crosshair และ draw อยู่บนสุดเสมอ
const lyrSource = (id: number) => `lyr-${id}`;
const lyrIds = (id: number, suffixes: string[]) => suffixes.map((s) => `${lyrSource(id)}-${s}`);
const SUFFIXES: Record<GeomType, string[]> = {
  Polygon: ["fill", "halo", "line"],
  LineString: ["halo", "line"],
  Point: ["cluster", "cluster-count", "point-halo", "point"],
};
const TOP_ANCHOR = "crosshair-fill"; // ชั้นของเรา (layer ต่างๆ) วางใต้ชั้นนี้
const noCluster: ExpressionSpecification = ["!", ["has", "point_count"]];
const isCluster: ExpressionSpecification = ["has", "point_count"];

function layerSpecs(id: number, geom: GeomType, color: string): LayerSpecification[] {
  const src = lyrSource(id);
  const at = (s: string) => `${src}-${s}`;
  const lineLayout = { "line-cap": "round", "line-join": "round" } as const;
  if (geom === "Polygon") {
    return [
      { id: at("fill"), type: "fill", source: src, paint: { "fill-color": layerColor, "fill-opacity": ["case", active, 0.32, 0.2] } },
      { id: at("halo"), type: "line", source: src, layout: lineLayout, paint: { "line-color": layerColor, "line-width": 12, "line-opacity": ["case", active, 0.25, 0] } },
      { id: at("line"), type: "line", source: src, layout: lineLayout, paint: { "line-color": layerColor, "line-width": ["case", hover, 5, selected, 5, 3] } },
    ];
  }
  if (geom === "LineString") {
    return [
      { id: at("halo"), type: "line", source: src, layout: lineLayout, paint: { "line-color": layerColor, "line-width": 12, "line-opacity": ["case", active, 0.25, 0] } },
      { id: at("line"), type: "line", source: src, layout: lineLayout, paint: { "line-color": layerColor, "line-width": ["case", hover, 5, selected, 5, 3] } },
    ];
  }
  return [
    {
      id: at("cluster"),
      type: "circle",
      source: src,
      filter: isCluster,
      paint: {
        "circle-color": color,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 18, 100, 22],
        "circle-stroke-width": 5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.6,
      },
    },
    {
      id: at("cluster-count"),
      type: "symbol",
      source: src,
      filter: isCluster,
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": LABEL_FONT, "text-size": 12 },
      paint: { "text-color": "#ffffff" },
    },
    { id: at("point-halo"), type: "circle", source: src, filter: noCluster, paint: { "circle-color": layerColor, "circle-radius": 16, "circle-opacity": ["case", active, 0.28, 0] } },
    {
      id: at("point"),
      type: "circle",
      source: src,
      filter: noCluster,
      paint: {
        "circle-color": layerColor,
        "circle-radius": ["case", hover, 10, selected, 10, 8],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    },
  ];
}

type Stack = { signature: string; hit: string[]; cluster: string[] };
const stacks = new WeakMap<MlMap, Stack>();

/**
 * ทำให้ชั้นบนแผนที่ตรงกับ layer + ลำดับ (บนสุด → ล่างสุด) + การซ่อน ของผู้ใช้ — เรียกซ้ำได้ทุกครั้งที่เปลี่ยน
 * เพิ่ม/ลบ source+ชั้นของ layer ที่มา/หาย, จัดลำดับด้วย moveLayer (เฉพาะเมื่อลำดับเปลี่ยน), ซ่อน/แสดงด้วย visibility
 * ไม่แตะข้อมูล feature → ไม่ต้องสร้างใหม่
 */
export function syncLayerStack(map: MlMap, ordered: Layer[], hidden: Set<number>) {
  if (!map.getSource(SHAPES)) return; // addFeatureLayers ยังไม่เสร็จ
  const prev = stacks.get(map);
  const wanted = new Map(ordered.map((l) => [l.id, l]));
  const style = map.getStyle();

  // ลบของ layer ที่หายไป / เปลี่ยนชนิด
  for (const l of style.layers) {
    const m = /^lyr-(-?\d+)-/.exec(l.id);
    if (!m) continue;
    const layer = wanted.get(Number(m[1]));
    if (!layer || !SUFFIXES[layer.geomType].includes(l.id.slice(`lyr-${m[1]}-`.length))) map.removeLayer(l.id);
  }
  for (const id of Object.keys(style.sources)) {
    const m = /^lyr-(-?\d+)$/.exec(id);
    if (m && !wanted.has(Number(m[1]))) map.removeSource(id);
  }

  for (const layer of ordered) {
    const src = lyrSource(layer.id);
    if (!map.getSource(src)) {
      map.addSource(
        src,
        layer.geomType === "Point"
          ? { type: "geojson", data: empty, promoteId: "fid", cluster: true, clusterMaxZoom: 16, clusterRadius: 50 }
          : { type: "geojson", data: empty, promoteId: "fid" },
      );
    }
    for (const spec of layerSpecs(layer.id, layer.geomType, layer.color)) {
      if (!map.getLayer(spec.id)) map.addLayer(spec, TOP_ANCHOR);
    }
    if (layer.geomType === "Point") map.setPaintProperty(`${src}-cluster`, "circle-color", layer.color);
    const visibility = hidden.has(layer.id) ? "none" : "visible";
    for (const id of lyrIds(layer.id, SUFFIXES[layer.geomType])) map.setLayoutProperty(id, "visibility", visibility);
  }

  // จัดลำดับ: ไล่จากล่างสุดขึ้นบน วางแต่ละชั้นใต้ TOP_ANCHOR → ตัวหลังๆ ทับตัวก่อนหน้า
  const signature = ordered.map((l) => `${l.id}:${l.geomType}`).join(",");
  if (signature !== prev?.signature) {
    for (const layer of [...ordered].reverse()) {
      for (const id of lyrIds(layer.id, SUFFIXES[layer.geomType])) map.moveLayer(id, TOP_ANCHOR);
    }
  }

  // ชั้นที่ใช้ hit-test: เรียงจากบนลงล่างให้ queryRenderedFeatures ได้ตัวบนสุดก่อน (ชั้นที่ซ่อนอยู่ MapLibre ข้ามเอง)
  const hit = [...HIT_LAYERS];
  const cluster = [CLUSTER_LAYER];
  for (const layer of ordered) {
    const ids = lyrIds(layer.id, SUFFIXES[layer.geomType]);
    hit.push(...ids.filter((id) => /-(fill|line|point)$/.test(id)));
    if (layer.geomType === "Point") cluster.push(`${lyrSource(layer.id)}-cluster`);
  }
  stacks.set(map, { signature, hit, cluster });
}

/** ชั้นที่คลิก/hover แล้วถือว่าโดน feature (ของ layer ทั้งหมดที่อยู่บนแผนที่ตอนนี้) */
export const hitLayerIds = (map: MlMap) => stacks.get(map)?.hit ?? HIT_LAYERS;
export const clusterLayerIds = (map: MlMap) => stacks.get(map)?.cluster ?? [CLUSTER_LAYER];
