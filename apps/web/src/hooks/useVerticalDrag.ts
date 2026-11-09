import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * ลากแนวตั้งด้วย pointer events (นิ้วและเมาส์) — เริ่มนับว่าลากเมื่อขยับเกิน 6px
 * การแตะธรรมดาจึงยังกดปุ่มข้างในได้ และถ้าเพิ่งลากจะกัน click ที่ตามมา
 * ใส่ `touch-none` ที่ element เพื่อกันเบราว์เซอร์เลื่อนหน้า/pull-to-refresh แย่งท่าทาง
 */
export function useVerticalDrag({
  enabled = true,
  onEnd,
}: {
  enabled?: boolean;
  /** dy = ระยะที่ลาก (ลบ = ขึ้น), velocity = px/ms (ลบ = ขึ้น) */
  onEnd: (dy: number, velocity: number) => void;
}) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);

  const reset = () => {
    start.current = null;
    setDy(0);
    setDragging(false);
  };

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
      moved.current = false;
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const d = e.clientY - s.y;
      if (!moved.current) {
        if (Math.abs(d) < 6) return;
        moved.current = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      setDy(d);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (moved.current) {
        const d = e.clientY - s.y;
        onEnd(d, d / Math.max(1, performance.now() - s.t));
      }
      reset();
    },
    onPointerCancel: reset,
    onClickCapture: (e: React.MouseEvent) => {
      if (moved.current) {
        e.stopPropagation();
        e.preventDefault();
        moved.current = false;
      }
    },
  };

  return { dy, dragging, handlers };
}
