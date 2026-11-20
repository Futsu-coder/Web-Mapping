import { useEffect, useRef, useState, type ReactNode } from "react";
import { InfoIcon, ListIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useVerticalDrag } from "../../hooks/useVerticalDrag";

type Tab = "details" | "features";
type Level = "peek" | "half" | "full";

/** สัดส่วนความสูงแผ่นตอนเปิดครึ่ง (ของพื้นที่แผนที่) — App ใช้คำนวณระยะเว้นขอบตอนซูมไปหา feature */
export const SHEET_HALF_RATIO = 0.6;
const FULL_RATIO = 0.92;
const LEVELS: Level[] = ["peek", "half", "full"];

/**
 * Bottom sheet 3 ระดับ เลื่อนด้วย translateY:
 * - peek = เห็นแค่ handle + แท็บ, half = 60% ของจอ, full = 92%
 * - ลากที่ handle/แท็บได้ แผ่นตามนิ้วและเห็นเนื้อหาทันที ปล่อยแล้วดูดไประดับที่ใกล้ที่สุด (หรือตามความเร็วปัด)
 * ลอยทับแผนที่ ไม่ resize แผนที่ กากบาทตอนวาดจึงอยู่กลางจอเสมอ
 * open/onOpenChange: false = peek, true = half หรือ full
 */
export default function MobileSheet({
  open,
  onOpenChange,
  featureCount,
  hasDetails,
  creating,
  selectionKey,
  details,
  list,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = ยังโหลดไม่ครบ (โชว์แถบเทาแทนตัวเลข) */
  featureCount: number | null;
  hasDetails: boolean;
  creating: boolean;
  /** เปลี่ยนเมื่อเลือก feature ใหม่ → สลับมาแท็บรายละเอียดอัตโนมัติ */
  selectionKey: string | null;
  details: ReactNode;
  list: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("features");
  const [prevKey, setPrevKey] = useState(selectionKey);
  if (prevKey !== selectionKey) {
    setPrevKey(selectionKey);
    if (selectionKey) setTab("details");
  }

  // ระดับของแผ่น — sync กับ prop open (ปิด = peek, เปิดจากข้างนอก = half)
  const [level, setLevel] = useState<Level>(open ? "half" : "peek");
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setLevel((l) => (open ? (l === "peek" ? "half" : l) : "peek"));
  }

  const current: Tab = creating ? "details" : hasDetails && tab === "details" ? "details" : "features";
  const shown: Level = creating && level === "peek" ? "half" : level;
  const expanded = shown !== "peek";

  // ระยะเลื่อนของแต่ละระดับ วัดใน ResizeObserver (ยิงครั้งแรกก่อน paint จึงไม่กระพริบ และอัปเดตเองเมื่อหมุนจอ/คีย์บอร์ดเปิด)
  const sheetRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [offsets, setOffsets] = useState<Record<Level, number> | null>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    const head = headRef.current;
    if (!sheet || !head) return;
    const measure = () => {
      const safe = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      const parentH = sheet.parentElement?.clientHeight ?? sheet.offsetHeight;
      const peek = Math.max(0, sheet.offsetHeight - head.offsetHeight - safe);
      const half = Math.min(peek, Math.max(0, sheet.offsetHeight - parentH * SHEET_HALF_RATIO));
      setOffsets({ peek, half, full: 0 });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    ro.observe(head);
    if (sheet.parentElement) ro.observe(sheet.parentElement);
    return () => ro.disconnect();
  }, []);

  const goTo = (l: Level) => {
    setLevel(l);
    if ((l !== "peek") !== open) onOpenChange(l !== "peek");
  };

  const drag = useVerticalDrag({
    enabled: !creating,
    onEnd: (dy, v) => {
      if (!offsets) return;
      const pos = offsets[shown] + dy;
      let i = LEVELS.indexOf(shown);
      if (v > 0.4) i = Math.max(0, i - 1); // ปัดลง
      else if (v < -0.3) i = Math.min(2, i + 1); // ปัดขึ้น
      else {
        let best = Infinity;
        LEVELS.forEach((l, idx) => {
          const d = Math.abs(offsets[l] - pos);
          if (d < best) [best, i] = [d, idx];
        });
      }
      goTo(LEVELS[i]);
    },
  });

  const max = offsets?.peek ?? 0;
  const base = offsets ? offsets[shown] : 0;
  const offset = Math.min(max, Math.max(0, base + drag.dy));

  // เลือก feature ใหม่ → แท็บสลับเป็น "รายละเอียด" เอง แต่ focus ยังค้างที่ปุ่มเดิม (กรอบค้าง) → ปล่อย focus ในแถบแท็บ
  useEffect(() => {
    const el = document.activeElement;
    if (selectionKey && el instanceof HTMLElement && headRef.current?.contains(el)) el.blur();
  }, [selectionKey]);

  // onClick ด้วย เพราะ onValueChange ไม่ยิงเมื่อแตะแท็บที่ active อยู่แล้ว (แผ่นยุบอยู่แต่แท็บนั้น active → ไม่เปิด)
  const pick = (t: Tab) => {
    setTab(t);
    if (!expanded) goTo("half");
  };

  return (
    <div
      ref={sheetRef}
      style={{
        height: `${FULL_RATIO * 100}%`,
        transform: `translateY(${offset}px)`,
        visibility: offsets === null && !expanded ? "hidden" : "visible",
      }}
      className={cn(
        "pb-safe absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-black/5 bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
        !drag.dragging && "transition-transform duration-300 ease-out",
      )}
    >
      {/* พื้นที่ลาก: handle + แท็บ (ส่วนรายการด้านล่างเลื่อนดูได้ตามปกติ) */}
      <div ref={headRef} {...drag.handlers} className={cn("shrink-0 select-none", !creating && "touch-none")}>
        <div
          role="separator"
          aria-label={expanded ? "ปัดลงเพื่อย่อรายการ" : "ปัดขึ้นเพื่อเปิดรายการ"}
          className="flex w-full justify-center pt-2.5 pb-3"
        >
          <span className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>

        {!creating && (
          <Tabs value={current} onValueChange={(v) => pick(v as Tab)} className="px-4 pb-3">
            <TabsList className={cn("grid h-11 w-full gap-1 p-1", hasDetails ? "grid-cols-2" : "grid-cols-1")}>
              {hasDetails && (
                <TabsTrigger value="details" onClick={() => pick("details")} className="h-9 gap-1.5 text-[0.8125rem] font-semibold">
                  <InfoIcon />
                  รายละเอียด
                </TabsTrigger>
              )}
              <TabsTrigger value="features" onClick={() => pick("features")} className="h-9 gap-1.5 text-[0.8125rem] font-semibold">
                <ListIcon />
                รายการทั้งหมด
                {featureCount === null ? (
                  <span className="h-4 w-5 animate-pulse rounded-full bg-primary/30 motion-reduce:animate-none" aria-hidden />
                ) : (
                  <span className="rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-primary-foreground">{featureCount}</span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* ตอนยุบเนื้อหาอยู่นอกจอ — inert กันโฟกัส/โปรแกรมอ่านจอ */}
      {/* paddingBottom = ส่วนของแผ่นที่จมใต้ขอบจอ (half/peek) → ช่องเลื่อนข้างในสูงเท่าส่วนที่มองเห็นจริง เลื่อนถึงปุ่มล่างสุดได้ */}
      <div inert={!expanded} className="flex min-h-0 flex-1 flex-col" style={{ paddingBottom: expanded ? base : 0 }}>
        {current === "details" ? details : list}
      </div>
    </div>
  );
}
