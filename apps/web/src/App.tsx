import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./App.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import {
  createFeature,
  deleteFeature,
  listFeatures,
  updateFeature,
  type ApiFeature,
  type GeomType,
} from "./api";

// Vite ไม่หา path รูป marker ของ Leaflet เอง ต้องกำหนดให้
// imagePath = "" กัน Leaflet เอา path ที่เดาจาก CSS ไปต่อหน้า URL ที่ import มา (ทำให้รูปหมุดหาย)
L.Icon.Default.imagePath = "";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type Item = { id: number; name: string; type: GeomType; layer: L.Layer };
type SetItems = (fn: (items: Item[]) => Item[]) => void;
type GeoLayer = L.Layer & { toGeoJSON(): GeoJSON.Feature };

const FILTERS: (GeomType | "All")[] = ["All", "Point", "LineString", "Polygon"];

// id / ชื่อ / ชนิด / รูปทรงล่าสุดที่บันทึกแล้ว ของแต่ละ layer บนแผนที่ (ตรงกับข้อมูลใน database)
type Meta = { id: number; name: string; type: GeomType; saved: GeoJSON.Geometry };
const meta = new WeakMap<L.Layer, Meta>();

const geometryOf = (layer: L.Layer) => (layer as GeoLayer).toGeoJSON().geometry;

// คืนรูปทรงของ layer กลับเป็นค่าที่บันทึกไว้ (ใช้ตอน API ไม่รับการแก้ไข)
function restoreGeometry(layer: L.Layer, geometry: GeoJSON.Geometry) {
  if (layer instanceof L.Marker && geometry.type === "Point") {
    layer.setLatLng(L.GeoJSON.coordsToLatLng(geometry.coordinates as [number, number]));
  } else if (layer instanceof L.Polygon && geometry.type === "Polygon") {
    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(geometry.coordinates, 1));
  } else if (layer instanceof L.Polyline && geometry.type === "LineString") {
    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(geometry.coordinates, 0));
  }
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function FeatureLayers({ setItems, onError }: { setItems: SetItems; onError: (err: unknown) => void }) {
  const map = useMap();

  useEffect(() => {
    (map.pm.Draw.Polygon as L.PM.DrawShape).setOptions({ allowSelfIntersection: false });
    map.pm.addControls({
      position: "topleft",
      drawMarker: true,
      drawPolyline: true,
      drawPolygon: true,
      drawCircle: false,
      drawCircleMarker: false,
      drawRectangle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });

    const group = L.featureGroup().addTo(map);
    let alive = true;

    // คืนรูปทรงเดิมแล้ว sync จุดแก้ไขของ Geoman ให้ตรงกับรูปทรงใหม่
    const revert = (layer: L.Path | L.Marker) => {
      const editing = layer.pm.enabled();
      if (editing) layer.pm.disable();
      restoreGeometry(layer, meta.get(layer)!.saved);
      if (editing) layer.pm.enable();
    };

    // ผูก layer กับ feature ใน database: แก้รูปทรง → PUT, ลบด้วยเครื่องมือบนแผนที่ → DELETE
    const register = (layer: L.Layer, f: ApiFeature) => {
      const info: Meta = { id: f.id, name: f.properties.name, type: f.geometry.type as GeomType, saved: f.geometry };
      meta.set(layer, info);
      layer.bindPopup(info.name);
      // Polygon ที่ขอบตัดกันเองบันทึกไม่ได้ (PostGIS ถือว่า invalid) → ให้ Geoman ห้ามตั้งแต่ตอนลากจุด
      if (layer instanceof L.Polygon) layer.pm.setOptions({ allowSelfIntersection: false });
      // pm:edit ยิงทุกครั้งที่ลากจุด/เพิ่ม-ลบจุด/ย้าย layer เสร็จ → บันทึกทันที ไม่ต้องรอกด Finish
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
          .then(() => setItems((items) => items.filter((i) => i.id !== m.id)))
          .catch((err) => {
            group.addLayer(layer);
            onError(err);
          });
      });
      group.addLayer(layer);
      setItems((items) => [...items, { ...info, layer }]);
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

    listFeatures()
      .then((features) => {
        if (!alive) return;
        for (const f of features) register(L.GeoJSON.geometryToLayer(f), f);
      })
      .catch(onError);

    map.on("pm:create", handleCreate);
    return () => {
      alive = false;
      map.off("pm:create", handleCreate);
      map.pm.removeControls();
      group.remove();
      setItems(() => []);
    };
  }, [map, setItems, onError]);

  return null;
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<GeomType | "All">("All");
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const onError = useCallback((err: unknown) => setError(message(err)), []);

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);

  const focus = (item: Item) => {
    const map = mapRef.current;
    if (!map) return;
    if (item.layer instanceof L.Marker) map.flyTo(item.layer.getLatLng(), 15);
    else if (item.layer instanceof L.Polyline) map.flyToBounds(item.layer.getBounds(), { maxZoom: 16 });
    item.layer.openPopup();
  };

  const rename = async (item: Item) => {
    const name = window.prompt("เปลี่ยนชื่อ", item.name)?.trim();
    if (!name || name === item.name) return;
    try {
      await updateFeature(item.id, geometryOf(item.layer), name);
      meta.set(item.layer, { ...meta.get(item.layer)!, name });
      item.layer.setPopupContent(name);
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, name } : i)));
    } catch (err) {
      onError(err);
    }
  };

  const remove = async (item: Item) => {
    try {
      await deleteFeature(item.id);
      mapRef.current?.removeLayer(item.layer);
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>🗺️ Web Mapping</h1>
        <span className="count">{items.length} features</span>
      </header>

      {error && (
        <div className="error" role="alert">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} title="ปิด">
            ✕
          </button>
        </div>
      )}

      <div className="body">
        <aside className="sidebar">
          <div className="filters">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          <ul className="list">
            {shown.length === 0 && <li className="empty">ยังไม่มีข้อมูล — ใช้เครื่องมือซ้ายบนวาดบนแผนที่</li>}
            {shown.map((item) => (
              <li key={item.id} onClick={() => focus(item)}>
                <span className={`badge ${item.type}`}>{item.type}</span>
                <span className="name">{item.name}</span>
                <button
                  className="icon"
                  title="เปลี่ยนชื่อ"
                  onClick={(e) => {
                    e.stopPropagation();
                    rename(item);
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon del"
                  title="ลบ"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(item);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <MapContainer ref={mapRef} className="map" center={[13.75, 100.5]} zoom={6}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="ดาวเทียม (Esri)">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="CARTO Light">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="&copy; OpenStreetMap &copy; CARTO"
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <FeatureLayers setItems={setItems} onError={onError} />
        </MapContainer>
      </div>
    </div>
  );
}
