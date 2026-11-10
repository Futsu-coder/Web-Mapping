import { useEffect } from "react";
import { layerApi } from "../api";
import type { Layer, RelatedRecord, RelatedTable } from "../lib/layers";
import { subscribeTable } from "../lib/realtime";

type Setter<T> = (value: T) => void;

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
  useEffect(() => {
    if (guest) return;
    let alive = true;
    const loadLayers = () =>
      layerApi
        .list()
        .then((d) => {
          if (!alive) return;
          setLayers(d.layers);
          setTables(d.tables);
        })
        .catch(onError);
    const loadRecords = () =>
      layerApi
        .listRecords()
        .then((r) => {
          if (alive) setRecords(r);
        })
        .catch(onError);

    void loadLayers();
    void loadRecords();
    const unsubscribe = [
      subscribeTable("layers", () => void loadLayers()),
      subscribeTable("related_tables", () => void loadLayers()),
      subscribeTable("related_records", () => void loadRecords()),
    ];
    return () => {
      alive = false;
      for (const u of unsubscribe) u();
    };
  }, [viewKey, guest, setLayers, setTables, setRecords, onError]);
}
