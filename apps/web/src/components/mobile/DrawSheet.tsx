import type { Map as MlMap } from "maplibre-gl";
import type { MobileDraw } from "../../hooks/useCrosshairDraw";
import { formatArea, formatLength, lineLength, polygonArea } from "../../lib/measure";

const LABEL = { Marker: "Point", Line: "Line", Polygon: "Polygon" } as const;

/** แผ่นล่างตอนวาด: ชนิด + ตัวเลขวัดแบบสด + ปุ่ม Add point */
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
  const count = `${n} point${n === 1 ? "" : "s"}`;
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
      <button
        type="button"
        aria-label="ตำแหน่งปัจจุบัน"
        title="ตำแหน่งปัจจุบัน"
        onClick={locate}
        className="absolute bottom-[calc(8.5rem_+_env(safe-area-inset-bottom,0px))] right-3 z-30 w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-700 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[22px]">my_location</span>
      </button>

      <div className="absolute bottom-0 inset-x-0 z-30 bg-white rounded-t-2xl border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-safe">
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-700" />
              <span className="text-base font-bold text-slate-900 leading-tight">{LABEL[draw.shape]}</span>
            </div>
            <span className="text-xs font-medium text-slate-500">{measure}</span>
          </div>
          {draw.warning && (
            <p role="alert" className="mb-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              ⚠️ {draw.warning}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              const c = mapRef.current?.getCenter();
              if (c) onAdd([c.lng, c.lat]);
            }}
            className="w-full h-[3.125rem] bg-teal-700 hover:bg-teal-800 active:scale-[0.99] text-white font-medium text-[15px] rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            {draw.shape === "Marker" && n ? "Move point here" : "Add point"}
          </button>
        </div>
      </div>
    </>
  );
}
