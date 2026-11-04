import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { createFeature, deleteFeature, updateFeature, type FeatureProps } from "./api";
import DrawTools, { type RegisterFn } from "./components/DrawTools";
import FeatureEditor from "./components/FeatureEditor";
import MapRef from "./components/MapRef";
import Navbar from "./components/Navbar";
import Toast, { type ToastData } from "./components/Toast";
import Toolbar from "./components/Toolbar";
import FeaturePanel from "./components/FeaturePanel";
import SidebarToggleIcon from "./components/SidebarToggleIcon";
import { BASE_LAYERS, type BaseLayerId } from "./lib/baseLayers";
import { geometryOf, message, meta, propsOf, restoreGeometry, sameGeometry } from "./lib/featureMeta";
import type { DrawShape, GeomType, Item, Selection } from "./lib/types";

// Vite ไม่หา path รูป marker ของ Leaflet เอง ต้องกำหนดให้
// imagePath = "" กัน Leaflet เอา path ที่เดาจาก CSS ไปต่อหน้า URL ที่ import มา (ทำให้รูปหมุดหาย)
L.Icon.Default.imagePath = "";
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type Editable = L.Path | L.Marker;

/** ปิดโหมดแก้ทีละจุดและโหมดลากทั้งก้อนของ layer ก่อนเอาออกจากแผนที่ (กัน Geoman error) */
function releaseLayer(layer: L.Layer) {
  const l = layer as Editable;
  if (l.pm.enabled()) l.pm.disable();
  if (l.pm.layerDragEnabled()) l.pm.disableLayerDrag();
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<GeomType | "All">("All");
  const [activeTool, setActiveTool] = useState<DrawShape | null>(null);
  const [baseLayerId, setBaseLayerId] = useState<BaseLayerId>("osm");
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<ToastData | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const registerRef = useRef<RegisterFn | null>(null);

  const onError = useCallback((err: unknown) => setError(message(err)), []);
  const closeToast = useCallback(() => setToast(null), []);

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);
  const activeBaseLayer = BASE_LAYERS.find((l) => l.id === baseLayerId)!;

  const selectedId = selection && selection.mode !== "create" ? selection.id : null;
  const selectedItem = selectedId !== null ? items.find((i) => i.id === selectedId) : undefined;
  // เปิดให้ลากแก้ทีละจุดได้เฉพาะ draft ที่เพิ่งวาด หรือ feature ที่กดปากกา (edit)
  // โหมดดู (view) ลากไม่ได้ — ย้ายทั้งก้อนใช้เครื่องมือ Move ใน toolbar แทน
  // feature ที่ซ่อนอยู่ไม่อยู่บนแผนที่ จึงเปิด pm ไม่ได้
  const activeLayer =
    selection?.mode === "create"
      ? selection.layer
      : selection?.mode === "edit" && selectedItem && !hiddenIds.has(selectedItem.id)
        ? selectedItem.layer
        : undefined;

  useEffect(() => {
    for (const { layer } of items) {
      const l = layer as Editable;
      const on = layer === activeLayer;
      if (on && !l.pm.enabled()) l.pm.enable();
      else if (!on && l.pm.enabled()) l.pm.disable();
      // เส้นขอบหนาขึ้นเป็นตัวบอกว่า feature นี้ถูกเลือกอยู่
      if (layer instanceof L.Path) layer.setStyle({ weight: layer === selectedItem?.layer ? 5 : 3 });
    }
    // draft ที่เพิ่งวาด ยังไม่อยู่ใน items
    if (activeLayer && !items.some((i) => i.layer === activeLayer)) {
      const l = activeLayer as Editable;
      if (!l.pm.enabled()) l.pm.enable();
    }
  }, [items, activeLayer, selectedItem]);

  /** ทิ้งสิ่งที่ค้างอยู่: draft = ลบออกจากแผนที่, โหมดปากกา = คืนรูปทรงที่ยังไม่ได้กด Save (ไม่แตะ state) */
  const discardPending = () => {
    if (selection?.mode === "create") {
      const l = selection.layer as Editable;
      if (l.pm.enabled()) l.pm.disable();
      mapRef.current?.removeLayer(selection.layer);
    } else if (selection?.mode === "edit" && selectedItem) {
      const l = selectedItem.layer as Editable;
      if (l.pm.enabled()) l.pm.disable();
      restoreGeometry(l, meta.get(l)!.saved);
    }
  };

  // เครื่องมือ Move เปิด/ปิด: ตอนเปิดต้องทิ้งสิ่งที่ค้างอยู่ เพราะ layer-drag ของ Geoman จะปิดโหมดลากจุดของ layer นั้น
  const onMoveModeChange = (enabled: boolean) => {
    setMoveMode(enabled);
    if (enabled) closeSelection();
  };

  // ย้ายทั้งก้อนเสร็จ (เฉพาะตอนเปิดเครื่องมือ Move) → บันทึกตำแหน่งทันที
  // ส่ง props ที่บันทึกไว้ ไม่ใช่ค่าที่กำลังพิมพ์ในฟอร์ม ส่วนการแก้ทีละจุดในโหมดปากกาต้องกด Save Changes
  const onGeometryChange = (id: number, layer: L.Layer) => {
    if (!moveMode) return;
    const m = meta.get(layer);
    if (!m) return;
    const geometry = geometryOf(layer);
    if (sameGeometry(geometry, m.saved)) return; // กดลากแต่ไม่ได้ขยับจริง
    updateFeature(id, geometry, m.props)
      .then((f) => {
        meta.set(layer, { ...meta.get(layer)!, saved: f.geometry }); // บันทึกเงียบ ไม่ขึ้น toast
      })
      .catch((err) => {
        restoreGeometry(layer, meta.get(layer)!.saved); // API ไม่รับ = คืนตำแหน่งเดิม
        onError(err);
      });
  };

  const closeSelection = () => {
    discardPending();
    setSelection(null);
  };

  const view = (id: number) => {
    if (selection?.mode === "view" && selection.id === id) return;
    discardPending();
    setSelection({ mode: "view", id });
    setPanelOpen(true);
  };

  const showItem = (item: Item) => {
    mapRef.current?.addLayer(item.layer);
    setHiddenIds((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });
  };

  const startEdit = (item: Item) => {
    if (selection?.mode === "edit" && selection.id === item.id) return;
    discardPending();
    if (mapRef.current?.pm.globalDragModeEnabled()) mapRef.current.pm.disableGlobalDragMode(); // Move กับแก้ทีละจุดเปิดพร้อมกันไม่ได้
    if (hiddenIds.has(item.id)) showItem(item); // แก้ไขต้องเห็นรูปทรงบนแผนที่
    setSelection({ mode: "edit", id: item.id });
    setPanelOpen(true);
  };

  /** ปุ่ม Cancel ในฟอร์ม: edit = คืนค่าเดิมแล้วกลับไปโหมดดู, create = ทิ้ง shape */
  const cancel = () => {
    const keepId = selection?.mode === "edit" ? selection.id : null;
    discardPending();
    setSelection(keepId !== null ? { mode: "view", id: keepId } : null);
  };

  const toggleVisible = (item: Item) => {
    if (hiddenIds.has(item.id)) return showItem(item);
    if (selection?.mode === "edit" && selection.id === item.id) cancel();
    releaseLayer(item.layer); // ปิดโหมดแก้ไข/ลากก่อนเอาออกจากแผนที่
    mapRef.current?.removeLayer(item.layer);
    setHiddenIds((s) => new Set(s).add(item.id));
  };

  // คลิก feature บนแผนที่ = ดูข้อมูล (ระหว่างแก้ไข/สร้างไม่ทำอะไร กันข้อมูลที่กรอกไว้หาย)
  const onLayerClick = (id: number) => {
    if (selection?.mode === "edit" || selection?.mode === "create") return;
    view(id);
  };

  // คลิกพื้นที่ว่าง: ปิดเฉพาะโหมดดู
  const onMapClick = () => {
    if (selection?.mode === "view") setSelection(null);
  };

  const onDraft = (layer: L.Layer, type: GeomType) => {
    discardPending();
    if (layer instanceof L.Polygon) layer.pm.setOptions({ allowSelfIntersection: false });
    setSelection({ mode: "create", layer, type });
    setPanelOpen(true);
  };

  const onActiveToolChange = (shape: DrawShape | null) => {
    if (shape) closeSelection(); // เริ่มวาดใหม่ = ทิ้งสิ่งที่ค้างอยู่
    setActiveTool(shape);
  };

  const focus = (item: Item) => {
    const map = mapRef.current;
    if (map && !hiddenIds.has(item.id)) {
      if (item.layer instanceof L.Marker) map.flyTo(item.layer.getLatLng(), 15);
      else if (item.layer instanceof L.Polyline) map.flyToBounds(item.layer.getBounds(), { maxZoom: 16 });
      item.layer.openPopup();
    }
    view(item.id);
  };

  // บันทึกจากฟอร์ม — throw เมื่อ API ไม่รับ เพื่อให้ฟอร์มแสดง error และคงข้อมูลที่กรอกไว้
  const save = async (props: FeatureProps) => {
    if (selection?.mode === "create") {
      const draft = selection.layer as Editable;
      const f = await createFeature(geometryOf(draft), props);
      if (draft.pm.enabled()) draft.pm.disable();
      mapRef.current?.removeLayer(draft);
      registerRef.current?.(L.GeoJSON.geometryToLayer(f), f); // layer จริงจากข้อมูลที่ API ตอบกลับมา
      setSelection({ mode: "view", id: f.id });
      setToast({ id: Date.now(), name: f.properties.name });
    } else if (selection?.mode === "edit" && selectedItem) {
      const { layer, id } = selectedItem;
      const f = await updateFeature(id, geometryOf(layer), props);
      const saved = propsOf(f);
      meta.set(layer, { ...meta.get(layer)!, props: saved, saved: f.geometry });
      layer.setPopupContent(saved.name);
      setItems((list) => list.map((i) => (i.id === id ? { ...i, props: saved } : i)));
      setSelection({ mode: "view", id });
      setToast({ id: Date.now(), name: saved.name });
    }
  };

  const removeItem = async (item: Item) => {
    await deleteFeature(item.id);
    releaseLayer(item.layer);
    mapRef.current?.removeLayer(item.layer);
    setItems((list) => list.filter((i) => i.id !== item.id));
    setHiddenIds((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });
    if (selectedId === item.id) setSelection(null);
  };

  const editor =
    selection?.mode === "create" ? (
      <FeatureEditor
        key={`new-${L.stamp(selection.layer)}`}
        mode="create"
        type={selection.type}
        layer={selection.layer}
        initial={{ name: "" }}
        onSave={save}
        onCancel={cancel}
        onDelete={async () => cancel()}
      />
    ) : selection && selectedItem ? (
      <FeatureEditor
        key={`${selectedItem.id}-${selection.mode}`}
        mode={selection.mode}
        type={selectedItem.type}
        layer={selectedItem.layer}
        initial={selectedItem.props}
        onSave={save}
        onCancel={selection.mode === "edit" ? cancel : closeSelection}
        onDelete={() => removeItem(selectedItem)}
      />
    ) : null;

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
          <DrawTools
            registerRef={registerRef}
            onItemsChange={setItems}
            onActiveToolChange={onActiveToolChange}
            onError={onError}
            onLayerClick={onLayerClick}
            onMapClick={onMapClick}
            onDraft={onDraft}
            onGeometryChange={onGeometryChange}
            onMoveModeChange={onMoveModeChange}
          />
          <MapRef mapRef={mapRef} />
        </MapContainer>

        <Toolbar
          mapRef={mapRef}
          activeTool={activeTool}
          moveActive={moveMode}
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
          onEdit={startEdit}
          onToggleVisible={toggleVisible}
          onRemove={(item) => removeItem(item).catch(onError)}
          selectedId={selectedId}
          editingId={selection?.mode === "edit" ? selection.id : null}
          hiddenIds={hiddenIds}
          editor={editor}
        />

        {toast && <Toast key={toast.id} toast={toast} onClose={closeToast} />}
      </div>
    </div>
  );
}
