import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedFlag } from "../hooks/useDelayedFlag";
import type { LoadState } from "../lib/loadState";

/**
 * สถานะโหลดข้อมูลลอยกลางบนแผนที่ (แผนที่ยังใช้ได้ — pill ไม่บังคลิกยกเว้นปุ่ม)
 * - loading: spinner + ข้อความ (รอ 300ms ก่อนแสดง ไม่ให้วูบตอนโหลดเร็ว)
 * - refreshing: spinner วงเล็ก ไม่มีข้อความ
 * - error: pill สีแดง + ปุ่มลองใหม่ (แสดงทันที)
 */
export function LoadingPill({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  const showLoading = useDelayedFlag(state === "loading");
  const showRefresh = useDelayedFlag(state === "refreshing");

  if (state === "error") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4 md:top-4" role="alert">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-destructive py-1 pr-1 pl-3 text-sm text-white shadow-lg">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>โหลดข้อมูลไม่สำเร็จ</span>
          <Button type="button" size="sm" variant="secondary" className="h-7 rounded-full px-3" onClick={onRetry}>
            ลองใหม่
          </Button>
        </div>
      </div>
    );
  }
  if (!showLoading && !showRefresh) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top,0px))] z-30 flex justify-center px-4 md:top-4" role="status" aria-live="polite">
      {showLoading ? (
        <div className="flex items-center gap-2 rounded-full bg-background/95 px-4 py-1.5 text-sm text-foreground shadow-lg ring-1 ring-border">
          <Loader2Icon className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          กำลังโหลดข้อมูล…
        </div>
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-background/95 shadow-lg ring-1 ring-border" title="กำลังอัปเดตข้อมูล">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
          <span className="sr-only">กำลังอัปเดตข้อมูล</span>
        </div>
      )}
    </div>
  );
}

/** แถว skeleton แทนรายการ/ตารางระหว่างโหลดครั้งแรก (รอ 300ms เหมือน pill) */
export function ListSkeleton({ loading, rows = 5, className }: { loading: boolean; rows?: number; className?: string }) {
  const show = useDelayedFlag(loading);
  if (!show) return null;
  return (
    <div className={className ?? "flex flex-col gap-2 px-2 py-2"} role="status" aria-label="กำลังโหลดข้อมูล">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" style={{ opacity: 1 - i * 0.14 }} />
      ))}
    </div>
  );
}
