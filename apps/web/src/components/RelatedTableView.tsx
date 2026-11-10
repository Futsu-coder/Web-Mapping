import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  badInputLabel,
  badNumberMessage,
  EMPTY_ROW_MESSAGE,
  NO_COLUMN_MESSAGE,
  formatDate,
  formatMonth,
  formatValue,
  monthKey,
  newFieldKey,
  type FieldValue,
  type FieldValues,
  type LayerField,
  type RelatedRecord,
  type RelatedTable,
} from "../lib/layers";
import type { Item } from "../lib/types";
import AddColumn from "./AddColumn";
import FieldInput from "./FieldInput";
import HeaderCell from "./HeaderCell";
import type { RecordDraft } from "./RelatedRecords";
import { CalendarIcon, CheckIcon, CircleAlertIcon, FilterIcon, PencilIcon, PlusIcon, Rows3Icon, Trash2Icon, XIcon } from "lucide-react";

type Sort = { id: string; dir: 1 | -1 };

const compare = (a: FieldValue | undefined, b: FieldValue | undefined) => {
  if (a === undefined || a === "") return b === undefined || b === "" ? 0 : 1;
  if (b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th");
};

/**
 * มุมมองตารางย่อยใน attribute table: แถวของตารางย่อยรวมทุก feature ใน layer (หรือเฉพาะ feature เดียว)
 * ดับเบิลคลิกช่องเพื่อแก้, ลบแถวได้, เพิ่มแถวได้เมื่อกรองเฉพาะ feature (ต้องรู้ว่าแถวใหม่เป็นของ feature ไหน)
 */
export default function RelatedTableView({
  table,
  items,
  records,
  featureId,
  onClearFilter,
  onFocus,
  onHover,
  hoveredId,
  onSave,
  onDelete,
  onUpdateTable,
  takenTableNames,
  canManage,
  canEditFeature,
}: {
  /** จัดการโครงสร้างได้ (ชื่อตาราง / คอลัมน์) — โหมดทดลองหรือเจ้าของ group */
  canManage: boolean;
  /** เพิ่ม/แก้/ลบแถวของ feature นี้ได้ (สิทธิ์เดียวกับ feature) */
  canEditFeature: (featureId: number) => boolean;
  /** แก้ตารางย่อย: เปลี่ยนชื่อตาราง / เพิ่มคอลัมน์ / เปลี่ยนชื่อคอลัมน์ */
  onUpdateTable: (table: RelatedTable) => void;
  /** ชื่อตารางย่อยอื่นใน layer (ห้ามซ้ำ) */
  takenTableNames: string[];
  table: RelatedTable;
  /** feature ใน layer ของตารางนี้ */
  items: Item[];
  /** แถวของตารางนี้ (ทุก feature) */
  records: RelatedRecord[];
  /** กรองเฉพาะ feature นี้ (null = ทั้งหมด) */
  featureId: number | null;
  onClearFilter: () => void;
  onFocus: (item: Item) => void;
  onHover: (id: number | null) => void;
  hoveredId: number | null;
  onSave: (record: RecordDraft) => void;
  onDelete: (id: number) => void;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  // ช่องที่กำลังแก้ (record = null คือแถวใหม่ที่กำลังเพิ่ม)
  const [cell, setCell] = useState<{ record: number; key: string; value: FieldValue | undefined } | null>(null);
  const [draft, setDraft] = useState<FieldValues | null>(null);
  // กรองตามเดือนที่สร้างแถว ("YYYY-MM") — null = ทุกเดือน
  const [month, setMonth] = useState<string | null>(null);
  // แจ้งเตือนเมื่อกรอกผิด — ช่องตัวเลขที่พิมพ์ผิดตรวจจาก DOM ของช่อง/แถวที่ส่งมากับ event ตอนบันทึก
  const [error, setError] = useState<string | null>(null);
  // เปลี่ยนชื่อตารางย่อย
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const commitName = () => {
    if (nameDraft === null) return;
    const next = nameDraft.trim();
    if (next && next !== table.name) {
      if (takenTableNames.some((n) => n.toLowerCase() === next.toLowerCase())) return setNameError(`มีตาราง "${next}" แล้ว`);
      onUpdateTable({ ...table, name: next });
    }
    setNameDraft(null);
    setNameError(null);
  };

  const itemOf = (id: number) => items.find((i) => i.id === id);
  const byFeature = featureId === null ? records : records.filter((r) => r.featureId === featureId);
  // เดือนที่มีข้อมูล (ใหม่ → เก่า) สำหรับตัวกรอง
  const months = [...new Set(byFeature.flatMap((r) => (r.createdAt ? [monthKey(r.createdAt)] : [])))].sort().reverse();
  const activeMonth = month && months.includes(month) ? month : null;
  const filtered = activeMonth ? byFeature.filter((r) => r.createdAt && monthKey(r.createdAt) === activeMonth) : byFeature;
  const rows = [...filtered];
  if (sort) {
    rows.sort((a, b) => {
      const value = (r: RelatedRecord) =>
        sort.id === "feature" ? itemOf(r.featureId)?.props.name : sort.id === "createdAt" ? r.createdAt : r.values[sort.id];
      const va = value(a);
      const vb = value(b);
      return compare(va, vb) * sort.dir;
    });
  }

  const commitCell = (el: Element) => {
    if (!cell) return;
    const record = records.find((r) => r.id === cell.record);
    const wrong = badInputLabel(el.closest("td"));
    setCell(null);
    // พิมพ์ไม่เป็นตัวเลข → ไม่บันทึก คงค่าเดิมไว้ แล้วบอกผู้ใช้
    if (wrong !== null) return setError(`${badNumberMessage(wrong)} (ค่าเดิมยังอยู่)`);
    if (!record || record.values[cell.key] === cell.value) return;
    const values = { ...record.values };
    if (cell.value === undefined || cell.value === "") delete values[cell.key];
    else values[cell.key] = cell.value;
    onSave({ ...record, values });
  };

  /** บันทึกแถวใหม่ — กรอกผิด/ว่าง = แจ้งเตือนและยังไม่ปิดแถว (ข้อมูลที่กรอกไว้ไม่หาย) */
  const commitDraft = (el: Element) => {
    if (!draft || featureId === null) return;
    const wrong = badInputLabel(el.closest("tr"));
    if (wrong !== null) return setError(badNumberMessage(wrong));
    if (!Object.keys(draft).length) return setError(EMPTY_ROW_MESSAGE);
    onSave({ tableId: table.id, featureId, values: draft });
    closeDraft();
  };

  const closeDraft = () => {
    setDraft(null);
    setError(null);
  };

  const keys = (commit: (el: Element) => void, cancel: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit(e.currentTarget);
    if (e.key === "Escape") cancel();
  };

  // ช่องกรอกในตาราง (FieldInput ส่งต่อให้ input/select ดั้งเดิม) หน้าตาเหมือน Input ของ shadcn แบบเตี้ย
  const inputCls =
    "h-7 w-full min-w-[7rem] rounded-md border border-input bg-card px-1.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";
  const filterItem = featureId !== null ? itemOf(featureId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-3 py-1 text-xs">
        <Rows3Icon className="size-4 shrink-0 text-primary" />
        {nameDraft !== null ? (
          <span className="relative">
            <Input
              autoFocus
              value={nameDraft}
              maxLength={60}
              aria-label="ชื่อตารางย่อย"
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameError(null);
              }}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setNameDraft(null);
                  setNameError(null);
                }
              }}
              className="h-7 w-40 bg-card px-1.5 text-base font-semibold md:text-xs"
            />
            {nameError && (
              <span className="absolute top-full left-0 z-20 mt-1 rounded-md border bg-popover px-2 py-1 text-[0.6875rem] whitespace-nowrap text-destructive shadow-float">
                {nameError}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5">
            <strong>{table.name}</strong>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="เปลี่ยนชื่อตารางย่อย"
                aria-label="เปลี่ยนชื่อตารางย่อย"
                className="text-muted-foreground"
                onClick={() => setNameDraft(table.name)}
              >
                <PencilIcon />
              </Button>
            )}
          </span>
        )}
        {featureId !== null && (
          <>
            <span className="text-muted-foreground/50">|</span>
            <FilterIcon className="size-4 shrink-0 text-primary" />
            เฉพาะ <strong>{filterItem?.props.name ?? "—"}</strong>
            <Button type="button" variant="ghost" size="xs" className="h-6 text-primary hover:bg-primary/10 hover:text-primary" onClick={onClearFilter}>
              <XIcon />
              ดูทุก feature
            </Button>
          </>
        )}
        <span className="flex-1" />
        {months.length > 0 && (
          <label className="flex items-center gap-1 text-muted-foreground">
            <CalendarIcon className="size-4 shrink-0 text-primary" />
            <select
              value={activeMonth ?? ""}
              aria-label="กรองตามเดือน"
              onChange={(e) => setMonth(e.target.value || null)}
              className="h-7 rounded-md border border-input bg-card px-1.5 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-xs"
            >
              <option value="">ทุกเดือน</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        {featureId !== null && canEditFeature(featureId) && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!!draft}
            className="h-6 font-medium text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => (table.fields.length ? setDraft({}) : setError(NO_COLUMN_MESSAGE))}
          >
            <PlusIcon />
            เพิ่มแถว
          </Button>
        )}
      </div>
      {error && (
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
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="w-10 border-b px-2 py-1.5 text-right text-[0.6875rem] font-semibold text-muted-foreground">#</th>
              <HeaderCell
                label="Feature"
                sortDir={sort?.id === "feature" ? sort.dir : null}
                onSort={(dir) => setSort(dir ? { id: "feature", dir } : null)}
              />
              {table.fields.map((f) => (
                <HeaderCell
                  key={f.key}
                  label={f.label}
                  numeric={f.type === "number"}
                  sortDir={sort?.id === f.key ? sort.dir : null}
                  onSort={(dir) => setSort(dir ? { id: f.key, dir } : null)}
                  taken={["Feature", ...table.fields.filter((o) => o.key !== f.key).map((o) => o.label)]}
                  field={f}
                  {...(canManage && {
                    onRename: (label: string) =>
                      onUpdateTable({ ...table, fields: table.fields.map((o) => (o.key === f.key ? { ...o, label } : o)) }),
                    onChangeType: (type: LayerField["type"], options?: string[]) =>
                    onUpdateTable({
                      ...table,
                      // key ใหม่ = ค่าเดิมถูกล้าง, ถ้าเป็นหัวข้อที่ใช้นับสรุปอยู่ ให้นับจากหัวข้อใหม่แทน
                      ...(() => {
                        const key = newFieldKey();
                        return {
                          fields: table.fields.map((o) => (o.key === f.key ? { key, label: f.label, type, ...(options && { options }) } : o)),
                          countKey: table.countKey === f.key ? key : table.countKey,
                        };
                      })(),
                    }),
                    onDelete: () =>
                      onUpdateTable({
                        ...table,
                        fields: table.fields.filter((o) => o.key !== f.key),
                        countKey: table.countKey === f.key ? undefined : table.countKey,
                      }),
                  })}
                />
              ))}
              <HeaderCell
                label="วันที่สร้าง"
                sortDir={sort?.id === "createdAt" ? sort.dir : null}
                onSort={(dir) => setSort(dir ? { id: "createdAt", dir } : null)}
              />
              <th className="w-full border-b px-2 py-1 text-left">
                {canManage && (
                  <AddColumn
                    taken={["Feature", "วันที่สร้าง", ...table.fields.map((f) => f.label)]}
                    onAdd={(field) => onUpdateTable({ ...table, fields: [...table.fields, field] })}
                  />
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !draft && (
              <tr>
                <td colSpan={table.fields.length + 4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {activeMonth
                    ? `ไม่มีข้อมูลในเดือน ${formatMonth(activeMonth)}`
                    : table.fields.length === 0
                    ? canManage
                      ? 'ยังไม่มีคอลัมน์ — กดปุ่ม + ที่หัวตารางเพื่อเพิ่มคอลัมน์ เช่น "ชนิดปลา", "จำนวน"'
                      : "ยังไม่มีคอลัมน์ — ให้เจ้าของ group เพิ่มคอลัมน์ก่อน"
                    : featureId === null
                      ? `ยังไม่มีข้อมูลในตาราง "${table.name}" — คลิกตัวเลขในคอลัมน์สรุปของตารางหลัก แล้วกด "เพิ่มแถว"`
                      : 'ยังไม่มีข้อมูล — กด "เพิ่มแถว"'}
                </td>
              </tr>
            )}
            {rows.map((r, n) => {
              const item = itemOf(r.featureId);
              return (
                <tr
                  key={r.id}
                  onMouseEnter={() => onHover(r.featureId)}
                  onMouseLeave={() => onHover(null)}
                  className={hoveredId === r.featureId ? "bg-primary/10" : "hover:bg-muted/60"}
                >
                  <td className="border-b px-2 py-1.5 text-right text-[0.6875rem] text-muted-foreground">{n + 1}</td>
                  <td className="border-b px-3 py-1.5 whitespace-nowrap">
                    {item ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        title="ซูมไปที่ feature นี้"
                        className="h-auto p-0 text-sm font-medium"
                        onClick={() => onFocus(item)}
                      >
                        {item.props.name}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {table.fields.map((f) => {
                    const editing = cell?.record === r.id && cell.key === f.key;
                    const text = formatValue(f, r.values[f.key]);
                    return (
                      <td
                        key={f.key}
                        title={editing ? undefined : `${text}${text ? "\n" : ""}(ดับเบิลคลิกเพื่อแก้)`}
                        onDoubleClick={() =>
                          !editing && canEditFeature(r.featureId) && setCell({ record: r.id, key: f.key, value: r.values[f.key] })
                        }
                        className={cn(
                          "max-w-[16rem] truncate border-b",
                          editing ? "px-2 py-1" : "px-3 py-1.5",
                          f.type === "number" && "text-right tabular-nums",
                        )}
                      >
                        {editing ? (
                          <FieldInput
                            field={f}
                            value={cell.value}
                            onChange={(value) => setCell({ ...cell, value })}
                            className={inputCls}
                            autoFocus
                            onBlur={(e) => commitCell(e.currentTarget)}
                            onKeyDown={keys(commitCell, () => setCell(null))}
                          />
                        ) : (
                          text || <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    title={r.createdAt ? new Date(r.createdAt).toLocaleString("th-TH") : "แถวที่สร้างก่อนมีการเก็บวันที่"}
                    className="border-b px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                  >
                    {formatDate(r.createdAt) || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="border-b px-1">
                    {canEditFeature(r.featureId) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="ลบแถว"
                        title="ลบแถว"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onDelete(r.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {draft && filterItem && (
              <tr className="bg-primary/5">
                <td className="px-2 py-1 text-right text-[0.6875rem] text-muted-foreground">+</td>
                <td className="px-3 py-1 font-medium whitespace-nowrap">{filterItem.props.name}</td>
                {table.fields.map((f, i) => (
                  <td key={f.key} className="px-2 py-1">
                    <FieldInput
                      field={f}
                      value={draft[f.key]}
                      onChange={(v) =>
                        setDraft((d) => {
                          const next = { ...d };
                          if (v === undefined || v === "") delete next[f.key];
                          else next[f.key] = v;
                          return next;
                        })
                      }
                      className={inputCls}
                      autoFocus={i === 0}
                      onKeyDown={keys(commitDraft, closeDraft)}
                    />
                  </td>
                ))}
                <td className="px-3 py-1 text-xs whitespace-nowrap text-muted-foreground">วันนี้</td>
                <td className="px-1">
                  <div className="flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="บันทึกแถว"
                      className="text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={(e) => commitDraft(e.currentTarget)}
                    >
                      <CheckIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="ยกเลิก" className="text-muted-foreground" onClick={closeDraft}>
                      <XIcon />
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
