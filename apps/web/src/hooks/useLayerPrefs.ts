import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layerPrefsApi } from "../api";
import { orderLayers, prefsFor, type Layer, type LayerPref } from "../lib/layers";
import { GUEST_KEY, loadGuestLayerPrefs, saveGuestLayerPrefs } from "../lib/guestStore";

/** รอให้หยุดลาก/กดต่อเนื่องแล้วค่อยบันทึก (ลาก 1 ครั้งหรือกด ↑↓ รัวๆ = 1 request) */
const SAVE_DELAY_MS = 600;

/**
 * ลำดับ (z-order) + การซ่อน layer ของบัญชีนี้ — ส่วนตัว ไม่ฟัง Realtime / ไม่ poll (การจัดของคนอื่นต้องไม่กระทบจอเรา)
 * login = เก็บใน database ผ่าน API, โหมดทดลอง = localStorage (ซิงก์ระหว่างแถบด้วย event `storage`)
 * อัปเดตจอทันที (optimistic) → รวมเป็น request เดียวหลังหยุดจัด → ล้มเหลวย้อนกลับเป็นค่าที่บันทึกสำเร็จล่าสุด
 */
export function useLayerPrefs(
  viewKey: string,
  guest: boolean,
  layers: Layer[],
  onError: (err: unknown) => void,
) {
  const [prefs, setPrefs] = useState<LayerPref[]>(() => (guest ? loadGuestLayerPrefs() : []));
  // เปลี่ยนบัญชี/โหมด → ล้างค่าชุดเก่า (ปรับ state ระหว่าง render เหมือน viewKey ใน App)
  const [shownKey, setShownKey] = useState(viewKey);
  if (shownKey !== viewKey) {
    setShownKey(viewKey);
    setPrefs(guest ? loadGuestLayerPrefs() : []);
  }

  // โหลดครั้งแรกของ viewKey นี้เสร็จแล้ว (สำเร็จหรือพัง) — App รวมเข้า loadState ให้ทุกส่วนโผล่พร้อมกัน
  const [readyKey, setReadyKey] = useState<string | null>(null);

  const saved = useRef<LayerPref[]>([]); // ชุดที่บันทึกสำเร็จล่าสุด (ไว้ย้อนกลับ)
  const pending = useRef<LayerPref[] | null>(null); // ชุดที่รอบันทึก
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ prefs, layers, guest, onError });
  useEffect(() => {
    latest.current = { prefs, layers, guest, onError };
  });

  const flush = useCallback(async (keepalive = false) => {
    clearTimeout(timer.current);
    const items = pending.current;
    if (!items) return;
    pending.current = null;
    try {
      await layerPrefsApi.save(items, keepalive);
      saved.current = items;
    } catch (err) {
      if (pending.current) return; // มีการจัดใหม่ตามมาแล้ว — รอบนั้นจะบันทึกชุดล่าสุดเอง
      setPrefs(saved.current);
      latest.current.onError(new Error(`บันทึกลำดับ/การซ่อน layer ไม่สำเร็จ — กลับเป็นค่าเดิม (${err instanceof Error ? err.message : err})`));
    }
  }, []);

  // login: โหลดครั้งเดียวต่อบัญชี/group
  useEffect(() => {
    if (guest) return;
    let alive = true;
    saved.current = [];
    pending.current = null;
    layerPrefsApi
      .list()
      .then((list) => {
        if (!alive) return;
        const items = list.map(({ layerId, visible }) => ({ layerId, visible }));
        saved.current = items;
        if (!pending.current) setPrefs(items);
        setReadyKey(viewKey);
      })
      .catch((e) => {
        if (!alive) return;
        latest.current.onError(e);
        setReadyKey(viewKey); // พัง = ใช้ลำดับเริ่มต้น (ไม่ให้ค้างทั้งหน้า)
      });
    return () => {
      alive = false;
      void flush(true); // ออก/สลับบัญชีขณะยังมีที่ค้างบันทึก
    };
  }, [viewKey, guest, flush]);

  // ปิดหน้า/ซ่อนแท็บ → บันทึกที่ค้างอยู่ทันที
  useEffect(() => {
    if (guest) return;
    const onHide = () => void flush(true);
    const onVis = () => document.visibilityState === "hidden" && onHide();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [guest, flush]);

  // โหมดทดลอง: อีกแถบจัดลำดับ → ตามมา
  useEffect(() => {
    if (!guest) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_KEY || e.key === null) setPrefs(loadGuestLayerPrefs());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [guest]);

  const commit = useCallback(
    (next: LayerPref[]) => {
      setPrefs(next);
      if (latest.current.guest) {
        saveGuestLayerPrefs(next);
        return;
      }
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const ordered = useMemo(() => orderLayers(layers, prefs), [layers, prefs]);
  const hidden = useMemo(() => new Set(prefs.filter((p) => !p.visible).map((p) => p.layerId)), [prefs]);

  /** ย้าย layer ไปตำแหน่ง toIndex (0 = บนสุด) ของรายการที่เรียงแล้ว */
  const move = useCallback(
    (layerId: number, toIndex: number) => {
      const { layers: all, prefs: cur } = latest.current;
      const order = orderLayers(all, cur);
      const from = order.findIndex((l) => l.id === layerId);
      const to = Math.max(0, Math.min(order.length - 1, toIndex));
      if (from < 0 || from === to) return;
      const next = [...order];
      next.splice(to, 0, next.splice(from, 1)[0]);
      commit(prefsFor(next, cur));
    },
    [commit],
  );

  const setVisible = useCallback(
    (layerId: number, visible: boolean) => {
      const { layers: all, prefs: cur } = latest.current;
      commit(prefsFor(orderLayers(all, cur), cur).map((p) => (p.layerId === layerId ? { ...p, visible } : p)));
    },
    [commit],
  );

  return { ordered, hidden, move, setVisible, ready: guest || readyKey === viewKey };
}
