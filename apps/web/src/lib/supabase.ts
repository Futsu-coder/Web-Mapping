import { createClient } from "@supabase/supabase-js";

// client เดียวของทั้งเว็บ: login (Supabase Auth) + ฟัง Realtime — อ่าน/เขียนข้อมูลผ่าน API ของเราเหมือนเดิม
// anon key เปิดเผยฝั่งเว็บได้ (สิทธิ์ถูกจำกัดด้วย RLS ใน apps/server/sql/realtime.sql)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
if (!supabase) console.info("Login / Realtime ปิดอยู่: ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_ANON_KEY ใน .env");

/** access token ปัจจุบัน (supabase-js ต่ออายุให้เองเมื่อใกล้หมด) */
export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
