import { useState } from "react";
import {
  badInputLabel,
  badNumberMessage,
  EMPTY_ROW_MESSAGE,
  formatDate,
  formatValue,
  NO_COLUMN_MESSAGE,
  type FieldValues,
  type RelatedRecord,
  type RelatedTable,
} from "../lib/layers";
import AddColumn from "./AddColumn";
import FieldInput from "./FieldInput";
import { CheckIcon, CircleAlertIcon, PencilIcon, PlusIcon, Rows3Icon, Trash2Icon, XIcon } from "lucide-react";

export type RecordDraft = Omit<RelatedRecord, "id"> & { id?: number };

/** แถวที่กำลังแก้ (id = null คือแถวใหม่) */
type Editing = { tableId: number; id: number | null; values: FieldValues };

/**
 * ตารางย่อยของ feature หนึ่ง (อยู่ในฟอร์มรายละเอียด) — เพิ่ม/แก้/ลบแถวแล้วบันทึกทันที ไม่ต้องกด Save ของ feature
 * อยู่ใน <form> ของ feature → Enter ในช่องกรอกต้องกันไม่ให้ไป submit ฟอร์ม feature
 */
export default function RelatedRecords({
  tables,
  records,
  featureId,
  canEdit,
  onSave,
  onDelete,
  onCreateTable,
  onUpdateTable,
}: {
  /** เพิ่มคอลัมน์ให้ตารางย่อย (ตารางที่ยังไม่มีคอลัมน์) */
  onUpdateTable?: (table: RelatedTable) => void;
  /** ตารางย่อยของ layer ที่ feature นี้อยู่ */
  tables: RelatedTable[];
  /** แถวของ feature นี้ (ทุกตาราง) */
  records: RelatedRecord[];
  /** null = feature ยังไม่ได้บันทึก (เพิ่งวาด) */
  featureId: number | null;
  canEdit: boolean;
  onSave: (record: RecordDraft) => void;
  onDelete: (id: number) => void;
  onCreateTable?: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  // ข้อความแจ้งเตือนของตาราง (ช่องตัวเลขที่พิมพ์ผิดตรวจจาก DOM ของแถวที่ส่งมากับ event ตอนบันทึก)
  const [error, setError] = useState<{ tableId: number; message: string } | null>(null);

  const startEdit = (next: Editing | null) => {
    setEditing(next);
    setError(null);
  };

  if (!tables.length) {
    if (!canEdit || !onCreateTable) return null;
    return (
      <button
        type="button"
        onClick={onCreateTable}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-teal-600 hover:text-teal-700"
      >
        <Rows3Icon className="size-[16px] shrink-0" />
        สร้างตารางย่อย (เช่น ปลาที่พบ) ให้ layer นี้
      </button>
    );
  }

  /** บันทึกแถว — กรอกผิด/ว่าง = แจ้งเตือนและยังไม่ปิดแถว (ข้อมูลที่กรอกไว้ไม่หาย) */
  const commit = (el: Element) => {
    if (!editing || featureId === null) return;
    const wrong = badInputLabel(el.closest("tr"));
    if (wrong !== null) return setError({ tableId: editing.tableId, message: badNumberMessage(wrong) });
    if (!Object.keys(editing.values).length) return setError({ tableId: editing.tableId, message: EMPTY_ROW_MESSAGE });
    onSave({ id: editing.id ?? undefined, tableId: editing.tableId, featureId, values: editing.values });
    startEdit(null);
  };

  const setValue = (key: string, v: FieldValues[string] | undefined) =>
    setEditing((e) => {
      if (!e) return e;
      const values = { ...e.values };
      if (v === undefined || v === "") delete values[key];
      else values[key] = v;
      return { ...e, values };
    });


  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(e.currentTarget);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      startEdit(null);
    }
  };

  const inputCls =
    "w-full min-w-[6rem] px-1.5 py-1 bg-white border border-teal-600 rounded text-base md:text-xs text-slate-900 outline-none";
  const iconBtn = "p-0.5 rounded flex items-center";

  return (
    <div className="space-y-3">
      {tables.map((table) => {
        const rows = records.filter((r) => r.tableId === table.id);
        const editRow = (id: number | null) => editing?.tableId === table.id && editing.id === id;
        const inputsRow = (id: number | null) => (
          <tr key={id ?? "new"} className="bg-teal-50/50">
            {table.fields.map((f, i) => (
              <td key={f.key} className="px-1 py-1">
                <FieldInput
                  field={f}
                  value={editing?.values[f.key]}
                  onChange={(v) => {
                    setValue(f.key, v);
                    setError(null);
                  }}
                  className={inputCls}
                  autoFocus={i === 0}
                  onKeyDown={onKeyDown}
                />
              </td>
            ))}
            <td className="px-2 py-1 whitespace-nowrap text-slate-400">
              {id === null ? "วันนี้" : formatDate(records.find((r) => r.id === id)?.createdAt)}
            </td>
            <td className="px-1 py-1">
              <div className="flex">
                <button type="button" aria-label="บันทึกแถว" onClick={(e) => commit(e.currentTarget)} className={`${iconBtn} text-teal-700 hover:bg-teal-100`}>
                  <CheckIcon className="size-[18px] shrink-0" />
                </button>
                <button type="button" aria-label="ยกเลิก" onClick={() => startEdit(null)} className={`${iconBtn} text-slate-500 hover:bg-slate-100`}>
                  <XIcon className="size-[18px] shrink-0" />
                </button>
              </div>
            </td>
          </tr>
        );
        return (
          <div key={table.id} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Rows3Icon className="size-[16px] shrink-0 text-teal-700" />
              <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">
                {table.name} <span className="font-normal text-slate-400">({rows.length} แถว)</span>
              </span>
              {canEdit && featureId !== null && (
                <button
                  type="button"
                  disabled={!!editing}
                  onClick={() =>
                    table.fields.length
                      ? startEdit({ tableId: table.id, id: null, values: {} })
                      : setError({ tableId: table.id, message: NO_COLUMN_MESSAGE })
                  }
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-40"
                >
                  <PlusIcon className="size-[16px] shrink-0" />
                  เพิ่มแถว
                </button>
              )}
            </div>
            {featureId === null ? (
              <p className="text-[11px] text-slate-400">บันทึก feature ก่อน แล้วจึงเพิ่มข้อมูลในตารางนี้ได้</p>
            ) : table.fields.length === 0 ? (
              // ยังไม่มีคอลัมน์ → เพิ่มคอลัมน์ได้ตรงนี้เลย (ไม่ต้องไป Attribute table)
              <div className="flex items-center justify-between gap-2 px-2 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                <span>ยังไม่มีคอลัมน์</span>
                {canEdit && onUpdateTable && (
                  <AddColumn
                    text="เพิ่มคอลัมน์"
                    taken={["วันที่"]}
                    onAdd={(field) => {
                      onUpdateTable({ ...table, fields: [field] });
                      setError(null);
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {table.fields.map((f) => (
                        <th key={f.key} className="px-2 py-1 text-left font-semibold text-slate-600 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-left font-semibold text-slate-600 whitespace-nowrap">วันที่</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && !editRow(null) && (
                      <tr>
                        <td colSpan={table.fields.length + 2} className="px-2 py-2 text-center text-slate-400">
                          {table.fields.length ? "ยังไม่มีข้อมูล" : "ยังไม่มีคอลัมน์ — เพิ่มได้ในตารางย่อยของ Attribute table"}
                        </td>
                      </tr>
                    )}
                    {rows.map((r) =>
                      editRow(r.id) ? (
                        inputsRow(r.id)
                      ) : (
                        <tr key={r.id} className="border-t border-slate-100">
                          {table.fields.map((f) => {
                            const text = formatValue(f, r.values[f.key]);
                            return (
                              <td key={f.key} className={`px-2 py-1 whitespace-nowrap ${f.type === "number" ? "text-right tabular-nums" : ""}`}>
                                {text || <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })}
                          <td
                            title={r.createdAt ? new Date(r.createdAt).toLocaleString("th-TH") : undefined}
                            className="px-2 py-1 whitespace-nowrap text-slate-500"
                          >
                            {formatDate(r.createdAt) || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-1 py-1">
                            {canEdit && (
                              <div className="flex">
                                <button
                                  type="button"
                                  aria-label="แก้แถว"
                                  disabled={!!editing}
                                  onClick={() => startEdit({ tableId: table.id, id: r.id, values: { ...r.values } })}
                                  className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-teal-700 disabled:opacity-30`}
                                >
                                  <PencilIcon className="size-[16px] shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="ลบแถว"
                                  disabled={!!editing}
                                  onClick={() => onDelete(r.id)}
                                  className={`${iconBtn} text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-30`}
                                >
                                  <Trash2Icon className="size-[16px] shrink-0" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                    {editRow(null) && inputsRow(null)}
                  </tbody>
                </table>
              </div>
            )}
            {error?.tableId === table.id && (
              <p role="alert" className="flex items-start gap-1 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                <CircleAlertIcon className="size-[14px] shrink-0" />
                {error.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
