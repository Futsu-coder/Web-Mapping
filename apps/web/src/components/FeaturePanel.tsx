import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MapIcon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GEOM_LABEL, type Layer } from "../lib/layers";
import type { GeomType, Item } from "../lib/types";
import GeomFilter from "./GeomFilter";

const TYPE_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

function RowButton({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      className={cn("size-8", danger && "text-muted-foreground hover:bg-red-50 hover:text-destructive")}
      onClick={(e) => {
        e.stopPropagation(); // ไม่ให้ไปเข้า onClick ของแถว
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

type RowHandlers = {
  onFocus: (item: Item) => void;
  onToggleVisible: (item: Item) => void;
  onRemove: (item: Item) => void;
  onHover: (id: number | null) => void;
};

/** แถวรายการ — memo: render ใหม่เฉพาะแถวที่ข้อมูล/สถานะเปลี่ยน (ไม่ใช่ทุกแถวทุกครั้งที่ App เปลี่ยน state) */
const FeatureRow = memo(function FeatureRow({
  item,
  layer,
  selected,
  hidden,
  hovered,
  modifiable,
  showOwner,
  h,
}: {
  item: Item;
  /** layer ของ feature นี้ (ไม่มี = ไม่อยู่ใน layer) — ใช้สีของ layer เป็นจุดหน้าชื่อ */
  layer: Layer | undefined;
  selected: boolean;
  hidden: boolean;
  hovered: boolean;
  modifiable: boolean;
  showOwner: boolean;
  h: RowHandlers;
}) {
  return (
    <li
      id={`feature-${item.id}`}
      onClick={() => h.onFocus(item)}
      onMouseEnter={() => h.onHover(item.id)}
      onMouseLeave={() => h.onHover(null)}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
        selected ? "bg-primary/10" : hovered ? "bg-muted" : "hover:bg-muted",
        hidden && "opacity-55",
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-full bg-zinc-500"
        style={layer ? { backgroundColor: layer.color } : undefined}
        title={layer?.name ?? "ไม่มี layer"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.props.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {TYPE_LABEL[item.type]}
          {showOwner && item.ownerName ? ` · โดย ${item.ownerName}` : ""}
        </span>
      </span>
      <div className="flex shrink-0 items-center">
        <RowButton title={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"} onClick={() => h.onToggleVisible(item)}>
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </RowButton>
        {modifiable ? (
          <RowButton title="ลบ" danger onClick={() => h.onRemove(item)}>
            <Trash2Icon />
          </RowButton>
        ) : (
          <span title="แก้ไขได้เฉพาะเจ้าของ feature หรือเจ้าของ group" className="px-2 text-muted-foreground/60">
            <LockIcon className="size-4" />
          </span>
        )}
      </div>
    </li>
  );
});

/**
 * การ์ดลอยซ้ายบน: โลโก้ + ค้นหา + ตัวกรอง + รายการ feature
 * ฟอร์มรายละเอียดแยกไปอยู่ DetailCard ด้านขวา
 */
export default function FeaturePanel({
  items,
  filter,
  onFilterChange,
  counts,
  hoveredId,
  onHover,
  onFocus,
  onToggleVisible,
  onRemove,
  selectedId,
  hiddenIds,
  canModify,
  showOwner,
  open,
  onToggle,
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
  /** จำนวน feature แต่ละชนิด (นับจากทั้งหมด) */
  counts: Record<GeomType | "All", number>;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onFocus: (item: Item) => void;
  onToggleVisible: (item: Item) => void;
  onRemove: (item: Item) => void;
  selectedId: number | null;
  /** feature ที่ถูกซ่อนจากแผนที่ */
  hiddenIds: Set<number>;
  /** แก้/ลบได้ไหม (เจ้าของ feature หรือเจ้าของ group) — ไม่ได้ก็ซ่อนปุ่มถังขยะ */
  canModify: (item: Item) => boolean;
  /** แสดงชื่อคนสร้าง (login แล้ว) */
  showOwner: boolean;
  open: boolean;
  /** ย่อ/ขยายการ์ด */
  onToggle: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // handler คงที่ตลอดอายุ component (อ่านตัวล่าสุดผ่าน ref) → FeatureRow ที่ memo ไว้ไม่ render ใหม่โดยไม่จำเป็น
  const latest = useRef<RowHandlers>({ onFocus, onToggleVisible, onRemove, onHover });
  useEffect(() => {
    latest.current = { onFocus, onToggleVisible, onRemove, onHover };
  });
  const [handlers] = useState<RowHandlers>(() => ({
    onFocus: (i) => latest.current.onFocus(i),
    onToggleVisible: (i) => latest.current.onToggleVisible(i),
    onRemove: (i) => latest.current.onRemove(i),
    onHover: (id) => latest.current.onHover(id),
  }));
  // layer ที่พับรายการไว้
  const [folded, setFolded] = useState<Set<number>>(new Set());

  // hover รูปบนแผนที่ → เลื่อนรายการนั้นให้เห็น
  // เลื่อนเฉพาะในรายการเอง ไม่ใช้ scrollIntoView เพราะมันเลื่อนกล่องแผนที่ด้านนอกด้วย
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

  const renderRow = (item: Item) => (
    <FeatureRow
      key={item.id}
      item={item}
      layer={layers?.find((l) => l.id === item.props.layerId)}
      selected={item.id === selectedId}
      hidden={hiddenIds.has(item.id)}
      hovered={item.id === hoveredId}
      modifiable={canModify(item)}
      showOwner={showOwner}
      h={handlers}
    />
  );
  // feature ที่ไม่มี layer (หรือ layer ถูกลบไปแล้ว)
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
      className="absolute top-4 left-4 z-20 flex max-h-[calc(100%-7.5rem)] w-[22rem] flex-col rounded-xl border border-black/5 bg-card shadow-float"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <MapIcon className="size-4" />
        </span>
        <span className="flex-1 text-[0.9375rem] font-bold">Web Mapping</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-expanded={open}
          aria-label={open ? "ย่อรายการ" : "ขยายรายการ"}
          onClick={onToggle}
        >
          {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>

      {/* ย่อการ์ด = ซ่อนส่วนเนื้อหา */}
      <div className={cn("flex min-h-0 flex-1 flex-col", !open && "hidden")}>
        <div className="shrink-0 px-3 pb-2">
          <GeomFilter value={filter} onChange={onFilterChange} counts={counts} />
        </div>

        <div className="flex shrink-0 items-center justify-between border-t px-4 pt-2 text-sm font-semibold">
          <span>รายการ</span>
          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
            {items.length} รายการ{layers && ` · ${layers.length} layer`}
            {onAddLayer && (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-0.5 px-2 text-xs text-primary" onClick={onAddLayer}>
                <PlusIcon className="size-3.5" />
                Layer
              </Button>
            )}
          </span>
        </div>

        <ul ref={listRef} className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {!layers && items.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล ใช้เครื่องมือด้านล่างวาดบนแผนที่</li>
          )}
          {layers ? (
            <>
              {layers.length === 0 && (
                <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {onAddLayer
                    ? 'ยังไม่มี layer — กด "+ Layer" เพื่อสร้างกลุ่ม feature เช่น โรงเรียน / แม่น้ำ'
                    : "ยังไม่มี layer — เจ้าของ group เป็นคนสร้าง layer (วาด feature แบบไม่มี layer ได้)"}
                </li>
              )}
              {filter !== "All" &&
                layers.length > 0 &&
                noLayer.length === 0 &&
                !layers.some((l) => l.geomType === filter) && (
                  <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                    ไม่มี {TYPE_LABEL[filter]} — เลือก "ทั้งหมด" เพื่อดูทุกชนิด
                  </li>
                )}
              {layers
                .filter((l) => filter === "All" || l.geomType === filter)
                .map((layer) => {
                  const members = items.filter((i) => i.props.layerId === layer.id);
                  const hidden = hiddenLayers?.has(layer.id) ?? false;
                  const isFolded = folded.has(layer.id);
                  return (
                    <li key={`layer-${layer.id}`} className="flex flex-col gap-0.5">
                      <div className={cn("flex items-center gap-1.5 rounded-lg bg-muted/60 px-1.5 py-1", hidden && "opacity-55")}>
                        <button
                          type="button"
                          aria-label={isFolded ? "กางรายการ" : "พับรายการ"}
                          aria-expanded={!isFolded}
                          onClick={() => toggleFold(layer.id)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          {isFolded ? (
                            <ChevronRightIcon className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronDownIcon className="size-4 text-muted-foreground" />
                          )}
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                          <span className="truncate text-sm font-semibold">{layer.name}</span>
                          <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                            {GEOM_LABEL[layer.geomType]} · {members.length}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center">
                          {onToggleLayer && (
                            <RowButton title={hidden ? "แสดง layer บนแผนที่" : "ซ่อน layer จากแผนที่"} onClick={() => onToggleLayer(layer)}>
                              {hidden ? <EyeOffIcon /> : <EyeIcon />}
                            </RowButton>
                          )}
                          {onOpenTable && (
                            <RowButton title="เปิดตาราง (Attribute table)" onClick={() => onOpenTable(layer)}>
                              <TableIcon />
                            </RowButton>
                          )}
                          {onEditLayer && (
                            <RowButton title="ตั้งค่า layer" onClick={() => onEditLayer(layer)}>
                              <SettingsIcon />
                            </RowButton>
                          )}
                        </div>
                      </div>
                      {!isFolded && (
                        <ul className="flex flex-col gap-0.5 pl-3">
                          {members.length === 0 && (
                            <li className="px-2 py-1 text-xs text-muted-foreground">
                              ยังไม่มี feature — วาด {GEOM_LABEL[layer.geomType]} แล้วเลือก layer นี้
                            </li>
                          )}
                          {members.map(renderRow)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              {noLayer.length > 0 && (
                <li className="flex flex-col gap-0.5">
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">ไม่มี layer</div>
                  <ul className="flex flex-col gap-0.5 pl-3">{noLayer.map(renderRow)}</ul>
                </li>
              )}
            </>
          ) : (
            items.map(renderRow)
          )}
        </ul>
      </div>
    </div>
  );
}
