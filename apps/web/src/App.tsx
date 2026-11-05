import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { createFeature, deleteFeature, patchFeature, type FeaturePatch, type FeatureProps } from "./api";
import DrawTools, { type RegisterFn } from "./components/DrawTools";
import FeatureEditor from "./components/FeatureEditor";
import MapRef from "./components/MapRef";
import Navbar from "./components/Navbar";
import Toast, { type ToastData } from "./components/Toast";
import Toolbar from "./components/Toolbar";
import FeaturePanel from "./components/FeaturePanel";
import SearchBox from "./components/SearchBox";
import CrosshairDraw, { Crosshair, MobileScale } from "./components/mobile/CrosshairDraw";
import DrawSheet from "./components/mobile/DrawSheet";
import MobileFeatureList from "./components/mobile/MobileFeatureList";
import MobileHeader from "./components/mobile/MobileHeader";
import MobileSheet from "./components/mobile/MobileSheet";
import { MIN_POINTS, useCrosshairDraw } from "./hooks/useCrosshairDraw";
import { useIsMobile, useMediaQuery } from "./lib/useMediaQuery";
import { BASE_LAYERS, type BaseLayerId } from "./lib/baseLayers";
import {
  attach,
  detach,
  geometryOf,
  message,
  meta,
  ownerGroup,
  propsOf,
  restoreGeometry,
  sameGeometry,
  setHighlight,
} from "./lib/featureMeta";
import { SHAPE_TO_GEOM_TYPE, type DrawShape, type GeomType, type Item, type Selection } from "./lib/types";

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

/** หมุดที่ถูกรวมใน cluster ยังไม่อยู่บนแผนที่ → ซูมให้ cluster แตกก่อน แล้วค่อยทำต่อ */
function reveal(layer: L.Layer, then: () => void) {
  const group = ownerGroup.get(layer);
  if (layer instanceof L.Marker && group instanceof L.MarkerClusterGroup) group.zoomToShowLayer(layer, then);
  else then();
}

const noop = () => {};

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
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const isMobile = useIsMobile();
  // hover มีจริงเฉพาะอุปกรณ์ที่มีเมาส์ — จอสัมผัสยิง mouseover จำลองตอนแตะแต่ไม่ยิง mouseout ทำให้สีส้มค้าง
  const canHover = useMediaQuery("(hover: hover)");
  const hoverEnabled = !isMobile && canHover;
  const crosshair = useCrosshairDraw();
  // วาดด้วยกากบาทกลางจอ (มือถือเท่านั้น) — ขยายจอเป็นจอคอมระหว่างวาด = ยกเลิกโหมดนี้
  if (!isMobile && crosshair.draw) crosshair.cancel();
  const mobileDraw = isMobile ? crosshair.draw : null;
  const registerRef = useRef<RegisterFn | null>(null);

  const onError = useCallback((err: unknown) => setError(message(err)), []);
  const closeToast = useCallback(() => setToast(null), []);

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);
  const activeBaseLayer = BASE_LAYERS.find((l) => l.id === baseLayerId)!;

  const selectedId = selection && selection.mode !== "create" ? selection.id : null;
  const selectedItem = selectedId !== null ? items.find((i) => i.id === selectedId) : undefined;
  const activeHoverId = hoverEnabled ? hoveredId : null;
  const onHover = useCallback((id: number | null) => setHoveredId(id), []);
  const hoveredLayer = activeHoverId !== null ? items.find((i) => i.id === activeHoverId)?.layer : undefined;
  // เปิดให้ลากแก้ทีละจุดได้เฉพาะ draft ที่เพิ่งวาด หรือ feature ที่กดปากกา (edit)
  // โหมดดู (view) ลากไม่ได้ — ย้ายทั้งก้อนใช้เครื่องมือ Move ใน toolbar แทน
  // feature ที่ซ่อนอยู่ไม่อยู่บนแผนที่ จึงเปิด pm ไม่ได้
  const activeLayer =
    selection?.mode === "create"
      ? selection.layer
      : selection?.mode === "edit" && selectedItem && !hiddenIds.has(selectedItem.id)
        ? selectedItem.layer
        : undefined;

  // ย่อจอเป็นมือถือระหว่างวาดแบบ Geoman อยู่ → ปิดโหมดนั้น
  useEffect(() => {
    if (isMobile) mapRef.current?.pm.disableDraw();
  }, [isMobile]);

  const drawingMobile = !!mobileDraw;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawingMobile) return;
    map.closePopup();
    const closeAny = () => map.closePopup();
    map.on("popupopen", closeAny);
    return () => void map.off("popupopen", closeAny);
  }, [drawingMobile]);

  // hover จากรายการหรือบนแผนที่ → ไฮไลต์รูปบนแผนที่ (ต้องอยู่ก่อน effect ด้านล่างที่ตั้งความหนาเส้นตามการเลือก)
  useEffect(() => {
    if (!hoveredLayer) return;
    setHighlight(hoveredLayer, true);
    return () => setHighlight(hoveredLayer, false);
  }, [hoveredLayer]);

  useEffect(() => {
    for (const { layer } of items) {
      const l = layer as Editable;
      const on = layer === activeLayer;
      if (on && !l.pm.enabled()) l.pm.enable();
      else if (!on && l.pm.enabled()) l.pm.disable();
      // เส้นขอบหนาขึ้นเป็นตัวบอกว่า feature นี้ถูกเลือกอยู่ (ตัวที่ hover อยู่ใช้สไตล์ไฮไลต์แทน)
      if (layer instanceof L.Path && layer !== hoveredLayer) {
        layer.setStyle({ weight: layer === selectedItem?.layer ? 5 : 3 });
      }
    }
    // draft ที่เพิ่งวาด ยังไม่อยู่ใน items
    if (activeLayer && !items.some((i) => i.layer === activeLayer)) {
      const l = activeLayer as Editable;
      if (!l.pm.enabled()) l.pm.enable();
    }
  }, [items, activeLayer, selectedItem, hoveredLayer]);

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
    if (enabled) {
      crosshair.cancel();
      closeSelection();
    }
  };

  // ย้ายทั้งก้อนเสร็จ (เฉพาะตอนเปิดเครื่องมือ Move) → บันทึกตำแหน่งทันที
  // ส่ง PATCH เฉพาะ geometry ไม่แตะ properties ส่วนการแก้ทีละจุดในโหมดปากกาต้องกด Save Changes
  const onGeometryChange = (id: number, layer: L.Layer) => {
    if (!moveMode) return;
    const m = meta.get(layer);
    if (!m) return;
    const geometry = geometryOf(layer);
    if (sameGeometry(geometry, m.saved)) return; // กดลากแต่ไม่ได้ขยับจริง
    patchFeature(id, { geometry })
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
    attach(item.layer); // ใส่คืนกลุ่มเดิม (หมุดกลับเข้า cluster)
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
    setPanelOpen(true);
    // หมุดต้องอยู่บนแผนที่ (ไม่ถูกรวมใน cluster) ก่อน Geoman จะเปิดให้ลากได้
    reveal(item.layer, () => setSelection({ mode: "edit", id: item.id }));
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
    detach(item.layer);
    setHiddenIds((s) => new Set(s).add(item.id));
  };

  // คลิก feature บนแผนที่ = ดูข้อมูล (ระหว่างแก้ไข/สร้างไม่ทำอะไร กันข้อมูลที่กรอกไว้หาย)
  const onLayerClick = (id: number) => {
    if (mobileDraw || selection?.mode === "edit" || selection?.mode === "create") return;
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

  /** มือถือ: เลือกเครื่องมือวาด = เริ่มโหมดกากบาท (เลือกชนิดเดิมซ้ำ = ยกเลิก) */
  const onMobileDrawSelect = (shape: DrawShape) => {
    if (mobileDraw?.shape === shape) return crosshair.cancel();
    closeSelection();
    if (mapRef.current?.pm.globalDragModeEnabled()) mapRef.current.pm.disableGlobalDragMode();
    crosshair.start(shape);
  };

  /** ปุ่ม Next: สร้าง layer จากจุดที่วางไว้ แล้วเข้าขั้นตอนกรอกข้อมูลเดียวกับที่วาดด้วย Geoman */
  const finishMobileDraw = () => {
    const map = mapRef.current;
    if (!map || !mobileDraw || mobileDraw.points.length < MIN_POINTS[mobileDraw.shape]) return;
    const { shape, points } = mobileDraw;
    const layer: L.Layer =
      shape === "Marker" ? L.marker(points[0]) : shape === "Line" ? L.polyline(points) : L.polygon(points);
    layer.addTo(map);
    crosshair.cancel();
    onDraft(layer, SHAPE_TO_GEOM_TYPE[shape]);
    // แผ่นฟอร์มกินล่าง 60% ของจอ → เลื่อนรูปที่วาดขึ้นมาอยู่ในส่วนที่ยังมองเห็น
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, map.getSize().y * 0.6 + 16],
      maxZoom: shape === "Marker" ? map.getZoom() : 18,
    });
  };

  const focus = (item: Item) => {
    const map = mapRef.current;
    if (map && !hiddenIds.has(item.id)) {
      // มือถือ: แผ่นล่างกาง 60% ของจอ → เว้นขอบล่างให้รูปไปอยู่ในส่วนที่ยังมองเห็น
      const pad: L.FitBoundsOptions = isMobile
        ? { paddingTopLeft: [40, 40], paddingBottomRight: [40, map.getSize().y * 0.6 + 16] }
        : {};
      if (item.layer instanceof L.Marker) {
        // หมุดอาจอยู่ใน cluster → บินไปซูม 17 (cluster แตกหมด) แล้วค่อยเปิด popup
        const marker = item.layer;
        const p = marker.getLatLng();
        map.flyToBounds(L.latLngBounds([p, p]), { ...pad, maxZoom: 17 });
        map.once("moveend", () => marker.openPopup());
      } else {
        if (item.layer instanceof L.Polyline) map.flyToBounds(item.layer.getBounds(), { ...pad, maxZoom: 16 });
        item.layer.openPopup();
      }
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
      const m = meta.get(layer)!;
      const geometry = geometryOf(layer);

      // ส่งเฉพาะสิ่งที่เปลี่ยนจริง (PATCH)
      const patch: FeaturePatch = {};
      if (!sameGeometry(geometry, m.saved)) patch.geometry = geometry;
      const changed: NonNullable<FeaturePatch["properties"]> = {};
      if (props.name !== m.props.name) changed.name = props.name;
      if (props.category !== m.props.category) changed.category = props.category ?? null;
      if (props.description !== m.props.description) changed.description = props.description ?? null;
      if (Object.keys(changed).length) patch.properties = changed;

      if (!patch.geometry && !patch.properties) {
        setSelection({ mode: "view", id }); // ไม่มีอะไรเปลี่ยน ไม่ต้องยิง API
        return;
      }

      const f = await patchFeature(id, patch);
      const saved = propsOf(f);
      meta.set(layer, { ...m, props: saved, saved: f.geometry });
      layer.setPopupContent(saved.name);
      setItems((list) => list.map((i) => (i.id === id ? { ...i, props: saved } : i)));
      setSelection({ mode: "view", id });
      setToast({ id: Date.now(), name: saved.name });
    }
  };

  const removeItem = async (item: Item) => {
    await deleteFeature(item.id);
    releaseLayer(item.layer);
    detach(item.layer);
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
        variant={isMobile ? "mobile" : "desktop"}
        formId="fe-form"
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
        variant={isMobile ? "mobile" : "desktop"}
        formId="fe-form"
        onEdit={() => startEdit(selectedItem)}
        onSave={save}
        onCancel={selection.mode === "edit" ? cancel : closeSelection}
        onDelete={() => removeItem(selectedItem)}
      />
    ) : null;

  const creating = selection?.mode === "create";
  const selectionKey = selection ? (selection.mode === "create" ? "create" : `${selection.mode}-${selection.id}`) : null;
  const panelVars = { "--panel-w": "clamp(20rem, 28vw, 26rem)" } as CSSProperties;

  return (
    <div className="flex flex-col h-full" style={panelVars}>
      {isMobile ? (
        <MobileHeader
          mode={mobileDraw ? "drawing" : creating ? "form" : "idle"}
          mapRef={mapRef}
          formId="fe-form"
          onCancel={mobileDraw ? crosshair.cancel : cancel}
          onUndo={crosshair.undo}
          onRedo={crosshair.redo}
          onClear={crosshair.clear}
          onNext={finishMobileDraw}
          canUndo={!!mobileDraw && mobileDraw.points.length > 0}
          canRedo={!!mobileDraw && mobileDraw.redo.length > 0}
          canNext={!!mobileDraw && mobileDraw.points.length >= MIN_POINTS[mobileDraw.shape]}
        />
      ) : (
        <Navbar />
      )}

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

      <div
        className="map-area relative flex-1 min-h-0 overflow-hidden"
        style={
          {
            "--map-bottom-inset": `calc(${mobileDraw ? "8rem" : "5.5rem"} + env(safe-area-inset-bottom, 0px))`,
          } as CSSProperties
        }
      >
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
            onHover={hoverEnabled ? onHover : noop}
            onError={onError}
            onLayerClick={onLayerClick}
            onMapClick={onMapClick}
            onDraft={onDraft}
            onGeometryChange={onGeometryChange}
            onMoveModeChange={onMoveModeChange}
          />
          <MapRef mapRef={mapRef} />
          <CrosshairDraw draw={mobileDraw} />
          {isMobile && <MobileScale />}
        </MapContainer>

        {mobileDraw && <Crosshair />}

        <Toolbar
          mapRef={mapRef}
          activeTool={isMobile ? (mobileDraw?.shape ?? null) : activeTool}
          moveActive={moveMode}
          baseLayerId={baseLayerId}
          onBaseLayerChange={setBaseLayerId}
          collapsible={isMobile}
          onDrawSelect={isMobile ? onMobileDrawSelect : undefined}
        />

        {isMobile ? (
          mobileDraw ? (
            <DrawSheet draw={mobileDraw} mapRef={mapRef} onAdd={crosshair.addPoint} onError={onError} />
          ) : (
            <MobileSheet
              open={panelOpen}
              onOpenChange={setPanelOpen}
              featureCount={items.length}
              hasDetails={!!editor && !creating}
              creating={creating}
              selectionKey={selectionKey}
              details={editor}
              list={
                <MobileFeatureList
                  items={items}
                  filter={filter}
                  onFilterChange={setFilter}
                  selectedId={selectedId}
                  hiddenIds={hiddenIds}
                  onFocus={focus}
                  onToggleVisible={toggleVisible}
                  onRemove={(item) => removeItem(item).catch(onError)}
                />
              }
            />
          )
        ) : (
          <>
            {/* ช่องค้นหาหดหลบพาเนลที่เปิดอยู่ (ปุ่มเปิด/ปิดพาเนลเกาะขอบพาเนลเอง) */}
            <SearchBox
              mapRef={mapRef}
              className={`absolute top-4 left-16 z-20 ${
                panelOpen ? "w-[min(20rem,calc(100%_-_var(--panel-w)_-_8rem))]" : "w-[min(20rem,calc(100%_-_8rem))]"
              }`}
            />

            <FeaturePanel
              open={panelOpen}
              onToggle={() => setPanelOpen((o) => !o)}
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
              hoveredId={activeHoverId}
              onHover={onHover}
              editor={editor}
            />
          </>
        )}

        {toast && <Toast key={toast.id} toast={toast} onClose={closeToast} />}
      </div>
    </div>
  );
}
