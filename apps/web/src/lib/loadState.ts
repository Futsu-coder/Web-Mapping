/** สถานะโหลดข้อมูล: loading = โหลดครั้งแรก, refreshing = reload เบื้องหลัง, error = โหลดไม่สำเร็จ */
export type LoadState = "loading" | "refreshing" | "ready" | "error";

/** viewKey ระหว่างรอรู้ว่าเป็นใคร (session / getMe ยังไม่เสร็จ) — ยังไม่โหลดอะไร ไม่โชว์ข้อมูลโหมดทดลอง */
export const PENDING_VIEW = "pending";

/** รวมสถานะหลายตัว: error > loading > refreshing > ready */
export function mergeLoadState(...states: LoadState[]): LoadState {
  for (const s of ["error", "loading", "refreshing"] as const) if (states.includes(s)) return s;
  return "ready";
}
