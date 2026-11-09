import { useRef, useState } from "react";
import type { Map as MlMap, PaddingOptions } from "maplibre-gl";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SearchBox from "./SearchBox";

/**
 * ปุ่มค้นหาวงกลม (ขวาบน ข้างกระดิ่ง) กดแล้วยืดออกทางซ้ายให้พิมพ์ค้นหา
 * - จอคอม: ยืดเป็นความกว้างคงที่, มือถือ (fill): ยืดเต็มที่ว่างจนถึงข้างกระดิ่ง
 * - SearchBox mount ค้างไว้ตลอด (ปิดแค่ซ่อน) เพื่อให้หมุดผลค้นหาไม่หายตอนยุบ
 * ต้องวางในแถว flex ที่จัดชิดขวา (justify-end) เพื่อให้ยืดไปทางซ้าย
 */
export default function SearchToggle({
  mapRef,
  getPadding,
  fill = false,
}: {
  mapRef: React.MutableRefObject<MlMap | null>;
  getPadding?: () => PaddingOptions;
  /** มือถือ: ยืดเต็มพื้นที่ที่เหลือในแถว */
  fill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const show = () => {
    setOpen(true);
    requestAnimationFrame(() => boxRef.current?.querySelector("input")?.focus());
  };

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative h-12 min-w-12 rounded-full border border-black/5 bg-card shadow-float transition-[width,flex-grow] duration-300 ease-out motion-reduce:transition-none",
        fill ? (open ? "flex-1" : "flex-none basis-12") : open ? "w-80" : "w-12",
        !open && "overflow-hidden",
      )}
      style={fill ? { flexGrow: open ? 1 : 0, flexBasis: open ? "0%" : "3rem" } : undefined}
    >
      <button
        type="button"
        aria-label="ค้นหาสถานที่"
        aria-expanded={open}
        title="ค้นหาสถานที่"
        onClick={show}
        className={cn(
          "absolute inset-0 grid place-items-center rounded-full transition-opacity hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          open && "pointer-events-none opacity-0",
        )}
      >
        <SearchIcon className="size-5" />
      </button>

      <div className={cn("transition-opacity duration-200", !open && "pointer-events-none invisible opacity-0")}>
        <SearchBox mapRef={mapRef} getPadding={getPadding} floating onPicked={() => setOpen(false)} onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
