import { useEffect } from "react";

/** name = แจ้งว่าบันทึก feature แล้ว, message = ข้อความอื่น (เช่น ลบข้อมูลทดลองแล้ว) */
export type ToastData = { id: number; name: string; message?: undefined } | { id: number; message: string; name?: undefined };

/** แจ้งว่าบันทึกแล้ว — ล่างกลางแผนที่ ปิดเองใน 4 วินาที (บันทึกซ้ำ = id ใหม่ = เริ่มนับใหม่) */
export default function Toast({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in absolute bottom-[calc(6rem_+_env(safe-area-inset-bottom,0px))] md:bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[90%] flex items-center gap-2.5 px-3.5 py-2 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-700/60 text-sm"
    >
      <span className="material-symbols-outlined text-emerald-300 text-base shrink-0">
        {toast.message ? "info" : "check_circle"}
      </span>
      <span className="truncate">
        {toast.message ?? (
          <>
            Feature <strong className="text-emerald-200">"{toast.name}"</strong> saved successfully
          </>
        )}
      </span>
      <span className="text-[11px] text-slate-400 ml-1 shrink-0">Just now</span>
      <button
        type="button"
        title="ปิด"
        aria-label="ปิด"
        onClick={onClose}
        className="ml-1 text-white/80 hover:text-white shrink-0"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}
