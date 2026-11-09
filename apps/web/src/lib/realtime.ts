import { supabase } from "./supabase";

// Realtime ส่ง event เฉพาะแถวที่ RLS อนุญาต (feature ใน group ตัวเอง / คำเชิญถึงเรา) ตาม session ที่ login อยู่

export type FeatureChange = { type: "INSERT" | "UPDATE" | "DELETE"; id: number };

/** ฟังการเปลี่ยนแปลงตาราง features ของ group ตัวเอง — คืนฟังก์ชันเลิกฟัง */
export function subscribeFeatures(onChange: (change: FeatureChange) => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel("features")
    .on("postgres_changes", { event: "*", schema: "public", table: "features" }, (payload) => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: number | string };
      if (row?.id != null) onChange({ type: payload.eventType, id: Number(row.id) });
    })
    .subscribe();
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
