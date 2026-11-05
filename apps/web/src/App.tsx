import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { Session } from "@supabase/supabase-js";
import {
  createFeature,
  deleteFeature,
  getMe,
  updateFeature,
  type ApiFeature,
  type FeatureProps,
  type Me,
} from "./api";
import AuthDialog from "./components/AuthDialog";
import DrawTools, { type RegisterFn } from "./components/DrawTools";
import InvitationToasts from "./components/InvitationToasts";
import NotificationBell from "./components/NotificationBell";
import FeatureEditor from "./components/FeatureEditor";
import MapRef from "./components/MapRef";
import Navbar from "./components/Navbar";
import Toast, { type ToastData } from "./components/Toast";
import Toolbar from "./components/Toolbar";
import FeaturePanel from "./components/FeaturePanel";
import SidebarToggleIcon from "./components/SidebarToggleIcon";
import SearchBox from "./components/SearchBox";
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
  setEditable,
  setHighlight,
} from "./lib/featureMeta";
import { isIdleExpired, watchIdle } from "./lib/idleLogout";
import { supabase } from "./lib/supabase";
import { useInvitations } from "./lib/useInvitations";
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

/** หมุดที่ถูกรวมใน cluster ยังไม่อยู่บนแผนที่ → ซูมให้ cluster แตกก่อน แล้วค่อยทำต่อ */
function reveal(layer: L.Layer, then: () => void) {
  const group = ownerGroup.get(layer);
  if (layer instanceof L.Marker && group instanceof L.MarkerClusterGroup) group.zoomToShowLayer(layer, then);
  else then();
}

/** feature ในโหมดทดลอง: สร้างในเครื่อง ไม่ผ่าน API (id ติดลบ ไม่ชนกับ id จริง) */
const localFeature = (id: number, type: GeomType, geometry: GeoJSON.Geometry, props: FeatureProps): ApiFeature => ({
  type: "Feature",
  id,
  geometry,
  properties: { ...props, geom_type: type, owner_id: null, owner_name: null },
});

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
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // สมาชิกที่ซ่อน feature ไว้ (ซ่อนแค่บนจอเรา)
  const [hiddenOwners, setHiddenOwners] = useState<Set<string>>(new Set());
  const mapRef = useRef<L.Map | null>(null);
  const registerRef = useRef<RegisterFn | null>(null);
  const nextLocalId = useRef(-1);

  const onError = useCallback((err: unknown) => setError(message(err)), []);
  const closeToast = useCallback(() => setToast(null), []);

  // ---------- บัญชีผู้ใช้ ----------
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  // ไม่ได้ใช้งานเกิน 1 วัน → ออกจากระบบอัตโนมัติ (ตรวจตั้งแต่เปิดหน้าเว็บ ก่อนโหลดข้อมูล)
  useEffect(() => {
    if (!userId) return;
    return watchIdle(() => {
      setError("ออกจากระบบอัตโนมัติ เพราะไม่ได้ใช้งานเกิน 1 วัน — กรุณาเข้าสู่ระบบใหม่");
      void supabase?.auth.signOut();
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || isIdleExpired()) return;
    getMe().then(setMe).catch(onError);
  }, [userId, onError]);

  // me ที่ตรงกับ session ปัจจุบันเท่านั้น (logout แล้ว me เก่าไม่ถูกใช้)
  const activeMe = userId && me?.user.id === userId ? me : null;
  const guest = !activeMe;
  const myId = activeMe?.user.id ?? null;
  const groupOwner = !!activeMe && activeMe.group.ownerId === activeMe.user.id;

  /** แก้/ลบได้: โหมดทดลอง, เจ้าของ feature, หรือเจ้าของ group */
  const canModifyOwner = (ownerId: string | null) => guest || groupOwner || (ownerId !== null && ownerId === myId);
  const canModify = (item: Item) => canModifyOwner(item.ownerId);

  // เปลี่ยนบัญชี / ย้าย group → DrawTools โหลดใหม่ (key เปลี่ยน) และล้างสถานะที่ผูกกับ feature ชุดเก่า
  const viewKey = activeMe ? `group-${activeMe.group.id}` : "guest";
  const [shownKey, setShownKey] = useState(viewKey);
  if (shownKey !== viewKey) {
    setShownKey(viewKey);
    setSelection(null);
    setHiddenIds(new Set());
    setHiddenOwners(new Set());
    setHoveredId(null);
  }

  const isHidden = (item: Item) =>
    hiddenIds.has(item.id) || (item.ownerId !== null && hiddenOwners.has(item.ownerId));

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);
  const hiddenSet = new Set(items.filter(isHidden).map((i) => i.id));
  const activeBaseLayer = BASE_LAYERS.find((l) => l.id === baseLayerId)!;

  const selectedId = selection && selection.mode !== "create" ? selection.id : null;
  const selectedItem = selectedId !== null ? items.find((i) => i.id === selectedId) : undefined;
  const hoveredLayer = hoveredId !== null ? items.find((i) => i.id === hoveredId)?.layer : undefined;
  // เปิดให้ลากแก้ทีละจุดได้เฉพาะ draft ที่เพิ่งวาด หรือ feature ที่กดปากกา (edit)
  // โหมดดู (view) ลากไม่ได้ — ย้ายทั้งก้อนใช้เครื่องมือ Move ใน toolbar แทน
  // feature ที่ซ่อนอยู่ไม่อยู่บนแผนที่ จึงเปิด pm ไม่ได้
  const activeLayer =
    selection?.mode === "create"
      ? selection.layer
      : selection?.mode === "edit" && selectedItem && !isHidden(selectedItem)
        ? selectedItem.layer
        : undefined;

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

  // สิทธิ์เปลี่ยนได้ (login / ย้าย group / ได้เป็นเจ้าของ group) → feature ที่แก้ไม่ได้ให้ Geoman ข้าม (Move ลากไม่ได้)
  useEffect(() => {
    for (const { layer, ownerId } of items) {
      const editable = guest || groupOwner || (ownerId !== null && ownerId === myId);
      setEditable(layer, editable);
    }
  }, [items, guest, groupOwner, myId]);

  // ซ่อนของสมาชิกทั้งคน (รวมที่เพิ่งเข้ามาทาง Realtime) — ซ่อนทีละ feature ทำใน toggleVisible อยู่แล้ว
  useEffect(() => {
    for (const item of items) {
      if (item.ownerId === null || hiddenIds.has(item.id)) continue;
      const group = ownerGroup.get(item.layer);
      const onMap = group?.hasLayer(item.layer) ?? false;
      const hide = hiddenOwners.has(item.ownerId);
      if (hide && onMap) {
        releaseLayer(item.layer);
        detach(item.layer);
      } else if (!hide && !onMap) {
        attach(item.layer);
      }
    }
  }, [items, hiddenOwners, hiddenIds]);

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
    if (guest) {
      meta.set(layer, { ...m, saved: geometry }); // โหมดทดลอง: จำตำแหน่งในเครื่องอย่างเดียว
      return;
    }
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
    attach(item.layer); // ใส่คืนกลุ่มเดิม (หมุดกลับเข้า cluster)
    setHiddenIds((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });
  };

  const startEdit = (item: Item) => {
    if (!canModify(item) || (selection?.mode === "edit" && selection.id === item.id)) return;
    discardPending();
    if (mapRef.current?.pm.globalDragModeEnabled()) mapRef.current.pm.disableGlobalDragMode(); // Move กับแก้ทีละจุดเปิดพร้อมกันไม่ได้
    // แก้ไขต้องเห็นรูปทรงบนแผนที่
    if (hiddenIds.has(item.id)) showItem(item);
    if (item.ownerId !== null && hiddenOwners.has(item.ownerId)) toggleOwner(item.ownerId);
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

  /** ซ่อน/แสดง feature ทั้งหมดของสมาชิกคนหนึ่ง (เฉพาะบนจอเรา) */
  const toggleOwner = (ownerId: string) => {
    const hiding = !hiddenOwners.has(ownerId);
    if (hiding && selection?.mode === "edit" && selectedItem?.ownerId === ownerId) cancel();
    setHiddenOwners((s) => {
      const next = new Set(s);
      if (hiding) next.add(ownerId);
      else next.delete(ownerId);
      return next;
    });
  };

  // ---------- บัญชีผู้ใช้ / group ----------
  /** โหลด me ใหม่ — ถ้าย้าย group ต้องทิ้ง draft / การแก้ไขที่ค้างไว้ก่อน (feature ชุดใหม่จะถูกโหลดแทน) */
  const refreshMe = async () => {
    const next = await getMe();
    if (next.group.id !== activeMe?.group.id) closeSelection();
    setMe(next);
  };

  // คำเชิญที่รอตอบ — ใช้ร่วมกันระหว่างการ์ดมุมขวาล่างกับกระดิ่ง
  const inv = useInvitations(myId, () => void refreshMe().catch(onError));

  const openLogin = () => {
    closeSelection(); // ข้อมูลทดลองที่วาดค้างไว้จะหายเมื่อ login
    setAuthOpen(true);
  };

  const logout = () => {
    closeSelection();
    void supabase?.auth.signOut();
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
    if (map && !isHidden(item)) {
      if (item.layer instanceof L.Marker) {
        // หมุดอาจอยู่ใน cluster → บินไปซูม 17 (cluster แตกหมด) แล้วค่อยเปิด popup
        const marker = item.layer;
        map.flyTo(marker.getLatLng(), 17);
        map.once("moveend", () => marker.openPopup());
      } else {
        if (item.layer instanceof L.Polyline) map.flyToBounds(item.layer.getBounds(), { maxZoom: 16 });
        item.layer.openPopup();
      }
    }
    view(item.id);
  };

  // บันทึกจากฟอร์ม — throw เมื่อ API ไม่รับ เพื่อให้ฟอร์มแสดง error และคงข้อมูลที่กรอกไว้
  const save = async (props: FeatureProps) => {
    if (selection?.mode === "create") {
      const draft = selection.layer as Editable;
      const geometry = geometryOf(draft);
      const f = guest
        ? localFeature(nextLocalId.current--, selection.type, geometry, props)
        : await createFeature(geometry, props);
      if (draft.pm.enabled()) draft.pm.disable();
      mapRef.current?.removeLayer(draft);
      registerRef.current?.(L.GeoJSON.geometryToLayer(f), f); // layer จริงจากข้อมูลที่ API ตอบกลับมา
      setSelection({ mode: "view", id: f.id });
      setToast({ id: Date.now(), name: f.properties.name });
    } else if (selection?.mode === "edit" && selectedItem) {
      const { layer, id, type } = selectedItem;
      const geometry = geometryOf(layer);
      const f = guest ? localFeature(id, type, geometry, props) : await updateFeature(id, geometry, props);
      const saved = propsOf(f);
      meta.set(layer, { ...meta.get(layer)!, props: saved, saved: f.geometry });
      layer.setPopupContent(saved.name);
      setItems((list) => list.map((i) => (i.id === id ? { ...i, props: saved } : i)));
      setSelection({ mode: "view", id });
      setToast({ id: Date.now(), name: saved.name });
    }
  };

  const removeItem = async (item: Item) => {
    if (!guest) await deleteFeature(item.id);
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
        ownerName={guest ? null : selectedItem.ownerName}
      />
    ) : null;

  return (
    <div className="flex flex-col h-full">
      <Navbar
        me={activeMe}
        hiddenOwners={hiddenOwners}
        onToggleOwner={toggleOwner}
        onLogin={openLogin}
        onLogout={logout}
        onRefresh={() => refreshMe().catch(onError)}
        bell={
          activeMe && (
            <NotificationBell
              key={activeMe.user.id}
              userId={activeMe.user.id}
              invitations={inv.invitations}
              busyInvitationId={inv.busyId}
              onAnswer={(i, action) => void inv.answer(i, action)}
            />
          )
        }
      />

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
            key={viewKey}
            guest={guest}
            canModify={canModifyOwner}
            registerRef={registerRef}
            onItemsChange={setItems}
            onActiveToolChange={onActiveToolChange}
            onHover={setHoveredId}
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

        <SearchBox mapRef={mapRef} />

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
          hiddenIds={hiddenSet}
          canModify={canModify}
          showOwner={!guest}
          hoveredId={hoveredId}
          onHover={setHoveredId}
          editor={editor}
        />

        {guest && (
          <div className="absolute bottom-8 left-4 z-20 max-w-[calc(100%-2rem)] flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg shadow-md text-xs">
            <span className="material-symbols-outlined text-[18px]">science</span>
            <span>
              <strong>โหมดทดลอง</strong> — วาดได้ แต่ข้อมูลไม่ถูกบันทึก (หายเมื่อรีเฟรช)
            </span>
            <button type="button" onClick={openLogin} className="font-semibold text-teal-800 hover:underline shrink-0">
              เข้าสู่ระบบเพื่อบันทึก
            </button>
          </div>
        )}

        {toast && <Toast key={toast.id} toast={toast} onClose={closeToast} />}
      </div>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {activeMe && (
        <InvitationToasts
          invitations={inv.invitations}
          busyId={inv.busyId}
          error={inv.error}
          onAnswer={(i, action) => void inv.answer(i, action)}
        />
      )}
    </div>
  );
}
