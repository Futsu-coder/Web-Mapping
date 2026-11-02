import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./App.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Vite ไม่หา path รูป marker ของ Leaflet เอง ต้องกำหนดให้
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type GeomType = "Point" | "LineString" | "Polygon";
type Item = { id: number; name: string; type: GeomType; layer: L.Layer };

const FILTERS: (GeomType | "All")[] = ["All", "Point", "LineString", "Polygon"];

function DrawTools({ onChange }: { onChange: (fn: (items: Item[]) => Item[]) => void }) {
  const map = useMap();

  useEffect(() => {
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

    const handleCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Layer & { toGeoJSON(): GeoJSON.Feature };
      const type = layer.toGeoJSON().geometry.type as GeomType;
      const name = window.prompt("ตั้งชื่อ", type) || type;
      const id = L.Util.stamp(layer);
      layer.bindPopup(name);
      layer.on("pm:remove", () => onChange((items) => items.filter((i) => i.id !== id)));
      onChange((items) => [...items, { id, name, type, layer }]);
      console.log(layer.toGeoJSON());
    };

    map.on("pm:create", handleCreate);
    return () => {
      map.off("pm:create", handleCreate);
      map.pm.removeControls();
    };
  }, [map, onChange]);

  return null;
}

function MapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  mapRef.current = useMap();
  return null;
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<GeomType | "All">("All");
  const mapRef = useRef<L.Map | null>(null);

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);

  const focus = (item: Item) => {
    const map = mapRef.current;
    if (!map) return;
    if (item.layer instanceof L.Marker) map.flyTo(item.layer.getLatLng(), 15);
    else if (item.layer instanceof L.Polyline) map.flyToBounds(item.layer.getBounds(), { maxZoom: 16 });
    item.layer.openPopup();
  };

  const remove = (item: Item) => {
    mapRef.current?.removeLayer(item.layer);
    setItems((list) => list.filter((i) => i.id !== item.id));
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>🗺️ Web Mapping</h1>
        <span className="count">{items.length} features</span>
      </header>

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
                  className="del"
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

        <MapContainer className="map" center={[13.75, 100.5]} zoom={6}>
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
          <DrawTools onChange={setItems} />
          <MapRef mapRef={mapRef} />
        </MapContainer>
      </div>
    </div>
  );
}
