import { useCallback, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { deleteFeature, updateFeature } from "./api";
import DrawTools from "./components/DrawTools";
import MapRef from "./components/MapRef";
import Navbar from "./components/Navbar";
import Toolbar from "./components/Toolbar";
import FeaturePanel from "./components/FeaturePanel";
import SidebarToggleIcon from "./components/SidebarToggleIcon";
import { BASE_LAYERS, type BaseLayerId } from "./lib/baseLayers";
import { geometryOf, message, meta } from "./lib/featureMeta";
import type { DrawShape, GeomType, Item } from "./lib/types";

// Vite ไม่หา path รูป marker ของ Leaflet เอง ต้องกำหนดให้
// imagePath = "" กัน Leaflet เอา path ที่เดาจาก CSS ไปต่อหน้า URL ที่ import มา (ทำให้รูปหมุดหาย)
L.Icon.Default.imagePath = "";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<GeomType | "All">("All");
  const [activeTool, setActiveTool] = useState<DrawShape | null>(null);
  const [baseLayerId, setBaseLayerId] = useState<BaseLayerId>("osm");
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const onError = useCallback((err: unknown) => setError(message(err)), []);

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);
  const activeBaseLayer = BASE_LAYERS.find((l) => l.id === baseLayerId)!;

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
    <div className="flex flex-col h-full">
      <Navbar />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-4 py-2 shrink-0 bg-red-50 text-red-800 border-b border-red-200 text-sm z-30"
        >
          <span className="flex-1">⚠️ {error}</span>
          <button
            type="button"
            title="ปิด"
            aria-label="ปิด"
            onClick={() => setError(null)}
            className="text-base leading-none hover:text-red-950"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <MapContainer
          className="absolute inset-0 w-full h-full z-0"
          center={[13.75, 100.5]}
          zoom={6}
          zoomControl={false}
        >
          <TileLayer key={activeBaseLayer.id} url={activeBaseLayer.url} attribution={activeBaseLayer.attribution} />
          <DrawTools onItemsChange={setItems} onActiveToolChange={setActiveTool} onError={onError} />
          <MapRef mapRef={mapRef} />
        </MapContainer>

        <Toolbar
          mapRef={mapRef}
          activeTool={activeTool}
          baseLayerId={baseLayerId}
          onBaseLayerChange={setBaseLayerId}
        />

        <button
          type="button"
          title={panelOpen ? "ปิดพาเนลรายการ" : "เปิดพาเนลรายการ"}
          aria-label={panelOpen ? "ปิดพาเนลรายการ" : "เปิดพาเนลรายการ"}
          onClick={() => setPanelOpen((o) => !o)}
          className={`absolute top-4 z-30 w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-[right] duration-300 ease-in-out ${
            panelOpen ? "right-[21rem] sm:right-[25rem]" : "right-4"
          }`}
        >
          <SidebarToggleIcon direction={panelOpen ? "right" : "left"} className="w-5 h-5" />
        </button>

        <FeaturePanel
          open={panelOpen}
          items={shown}
          filter={filter}
          onFilterChange={setFilter}
          onFocus={focus}
          onRename={rename}
          onRemove={remove}
        />
      </div>
    </div>
  );
}
