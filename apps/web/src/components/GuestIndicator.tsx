import { FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const R = 18;
const C = 2 * Math.PI * R;

/**
 * โหมดทดลอง (ยังไม่ login): วงกลมเล็กติดปุ่มบัญชี — วงแหวนรอบไอคอน = เวลาที่เหลือก่อนข้อมูลถูกลบ
 * เหลือ ≤ 5 นาทีเปลี่ยนเป็นสีแดง + จุดกะพริบ / กดแล้วมี popover อธิบาย + ปุ่มเข้าสู่ระบบ
 */
export default function GuestIndicator({
  expiry,
  minutesLeft,
  ttlMinutes,
  onLogin,
  className,
}: {
  expiry: number | null;
  minutesLeft: number | null;
  ttlMinutes: number;
  onLogin: () => void;
  className?: string;
}) {
  const urgent = minutesLeft !== null && minutesLeft <= 5;
  const ratio = minutesLeft === null ? 1 : Math.min(1, minutesLeft / ttlMinutes);
  const label =
    minutesLeft === null
      ? "โหมดทดลอง: ข้อมูลไม่ถูกบันทึกถาวร"
      : `โหมดทดลอง: ข้อมูลจะถูกลบในอีก ${minutesLeft} นาที`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          title={label}
          className={cn(
            "relative size-10 shrink-0 rounded-full border border-black/5 bg-card p-0 shadow-float hover:bg-card",
            urgent ? "text-red-600" : "text-amber-600",
            className,
          )}
        >
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r={R} fill="none" strokeWidth="2.5" className="stroke-current opacity-15" />
            <circle
              cx="20"
              cy="20"
              r={R}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="stroke-current transition-[stroke-dashoffset] duration-700"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
            />
          </svg>
          <FlaskConicalIcon className="size-4.5" />
          {urgent && (
            <span className="absolute top-0.5 right-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-xl p-3 text-sm shadow-float">
        <p className="flex items-center gap-1.5 font-semibold">
          <FlaskConicalIcon className={cn("size-4", urgent ? "text-red-600" : "text-amber-600")} />
          โหมดทดลอง
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {expiry === null
            ? "ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น และจะถูกลบเมื่อครบ 1 ชั่วโมงนับจากรายการแรก"
            : `ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น จะถูกลบเวลา ${new Date(expiry).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น. (อีก ${minutesLeft} นาที)`}
        </p>
        <Button size="sm" className="mt-3 w-full" onClick={onLogin}>
          เข้าสู่ระบบเพื่อบันทึกถาวร
        </Button>
      </PopoverContent>
    </Popover>
  );
}
