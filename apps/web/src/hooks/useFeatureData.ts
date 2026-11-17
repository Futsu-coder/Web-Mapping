import { useCallback, useEffect, useState } from "react";
import { getFeature, isOwnEcho, listFeatures, type ApiFeature } from "../api";
import { propsOf, sameGeometry } from "../lib/featureMeta";
import { loadGuest } from "../lib/guestStore";
import { PENDING_VIEW, type LoadState } from "../lib/loadState";
import { subscribeFeatures } from "../lib/realtime";
import type { GeomType, Item } from "../lib/types";

export const toItem = (f: ApiFeature): Item => ({
  id: f.id,
  type: f.geometry.type as GeomType,
  props: propsOf(f),
  geometry: f.geometry,
  ownerId: f.properties.owner_id ?? null,
  ownerName: f.properties.owner_name ?? null,
});

type SetItems = (fn: (items: Item[]) => Item[]) => void;

/** เพิ่ม/แทนที่ตาม id — ข้อมูลเหมือนเดิม (เช่น Realtime ส่งการแก้ของเราเองกลับมา) = ไม่เปลี่ยน state */
function upsert(items: Item[], next: Item): Item[] {
  const i = items.findIndex((x) => x.id === next.id);
  if (i < 0) return [...items, next];
  const old = items[i];
  if (JSON.stringify(old.props) === JSON.stringify(next.props) && sameGeometry(old.geometry, next.geometry)) return items;
  return items.map((x) => (x.id === next.id ? next : x));
}

/**
 * โหลด feature ของมุมมองนี้ (viewKey เปลี่ยน = บัญชี/group/รอบข้อมูลทดลองเปลี่ยน → โหลดใหม่)
 * - login แล้ว: GeoJSON FeatureCollection จาก API + ฟัง Realtime (browser อื่นเพิ่ม/แก้/ลบ → อัปเดตตาม)
 * - โหมดทดลอง: โหลดจาก localStorage ไม่ฟัง Realtime
 * App ต้องล้าง items เองตอน viewKey เปลี่ยน
 * คืนสถานะโหลด: loading (ครั้งแรก, error ตอนนี้ไม่ขึ้นแถบแดง — ให้ pill แสดงพร้อมปุ่มลองใหม่) / refreshing (reload เบื้องหลัง) + retry
 */
export function useFeatureData(viewKey: string, guest: boolean, setItems: SetItems, onError: (err: unknown) => void) {
  // เก็บสถานะคู่กับ viewKey — viewKey เปลี่ยนแล้วถือเป็น loading ทันทีโดยไม่ต้อง setState ใน effect
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
    if (viewKey === PENDING_VIEW) return; // ยังไม่รู้ว่าเป็นใคร — รอก่อน
    let alive = true;
    // ของที่ Realtime ส่งมาก่อนรายการโหลดเสร็จยังอยู่ (ไม่ถูกรายการทับ)
    const load = (features: ApiFeature[]) => {
      if (!alive) return;
      const ids = new Set(features.map((f) => f.id));
      setItems((items) => [...features.map(toItem), ...items.filter((i) => !ids.has(i.id))]);
    };

    if (guest) {
      void Promise.resolve(loadGuest()).then(load);
      return () => {
        alive = false;
      };
    }

    let loaded = false; // โหลดครั้งแรกสำเร็จแล้ว → ครั้งต่อไปเป็น reload เบื้องหลัง
    const reload = () => {
      if (loaded) setRes((r) => (r.key === viewKey && r.state === "ready" ? { key: viewKey, state: "refreshing" } : r));
      void listFeatures()
        .then((f) => {
          if (!alive) return;
          loaded = true;
          load(f);
          setRes((r) => (r.key === viewKey && r.state === "ready" ? r : { key: viewKey, state: "ready" }));
        })
        .catch((e) => {
          if (!alive) return;
          if (loaded) {
            setRes({ key: viewKey, state: "ready" });
            onError(e); // reload เบื้องหลังพลาด: ข้อมูลเดิมยังอยู่ → แถบแดงพอ
          } else setRes({ key: viewKey, state: "error" });
        });
    };
    reload();
    // กลับมาที่แท็บ/หน้าต่าง (เครื่องพับจอ websocket อาจหลุดเงียบๆ) → โหลดใหม่กันของตกหล่น
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const unsubscribe = subscribeFeatures(async ({ type, id }) => {
      if (type === "DELETE") return setItems((items) => items.filter((i) => i.id !== id));
      if (isOwnEcho(id)) return; // เราเพิ่งบันทึกเอง — App อัปเดต items จากผลลัพธ์ไปแล้ว
      try {
        const f = await getFeature(id);
        if (alive) setItems((items) => upsert(items, toItem(f)));
      } catch {
        // ถูกลบไปแล้วระหว่างรอ
      }
    }, reload); // ต่อ Realtime ได้ใหม่หลังหลุด → โหลดรายการใหม่
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubscribe();
    };
  }, [viewKey, guest, setItems, onError, nonce]);

  const state: LoadState = guest ? "ready" : res.key === viewKey ? res.state : "loading";
  return { state, retry };
}
