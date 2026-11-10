import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed text-xs text-muted-foreground hover:border-primary hover:bg-transparent hover:text-primary"
        onClick={onCreateTable}
      >
        <Rows3Icon />
        สร้างตารางย่อย (เช่น ปลาที่พบ) ให้ layer นี้
      </Button>
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

  // ช่องกรอกในตารางย่อย (FieldInput ส่งต่อให้ input/select ดั้งเดิม) หน้าตาเหมือน Input ของ shadcn แบบเตี้ย
  const inputCls =
    "h-7 w-full min-w-[6rem] rounded-md border border-input bg-card px-1.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-xs";

  return (
    <div className="flex flex-col gap-3">
      {tables.map((table) => {
        const rows = records.filter((r) => r.tableId === table.id);
        const editRow = (id: number | null) => editing?.tableId === table.id && editing.id === id;
        const inputsRow = (id: number | null) => (
          <tr key={id ?? "new"} className="bg-primary/5">
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
            <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
              {id === null ? "วันนี้" : formatDate(records.find((r) => r.id === id)?.createdAt)}
            </td>
            <td className="px-1 py-1">
              <div className="flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="บันทึกแถว"
                  className="text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={(e) => commit(e.currentTarget)}
                >
                  <CheckIcon />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="ยกเลิก" className="text-muted-foreground" onClick={() => startEdit(null)}>
                  <XIcon />
                </Button>
              </div>
            </td>
          </tr>
        );
        return (
          <div key={table.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Rows3Icon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {table.name} <span className="font-normal text-muted-foreground">({rows.length} แถว)</span>
              </span>
              {canEdit && featureId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!!editing}
                  className="h-6 font-medium text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() =>
                    table.fields.length
                      ? startEdit({ tableId: table.id, id: null, values: {} })
                      : setError({ tableId: table.id, message: NO_COLUMN_MESSAGE })
                  }
                >
                  <PlusIcon />
                  เพิ่มแถว
                </Button>
              )}
            </div>
            {featureId === null ? (
              <p className="text-[0.6875rem] text-muted-foreground">บันทึก feature ก่อน แล้วจึงเพิ่มข้อมูลในตารางนี้ได้</p>
            ) : table.fields.length === 0 ? (
              // ยังไม่มีคอลัมน์ → เพิ่มคอลัมน์ได้ตรงนี้เลย (ไม่ต้องไป Attribute table)
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-2 py-2 text-xs text-muted-foreground">
                <span>{canEdit && onUpdateTable ? "ยังไม่มีคอลัมน์" : "ยังไม่มีคอลัมน์ — ให้เจ้าของ group เพิ่มคอลัมน์"}</span>
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
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {table.fields.map((f) => (
                        <th key={f.key} className="px-2 py-1 text-left font-semibold whitespace-nowrap text-muted-foreground">
                          {f.label}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-left font-semibold whitespace-nowrap text-muted-foreground">วันที่</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && !editRow(null) && (
                      <tr>
                        <td colSpan={table.fields.length + 2} className="px-2 py-2 text-center text-muted-foreground">
                          {table.fields.length ? "ยังไม่มีข้อมูล" : "ยังไม่มีคอลัมน์ — ให้เจ้าของ group เพิ่มคอลัมน์"}
                        </td>
                      </tr>
                    )}
                    {rows.map((r) =>
                      editRow(r.id) ? (
                        inputsRow(r.id)
                      ) : (
                        <tr key={r.id} className="border-t">
                          {table.fields.map((f) => {
                            const text = formatValue(f, r.values[f.key]);
                            return (
                              <td key={f.key} className={cn("px-2 py-1 whitespace-nowrap", f.type === "number" && "text-right tabular-nums")}>
                                {text || <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td
                            title={r.createdAt ? new Date(r.createdAt).toLocaleString("th-TH") : undefined}
                            className="px-2 py-1 whitespace-nowrap text-muted-foreground"
                          >
                            {formatDate(r.createdAt) || <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-1 py-1">
                            {canEdit && (
                              <div className="flex">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="แก้แถว"
                                  disabled={!!editing}
                                  className="text-muted-foreground hover:text-primary"
                                  onClick={() => startEdit({ tableId: table.id, id: r.id, values: { ...r.values } })}
                                >
                                  <PencilIcon />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="ลบแถว"
                                  disabled={!!editing}
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => onDelete(r.id)}
                                >
                                  <Trash2Icon />
                                </Button>
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
              <Alert variant="destructive" className="px-2 py-1.5 text-[0.6875rem]">
                <CircleAlertIcon />
                <AlertDescription className="text-[0.6875rem]">{error.message}</AlertDescription>
              </Alert>
            )}
          </div>
        );
      })}
    </div>
  );
}
