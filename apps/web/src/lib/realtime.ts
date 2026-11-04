import { createClient } from "@supabase/supabase-js";

// Supabase ใช้แค่ฟัง Realtime — อ่าน/เขียนข้อมูลยังผ่าน API ของเราเหมือนเดิม
// anon key เปิดเผยฝั่งเว็บได้ (สิทธิ์ถูกจำกัดด้วย RLS ใน apps/server/sql/realtime.sql)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabase = url && anonKey ? createClient(url, anonKey) : null;
if (!supabase) console.info("Realtime ปิดอยู่: ยังไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");

export type FeatureChange = { type: "INSERT" | "UPDATE" | "DELETE"; id: number };

/** ฟังการเปลี่ยนแปลงตาราง features จากทุก browser — คืนฟังก์ชันเลิกฟัง */
export function subscribeFeatures(onChange: (change: FeatureChange) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("features")
    .on("postgres_changes", { event: "*", schema: "public", table: "features" }, (payload) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: number | string };
      if (row?.id != null) onChange({ type: payload.eventType, id: Number(row.id) });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
