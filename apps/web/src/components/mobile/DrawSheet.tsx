import type { Map as MlMap } from "maplibre-gl";
import { LocateFixedIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileDraw } from "../../hooks/useCrosshairDraw";
import { formatArea, formatLength, lineLength, polygonArea } from "../../lib/measure";

const LABEL = { Marker: "Point", Line: "Line", Polygon: "Polygon" } as const;

/** แผ่นล่างตอนวาด: ชนิด + ตัวเลขวัดแบบสด + ปุ่มเพิ่มจุด */
export default function DrawSheet({
  draw,
  mapRef,
  onAdd,
  onError,
}: {
  draw: MobileDraw;
  mapRef: React.MutableRefObject<MlMap | null>;
  onAdd: (p: GeoJSON.Position) => void;
  onError: (err: unknown) => void;
}) {
  const n = draw.points.length;
  const count = `${n} จุด`;
  const measure =
    draw.shape === "Polygon" && n >= 3
      ? `${formatArea(polygonArea(draw.points))} · ${count}`
      : draw.shape === "Line" && n >= 2
        ? `${formatLength(lineLength(draw.points))} · ${count}`
        : count;

  // ไปยังตำแหน่งปัจจุบันของเครื่อง (ต้องอนุญาตสิทธิ์ตำแหน่งของเบราว์เซอร์)
  const locate = () => {
    if (!navigator.geolocation) return onError(new Error("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => mapRef.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 17 }),
      () => onError(new Error("ไม่สามารถระบุตำแหน่งปัจจุบันได้ (ตรวจสอบสิทธิ์ตำแหน่งของเบราว์เซอร์)")),
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label="ตำแหน่งปัจจุบัน"
        title="ตำแหน่งปัจจุบัน"
        onClick={locate}
        className="absolute right-3 bottom-[calc(8.5rem_+_env(safe-area-inset-bottom,0px))] z-30 size-12 rounded-xl border border-black/5 bg-card shadow-float hover:bg-card"
      >
        <LocateFixedIcon />
      </Button>

      <div className="pb-safe absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-black/5 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-primary" />
              <span className="text-base leading-tight font-bold">{LABEL[draw.shape]}</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{measure}</span>
          </div>
          {draw.warning && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
              {draw.warning}
            </p>
          )}
          <Button
            type="button"
            className="h-[3.125rem] w-full rounded-xl text-[15px]"
            onClick={() => {
              const c = mapRef.current?.getCenter();
              if (c) onAdd([c.lng, c.lat]);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {draw.shape === "Marker" && n ? "ย้ายจุดมาตรงนี้" : "เพิ่มจุดตรงกากบาท"}
          </Button>
        </div>
      </div>
    </>
  );
}
