import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { Popup, type Map as MlMap, type PaddingOptions } from "maplibre-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Session } from "@supabase/supabase-js";
import {
  createFeature,
  deleteFeature,
  getMe,
  patchFeature,
  type ApiFeature,
  type FeaturePatch,
  type FeatureProps,
  type Me,
} from "./api";
import AuthDialog from "./components/AuthDialog";
import InvitationToasts from "./components/InvitationToasts";
import NotificationBell from "./components/NotificationBell";
import FeatureEditor from "./components/FeatureEditor";
import MapView, { type MapCtx } from "./components/MapView";
import AccountMenu from "./components/AccountMenu";
import GuestIndicator from "./components/GuestIndicator";
import DetailCard from "./components/DetailCard";
import { AlertCircleIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notifyInfo, notifySaved } from "./components/Toast";
import { Toaster } from "@/components/ui/sonner";
import Toolbar from "./components/Toolbar";
import MapControls from "./components/MapControls";
import DrawFab from "./components/mobile/DrawFab";
import FeaturePanel from "./components/FeaturePanel";
import SearchToggle from "./components/SearchToggle";
import CrosshairDraw, { Crosshair } from "./components/mobile/CrosshairDraw";
import DrawSheet from "./components/mobile/DrawSheet";
import MobileFeatureList from "./components/mobile/MobileFeatureList";
import MobileHeader from "./components/mobile/MobileHeader";
import MobileSheet, { SHEET_HALF_RATIO } from "./components/mobile/MobileSheet";
import { MIN_POINTS, useCrosshairDraw } from "./hooks/useCrosshairDraw";
import { toItem, useFeatureData } from "./hooks/useFeatureData";
import { useMapEvents } from "./hooks/useMapEvents";
import { useIsMobile, useMediaQuery } from "./lib/useMediaQuery";
import { bboxOf, centerOf, message, propsOf, sameGeometry } from "./lib/featureMeta";
import { setFeatureData, setItemState, setTerrainEnabled } from "./lib/mapLayers";
import { selfIntersects } from "./lib/measure";
import { clearGuest, GUEST_TTL_MS, guestExpiresAt, nextGuestId, removeGuest, upsertGuest } from "./lib/guestStore";
import { isIdleExpired, watchIdle } from "./lib/idleLogout";
import { supabase } from "./lib/supabase";
import { useInvitations } from "./lib/useInvitations";
import { DRAW_MODE, SHAPE_TO_GEOM_TYPE, type DrawShape, type GeomType, type Item, type Selection } from "./lib/types";

/** feature ในโหมดทดลอง: สร้างในเครื่อง ไม่ผ่าน API (id ติดลบ ไม่ชนกับ id จริง) เก็บใน localStorage */
const localFeature = (id: number, type: GeomType, geometry: GeoJSON.Geometry, props: FeatureProps): ApiFeature => ({
  type: "Feature",
  id,
  geometry,
  properties: { ...props, geom_type: type, owner_id: null, owner_name: null },
});

// type ของ mapbox-gl-draw แยก changeMode ตามชื่อโหมด — ใช้ตัวนี้เมื่อชื่อโหมดเป็นตัวแปร
const setDrawMode = (draw: MapboxDraw, mode: string, options?: object) =>
  (draw.changeMode as (mode: string, options?: object) => void)(mode, options);

/** id ของรูปทรงใน draw: ที่กำลังแก้ = `f<id>`, ที่กำลังย้าย = `m<id>`, ที่เพิ่งวาด = id ที่ draw สร้างให้ */
const editDrawId = (id: number) => `f${id}`;
const moveDrawId = (id: number) => `m${id}`;

const SELF_INTERSECT = "ขอบพื้นที่ตัดกันเอง — บันทึกไม่ได้ (ลากจุดให้ขอบไม่ไขว้กัน)";
const isBadPolygon = (g: GeoJSON.Geometry) => g.type === "Polygon" && selfIntersects(g.coordinates[0] ?? []);

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<GeomType | "All">("All");
  const [activeTool, setActiveTool] = useState<DrawShape | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // รูปทรงล่าสุดของสิ่งที่วาด/แก้อยู่ใน draw (ยังไม่บันทึก) — ใช้แสดงตำแหน่ง/พื้นที่ในฟอร์ม
  const [draftGeom, setDraftGeom] = useState<GeoJSON.Geometry | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [moveMode, setMoveMode] = useState(false);
  // โหมด 3D: แผนที่เอียง 60° หมุนได้ เห็นภูเขาและตึก 3D (ตึกมีตั้งแต่ซูม 14)
  const [is3D, setIs3D] = useState(false);
  const zoomInFor3D = useRef(false);
  /** กล้องถูกสั่งแบน (pitch 0) พร้อมการเลื่อนไปแล้ว → effect mustBeFlat ไม่ต้อง easeTo ซ้ำ (ไม่งั้นตัดการบินที่ค้างอยู่) */
  const skipFlatEase = useRef(false);
  /** กล้องที่รอเลื่อนหลัง render ถัดไป (ดู requestFit) */
  const pendingFit = useRef<{ geometry: GeoJSON.Geometry; fly: boolean; maxZoom?: number; flat: boolean } | null>(null);
  const [, bumpFit] = useReducer((n: number) => n + 1, 0);
  // feature ที่ถูกดึงเข้า draw เพื่อลากย้ายในโหมด Move
  const [movingId, setMovingId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // สมาชิกที่ซ่อน feature ไว้ (ซ่อนแค่บนจอเรา)
  const [hiddenOwners, setHiddenOwners] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<MapCtx | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popup = useRef<Popup | null>(null);
  const isMobile = useIsMobile();
  // hover มีจริงเฉพาะอุปกรณ์ที่มีเมาส์ — จอสัมผัสยิง mouseover จำลองตอนแตะแต่ไม่ยิง mouseout ทำให้สีส้มค้าง
  const canHover = useMediaQuery("(hover: hover)");
  const hoverEnabled = !isMobile && canHover;
  const crosshair = useCrosshairDraw();
  // วาดด้วยกากบาทกลางจอ (มือถือเท่านั้น) — ขยายจอเป็นจอคอมระหว่างวาด = ยกเลิกโหมดนี้
  if (!isMobile && crosshair.draw) crosshair.cancel();
  // ย่อจอเป็นมือถือระหว่างวาดด้วย draw อยู่ → ปิดเครื่องมือนั้น (โหมดของ draw ปิดใน effect ด้านล่าง)
  if (isMobile && activeTool) setActiveTool(null);
  const mobileDraw = isMobile ? crosshair.draw : null;
  // โหมดทดลอง: เวลาที่ข้อมูลใน localStorage จะถูกลบ (null = ยังไม่มีข้อมูล) / ลบแล้วเพิ่ม epoch ให้โหลดใหม่
  const [guestExpiry, setGuestExpiry] = useState(guestExpiresAt);
  const [guestEpoch, setGuestEpoch] = useState(0);
  const [now, setNow] = useState(Date.now);

  const onError = useCallback((err: unknown) => setError(message(err)), []);
  const onMapReady = useCallback((c: MapCtx | null) => {
    mapRef.current = c?.map ?? null;
    setCtx(c);
  }, []);

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

  // เปลี่ยนบัญชี / ย้าย group / ข้อมูลทดลองหมดอายุ → โหลด feature ชุดใหม่ และล้างสถานะที่ผูกกับชุดเก่า
  const viewKey = activeMe ? `group-${activeMe.group.id}` : `guest-${guestEpoch}`;
  const [shownKey, setShownKey] = useState(viewKey);
  if (shownKey !== viewKey) {
    setShownKey(viewKey);
    setGuestExpiry(guestExpiresAt()); // กลับมาโหมดทดลอง (logout) ข้อมูลอาจหมดอายุไประหว่างนั้น
    setItems([]);
    setSelection(null);
    setDraftGeom(null);
    setMovingId(null);
    setHiddenIds(new Set());
    setHiddenOwners(new Set());
    setHoveredId(null);
  }
  useFeatureData(viewKey, guest, setItems, onError);

  const isHidden = (item: Item) =>
    hiddenIds.has(item.id) || (item.ownerId !== null && hiddenOwners.has(item.ownerId));

  const shown = filter === "All" ? items : items.filter((i) => i.type === filter);
  const hiddenSet = new Set(items.filter(isHidden).map((i) => i.id));

  const selectedId = selection && selection.mode !== "create" ? selection.id : null;
  const selectedItem = selectedId !== null ? items.find((i) => i.id === selectedId) : undefined;
  const editingId = selection?.mode === "edit" ? selection.id : null;
  const activeHoverId = hoverEnabled ? hoveredId : null;
  const onHover = useCallback((id: number | null) => setHoveredId(id), []);
  const hoveredItem = activeHoverId !== null ? items.find((i) => i.id === activeHoverId) : undefined;

  // วาด feature ที่บันทึกแล้วลงแผนที่ — ไม่รวมที่ซ่อน และที่อยู่ใน draw (กำลังแก้ / กำลังย้าย) จะได้ไม่เห็นซ้อนกัน 2 ชิ้น
  useEffect(() => {
    if (!ctx) return;
    setFeatureData(
      ctx.map,
      items.filter(
        (i) =>
          !hiddenIds.has(i.id) &&
          !(i.ownerId !== null && hiddenOwners.has(i.ownerId)) &&
          i.id !== editingId &&
          i.id !== movingId,
      ),
    );
  }, [ctx, items, hiddenIds, hiddenOwners, editingId, movingId]);

  // hover จากรายการหรือบนแผนที่ → ไฮไลต์บนแผนที่ / ที่เลือกอยู่ → เส้นหนาขึ้น
  useEffect(() => {
    if (!ctx || !hoveredItem) return;
    setItemState(ctx.map, hoveredItem, { hover: true });
    return () => setItemState(ctx.map, hoveredItem, { hover: false });
  }, [ctx, hoveredItem]);
  useEffect(() => {
    if (!ctx || !selectedItem) return;
    setItemState(ctx.map, selectedItem, { selected: true });
    return () => setItemState(ctx.map, selectedItem, { selected: false });
  }, [ctx, selectedItem]);

  // วาด / แก้จุด / Move ต้องทำบนแผนที่แบนเสมอ (draw คำนวณตำแหน่งคลาดเมื่อแผนที่เอียง)
  // → ระหว่างนั้นกลับเป็น 2D ชั่วคราว ทำเสร็จแล้วเอียงกลับให้เอง
  // โหมดดูรายละเอียด (view) ก็แบนด้วย เพื่อให้ทุกครั้งที่เลือก feature ได้มุมมองเดียวกัน
  const mustBeFlat = !!activeTool || !!mobileDraw || moveMode || !!selection;
  /** ตอนนี้ควรเอียงอยู่ไหม (is3D และไม่ได้อยู่ในโหมดที่ต้องแบน) — ให้ตัวกันพลาด moveend ด้านล่างอ่านค่าล่าสุด */
  const tiltRef = useRef(false);
  // ตัวกันพลาด: การแบนด้วย easeTo อาจถูกตัดกลางทาง (ผู้ใช้ลาก/ซูม, flyTo ของค้นหา, ปุ่มตำแหน่งปัจจุบัน, กด cluster)
  // แล้วแผนที่ค้างเอียง — moveend ยิงทั้งตอนจบเองและตอนถูกขัด → ถ้าควรแบนแต่ยังเอียง/หมุนอยู่ ให้แบนให้อีกรอบ
  // (แบนแล้วก็หยุดเอง ไม่วนซ้ำ)
  useEffect(() => {
    if (!ctx) return;
    const { map } = ctx;
    let raf = 0;
    const onMoveEnd = () => {
      // เลื่อนไปเฟรมถัดไป: moveend ยิงตอน map.stop() ของอนิเมชันใหม่/การลากของผู้ใช้ด้วย — ถ้า easeTo ทันทีจะแย่งกัน
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (tiltRef.current || map.isMoving()) return; // กำลังเลื่อนใหม่อยู่ → moveend ของมันจะเช็กอีกรอบเอง
        if (map.getPitch() > 0.1 || Math.abs(map.getBearing()) > 0.1) {
          map.easeTo({ pitch: 0, bearing: 0, duration: 300 });
        }
      });
    };
    map.on("moveend", onMoveEnd);
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend", onMoveEnd);
    };
  }, [ctx]);
  useEffect(() => {
    if (!ctx) return;
    const { map } = ctx;
    const tilt = is3D && !mustBeFlat;
    tiltRef.current = tilt;
    if (tilt) {
      map.dragRotate.enable();
      map.touchPitch.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
    } else {
      map.dragRotate.disable();
      map.touchPitch.disable();
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    }
    // ภูเขาเปิดพร้อมการเอียง — ตอนวาด/แก้ต้องปิดด้วย เพราะ draw วางจุดบนพื้นราบ จะคลาดจากพื้นที่ยกเป็นภูเขา
    setTerrainEnabled(map, tilt);
    // เพิ่งกดเปิด 3D ตอนซูมไกลมาก (ทั้งประเทศ) → ซูมเข้าระดับภูมิภาค ให้เห็นภูเขาชัด (ตึกต้องซูมต่อถึง 14)
    const zoom = tilt && zoomInFor3D.current && map.getZoom() < 7 ? 9 : undefined;
    zoomInFor3D.current = false;
    const pitch = tilt ? 60 : 0;
    if (skipFlatEase.current) {
      skipFlatEase.current = false;
      return;
    }
    if (map.getPitch() !== pitch || zoom !== undefined || (!tilt && map.getBearing() !== 0)) {
      map.easeTo({ pitch, zoom, ...(tilt ? {} : { bearing: 0 }), duration: 500 });
    }
  }, [ctx, is3D, mustBeFlat]);

  const onToggle3D = () => {
    zoomInFor3D.current = !is3D;
    setIs3D(!is3D);
  };

  /**
   * ขอให้กล้องไปอยู่กลางพื้นที่ที่มองเห็นของ feature (ซูมออกถ้าใหญ่เกิน) — ทำ "หลัง" commit ถัดไป
   * เพราะการ์ดรายการ/รายละเอียด (จอคอม) หรือ sheet (มือถือ) เพิ่งสั่งเปิด ยังไม่อยู่ใน DOM ตอนนี้ วัดระยะเว้นขอบตอนนี้จะผิด
   * ถ้าเปิด 3D อยู่ (และยังไม่แบน) จะแบนเป็น 2D ในคำสั่งกล้องเดียวกัน
   * ไม่ปล่อยให้ effect mustBeFlat easeTo แยก เพราะมันจะตัดการบิน/เลื่อนที่ค้างอยู่
   */
  const requestFit = (
    geometry: GeoJSON.Geometry,
    opts: { fly?: boolean; maxZoom?: number } = {},
  ) => {
    const flat = is3D && !mustBeFlat;
    if (flat) skipFlatEase.current = true;
    pendingFit.current = { geometry, fly: !!opts.fly, maxZoom: opts.maxZoom, flat };
    bumpFit(); // ถ้า state อื่นไม่เปลี่ยน (เช่น เปิดการ์ดอยู่แล้ว) ก็ยังต้อง render เพื่อให้ effect ด้านล่างทำงาน
  };

  // ย่อจอเป็นมือถือระหว่างวาดด้วย draw → ปิดโหมดวาดของ draw (มือถือวาดด้วยกากบาทแทน)
  useEffect(() => {
    if (isMobile && ctx?.draw.getMode().startsWith("draw_")) setDrawMode(ctx.draw, "simple_select");
  }, [isMobile, ctx]);

  const closePopup = () => {
    popup.current?.remove();
    popup.current = null;
  };
  const showPopup = (lngLat: [number, number], name: string) => {
    const map = mapRef.current;
    if (!map) return;
    closePopup();
    popup.current = new Popup({ offset: 12, maxWidth: "16rem" }).setLngLat(lngLat).setText(name).addTo(map);
  };

  // ---------- mapbox-gl-draw ----------
  /** เลือกรูปใน draw ให้ลากแก้ได้: Point = ลากทั้งจุด, Line/Polygon = ลากทีละจุดยอด */
  const selectInDraw = (drawId: string, type: GeomType) => {
    if (!ctx || !ctx.draw.get(drawId)) return;
    if (type === "Point") setDrawMode(ctx.draw, "simple_select", { featureIds: [drawId] });
    else setDrawMode(ctx.draw, "direct_select", { featureId: drawId });
  };

  /** ใส่รูปทรงลง draw (ล้างของเดิมก่อน) */
  const loadIntoDraw = (drawId: string, geometry: GeoJSON.Geometry) => {
    if (!ctx) return;
    ctx.draw.deleteAll();
    ctx.draw.add({ type: "Feature", id: drawId, geometry, properties: {} });
  };

  const clearDraw = () => {
    if (!ctx) return;
    ctx.draw.deleteAll();
    if (ctx.draw.getMode() !== "simple_select") setDrawMode(ctx.draw, "simple_select");
  };

  /** id ใน draw ของสิ่งที่วาด/แก้อยู่ */
  const activeDrawId =
    selection?.mode === "create" ? selection.drawId : selection?.mode === "edit" ? editDrawId(selection.id) : null;
  const activeType = selection?.mode === "create" ? selection.type : (selectedItem?.type ?? null);

  /** ทิ้งสิ่งที่ค้างอยู่ใน draw (draft ที่ยังไม่บันทึก / การแก้ที่ยังไม่กด Save) — รูปที่บันทึกแล้วอยู่ใน items ไม่ถูกแตะ */
  const discardPending = () => {
    if (selection?.mode === "create" || selection?.mode === "edit") clearDraw();
    setDraftGeom(null);
  };

  const closeSelection = () => {
    discardPending();
    setSelection(null);
  };

  /** ออกจากโหมด Move (คืน feature ที่ดึงเข้า draw ไว้กลับไปแสดงตามปกติ) */
  const exitMove = () => {
    if (!moveMode) return;
    if (movingId !== null) clearDraw();
    setMovingId(null);
    setMoveMode(false);
  };

  /** เขียนข้อมูลทดลองลง localStorage แล้วอัปเดตเวลาที่จะถูกลบ (เริ่มนับเมื่อมี feature ชิ้นแรก) */
  const persistGuest = (write: () => void) => {
    write();
    setGuestExpiry(guestExpiresAt());
    setNow(Date.now());
  };

  // effect ด้านล่างต้องเรียก closeSelection ล่าสุด (ทิ้ง draft ที่วาดค้างไว้)
  const closeSelectionRef = useRef(closeSelection);
  useEffect(() => {
    closeSelectionRef.current = closeSelection;
  });

  // โหมดทดลอง: นับถอยหลังบนแบนเนอร์ และลบข้อมูลเมื่อครบเวลา (ระหว่างเปิดหน้าเว็บค้างไว้)
  useEffect(() => {
    if (!guest || guestExpiry === null) return;
    const tick = setInterval(() => setNow(Date.now()), 30 * 1000);
    const timer = setTimeout(() => {
      closeSelectionRef.current();
      clearGuest();
      setGuestExpiry(null);
      setGuestEpoch((e) => e + 1);
      notifyInfo("ลบข้อมูลทดลองแล้ว (เก็บไว้ครบ 1 ชั่วโมง)");
    }, Math.max(0, guestExpiry - Date.now()));
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [guest, guestExpiry]);

  const view = (id: number) => {
    if (selection?.mode === "view" && selection.id === id) return;
    discardPending();
    setSelection({ mode: "view", id });
    setPanelOpen(true);
  };

  const showItem = (item: Item) =>
    setHiddenIds((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });

  const startEdit = (item: Item) => {
    if (!canModify(item) || (selection?.mode === "edit" && selection.id === item.id)) return;
    discardPending();
    exitMove(); // Move กับแก้ทีละจุดเปิดพร้อมกันไม่ได้
    closePopup();
    // แก้ไขต้องเห็นรูปทรงบนแผนที่
    if (hiddenIds.has(item.id)) showItem(item);
    if (item.ownerId !== null && hiddenOwners.has(item.ownerId)) toggleOwner(item.ownerId);
    setPanelOpen(true);
    loadIntoDraw(editDrawId(item.id), item.geometry);
    selectInDraw(editDrawId(item.id), item.type);
    setDraftGeom(item.geometry);
    setSelection({ mode: "edit", id: item.id });
  };

  const toggleVisible = (item: Item) => {
    if (hiddenIds.has(item.id)) return showItem(item);
    if (selection?.mode === "edit" && selection.id === item.id) closeSelection();
    closePopup();
    setHiddenIds((s) => new Set(s).add(item.id));
  };

  /** ซ่อน/แสดง feature ทั้งหมดของสมาชิกคนหนึ่ง (เฉพาะบนจอเรา) */
  const toggleOwner = (ownerId: string) => {
    const hiding = !hiddenOwners.has(ownerId);
    if (hiding && selection?.mode === "edit" && selectedItem?.ownerId === ownerId) closeSelection();
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
    closeSelection(); // draft ที่ยังไม่กด Save จะหายเมื่อ login (ที่บันทึกแล้วยังอยู่ใน localStorage)
    setAuthOpen(true);
  };

  const logout = () => {
    closeSelection();
    void supabase?.auth.signOut();
  };

  // ---------- เครื่องมือวาด / Move ----------
  /** จอคอม: เลือกเครื่องมือวาด = เปิดโหมดวาดของ draw (เลือกชนิดเดิมซ้ำ = ยกเลิก) */
  const onDrawSelect = (shape: DrawShape) => {
    if (!ctx) return;
    if (activeTool === shape) {
      setDrawMode(ctx.draw, "simple_select");
      setActiveTool(null);
      return;
    }
    closeSelection(); // เริ่มวาดใหม่ = ทิ้งสิ่งที่ค้างอยู่
    exitMove();
    closePopup();
    ctx.draw.deleteAll();
    setDrawMode(ctx.draw, DRAW_MODE[shape]);
    setActiveTool(shape);
  };

  /** มือถือ: เลือกเครื่องมือวาด = เริ่มโหมดกากบาท (เลือกชนิดเดิมซ้ำ = ยกเลิก) */
  const onMobileDrawSelect = (shape: DrawShape) => {
    if (mobileDraw?.shape === shape) return crosshair.cancel();
    closeSelection();
    exitMove();
    closePopup();
    crosshair.start(shape);
  };

  // Move = ย้ายทั้งก้อน: คลิก feature ที่แก้ได้ → ดึงเข้า draw แล้วลากได้ทันที ปล่อยเมาส์ = บันทึก
  const onToggleMove = () => {
    if (moveMode) return exitMove();
    crosshair.cancel();
    closeSelection();
    closePopup();
    if (ctx && activeTool) setDrawMode(ctx.draw, "simple_select");
    setActiveTool(null);
    setMoveMode(true);
  };

  /** ย้ายเสร็จ (เฉพาะโหมด Move) → บันทึกตำแหน่งทันที ส่ง PATCH เฉพาะ geometry ไม่แตะ properties */
  const saveMove = (id: number, geometry: GeoJSON.Geometry) => {
    const item = items.find((i) => i.id === id);
    if (!item || sameGeometry(geometry, item.geometry)) return; // กดลากแต่ไม่ได้ขยับจริง
    const apply = (g: GeoJSON.Geometry) => setItems((list) => list.map((i) => (i.id === id ? { ...i, geometry: g } : i)));
    if (guest) {
      apply(geometry); // โหมดทดลอง: บันทึกลง localStorage อย่างเดียว
      persistGuest(() => upsertGuest(localFeature(id, item.type, geometry, item.props)));
      return;
    }
    // optimistic: ปล่อยเมาส์แล้วรูปอยู่ที่ใหม่ทันที ไม่รอ API (บันทึกเงียบ ไม่ขึ้น toast)
    apply(geometry);
    patchFeature(id, { geometry })
      .catch((err) => {
        // API ไม่รับ = คืนตำแหน่งเดิมทั้งใน items และใน draw
        apply(item.geometry);
        if (ctx?.draw.get(moveDrawId(id))) {
          loadIntoDraw(moveDrawId(id), item.geometry);
          setDrawMode(ctx.draw, "simple_select", { featureIds: [moveDrawId(id)] });
        }
        onError(err);
      });
  };

  // ---------- event ของแผนที่ ----------
  useMapEvents(ctx, {
    // คลิก feature บนแผนที่ = แก้ไขทันทีถ้ามีสิทธิ์ ไม่งั้นดูข้อมูล
    onFeatureClick: (id, lngLat) => {
      const item = items.find((i) => i.id === id);
      if (!item || !ctx) return;
      if (moveMode) {
        if (!canModify(item)) return onError(new Error("ย้ายได้เฉพาะ feature ของตัวเอง (หรือเจ้าของ group)"));
        loadIntoDraw(moveDrawId(id), item.geometry);
        setDrawMode(ctx.draw, "simple_select", { featureIds: [moveDrawId(id)] });
        setMovingId(id);
        return;
      }
      // ระหว่างแก้ชิ้นอื่นอยู่ คลิกชิ้นนี้ = ทิ้งชิ้นเดิมแล้วสลับมาชิ้นนี้ (เหมือนคลิกจากรายการ) / ระหว่างสร้างใหม่ไม่ทำอะไร กัน draft หาย
      if (mobileDraw || selection?.mode === "create") return;
      const editable = canModify(item);
      if (editable) startEdit(item);
      else {
        showPopup(lngLat, item.props.name);
        view(id);
      }
      // เลื่อนให้อยู่กลางพื้นที่ที่มองเห็น (ไม่ถูกการ์ด/sheet บัง) ซูมออกถ้ารูปใหญ่เกิน
      requestFit(item.geometry);
    },
    // คลิกพื้นที่ว่าง: ดูอยู่ / แก้อยู่ → ทิ้งการแก้ที่ยังไม่บันทึก แล้วปิดรายละเอียดกับการ์ดรายการ
    // (โหมด create ไม่ทำอะไร กัน draft หายเพราะเผลอคลิก)
    onMapClick: () => {
      closePopup();
      if (selection?.mode !== "view" && selection?.mode !== "edit") return;
      closeSelection();
      setPanelOpen(false);
    },
    onHover: hoverEnabled ? onHover : () => {},
    onDrawCreate: (f) => {
      if (!ctx) return;
      if (isBadPolygon(f.geometry)) {
        ctx.draw.delete(f.id);
        return onError(new Error("ขอบพื้นที่ตัดกันเอง — บันทึกไม่ได้ วาดใหม่ให้ขอบไม่ไขว้กัน"));
      }
      const type = f.geometry.type as GeomType;
      setActiveTool(null);
      setSelection({ mode: "create", drawId: f.id, type });
      setDraftGeom(f.geometry);
      setPanelOpen(true);
      // draw สลับโหมดเองหลังยิง draw.create → รอให้เสร็จก่อนค่อยเลือกให้ลากแก้ได้
      setTimeout(() => selectInDraw(f.id, type), 0);
    },
    onDrawUpdate: (f, action) => {
      if (!ctx) return;
      if (movingId !== null && f.id === moveDrawId(movingId)) {
        if (action === "move") saveMove(movingId, f.geometry);
        return;
      }
      if (f.id !== activeDrawId) return;
      // ลากจุดจนขอบตัดกันเอง → คืนรูปก่อนหน้า (PostGIS ไม่รับ polygon แบบนี้)
      if (isBadPolygon(f.geometry) && draftGeom) {
        loadIntoDraw(f.id, draftGeom);
        selectInDraw(f.id, "Polygon");
        return onError(new Error(SELF_INTERSECT));
      }
      setDraftGeom(f.geometry);
    },
    onDrawSelectionChange: (selected) => {
      if (selected.length || !ctx) return;
      // โหมด Move: คลิกที่อื่น = ปล่อย feature กลับไปแสดงตามปกติ
      if (movingId !== null) {
        ctx.draw.deleteAll();
        setMovingId(null);
        return;
      }
      // ระหว่างวาด/แก้: คลิกพื้นที่ว่างทำให้ draw เลิกเลือก → เลือกกลับให้ยังลากแก้ได้
      if (activeDrawId && activeType) setTimeout(() => selectInDraw(activeDrawId, activeType), 0);
    },
    onDrawModeChange: (mode) => {
      if (!mode.startsWith("draw_")) setActiveTool(null);
    },
  });

  /** ปุ่ม Next: สร้างรูปจากจุดที่วางไว้ แล้วเข้าขั้นตอนกรอกข้อมูลเดียวกับที่วาดด้วย draw */
  const finishMobileDraw = () => {
    const map = mapRef.current;
    if (!map || !ctx || !mobileDraw || mobileDraw.points.length < MIN_POINTS[mobileDraw.shape]) return;
    const { shape, points } = mobileDraw;
    const type = SHAPE_TO_GEOM_TYPE[shape];
    const geometry: GeoJSON.Geometry =
      shape === "Marker"
        ? { type: "Point", coordinates: points[0] }
        : shape === "Line"
          ? { type: "LineString", coordinates: points }
          : { type: "Polygon", coordinates: [[...points, points[0]]] };
    const drawId = `draft-${crypto.randomUUID()}`;
    crosshair.cancel();
    loadIntoDraw(drawId, geometry);
    selectInDraw(drawId, type);
    setSelection({ mode: "create", drawId, type });
    setDraftGeom(geometry);
    setPanelOpen(true);
    // แผ่นฟอร์มกินล่าง 60% ของจอ → เลื่อนรูปที่วาดขึ้นมาอยู่ในส่วนที่ยังมองเห็น
    const camera = map.cameraForBounds(bboxOf(geometry), {
      padding: { top: 40, left: 40, right: 40, bottom: map.getContainer().clientHeight * SHEET_HALF_RATIO + 16 },
      maxZoom: shape === "Marker" ? map.getZoom() : 18,
    });
    if (camera) map.easeTo(camera);
  };

  /** ระยะเว้นขอบส่วนที่ถูกบัง (พาเนลขวาบนจอคอม / แผ่นล่าง 60% บนมือถือ) ให้สิ่งที่ซูมไปอยู่กลางส่วนที่มองเห็น */
  const visiblePadding = (): PaddingOptions => {
    const pad = { top: 40, left: 40, right: 40, bottom: 40 };
    if (isMobile) {
      if (!panelOpen) return pad;
      return { ...pad, bottom: (mapRef.current?.getContainer().clientHeight ?? 0) * SHEET_HALF_RATIO + 16 };
    }
    // จอคอม: การ์ดรายการลอยซ้าย (ขยายอยู่) + การ์ดรายละเอียดลอยขวา (เมื่อมีฟอร์ม)
    const listW = panelOpen ? (document.querySelector<HTMLElement>("[data-feature-panel]")?.offsetWidth ?? 0) : 0;
    const detailW = document.querySelector<HTMLElement>("[data-detail-panel]")?.offsetWidth ?? 0;
    return { ...pad, left: listW ? listW + 40 : 40, right: detailW ? detailW + 40 : 40 };
  };

  // เลื่อนกล้องตามที่ขอไว้ (requestFit) — รันหลัง effect mustBeFlat (ประกาศไว้ก่อนหน้า) และหลังการ์ด/sheet อยู่ใน DOM แล้ว
  useEffect(() => {
    const fit = pendingFit.current;
    const map = mapRef.current;
    if (!fit || !map) return;
    pendingFit.current = null;
    skipFlatEase.current = false; // ถ้า effect mustBeFlat ไม่ได้รันรอบนี้ ไม่ให้ค่าค้างไปข้าม easeTo ครั้งหน้า
    const camera = map.cameraForBounds(bboxOf(fit.geometry), {
      padding: visiblePadding(),
      maxZoom: fit.maxZoom ?? map.getZoom(), // ไม่ระบุ = ซูมออกได้อย่างเดียว ไม่ซูมเข้าเพิ่ม
    });
    // ควรแบนเมื่อสั่งไว้ตอนขอ หรือตอนนี้ไม่ควรเอียงแล้ว (เช่น กดชิ้นที่สองระหว่างบินชิ้นแรก — fit.flat เป็น false แต่กล้องยังเอียงครึ่งทาง)
    const flat = fit.flat || !tiltRef.current;
    if (!camera) {
      // วัดไม่ได้ (เว้นขอบเกินขนาดจอ) แต่ effect mustBeFlat ข้ามการแบนไว้ให้ที่นี่แล้ว → ต้องแบนเองไม่งั้นค้างเอียง
      if (flat) map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
      return;
    }
    const opts = flat ? { ...camera, pitch: 0, bearing: 0 } : camera;
    if (fit.fly) map.flyTo(opts);
    else map.easeTo(opts);
  });

  const focus = (item: Item) => {
    // มีสิทธิ์แก้ (และไม่ได้ซ่อนอยู่) = คลิกแล้วเข้าโหมดแก้ไขเลย
    const editable = canModify(item) && !isHidden(item);
    if (!isHidden(item)) {
      // หมุดอาจอยู่ใน cluster → ซูมไป 17 (cluster แตกหมด)
      requestFit(item.geometry, { fly: true, maxZoom: item.type === "Point" ? 17 : 16 });
      if (!editable) showPopup(centerOf(item.geometry), item.props.name);
    }
    if (editable) return startEdit(item);
    view(item.id);
  };

  // บันทึกจากฟอร์ม — throw เมื่อ API ไม่รับ เพื่อให้ฟอร์มแสดง error และคงข้อมูลที่กรอกไว้
  const save = async (props: FeatureProps) => {
    const geometry = (activeDrawId && ctx?.draw.get(activeDrawId)?.geometry) || draftGeom;
    if (!geometry) return;
    if (isBadPolygon(geometry)) throw new Error(SELF_INTERSECT);

    if (selection?.mode === "create") {
      const f = guest
        ? localFeature(nextGuestId(), selection.type, geometry, props)
        : await createFeature(geometry, props);
      if (guest) persistGuest(() => upsertGuest(f));
      clearDraw();
      setDraftGeom(null);
      // Realtime อาจส่ง INSERT ของเรามาก่อนแล้ว → แทนที่ ไม่เพิ่มซ้ำ
      setItems((list) => [...list.filter((i) => i.id !== f.id), toItem(f)]);
      // บันทึกแล้ว → ปิดรายละเอียดกับแถบรายการ เหลือแต่แผนที่ + toast
      setSelection(null);
      setPanelOpen(false);
      notifySaved({ name: f.properties.name, type: selection.type, category: f.properties.category, temp: guest });
    } else if (selection?.mode === "edit" && selectedItem) {
      const { id, type } = selectedItem;
      let f: ApiFeature;
      if (guest) {
        f = localFeature(id, type, geometry, props); // โหมดทดลอง: ไม่ผ่าน API
        persistGuest(() => upsertGuest(f));
      } else {
        // ส่งเฉพาะสิ่งที่เปลี่ยนจริง (PATCH)
        const patch: FeaturePatch = {};
        if (!sameGeometry(geometry, selectedItem.geometry)) patch.geometry = geometry;
        const changed: NonNullable<FeaturePatch["properties"]> = {};
        if (props.name !== selectedItem.props.name) changed.name = props.name;
        if (props.category !== selectedItem.props.category) changed.category = props.category ?? null;
        if (props.description !== selectedItem.props.description) changed.description = props.description ?? null;
        if (Object.keys(changed).length) patch.properties = changed;

        if (!patch.geometry && !patch.properties) {
          clearDraw(); // ไม่มีอะไรเปลี่ยน ไม่ต้องยิง API
          setDraftGeom(null);
          setSelection(null);
          setPanelOpen(false);
          return;
        }
        f = await patchFeature(id, patch);
      }
      const saved = propsOf(f);
      clearDraw();
      setDraftGeom(null);
      setItems((list) => list.map((i) => (i.id === id ? { ...i, props: saved, geometry: f.geometry } : i)));
      setSelection(null);
      setPanelOpen(false);
      notifySaved({ name: saved.name, type, category: saved.category, temp: guest });
    }
  };

  const removeItem = async (item: Item) => {
    if (guest) persistGuest(() => removeGuest(item.id));
    else await deleteFeature(item.id);
    if (editingId === item.id) clearDraw();
    closePopup();
    setItems((list) => list.filter((i) => i.id !== item.id));
    setHiddenIds((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    });
    if (selectedId === item.id) {
      setDraftGeom(null);
      setSelection(null);
    }
  };

  const editor =
    selection?.mode === "create" && draftGeom ? (
      <FeatureEditor
        key={`new-${selection.drawId}`}
        mode="create"
        type={selection.type}
        geometry={draftGeom}
        initial={{ name: "" }}
        variant={isMobile ? "mobile" : "desktop"}
        formId="fe-form"
        onSave={save}
        onCancel={closeSelection}
        onDelete={async () => closeSelection()}
      />
    ) : selection && selection.mode !== "create" && selectedItem ? (
      <FeatureEditor
        key={`${selectedItem.id}-${selection.mode}`}
        mode={selection.mode}
        type={selectedItem.type}
        geometry={(selection.mode === "edit" && draftGeom) || selectedItem.geometry}
        initial={selectedItem.props}
        variant={isMobile ? "mobile" : "desktop"}
        formId="fe-form"
        onEdit={() => startEdit(selectedItem)}
        onSave={save}
        onCancel={closeSelection}
        onDelete={() => removeItem(selectedItem)}
        ownerName={guest ? null : selectedItem.ownerName}
        canModify={canModify(selectedItem)}
      />
    ) : null;

  const creating = selection?.mode === "create";
  const selectionKey = selection ? (selection.mode === "create" ? "create" : `${selection.mode}-${selection.id}`) : null;
  // now อัปเดตทุก 30 วินาที อาจช้ากว่าเวลาจริงเล็กน้อย → จำกัดไม่ให้เกิน 1 ชั่วโมง
  const guestMinutesLeft =
    guestExpiry === null
      ? null
      : Math.min(GUEST_TTL_MS / 60000, Math.max(1, Math.ceil((guestExpiry - now) / 60000)));
  const panelVars = { "--panel-w": "clamp(20rem, 28vw, 26rem)" } as CSSProperties;

  const renderAccount = (className: string) => (
    <AccountMenu
      className={className}
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
  );

  return (
    <div className="relative h-full" style={panelVars}>
      <div
        className="map-area absolute inset-0 overflow-hidden"
        style={
          {
            "--map-bottom-inset": `calc(${mobileDraw ? "8rem" : "5.5rem"} + env(safe-area-inset-bottom, 0px))`,
          } as CSSProperties
        }
      >
        <MapView className="absolute inset-0 w-full h-full z-0" onReady={onMapReady} />
        <CrosshairDraw map={ctx?.map ?? null} draw={mobileDraw} />

        {mobileDraw && <Crosshair />}

        {error && (
          <Alert
            variant="destructive"
            className="absolute top-[calc(4.75rem+env(safe-area-inset-top,0px))] left-1/2 z-40 w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 bg-card shadow-float md:top-4"
          >
            <AlertCircleIcon />
            <AlertDescription className="flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <Button variant="ghost" size="icon" className="size-8" aria-label="ปิด" onClick={() => setError(null)}>
                <XIcon />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* มือถือ: แถบค้นหา + บัญชีลอยบน (ค้นหา mount ค้างไว้ เพื่อให้หมุดผลค้นหาไม่หาย) / ตอนวาด-กรอกฟอร์ม = แถบ MobileHeader */}
        {isMobile &&
          (mobileDraw || creating ? (
            <MobileHeader
              mode={mobileDraw ? "drawing" : "form"}
              formId="fe-form"
              onCancel={mobileDraw ? crosshair.cancel : closeSelection}
              onUndo={crosshair.undo}
              onRedo={crosshair.redo}
              onClear={crosshair.clear}
              onNext={finishMobileDraw}
              canUndo={!!mobileDraw && mobileDraw.points.length > 0}
              canRedo={!!mobileDraw && mobileDraw.redo.length > 0}
              canNext={!!mobileDraw && mobileDraw.points.length >= MIN_POINTS[mobileDraw.shape]}
            />
          ) : (
            <div className="absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-30 flex items-start justify-end gap-2">
              <SearchToggle mapRef={mapRef} getPadding={visiblePadding} fill />
              {guest && <GuestIndicator expiry={guestExpiry} minutesLeft={guestMinutesLeft} ttlMinutes={GUEST_TTL_MS / 60000} onLogin={openLogin} />}
              {renderAccount("shrink-0")}
            </div>
          ))}

        <MapControls
          map={ctx?.map ?? null}
          is3D={is3D}
          paused={is3D && mustBeFlat}
          onToggle3D={onToggle3D}
          compact={isMobile}
          className={
            isMobile
              ? `absolute right-3 z-20 ${
                  mobileDraw
                    ? "bottom-[calc(12rem+env(safe-area-inset-bottom,0px))]" // เหนือปุ่มตำแหน่งปัจจุบันของ DrawSheet
                    : panelOpen
                      ? "bottom-[calc(60%+5rem)]"
                      : "bottom-[calc(5.5rem+6.75rem+env(safe-area-inset-bottom,0px))]"
                }`
              : "absolute right-4 bottom-6 z-20"
          }
        />
        {isMobile ? (
          !mobileDraw &&
          !creating && (
            <DrawFab
              moveActive={moveMode}
              onDrawSelect={onMobileDrawSelect}
              onToggleMove={onToggleMove}
              className={`absolute right-3 z-20 ${panelOpen ? "bottom-[calc(60%+0.75rem)]" : "bottom-[calc(5.5rem+2.25rem+env(safe-area-inset-bottom,0px))]"}`}
            />
          )
        ) : (
          <Toolbar
            activeTool={activeTool}
            moveActive={moveMode}
            onDrawSelect={onDrawSelect}
            onToggleMove={onToggleMove}
            shortcutsEnabled={!selection || selection.mode === "view"}
          />
        )}

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
                  hiddenIds={hiddenSet}
                  canModify={canModify}
                  showOwner={!guest}
                  onFocus={focus}
                  onToggleVisible={toggleVisible}
                  onRemove={(item) => removeItem(item).catch(onError)}
                />
              }
            />
          )
        ) : (
          <>
            <FeaturePanel
              open={panelOpen}
              onToggle={() => setPanelOpen((o) => !o)}
              items={shown}
              filter={filter}
              onFilterChange={setFilter}
              onFocus={focus}
              onToggleVisible={toggleVisible}
              onRemove={(item) => removeItem(item).catch(onError)}
              selectedId={selectedId}
              hiddenIds={hiddenSet}
              canModify={canModify}
              showOwner={!guest}
              hoveredId={activeHoverId}
              onHover={onHover}
            />

            <div className="absolute top-4 right-4 z-30 flex items-start gap-2">
              <SearchToggle mapRef={mapRef} getPadding={visiblePadding} />
              {guest && <GuestIndicator expiry={guestExpiry} minutesLeft={guestMinutesLeft} ttlMinutes={GUEST_TTL_MS / 60000} onLogin={openLogin} />}
              {renderAccount("")}
            </div>

            {editor && <DetailCard>{editor}</DetailCard>}
          </>
        )}

        <Toaster />
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
