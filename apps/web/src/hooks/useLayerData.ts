import { useCallback, useEffect, useState } from "react";
import { layerApi } from "../api";
import type { Layer, RelatedRecord, RelatedTable } from "../lib/layers";
import type { LoadState } from "../lib/loadState";
import { subscribeTable } from "../lib/realtime";

type Setter<T> = (value: T) => void;

/** ดึง layer / ตารางย่อย / แถว ใหม่ทุกกี่ ms */
const POLL_MS = 5000;

/**
 * โหลด layer / ตารางย่อย / แถว ของ group จาก API + ฟัง Realtime (อีก browser แก้ → โหลดรายการนั้นใหม่)
 * เฉพาะตอน login — โหมดทดลอง App อ่านจาก localStorage เอง (ตอน viewKey เปลี่ยน)
 * App ต้องล้าง state เองตอน viewKey เปลี่ยน (เหมือน useFeatureData)
 */
export function useLayerData(
  viewKey: string,
  guest: boolean,
  setLayers: Setter<Layer[]>,
  setTables: Setter<RelatedTable[]>,
  setRecords: Setter<RelatedRecord[]>,
  onError: (err: unknown) => void,
) {
  // สถานะโหลดครั้งแรก (layer + แถวต้องมาครบ) เก็บคู่กับ viewKey — poll เบื้องหลังไม่เปลี่ยนสถานะ
  const [res, setRes] = useState<{ key: string; state: LoadState }>({ key: "", state: "loading" });
  const [nonce, setNonce] = useState(0);
  // viewKey เปลี่ยน (รวมไปโหมดทดลอง/pending) → กลับเป็น loading ทันที กัน res เก่าของ key เดิมค้างแล้วตอบ ready ทั้งที่ยังไม่ได้โหลด
  const [shownKey, setShownKey] = useState(viewKey);
  if (shownKey !== viewKey) {
    setShownKey(viewKey);
    setRes({ key: viewKey, state: "loading" });
  }
  const retry = useCallback(() => {
    setRes({ key: viewKey, state: "loading" });
    setNonce((n) => n + 1);
  }, [viewKey]);

  useEffect(() => {
    if (guest) return;
    let alive = true;
    let layersOk = false;
    let recordsOk = false;
    const initial = (ok: boolean) => {
      if (!alive) return;
      const next: LoadState | null = !ok ? "error" : layersOk && recordsOk ? "ready" : null;
      if (next) setRes((r) => (r.key === viewKey && r.state === next ? r : { key: viewKey, state: next }));
    };
    // ชุดล่าสุดที่โหลดได้ (JSON) — เหมือนเดิม = ไม่ set state ไม่ให้ render ใหม่ / ช่องที่กำลังแก้ในตารางไม่หลุดตอน poll
    let lastLayers = "";
    let lastRecords = "";
    // quiet = poll เบื้องหลัง: error ไม่ขึ้นแถบแดงทุกรอบ
    const loadLayers = (quiet = false) =>
      layerApi
        .list()
        .then((d) => {
          const json = JSON.stringify(d);
          layersOk = true;
          initial(true);
          if (!alive || json === lastLayers) return;
          lastLayers = json;
          setLayers(d.layers);
          setTables(d.tables);
        })
        .catch((e) => {
          if (!layersOk) initial(false); // ยังโหลดครั้งแรกไม่ได้ → pill แสดง error + ลองใหม่
          else if (!quiet) onError(e);
        });
    const loadRecords = (quiet = false) =>
      layerApi
        .listRecords()
        .then((r) => {
          const json = JSON.stringify(r);
          recordsOk = true;
          initial(true);
          if (!alive || json === lastRecords) return;
          lastRecords = json;
          setRecords(r);
        })
        .catch((e) => {
          if (!recordsOk) initial(false);
          else if (!quiet) onError(e);
        });

    void loadLayers();
    void loadRecords();
    // Realtime ของตารางพวกนี้ต้องเปิดใน Supabase (ไม่เปิดก็ไม่มี event) → poll ทุก 5 วินาทีเป็นหลัก ให้เครื่องอื่นแก้แล้วเห็นเอง
    const unsubscribe = [
      subscribeTable("layers", () => void loadLayers(), () => void loadLayers()),
      subscribeTable("related_tables", () => void loadLayers()),
      subscribeTable("related_records", () => void loadRecords(), () => void loadRecords()),
    ];
    let busy = false;
    const poll = async () => {
      if (busy || document.visibilityState !== "visible") return; // รอบก่อนยังไม่เสร็จ / แท็บถูกซ่อน → ข้าม
      busy = true;
      try {
        await Promise.all([loadLayers(true), loadRecords(true)]);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void poll(), POLL_MS);
    // กลับมาที่แท็บ/หน้าต่าง → โหลดทันที ไม่ต้องรอรอบ poll
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      for (const u of unsubscribe) u();
    };
  }, [viewKey, guest, setLayers, setTables, setRecords, onError, nonce]);

  const state: LoadState = guest ? "ready" : res.key === viewKey ? res.state : "loading";
  return { state, retry };
}
