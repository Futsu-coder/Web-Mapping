// ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งานเกิน 1 วัน
// Supabase มี "Inactivity timeout" ให้เฉพาะแพ็กเกจ Pro → ทำฝั่งเว็บแทน: จำเวลาที่ใช้งานล่าสุดไว้ใน localStorage
// (ข้อจำกัด: ตรวจในเบราว์เซอร์เท่านั้น ถ้าต้องการบังคับฝั่ง server ต้องใช้ตั้งค่า Sessions ของ Supabase Pro)

export const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const KEY = "webmap:lastActive";
const WRITE_EVERY_MS = 60 * 1000; // บันทึกเวลาไม่เกินนาทีละครั้ง

const read = (): number | null => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

/** บันทึกว่าเพิ่งใช้งาน (เรียกตอน login สำเร็จ และตอนผู้ใช้คลิก/พิมพ์) */
export function markActive() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // private mode / storage ถูกปิด → ข้ามได้ (ไม่มีการหมดเวลาอัตโนมัติ)
  }
}

/** ไม่ได้ใช้งานเกิน 1 วันแล้วหรือยัง (ไม่เคยบันทึก = ถือว่าเพิ่งใช้) */
export function isIdleExpired() {
  const last = read();
  return last !== null && Date.now() - last > IDLE_LIMIT_MS;
}

/**
 * เริ่มติดตามการใช้งาน — หมดเวลาเมื่อไหร่เรียก onExpire
 * ตรวจทันที (เปิดหน้าเว็บกลับมาหลังหายไปนาน), ทุก 1 นาที และตอนสลับกลับมาที่แท็บนี้
 * คืนฟังก์ชันหยุดติดตาม
 */
export function watchIdle(onExpire: () => void): () => void {
  if (isIdleExpired()) {
    onExpire();
    return () => {};
  }
  markActive(); // เปิดหน้าเว็บ (ยังไม่หมดเวลา) = ใช้งาน

  let lastWrite = Date.now();
  const onActivity = () => {
    if (Date.now() - lastWrite < WRITE_EVERY_MS) return;
    lastWrite = Date.now();
    markActive();
  };
  const check = () => {
    if (isIdleExpired()) onExpire();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };

  const events = ["pointerdown", "keydown", "wheel"] as const;
  for (const e of events) window.addEventListener(e, onActivity, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(check, 60 * 1000);

  return () => {
    for (const e of events) window.removeEventListener(e, onActivity);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
}
