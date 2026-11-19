import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

type Drag = { id: number; from: number; dy: number; rowH: number };

/**
 * ลากเรียงรายการแนวตั้งด้วย pointer events (เมาส์ + นิ้ว) — ไม่ใช้ไลบรารี
 * ลากที่ "ด้ามจับ" เท่านั้น (gripProps ใส่ touch-none ให้เองที่ element ด้ามจับ เพื่อให้เลื่อนรายการด้วยนิ้วที่อื่นยังได้)
 * สมมติทุกแถวสูงเท่ากัน; ลากชิดขอบบน/ล่างของ scrollRef = เลื่อนรายการให้เอง
 * ระหว่างลาก: offsetFor(id) = ระยะที่แถวต้องเลื่อน (px) — แถวที่ลาก = ตามนิ้ว, แถวอื่นเลื่อนหลบเป็นช่อง
 */
export function useSortable({
  ids,
  onMove,
  scrollRef,
}: {
  ids: number[];
  onMove: (id: number, toIndex: number) => void;
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const start = useRef<{ y: number; scroll: number; pointerId: number } | null>(null);

  const overIndex = drag ? Math.max(0, Math.min(ids.length - 1, drag.from + Math.round(drag.dy / drag.rowH))) : -1;

  const offsetFor = (id: number) => {
    if (!drag) return 0;
    if (id === drag.id) return drag.dy;
    const i = ids.indexOf(id);
    if (drag.from < overIndex && i > drag.from && i <= overIndex) return -drag.rowH;
    if (drag.from > overIndex && i < drag.from && i >= overIndex) return drag.rowH;
    return 0;
  };

  const gripProps = (id: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const row = e.currentTarget.closest("li");
      const from = ids.indexOf(id);
      if (!row || from < 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const gap = parseFloat(getComputedStyle(row.parentElement ?? row).rowGap) || 0;
      start.current = { y: e.clientY, scroll: scrollRef?.current?.scrollTop ?? 0, pointerId: e.pointerId };
      setDrag({ id, from, dy: 0, rowH: row.getBoundingClientRect().height + gap });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const box = scrollRef?.current;
      if (box) {
        const r = box.getBoundingClientRect();
        if (e.clientY < r.top + 28) box.scrollTop -= 10;
        else if (e.clientY > r.bottom - 28) box.scrollTop += 10;
      }
      const scrolled = (box?.scrollTop ?? 0) - s.scroll;
      setDrag((d) => d && { ...d, dy: e.clientY - s.y + scrolled });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      start.current = null;
      if (drag && drag.id === id && overIndex !== drag.from) onMove(id, overIndex);
      setDrag(null);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(null);
    },
    // ปุ่มลูกศรขึ้น/ลงบนด้ามจับ (คีย์บอร์ด): ใช้ปุ่ม ↑/↓ แยกต่างหาก — ด้ามจับรับแค่การลาก
    className: "touch-none cursor-grab select-none active:cursor-grabbing",
  });

  return { dragId: drag?.id ?? null, offsetFor, gripProps };
}
