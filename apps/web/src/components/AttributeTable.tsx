import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FeatureProps } from "../api";
import {
  badNumberMessage,
  formatValue,
  GEOM_LABEL,
  newFieldKey,
  NO_LAYER_ID,
  type FieldValue,
  type Layer,
  type LayerField,
  type RelatedRecord,
  type RelatedTable,
  summarize,
} from "../lib/layers";
import { describeGeometry, geometrySize } from "../lib/measure";
import type { Item } from "../lib/types";
import type { RecordDraft } from "./RelatedRecords";
import AddColumn from "./AddColumn";
import HeaderCell from "./HeaderCell";
import RelatedTableView from "./RelatedTableView";
import { ChevronRightIcon, CircleAlertIcon, Rows3Icon, TableIcon, XIcon } from "lucide-react";

type Column = {
  id: string;
  label: string;
  /** ค่าที่ใช้เรียง (ว่าง = undefined อยู่ท้ายเสมอ) */
  sortValue: (i: Item) => string | number | boolean | undefined;
  render: (i: Item) => string;
  numeric?: boolean;
  /** คอลัมน์ของหัวข้อใน layer → เปลี่ยนชื่อได้จากหัวตาราง */
  field?: LayerField;
  /** คอลัมน์สรุปจากตารางย่อย (ระบบนับเอง) — คลิกตัวเลขเพื่อเปิดตารางย่อยของ feature นั้น */
  computed?: boolean;
  relatedTableId?: number;
  /** แก้ในตารางได้: ค่าเริ่มต้นในช่องแก้ + แปลงข้อความที่กรอกกลับเป็น props ใหม่ (คืน null = ค่าไม่ถูกต้อง) */
  edit?: {
    field?: LayerField;
    raw: (i: Item) => string;
    apply: (i: Item, raw: string) => FeatureProps | null;
  };
};

type Sort = { id: string; dir: 1 | -1 };

/** ช่องแก้ค่าแบบ select ดั้งเดิม (ใช้ใน cell ที่ blur แล้วบันทึก — Select ของ shadcn เปิด popover แล้ว blur ทันที) หน้าตาเหมือน Input */
const CELL_SELECT =
  "h-7 w-full min-w-[8rem] rounded-md border border-input bg-card px-1.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

/** แปลงข้อความที่กรอกในตารางเป็นค่าตามชนิดหัวข้อ — ว่าง = undefined (ลบค่า) */
function parseValue(field: LayerField, raw: string): FieldValue | undefined | null {
  const t = raw.trim();
  if (!t) return undefined;
  if (field.type === "number") return Number.isFinite(Number(t)) ? Number(t) : null;
  if (field.type === "boolean") return t === "true";
  return t;
}

const withValue = (i: Item, key: string, v: FieldValue | undefined): FeatureProps => {
  const values = { ...i.props.values };
  if (v === undefined) delete values[key];
  else values[key] = v;
  return { ...i.props, values: Object.keys(values).length ? values : undefined };
};

const compare = (a: string | number | boolean | undefined, b: string | number | boolean | undefined) => {
  if (a === undefined || a === "") return b === undefined || b === "" ? 0 : 1;
  if (b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th");
};

/** แท็บ "ไม่มี layer": feature ที่ยังไม่ได้จัดเข้า layer (แก้ได้แค่ชื่อ/คำอธิบาย ไม่มีคอลัมน์ของ layer) */
const NO_LAYER: Layer = { id: NO_LAYER_ID, name: "ไม่มี layer", geomType: "Point", color: "", fields: [] };

const nameEdit: Column["edit"] = {
  raw: (i) => i.props.name,
  apply: (i, raw) => (raw.trim() ? { ...i.props, name: raw.trim() } : null),
};
const descriptionEdit: Column["edit"] = {
  raw: (i) => i.props.description ?? "",
  apply: (i, raw) => ({ ...i.props, description: raw.trim() || undefined }),
};

/**
 * Attribute table: ตารางของ layer หนึ่ง — 1 แถว = 1 feature, 1 คอลัมน์ = 1 property
 * จอคอม = แผ่นด้านล่างแผนที่ / มือถือ = เต็มพื้นที่แผนที่ เลื่อนแนวนอนได้
 */
export default function AttributeTable({
  layers,
  items,
  layerId,
  onLayerChange,
  onClose,
  onFocus,
  onHover,
  hoveredId,
  selectedId,
  hiddenIds,
  editingId,
  onEdit,
  onAddField,
  onRenameField,
  tables,
  records,
  onSaveRecord,
  onDeleteRecord,
  onAddTable,
  onUpdateTable,
  onUpdateLayer,
  onConvertField,
  canManage,
  canModify,
  variant = "desktop",
  style,
}: {
  /** จัดการโครงสร้างได้ (เพิ่ม/เปลี่ยนชื่อ/ลบคอลัมน์, ตารางย่อย) — โหมดทดลองหรือเจ้าของ group */
  canManage: boolean;
  /** แก้ค่าของ feature นี้ได้ (เจ้าของ feature หรือเจ้าของ group) */
  canModify: (item: Item) => boolean;
  /** feature ที่เปิดแก้ในฟอร์มอยู่ — แก้ในตารางไม่ได้ (กันค่าชนกัน) */
  editingId: number | null;
  /** แก้ค่าในตาราง (ดับเบิลคลิกช่อง) → props ใหม่ทั้งชุด */
  onEdit: (item: Item, props: FeatureProps) => void;
  /** เพิ่มคอลัมน์ใหม่ให้ layer */
  onAddField: (layer: Layer, field: LayerField) => void;
  /** เปลี่ยนชื่อหัวข้อ (key เดิม ค่าไม่หาย) */
  onRenameField: (layer: Layer, key: string, label: string) => void;
  /** ตารางย่อยทั้งหมด + แถวทั้งหมด → คอลัมน์สรุปต่อ feature */
  tables: RelatedTable[];
  records: RelatedRecord[];
  onSaveRecord: (record: RecordDraft) => void;
  onDeleteRecord: (id: number) => void;
  /** สร้างตารางย่อยจากปุ่ม + (ยังไม่มีหัวข้อ — เพิ่มต่อในมุมมองตารางย่อย) → คืนตารางที่สร้าง */
  onAddTable: (layer: Layer, name: string) => Promise<RelatedTable | undefined>;
  /** แก้ตารางย่อย (ชื่อตาราง / เพิ่มหรือเปลี่ยนชื่อคอลัมน์) */
  onUpdateTable: (table: RelatedTable) => void;
  /** แก้ layer (ลบ / เปลี่ยนชนิดหัวข้อ) */
  onUpdateLayer: (layer: Layer) => void;
  /** ย้ายหัวข้อไปเป็นตารางย่อย → คืนตารางที่สร้าง */
  onConvertField: (layer: Layer, field: LayerField) => Promise<RelatedTable | undefined>;
  layers: Layer[];
  items: Item[];
  /** layer ที่เปิดอยู่ (ไม่มี/ถูกลบไป = layer แรก, NO_LAYER_ID = แท็บ "ไม่มี layer") */
  layerId: number | null;
  onLayerChange: (id: number) => void;
  onClose: () => void;
  onFocus: (item: Item) => void;
  onHover: (id: number | null) => void;
  hoveredId: number | null;
  selectedId: number | null;
  hiddenIds: Set<number>;
  variant?: "desktop" | "mobile";
  style?: React.CSSProperties;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  // ช่องที่กำลังแก้ + ข้อความที่พิมพ์อยู่
  const [cell, setCell] = useState<{ id: number; col: string; draft: string } | null>(null);
  // แจ้งเตือนเมื่อกรอกผิดในตารางหลัก (ค่าที่ผิดไม่ถูกบันทึก)
  const [error, setError] = useState<string | null>(null);
  // feature ที่ไม่อยู่ใน layer (หรือ layer ถูกลบไปแล้ว) → แท็บ "ไม่มี layer"
  const noLayerItems = items.filter((i) => !layers.some((l) => l.id === i.props.layerId));
  const layer =
    layerId === NO_LAYER_ID && noLayerItems.length
      ? NO_LAYER
      : (layers.find((l) => l.id === layerId) ?? layers[0] ?? (noLayerItems.length ? NO_LAYER : undefined));
  const isNoLayer = layer === NO_LAYER;
  // ดูตารางย่อยแทนตารางหลัก (featureId = กรองเฉพาะ feature นั้น) — เปลี่ยน layer = กลับตารางหลัก
  const [view, setView] = useState<{ tableId: number; featureId: number | null } | null>(null);
  const layerTables = layer && !isNoLayer ? tables.filter((t) => t.layerId === layer.id) : [];
  const viewTable = view ? layerTables.find((t) => t.id === view.tableId) : undefined;
  const mobile = variant === "mobile";

  const columns: Column[] = isNoLayer
    ? [
        { id: "name", label: "ชื่อ", sortValue: (i) => i.props.name, render: (i) => i.props.name, edit: nameEdit },
        { id: "type", label: "ชนิด", sortValue: (i) => i.type, render: (i) => GEOM_LABEL[i.type] },
        { id: "description", label: "คำอธิบาย", sortValue: (i) => i.props.description, render: (i) => i.props.description ?? "", edit: descriptionEdit },
        {
          id: "size",
          label: "ขนาด",
          numeric: true,
          sortValue: (i) => geometrySize(i.geometry),
          render: (i) => describeGeometry(i.geometry).metric ?? "",
        },
      ]
    : layer
    ? [
        {
          id: "name",
          label: "ชื่อ",
          sortValue: (i) => i.props.name,
          render: (i) => i.props.name,
          edit: nameEdit,
        },
        ...layer.fields.map(
          (f): Column => ({
            id: f.key,
            label: f.label,
            field: f,
            numeric: f.type === "number",
            sortValue: (i) => i.props.values?.[f.key] as FieldValue | undefined,
            render: (i) => formatValue(f, i.props.values?.[f.key]),
            edit: {
              field: f,
              raw: (i) => (i.props.values?.[f.key] === undefined ? "" : String(i.props.values[f.key])),
              apply: (i, raw) => {
                const v = parseValue(f, raw);
                return v === null ? null : withValue(i, f.key, v);
              },
            },
          }),
        ),
        {
          id: "description",
          label: "คำอธิบาย",
          sortValue: (i) => i.props.description,
          render: (i) => i.props.description ?? "",
          edit: descriptionEdit,
        },
        ...tables
          .filter((t) => t.layerId === layer.id)
          .map(
            (t): Column => ({
              id: `rt-${t.id}`,
              label: t.countKey ? `${t.name} (${t.fields.find((f) => f.key === t.countKey)?.label ?? ""}ไม่ซ้ำ)` : `${t.name} (แถว)`,
              numeric: true,
              computed: true,
              relatedTableId: t.id,
              sortValue: (i) => summarize(t, records, i.id),
              render: (i) => String(summarize(t, records, i.id)),
            }),
          ),
        ...(layer.geomType === "Point"
          ? []
          : [
              {
                id: "size",
                label: layer.geomType === "Polygon" ? "พื้นที่" : "ความยาว",
                numeric: true,
                sortValue: (i: Item) => geometrySize(i.geometry),
                render: (i: Item) => describeGeometry(i.geometry).metric ?? "",
              },
            ]),
      ]
    : [];

  const rows = isNoLayer ? [...noLayerItems] : layer ? items.filter((i) => i.props.layerId === layer.id) : [];
  const sortCol = sort && columns.find((c) => c.id === sort.id);
  if (sort && sortCol) rows.sort((a, b) => compare(sortCol.sortValue(a), sortCol.sortValue(b)) * sort.dir);

  /** คำสั่งในเมนูหัวคอลัมน์ของหัวข้อ layer */
  const fieldActions = (f: LayerField) => ({
    onRename: (label: string) => onRenameField(layer!, f.key, label),
    // key ใหม่ = ค่าเดิมถูกล้าง (ค่าเก่าอาจไม่ตรงชนิดใหม่)
    onChangeType: (type: LayerField["type"], options?: string[]) =>
      onUpdateLayer({
        ...layer!,
        fields: layer!.fields.map((o) => (o.key === f.key ? { key: newFieldKey(), label: f.label, type, ...(options && { options }) } : o)),
      }),
    onConvertToTable: () =>
      void onConvertField(layer!, f).then((t) => {
        if (t) setView({ tableId: t.id, featureId: null });
      }),
    onDelete: () => onUpdateLayer({ ...layer!, fields: layer!.fields.filter((o) => o.key !== f.key) }),
  });

  /** el = ช่องกรอก — พิมพ์ไม่เป็นตัวเลขตรวจจาก validity.badInput เพราะค่าที่ได้เป็น "" เหมือนช่องว่าง */
  const commit = (el: Element) => {
    if (!cell) return;
    const item = rows.find((i) => i.id === cell.id);
    const col = columns.find((c) => c.id === cell.col);
    setCell(null);
    if (!item || !col?.edit) return;
    if (el instanceof HTMLInputElement && el.validity.badInput) return setError(`${badNumberMessage(col.label)} (ค่าเดิมยังอยู่)`);
    const next = col.edit.apply(item, cell.draft);
    if (!next) {
      return setError(col.id === "name" ? "ชื่อต้องไม่ว่าง (ค่าเดิมยังอยู่)" : `${badNumberMessage(col.label)} (ค่าเดิมยังอยู่)`);
    }
    setError(null);
    if (JSON.stringify(next) !== JSON.stringify(item.props)) onEdit(item, next);
  };

  const editor = (col: Column) => {
    const field = col.edit?.field;
    const common = {
      autoFocus: true,
      value: cell!.draft,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onBlur: (e: React.FocusEvent) => commit(e.currentTarget),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter") commit(e.currentTarget);
        if (e.key === "Escape") setCell(null);
      },
    };
    if (field?.type === "choice" || field?.type === "boolean") {
      const options = field.type === "choice" ? (field.options ?? []) : ["true", "false"];
      return (
        <select {...common} className={CELL_SELECT} onChange={(e) => setCell({ ...cell!, draft: e.target.value })}>
          <option value="">—</option>
          {field.type === "choice" && cell!.draft && !options.includes(cell!.draft) && <option value={cell!.draft}>{cell!.draft}</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {field.type === "boolean" ? (o === "true" ? "ใช่" : "ไม่ใช่") : o}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Input
        {...common}
        type={field?.type === "number" ? "number" : "text"}
        step="any"
        onChange={(e) => setCell({ ...cell!, draft: e.target.value })}
        className="h-7 min-w-[8rem] bg-card px-1.5 invalid:border-destructive invalid:ring-destructive/30"
      />
    );
  };

  return (
    <div
      data-attribute-table
      style={style}
      className={cn(
        "absolute z-30 flex flex-col bg-card text-card-foreground",
        mobile
          ? "inset-0"
          : "inset-x-0 bottom-0 h-[min(40%,20rem)] rounded-t-2xl border-t border-black/5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <TableIcon className="size-4" />
        </span>
        <span className="shrink-0 text-sm font-bold">Attribute table</span>
        {!mobile && <span className="shrink-0 text-xs text-muted-foreground">ดับเบิลคลิกช่องเพื่อแก้</span>}
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-0.5">
          {layers.map((l) => (
            <Button
              key={l.id}
              type="button"
              size="xs"
              variant={l.id === layer?.id ? "default" : "outline"}
              aria-pressed={l.id === layer?.id}
              className="h-7 rounded-full px-3"
              onClick={() => {
                onLayerChange(l.id);
                setSort(null);
                setView(null);
              }}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
              <span className="opacity-70">({items.filter((i) => i.props.layerId === l.id).length})</span>
            </Button>
          ))}
          {noLayerItems.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant={isNoLayer ? "default" : "outline"}
              aria-pressed={isNoLayer}
              className="h-7 rounded-full px-3"
              onClick={() => {
                onLayerChange(NO_LAYER_ID);
                setSort(null);
                setView(null);
              }}
            >
              <span className="size-2 rounded-full border border-dashed border-current" />
              ไม่มี layer
              <span className="opacity-70">({noLayerItems.length})</span>
            </Button>
          )}
          {layerTables.length > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5 self-center" />
              <Button
                type="button"
                size="xs"
                variant={!viewTable ? "default" : "outline"}
                aria-pressed={!viewTable}
                className="h-7 px-3"
                onClick={() => setView(null)}
              >
                <TableIcon />
                ตารางหลัก
              </Button>
              {layerTables.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  size="xs"
                  variant={viewTable?.id === t.id ? "default" : "outline"}
                  aria-pressed={viewTable?.id === t.id}
                  className="h-7 px-3"
                  onClick={() => setView({ tableId: t.id, featureId: null })}
                >
                  <Rows3Icon />
                  {t.name}
                  <span className="opacity-70">({records.filter((r) => r.tableId === t.id).length})</span>
                </Button>
              ))}
            </>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="ปิดตาราง" title="ปิดตาราง" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      {error && !viewTable && (
        <Alert variant="destructive" className="shrink-0 rounded-none border-x-0 border-t-0 px-3 py-1.5">
          <CircleAlertIcon />
          <AlertDescription className="flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="ปิดการแจ้งเตือน" onClick={() => setError(null)}>
              <XIcon />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!layer ? (
        <p className="m-auto px-4 text-center text-sm text-muted-foreground">{canManage ? 'ยังไม่มี layer — สร้างจากปุ่ม "+ Layer" ในพาเนลรายการ' : "ยังไม่มี layer — เจ้าของ group เป็นคนสร้าง layer"}</p>
      ) : viewTable ? (
        <RelatedTableView
          key={viewTable.id}
          table={viewTable}
          items={items.filter((i) => i.props.layerId === layer.id)}
          records={records.filter((r) => r.tableId === viewTable.id)}
          featureId={view!.featureId}
          onClearFilter={() => setView({ tableId: viewTable.id, featureId: null })}
          onFocus={onFocus}
          onHover={onHover}
          hoveredId={hoveredId}
          onSave={onSaveRecord}
          onDelete={onDeleteRecord}
          onUpdateTable={onUpdateTable}
          canManage={canManage}
          canEditFeature={(id) => {
            const item = items.find((i) => i.id === id);
            return !!item && canModify(item);
          }}
          takenTableNames={layerTables.filter((t) => t.id !== viewTable.id).map((t) => t.name)}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="w-10 border-b px-2 py-1.5 text-right text-[0.6875rem] font-semibold text-muted-foreground">#</th>
                {columns.map((c) => (
                  <HeaderCell
                    key={c.id}
                    label={c.label}
                    numeric={c.numeric}
                    computed={c.computed}
                    sortDir={sort?.id === c.id ? sort.dir : null}
                    onSort={(dir) => setSort(dir ? { id: c.id, dir } : null)}
                    taken={columns.filter((o) => o.id !== c.id && !o.computed).map((o) => o.label)}
                    field={c.field}
                    {...(c.field && canManage && fieldActions(c.field))}
                  />
                ))}
                <th className="w-full border-b px-2 py-1 text-left">
                  {canManage && !isNoLayer && (
                    <AddColumn
                      taken={[...columns.filter((c) => !c.computed).map((c) => c.label), ...layerTables.map((t) => t.name)]}
                      onAdd={(f) => onAddField(layer, f)}
                      onAddTable={(name) =>
                        void onAddTable(layer, name).then((t) => {
                          if (t) setView({ tableId: t.id, featureId: null });
                        })
                      }
                    />
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    ยังไม่มี feature ใน layer นี้ — วาด {GEOM_LABEL[layer.geomType]} แล้วเลือก layer "{layer.name}"
                  </td>
                </tr>
              )}
              {rows.map((item, n) => {
                const active = item.id === selectedId || item.id === hoveredId;
                return (
                  <tr
                    key={item.id}
                    onClick={() => onFocus(item)}
                    onMouseEnter={() => onHover(item.id)}
                    onMouseLeave={() => onHover(null)}
                    className={cn(
                      "cursor-pointer",
                      active ? "bg-primary/10" : "hover:bg-muted/60",
                      hiddenIds.has(item.id) ? "text-muted-foreground/60" : "text-foreground",
                    )}
                  >
                    <td className="border-b px-2 py-1.5 text-right text-[0.6875rem] text-muted-foreground">{n + 1}</td>
                    {columns.map((c) => {
                      const text = c.render(item);
                      if (cell?.id === item.id && cell.col === c.id) {
                        return (
                          <td key={c.id} className="border-b px-2 py-1">
                            {editor(c)}
                          </td>
                        );
                      }
                      const editable = !!c.edit && item.id !== editingId && canModify(item);
                      return (
                        <td
                          key={c.id}
                          title={editable ? `${text}${text ? "\n" : ""}(ดับเบิลคลิกเพื่อแก้)` : text}
                          onDoubleClick={
                            editable
                              ? (e) => {
                                  e.stopPropagation();
                                  setCell({ id: item.id, col: c.id, draft: c.edit!.raw(item) });
                                  setError(null);
                                }
                              : undefined
                          }
                          className={cn(
                            "max-w-[16rem] truncate border-b px-3 py-1.5",
                            c.numeric && "text-right tabular-nums",
                            c.id === "name" && "font-medium",
                          )}
                        >
                          {c.relatedTableId !== undefined ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              title="เปิดตารางย่อยของ feature นี้"
                              onClick={(e) => {
                                e.stopPropagation(); // ไม่ซูมแผนที่ (onClick ของแถว)
                                setView({ tableId: c.relatedTableId!, featureId: item.id });
                              }}
                              className="h-5 gap-0.5 px-1.5 font-medium text-primary underline decoration-dotted underline-offset-2 hover:bg-primary/10 hover:text-primary"
                            >
                              {text}
                              <ChevronRightIcon />
                            </Button>
                          ) : (
                            text || <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
