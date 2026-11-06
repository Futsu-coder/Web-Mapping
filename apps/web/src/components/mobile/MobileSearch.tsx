import { useRef, useState } from "react";
import type L from "leaflet";
import SearchBox from "../SearchBox";

/**
 * ปุ่ม search ใน navbar มือถือ (วางฝั่งขวา) กดแล้วกางกล่องค้นหาลงมาใต้ navbar แบบ overlay
 * กล่องค้นหา mount ไว้ตลอด แค่ซ่อนด้วย hidden เพื่อให้หมุดผลค้นหาไม่หายตอนปิดแถบ
 * ต้องวางใน element ที่เป็น position: relative (Navbar เป็น relative อยู่แล้ว)
 */
export default function MobileSearch({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) requestAnimationFrame(() => boxRef.current?.querySelector("input")?.focus());
  };

  return (
    <>
      <button
        type="button"
        aria-label="ค้นหาสถานที่"
        title="ค้นหาสถานที่"
        aria-pressed={open}
        onClick={toggle}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          open ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <span className="material-symbols-outlined text-[22px]">{open ? "close" : "search"}</span>
      </button>
      <div ref={boxRef} className={`absolute inset-x-0 top-full z-50 px-3 pt-2 ${open ? "" : "hidden"}`}>
        <SearchBox mapRef={mapRef} className="relative w-full" onPicked={() => setOpen(false)} />
      </div>
    </>
  );
}
