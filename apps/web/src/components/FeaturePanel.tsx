import { useEffect, useRef, useState, type ReactNode } from "react";
import { GEOM_LABEL, type Layer } from "../lib/layers";
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
  layers,
  hiddenLayers,
  onToggleLayer,
  onEditLayer,
  onAddLayer,
  onOpenTable,
}: {
  /** layer ทั้งหมด: มี = จัดรายการเป็นกลุ่มตาม layer (+ กลุ่ม "ไม่มี layer") */
  layers?: Layer[];
  hiddenLayers?: Set<number>;
  onToggleLayer?: (layer: Layer) => void;
  onEditLayer?: (layer: Layer) => void;
  onAddLayer?: () => void;
  onOpenTable?: (layer: Layer) => void;
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
  // layer ที่พับรายการไว้
  const [folded, setFolded] = useState<Set<number>>(new Set());

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

  const renderRow = (item: Item) => {
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
  };
  const noLayer = layers ? items.filter((i) => !layers.some((l) => l.id === i.props.layerId)) : [];
  const toggleFold = (id: number) =>
    setFolded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      data-feature-panel
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
          <span className="text-sm font-semibold text-slate-900">
            {items.length} features
            {layers && <span className="font-normal text-slate-500"> · {layers.length} layers</span>}
          </span>
          {onAddLayer && (
            <button
              type="button"
              onClick={onAddLayer}
              className="ml-auto mr-1 flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium text-teal-700 hover:bg-teal-50"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Layer
            </button>
          )}
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
          {!layers && items.length === 0 && (
            <li className="text-sm text-slate-500 px-2 py-4 text-center">
              ยังไม่มีข้อมูล — ใช้เครื่องมือซ้ายบนวาดบนแผนที่
            </li>
          )}
          {layers ? (
            <>
              {layers.length === 0 && (
                <li className="text-sm text-slate-500 px-2 py-4 text-center">
                  ยังไม่มี layer — กด "+ Layer" เพื่อสร้างกลุ่ม feature เช่น โรงเรียน / แม่น้ำ
                </li>
              )}
              {layers
                .filter((l) => filter === "All" || l.geomType === filter)
                .map((layer) => {
                  const members = items.filter((i) => i.props.layerId === layer.id);
                  const hidden = hiddenLayers?.has(layer.id) ?? false;
                  const isFolded = folded.has(layer.id);
                  return (
                    <li key={`layer-${layer.id}`} className="space-y-1.5">
                      <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-slate-50 ${hidden ? "opacity-60" : ""}`}>
                        <button
                          type="button"
                          aria-label={isFolded ? "กางรายการ" : "พับรายการ"}
                          aria-expanded={!isFolded}
                          onClick={() => toggleFold(layer.id)}
                          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                        >
                          <span className="material-symbols-outlined text-[18px] text-slate-500">
                            {isFolded ? "chevron_right" : "expand_more"}
                          </span>
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                          <span className="text-sm font-semibold text-slate-800 truncate">{layer.name}</span>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            {GEOM_LABEL[layer.geomType]} · {members.length}
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {onToggleLayer && (
                            <RowButton
                              title={hidden ? "แสดง layer บนแผนที่" : "ซ่อน layer จากแผนที่"}
                              icon={hidden ? "visibility_off" : "visibility"}
                              className={hidden ? "text-slate-400 hover:text-slate-600" : "text-teal-700 hover:bg-slate-200"}
                              onClick={() => onToggleLayer(layer)}
                            />
                          )}
                          {onOpenTable && (
                            <RowButton
                              title="เปิดตาราง (Attribute table)"
                              icon="table_view"
                              className="text-slate-500 hover:bg-slate-200 hover:text-teal-700"
                              onClick={() => onOpenTable(layer)}
                            />
                          )}
                          {onEditLayer && (
                            <RowButton
                              title="ตั้งค่า layer"
                              icon="settings"
                              className="text-slate-500 hover:bg-slate-200 hover:text-teal-700"
                              onClick={() => onEditLayer(layer)}
                            />
                          )}
                        </div>
                      </div>
                      {!isFolded && (
                        <ul className="space-y-1.5 pl-3">
                          {members.length === 0 && (
                            <li className="text-xs text-slate-400 px-2 py-1">
                              ยังไม่มี feature — วาด {GEOM_LABEL[layer.geomType]} แล้วเลือก layer นี้
                            </li>
                          )}
                          {members.map(renderRow)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              {/* feature ที่สร้างก่อนมีระบบ layer (หรือ layer ไม่ตรงกับตัวกรอง) */}
              {noLayer.length > 0 && (
                <li className="space-y-1.5">
                  <div className="px-2 py-1 text-xs font-semibold text-slate-500">ไม่มี layer</div>
                  <ul className="space-y-1.5 pl-3">{noLayer.map(renderRow)}</ul>
                </li>
              )}
            </>
          ) : (
            items.map(renderRow)
          )}
        </ul>
      </div>

      {editor && <div className="flex-1 min-h-0">{editor}</div>}
    </div>
  );
}
