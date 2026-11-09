import { useEffect } from "react";
import { CircleCheckIcon, InfoIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** name = แจ้งว่าบันทึก feature แล้ว, message = ข้อความอื่น (เช่น ลบข้อมูลทดลองแล้ว) */
export type ToastData = { id: number; name: string; message?: undefined } | { id: number; message: string; name?: undefined };

/** แจ้งว่าบันทึกแล้ว — ล่างกลางแผนที่ (เหนือ pill เครื่องมือ) ปิดเองใน 4 วินาที (บันทึกซ้ำ = id ใหม่ = เริ่มนับใหม่) */
export default function Toast({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in absolute bottom-[calc(6rem_+_env(safe-area-inset-bottom,0px))] left-1/2 z-30 flex max-w-[90%] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-zinc-900 py-2 pr-1.5 pl-3.5 text-sm text-white shadow-float md:bottom-24"
    >
      {toast.message ? (
        <InfoIcon className="size-4 shrink-0 text-sky-300" />
      ) : (
        <CircleCheckIcon className="size-4 shrink-0 text-emerald-300" />
      )}
      <span className="truncate">
        {toast.message ?? (
          <>
            บันทึก <strong className="text-emerald-200">&quot;{toast.name}&quot;</strong> แล้ว
          </>
        )}
      </span>
      <Button variant="ghost" size="icon" aria-label="ปิด" onClick={onClose} className="size-7 text-white/80 hover:bg-white/10 hover:text-white">
        <XIcon />
      </Button>
    </div>
  );
}
