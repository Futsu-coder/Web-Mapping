import { useEffect, useRef, useState, type ReactNode } from "react";
import { CATEGORY_STYLE } from "../lib/categories";
import { useMediaQuery } from "../lib/useMediaQuery";
import { FILTERS, type GeomType, type Item } from "../lib/types";
import SidebarToggleIcon from "./SidebarToggleIcon";

const BADGE_COLOR: Record<GeomType, string> = {
  Point: "bg-blue-600",
  LineString: "bg-green-600",
  Polygon: "bg-amber-600",
};

function RowButton({
  title,
  icon,
  className,
  onClick,
}: {
  title: string;
  icon: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation(); // ไม่ให้ไปเข้า onClick ของแถว
        onClick();
      }}
      className={`p-1 rounded transition-colors flex items-center ${className}`}
    >
      <span className="material-symbols-outlined text-[17px]">{icon}</span>
    </button>
  );
}

export default function FeaturePanel({
  items,
  filter,
  onFilterChange,
  hoveredId,
  onHover,
  onFocus,
  onEdit,
  onToggleVisible,
  onRemove,
  selectedId,
  editingId,
  hiddenIds,
  canModify,
  showOwner,
  open,
  onToggle,
  editor,
}: {
  items: Item[];
  filter: GeomType | "All";
  onFilterChange: (f: GeomType | "All") => void;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onFocus: (item: Item) => void;
  onEdit: (item: Item) => void;
  onToggleVisible: (item: Item) => void;
  onRemove: (item: Item) => void;
  selectedId: number | null;
  /** feature ที่กำลังอยู่ในโหมดแก้ไข (ปุ่มปากกาไฮไลต์) */
  editingId: number | null;
  /** feature ที่ถูกซ่อนจากแผนที่ */
  hiddenIds: Set<number>;
  /** แก้/ลบได้ไหม (เจ้าของ feature หรือเจ้าของ group) — ไม่ได้ก็ซ่อนปุ่มปากกาและถังขยะ */
  canModify: (item: Item) => boolean;
  /** แสดงชื่อคนสร้าง (login แล้ว) */
  showOwner: boolean;
  open: boolean;
  /** ปุ่มเปิด/ปิดพาเนล (เกาะขอบซ้ายของพาเนล เลื่อนตามพาเนลเอง) */
  onToggle: () => void;
  /** ฟอร์ม Edit Feature Properties — แสดงครึ่งล่างของ panel เมื่อมี feature ที่เลือก/กำลังสร้าง */
  editor: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // จอเตี้ย (เช่น notebook ที่ scaling 150%): ตอนมีฟอร์มให้ยุบรายการอัตโนมัติ เพื่อให้ฟอร์มเห็นครบ — กดหัวรายการเพื่อสลับเอง
  const short = useMediaQuery("(max-height: 760px)");
  const hasEditor = !!editor;
  const [manual, setManual] = useState<{ forEditor: boolean; collapsed: boolean } | null>(null);
  const collapsed = manual && manual.forEditor === hasEditor ? manual.collapsed : hasEditor && short;

  // hover รูปบนแผนที่ → เลื่อนรายการนั้นให้เห็น
  // เลื่อนเฉพาะในรายการเอง ไม่ใช้ scrollIntoView เพราะมันเลื่อนกล่องแผนที่ด้านนอกด้วย
  // (ตอนปิด panel แค่เลื่อนออกนอกจอ → scrollIntoView ดึงกล่องแผนที่ให้ panel โผล่กลับมา)
  useEffect(() => {
    const list = listRef.current;
    if (!open || hoveredId == null || !list) return;
    const row = list.querySelector<HTMLElement>(`#feature-${hoveredId}`);
    if (!row) return;
    const top = row.offsetTop; // ul เป็น relative → offsetTop นับจากขอบบนของรายการ
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [hoveredId, open]);

  return (
    <div
      className={`absolute inset-y-0 right-0 z-20 w-[var(--panel-w)] flex flex-col bg-white border-l border-slate-200 shadow-xl transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <button
        type="button"
        title={open ? "ปิดพาเนลรายการ" : "เปิดพาเนลรายการ"}
        aria-label={open ? "ปิดพาเนลรายการ" : "เปิดพาเนลรายการ"}
        onClick={onToggle}
        className="absolute top-4 right-full mr-4 w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50"
      >
        <SidebarToggleIcon direction={open ? "right" : "left"} className="w-5 h-5" />
      </button>

      <div
        className={`flex flex-col min-h-0 ${
          !editor ? "flex-1" : collapsed ? "shrink-0 border-b border-slate-200" : "h-[clamp(8rem,40%,24rem)] border-b border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 shrink-0">
          <span className="text-sm font-semibold text-slate-900">{items.length} features</span>
          {editor && (
            <button
              type="button"
              title={collapsed ? "แสดงรายการ" : "ซ่อนรายการ"}
              aria-label={collapsed ? "แสดงรายการ" : "ซ่อนรายการ"}
              aria-expanded={!collapsed}
              onClick={() => setManual({ forEditor: hasEditor, collapsed: !collapsed })}
              className="p-0.5 rounded text-slate-500 hover:bg-slate-100 flex items-center"
            >
              <span className="material-symbols-outlined text-[20px]">{collapsed ? "expand_more" : "expand_less"}</span>
            </button>
          )}
        </div>

        <div className={`flex gap-1 p-2 flex-wrap shrink-0 border-b border-slate-200 ${collapsed ? "hidden" : ""}`}>
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

        <ul
          ref={listRef}
          className={`relative flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5 ${collapsed ? "hidden" : ""}`}
        >
          {items.length === 0 && (
            <li className="text-sm text-slate-500 px-2 py-4 text-center">
              ยังไม่มีข้อมูล — ใช้เครื่องมือซ้ายบนวาดบนแผนที่
            </li>
          )}
          {items.map((item) => {
            const selected = item.id === selectedId;
            const hidden = hiddenIds.has(item.id);
            const hovered = item.id === hoveredId;
            return (
              <li
                key={item.id}
                id={`feature-${item.id}`}
                onClick={() => onFocus(item)}
                onMouseEnter={() => onHover(item.id)}
                onMouseLeave={() => onHover(null)}
                className={`flex items-center gap-2 px-2.5 py-2 border rounded-lg cursor-pointer transition-colors ${
                  selected
                    ? `border-teal-600 border-l-4 ${hovered ? "bg-amber-50" : "bg-teal-50"}`
                    : hovered
                      ? "bg-amber-50 border-amber-500"
                      : "bg-white border-slate-200 hover:border-teal-600"
                } ${hidden ? "opacity-60" : ""}`}
              >
                <span className={`text-[11px] px-1.5 py-0.5 rounded text-white shrink-0 ${BADGE_COLOR[item.type]}`}>
                  {item.type}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{item.props.name}</span>
                  {showOwner && item.ownerName && (
                    <span className="block text-[11px] text-slate-400 truncate">โดย {item.ownerName}</span>
                  )}
                </span>
                {item.props.category && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_STYLE[item.props.category].badge}`}
                  >
                    {item.props.category}
                  </span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                  <RowButton
                    title={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}
                    icon={hidden ? "visibility_off" : "visibility"}
                    className={hidden ? "text-slate-400 hover:text-slate-600" : "text-teal-700 hover:bg-slate-100"}
                    onClick={() => onToggleVisible(item)}
                  />
                  {canModify(item) ? (
                    <>
                      <RowButton
                        title="แก้ไข"
                        icon="edit"
                        className={
                          item.id === editingId
                            ? "bg-teal-700 text-white"
                            : "text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                        }
                        onClick={() => onEdit(item)}
                      />
                      <RowButton
                        title="ลบ"
                        icon="delete"
                        className="text-slate-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => onRemove(item)}
                      />
                    </>
                  ) : (
                    <span
                      title="แก้ไขได้เฉพาะเจ้าของ feature หรือเจ้าของ group"
                      className="material-symbols-outlined text-[17px] text-slate-300 px-1"
                    >
                      lock
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {editor && <div className="flex-1 min-h-0">{editor}</div>}
    </div>
  );
}
