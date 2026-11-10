import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** การ์ดขาวแบบเดียวกับการ์ดอื่นในเว็บ — แถบ teal ขอบล่างหดลงตามเวลาที่ toast จะหาย */
export default function ToastCard({ icon, badge, title, detail, duration, onClose }: { duration: number; icon: React.ReactNode; badge?: boolean; title: React.ReactNode; detail?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-black/5 bg-card text-card-foreground shadow-float">
      <div className="flex items-center gap-3 py-2.5 pr-2 pl-3">
        <div className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg", badge ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          {icon}
          {badge && (
            <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
              <CheckIcon className="size-2.5" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{title}</p>
          {detail && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <Button variant="ghost" size="icon" aria-label="ปิด" onClick={onClose} className="size-7 shrink-0 text-muted-foreground">
          <XIcon />
        </Button>
      </div>
      <div aria-hidden className="toast-timer absolute inset-x-0 bottom-0 h-0.5 bg-primary" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
