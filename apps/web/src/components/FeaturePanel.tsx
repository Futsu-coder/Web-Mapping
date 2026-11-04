import { useEffect } from "react";
import { FILTERS, type GeomType, type Item } from "../lib/types";

const BADGE_COLOR: Record<GeomType, string> = {
  Point: "bg-blue-600",
  LineString: "bg-green-600",
  Polygon: "bg-amber-600",
};

export default function FeaturePanel({
  items,
  filter,
  onFilterChange,
  hoveredId,
  onHover,
  onFocus,
  onRename,
  onRemove,
  open,
}: {
  items: Item[];
  filter: GeomType | "All";
  onFilterChange: (f: GeomType | "All") => void;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onFocus: (item: Item) => void;
  onRename: (item: Item) => void;
  onRemove: (item: Item) => void;
  open: boolean;
}) {
  // hover รูปบนแผนที่ → เลื่อนรายการนั้นให้เห็น
  useEffect(() => {
    if (hoveredId != null) document.getElementById(`feature-${hoveredId}`)?.scrollIntoView({ block: "nearest" });
  }, [hoveredId]);

  return (
    <div
      className={`absolute inset-y-0 right-0 z-20 w-80 sm:w-96 flex flex-col bg-white border-l border-slate-200 shadow-xl transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center px-3 py-2 border-b border-slate-200 shrink-0">
        <span className="text-sm font-semibold text-slate-900">{items.length} features</span>
      </div>

      <div className="flex gap-1 p-2 flex-wrap shrink-0 border-b border-slate-200">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              filter === f
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {items.length === 0 && (
          <li className="text-sm text-slate-500 px-2 py-4 text-center">
            ยังไม่มีข้อมูล — ใช้เครื่องมือซ้ายบนวาดบนแผนที่
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            id={`feature-${item.id}`}
            onClick={() => onFocus(item)}
            onMouseEnter={() => onHover(item.id)}
            onMouseLeave={() => onHover(null)}
            className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${
              hoveredId === item.id ? "bg-amber-50 border-amber-500" : "bg-white border-slate-200"
            }`}
          >
            <span className={`text-[11px] px-1.5 py-0.5 rounded text-white shrink-0 ${BADGE_COLOR[item.type]}`}>
              {item.type}
            </span>
            <span className="flex-1 text-sm text-slate-800 truncate">{item.name}</span>
            <button
              type="button"
              title="เปลี่ยนชื่อ"
              aria-label="เปลี่ยนชื่อ"
              onClick={(e) => {
                e.stopPropagation();
                onRename(item);
              }}
              className="text-slate-500 hover:text-teal-700 text-base leading-none px-1"
            >
              ✎
            </button>
            <button
              type="button"
              title="ลบ"
              aria-label="ลบ"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item);
              }}
              className="text-red-700 hover:text-red-900 text-base leading-none px-1"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
