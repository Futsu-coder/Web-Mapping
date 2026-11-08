import { useEffect, useRef, useState, type ReactNode } from "react";
import { useVerticalDrag } from "../../hooks/useVerticalDrag";

type Tab = "details" | "features";

/**
 * Bottom sheet แผ่นเดียวสูง 60% เลื่อนด้วย translateY:
 * - กาง = offset 0
 * - ยุบ = เลื่อนลงจนเหลือแค่ handle + แถวแท็บ (หน้าตาเป็นแถบปุ่มล่างตามดีไซน์)
 * - ระหว่างลาก แผ่นตามนิ้วและเห็นเนื้อหา (รายการ/Details) ทันที ไม่ต้องรอปล่อยนิ้ว
 * ลอยทับแผนที่ ไม่ resize แผนที่ กากบาทตอนวาดจึงอยู่กลางจอเสมอ
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
  featureCount: number;
  hasDetails: boolean;
  creating: boolean;
  /** เปลี่ยนเมื่อเลือก feature ใหม่ → สลับมาแท็บ Details อัตโนมัติ */
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

  const current: Tab = creating ? "details" : hasDetails && tab === "details" ? "details" : "features";
  const expanded = open || creating;

  // ระยะที่ต้องเลื่อนลงเพื่อให้เหลือแค่ส่วนหัว = ความสูงแผ่น − ส่วนหัว − padding ล่าง (safe area)
  // วัดใน ResizeObserver (ยิงครั้งแรกก่อน paint) จึงไม่กระพริบ และอัปเดตเองเมื่อหมุนจอ/คีย์บอร์ดเปิด
  const sheetRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [closedOffset, setClosedOffset] = useState<number | null>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    const head = headRef.current;
    if (!sheet || !head) return;
    const measure = () => {
      const safe = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      setClosedOffset(Math.max(0, sheet.offsetHeight - head.offsetHeight - safe));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  const drag = useVerticalDrag({
    enabled: !creating,
    onEnd: (dy, v) => {
      if (expanded) {
        if (dy > 80 || v > 0.4) onOpenChange(false);
      } else if (dy < -30 || v < -0.3) {
        onOpenChange(true);
      }
    },
  });

  const max = closedOffset ?? 0;
  const base = expanded ? 0 : max;
  const offset = Math.min(max, Math.max(0, base + drag.dy));

  const pick = (t: Tab) => {
    setTab(t);
    if (!expanded) onOpenChange(true);
  };
  const tabCls = (t: Tab) =>
    `py-2 rounded-md text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
      expanded && current === t ? "bg-white text-teal-700 shadow-sm" : expanded ? "text-slate-500" : "text-slate-600"
    }`;

  return (
    <div
      ref={sheetRef}
      className={`absolute bottom-0 inset-x-0 z-30 h-[60%] flex flex-col bg-white rounded-t-2xl border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-safe ${
        drag.dragging ? "" : "transition-transform duration-300 ease-out"
      }`}
      style={{ transform: `translateY(${offset}px)`, visibility: closedOffset === null && !expanded ? "hidden" : "visible" }}
    >
      {/* พื้นที่ลาก: handle + แท็บ (ส่วนรายการด้านล่างเลื่อนดูได้ตามปกติ) */}
      <div ref={headRef} {...drag.handlers} className={`shrink-0 select-none ${creating ? "" : "touch-none"}`}>
        <div
          role="separator"
          aria-label={expanded ? "ปัดลงเพื่อย่อรายการ" : "ปัดขึ้นเพื่อเปิดรายการ"}
          className="w-full flex justify-center pt-2.5 pb-3"
        >
          <span className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {!creating && (
          <div className="px-4 pb-3">
            <div
              className={`grid p-1 rounded-lg gap-1 transition-colors ${expanded ? "bg-slate-100" : "bg-transparent"} ${
                hasDetails ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {hasDetails && (
                <button type="button" className={tabCls("details")} onClick={() => pick("details")}>
                  <span className="material-symbols-outlined text-[18px] text-slate-500">info</span>
                  Details
                </button>
              )}
              <button type="button" className={tabCls("features")} onClick={() => pick("features")}>
                <span className="material-symbols-outlined text-[18px] text-slate-500">view_list</span>
                All Features
                <span
                  className={`text-[11px] px-1.5 rounded-full font-bold ${
                    expanded ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {featureCount}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ตอนยุบเนื้อหาอยู่นอกจอ — inert กันโฟกัส/โปรแกรมอ่านจอ */}
      <div inert={!expanded} className="flex-1 min-h-0 flex flex-col">
        {current === "details" ? details : list}
      </div>
    </div>
  );
}
