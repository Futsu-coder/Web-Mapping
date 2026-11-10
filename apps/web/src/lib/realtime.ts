import { supabase } from "./supabase";

// Realtime ส่ง event เฉพาะแถวที่ RLS อนุญาต (feature ใน group ตัวเอง / คำเชิญถึงเรา) ตาม session ที่ login อยู่

/**
 * onReady ถูกเรียกทุกครั้งที่ channel ต่อได้ (ครั้งแรก + ต่อใหม่หลังหลุด) → ผู้ใช้โหลดรายการใหม่ ได้ของที่พลาดไประหว่างหลุด
 * ครั้งแรกเรียกด้วยเหมือนกัน (ซ้ำกับการโหลดตอนเปิดหน้า 1 รอบ — ถูกกว่าการพลาดของที่เข้ามาก่อนต่อติด)
 */
const readyHandler = (onReady?: () => void) => (status: string) => {
  if (status === "SUBSCRIBED") onReady?.();
};

export type FeatureChange = { type: "INSERT" | "UPDATE" | "DELETE"; id: number };

/** ฟังการเปลี่ยนแปลงตาราง features ของ group ตัวเอง — คืนฟังก์ชันเลิกฟัง */
export function subscribeFeatures(onChange: (change: FeatureChange) => void, onReady?: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel("features")
    .on("postgres_changes", { event: "*", schema: "public", table: "features" }, (payload) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: number | string };
      if (row?.id != null) onChange({ type: payload.eventType, id: Number(row.id) });
    })
    .subscribe(readyHandler(onReady));
  return () => {
    client.removeChannel(channel);
  };
}

/**
 * ฟังการเปลี่ยนแปลงทุกแบบของตาราง (layers / related_tables / related_records) — RLS ส่งเฉพาะของ group ตัวเอง
 * ไม่ส่งข้อมูลแถวต่อ: ผู้ใช้โหลดรายการใหม่เองใน onChange (ข้อมูลระดับ group ไม่เยอะ) — คืนฟังก์ชันเลิกฟัง
 */
export function subscribeTable(table: string, onChange: () => void, onReady?: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel(`table-${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => onChange())
    .subscribe(readyHandler(onReady));
  return () => {
    client.removeChannel(channel);
  };
}

/** แถวใหม่ในตารางที่เป็นของเรา (คำเชิญถึงเรา / การแจ้งเตือนถึงเรา) — คืนฟังก์ชันเลิกฟัง */
function subscribeMine(table: string, column: string, userId: string, onNew: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel(`${table}-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `${column}=eq.${userId}` }, () =>
      onNew(),
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

export const subscribeInvitations = (userId: string, onNew: () => void) =>
  subscribeMine("invitations", "invitee_id", userId, onNew);

export const subscribeNotifications = (userId: string, onNew: () => void) =>
  subscribeMine("notifications", "user_id", userId, onNew);
