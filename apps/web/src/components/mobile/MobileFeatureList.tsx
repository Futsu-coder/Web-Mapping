import { useState } from "react";
import { CATEGORY_STYLE } from "../../lib/categories";
import { layerSummary } from "../../lib/measure";
import { FILTERS, type GeomType, type Item } from "../../lib/types";

const TYPE_STYLE: Record<GeomType, { icon: string; box: string; dot: string }> = {
  Point: { icon: "radio_button_checked", box: "bg-orange-50 text-orange-500", dot: "bg-orange-500" },
  LineString: { icon: "polyline", box: "bg-blue-50 text-blue-600", dot: "bg-blue-600" },
  Polygon: { icon: "pentagon", box: "bg-emerald-50 text-emerald-500", dot: "bg-emerald-500" },
};

/** แท็บ All Features บนมือถือ: ช่องกรอง + chip ชนิด + การ์ด feature */
export default function MobileFeatureList({
  items,
  filter,
  onFilterChange,
  selectedId,
  hiddenIds,
  onFocus,
  onToggleVisible,
  onRemove,
}: {
  items: Item[];
  filter: GeomType | "All";
  onFilterChange: (f: GeomType | "All") => void;
  selectedId: number | null;
  hiddenIds: Set<number>;
  onFocus: (item: Item) => void;
  onToggleVisible: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const count = (f: GeomType | "All") => (f === "All" ? items.length : items.filter((i) => i.type === f).length);
  const shown = items.filter(
    (i) =>
      (filter === "All" || i.type === filter) &&
      (!q || i.props.name.toLowerCase().includes(q) || (i.props.category ?? "").toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 px-4 mb-3">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-[18px] text-slate-400">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or category…"
            aria-label="กรอง feature"
            className="w-full h-10 pl-9 pr-9 bg-slate-100 rounded-lg text-base text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-1 focus:ring-teal-700"
          />
          {query && (
            <button
              type="button"
              aria-label="ล้าง"
              onClick={() => setQuery("")}
              className="absolute right-2 w-6 h-6 flex items-center justify-center text-slate-400"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 mb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              filter === f ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f !== "All" && <span className={`w-2 h-2 rounded-full ${TYPE_STYLE[f].dot}`} />}
            {f}
            <span className="opacity-80 font-normal">({count(f)})</span>
          </button>
        ))}
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-2.5">
        {shown.length === 0 && (
          <li className="text-sm text-slate-500 py-6 text-center">
            {items.length === 0 ? "ยังไม่มีข้อมูล — เปิดเครื่องมือซ้ายบนแล้วเริ่มวาดบนแผนที่" : "ไม่พบ feature ที่ตรงกับตัวกรอง"}
          </li>
        )}
        {shown.map((item) => {
          const style = TYPE_STYLE[item.type];
          const selected = item.id === selectedId;
          const hidden = hiddenIds.has(item.id);
          return (
            <li
              key={item.id}
              onClick={() => onFocus(item)}
              className={`flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-colors ${
                selected ? "bg-teal-50 border-l-4 border-teal-700" : "bg-slate-50 active:bg-slate-100"
              } ${hidden ? "opacity-60" : ""}`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.box}`}>
                <span className="material-symbols-outlined text-[18px]">{style.icon}</span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-slate-900 truncate">{item.props.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{item.type}</span>
                  {item.props.category && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_STYLE[item.props.category].badge}`}>
                      {item.props.category}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">{layerSummary(item.layer)}</div>
              </div>
              <button
                type="button"
                aria-label={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisible(item);
                }}
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${hidden ? "text-slate-400" : "text-teal-700"}`}
              >
                <span className="material-symbols-outlined text-[20px]">{hidden ? "visibility_off" : "visibility"}</span>
              </button>
              <button
                type="button"
                aria-label="ลบ"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-red-600"
              >
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
