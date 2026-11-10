import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GEOM_LABEL, type Layer } from "../lib/layers";
import { FILTERS, type GeomType, type Item } from "../lib/types";

const FILTER_LABEL: Record<GeomType | "All", string> = {
  All: "ทั้งหมด",
  Point: "Point",
  LineString: "Line",
  Polygon: "Polygon",
};
const TYPE_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

function RowButton({
  title,
  active,
  danger,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "ghost"}
          size="icon"
          aria-label={title}
          className={cn("size-8", danger && "text-muted-foreground hover:bg-red-50 hover:text-destructive")}
          onClick={(e) => {
            e.stopPropagation(); // ไม่ให้ไปเข้า onClick ของแถว
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * การ์ดลอยซ้ายบน: โลโก้ + ค้นหา + ตัวกรอง + รายการ feature
 * ฟอร์มรายละเอียดแยกไปอยู่ DetailCard ด้านขวา
 */
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
  footer,
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
  /** ย่อ/ขยายการ์ด */
  onToggle: () => void;
  /** ท้ายการ์ด (แสดงแม้ย่อรายการ) เช่นแบนเนอร์โหมดทดลอง */
  footer?: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
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

  const renderRow = (item: Item) => {
    const selected = item.id === selectedId;
    const hidden = hiddenIds.has(item.id);
    const hovered = item.id === hoveredId;
    const layer = layers?.find((l) => l.id === item.props.layerId);
    return (
      <li
        key={item.id}
        id={`feature-${item.id}`}
        onClick={() => onFocus(item)}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
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
          <RowButton title={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"} onClick={() => onToggleVisible(item)}>
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </RowButton>
          {canModify(item) ? (
            <>
              <RowButton title="แก้ไข" active={item.id === editingId} onClick={() => onEdit(item)}>
                <PencilIcon />
              </RowButton>
              <RowButton title="ลบ" danger onClick={() => onRemove(item)}>
                <Trash2Icon />
              </RowButton>
            </>
          ) : (
            <span title="แก้ไขได้เฉพาะเจ้าของ feature หรือเจ้าของ group" className="px-2 text-muted-foreground/60">
              <LockIcon className="size-4" />
            </span>
          )}
        </div>
      </li>
    );
  };
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
        <span className="flex-1 text-[15px] font-bold">Web Mapping</span>
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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter}
            onValueChange={(v) => v && onFilterChange(v as GeomType | "All")}
            aria-label="กรองตามชนิด"
            className="flex-wrap justify-start gap-1"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem
                key={f}
                value={f}
                className="h-7 rounded-full px-3 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {FILTER_LABEL[f]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
                          <span className="shrink-0 text-[11px] text-muted-foreground">
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

      {footer && <div className="shrink-0 border-t p-2">{footer}</div>}
    </div>
  );
}
