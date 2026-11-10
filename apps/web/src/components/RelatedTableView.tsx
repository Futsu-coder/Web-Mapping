import { useState } from "react";
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

  const inputCls =
    "w-full min-w-[7rem] px-1.5 py-0.5 bg-white border border-teal-600 rounded text-base md:text-sm text-slate-900 outline-none ring-2 ring-teal-600/20";
  const filterItem = featureId !== null ? itemOf(featureId) : undefined;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-slate-100 bg-teal-50/60 text-xs text-slate-700 shrink-0">
        <Rows3Icon className="size-[16px] shrink-0 text-teal-700" />
        {nameDraft !== null ? (
          <span className="relative">
            <input
              autoFocus
              value={nameDraft}
              maxLength={60}
              aria-label="ชื่อตารางย่อย"
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
              className="w-40 px-1.5 py-0.5 bg-white border border-teal-600 rounded text-base md:text-xs font-semibold text-slate-900 outline-none"
            />
            {nameError && (
              <span className="absolute left-0 top-full mt-1 z-20 px-2 py-1 rounded bg-red-50 border border-red-200 text-[11px] text-red-700 whitespace-nowrap">
                {nameError}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5">
            <strong>{table.name}</strong>
            {canManage && (
              <button
                type="button"
                title="เปลี่ยนชื่อตารางย่อย"
                aria-label="เปลี่ยนชื่อตารางย่อย"
                onClick={() => setNameDraft(table.name)}
                className="p-0.5 rounded flex text-slate-400 hover:bg-teal-100 hover:text-teal-700"
              >
                <PencilIcon className="size-[14px] shrink-0" />
              </button>
            )}
          </span>
        )}
        {featureId !== null && (
          <>
            <span className="text-slate-300">|</span>
            <FilterIcon className="size-[16px] shrink-0 text-teal-700" />
            เฉพาะ <strong>{filterItem?.props.name ?? "—"}</strong>
            <button type="button" onClick={onClearFilter} className="flex items-center gap-0.5 px-1.5 rounded text-teal-700 hover:bg-teal-100">
              <XIcon className="size-[14px] shrink-0" />
              ดูทุก feature
            </button>
          </>
        )}
        <span className="flex-1" />
        {months.length > 0 && (
          <label className="flex items-center gap-1 text-slate-600">
            <CalendarIcon className="size-[16px] shrink-0 text-teal-700" />
            <select
              value={activeMonth ?? ""}
              aria-label="กรองตามเดือน"
              onChange={(e) => setMonth(e.target.value || null)}
              className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-base md:text-xs text-slate-800"
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
          <button
            type="button"
            disabled={!!draft}
            onClick={() => (table.fields.length ? setDraft({}) : setError(NO_COLUMN_MESSAGE))}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-40"
          >
            <PlusIcon className="size-[16px] shrink-0" />
            เพิ่มแถว
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-1.5 px-3 py-1 border-b border-red-200 bg-red-50 text-xs text-red-800 shrink-0">
          <CircleAlertIcon className="size-[16px] shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setError(null)} className="p-0.5 rounded flex hover:bg-red-100">
            <XIcon className="size-[14px] shrink-0" />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-10 px-2 py-1.5 text-[11px] font-semibold text-slate-400 text-right border-b border-slate-200">#</th>
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
              <th className="w-full px-2 py-1 border-b border-slate-200 text-left">
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
                <td colSpan={table.fields.length + 4} className="px-3 py-6 text-center text-sm text-slate-500">
                  {activeMonth
                    ? `ไม่มีข้อมูลในเดือน ${formatMonth(activeMonth)}`
                    : table.fields.length === 0
                    ? 'ยังไม่มีคอลัมน์ — กดปุ่ม + ที่หัวตารางเพื่อเพิ่มคอลัมน์ เช่น "ชนิดปลา", "จำนวน"'
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
                  className={hoveredId === r.featureId ? "bg-amber-50" : "hover:bg-slate-50"}
                >
                  <td className="px-2 py-1.5 text-[11px] text-slate-400 text-right border-b border-slate-100">{n + 1}</td>
                  <td className="px-3 py-1.5 border-b border-slate-100 whitespace-nowrap">
                    {item ? (
                      <button
                        type="button"
                        title="ซูมไปที่ feature นี้"
                        onClick={() => onFocus(item)}
                        className="font-medium text-teal-800 hover:underline"
                      >
                        {item.props.name}
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
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
                        className={`border-b border-slate-100 max-w-[16rem] truncate ${editing ? "px-2 py-1" : "px-3 py-1.5"} ${
                          f.type === "number" ? "text-right tabular-nums" : ""
                        }`}
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
                          text || <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    title={r.createdAt ? new Date(r.createdAt).toLocaleString("th-TH") : "แถวที่สร้างก่อนมีการเก็บวันที่"}
                    className="px-3 py-1.5 border-b border-slate-100 whitespace-nowrap text-xs text-slate-500 tabular-nums"
                  >
                    {formatDate(r.createdAt) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-1 border-b border-slate-100">
                    {canEditFeature(r.featureId) && (
                      <button
                        type="button"
                        aria-label="ลบแถว"
                        title="ลบแถว"
                        onClick={() => onDelete(r.id)}
                        className="p-0.5 rounded flex text-slate-400 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2Icon className="size-[16px] shrink-0" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {draft && filterItem && (
              <tr className="bg-teal-50/50">
                <td className="px-2 py-1 text-[11px] text-slate-400 text-right">+</td>
                <td className="px-3 py-1 font-medium text-slate-700 whitespace-nowrap">{filterItem.props.name}</td>
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
                <td className="px-3 py-1 text-xs text-slate-400 whitespace-nowrap">วันนี้</td>
                <td className="px-1">
                  <div className="flex">
                    <button type="button" aria-label="บันทึกแถว" onClick={(e) => commitDraft(e.currentTarget)} className="p-0.5 rounded flex text-teal-700 hover:bg-teal-100">
                      <CheckIcon className="size-[18px] shrink-0" />
                    </button>
                    <button type="button" aria-label="ยกเลิก" onClick={closeDraft} className="p-0.5 rounded flex text-slate-500 hover:bg-slate-100">
                      <XIcon className="size-[18px] shrink-0" />
                    </button>
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
