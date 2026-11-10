import type { FieldValue, LayerField } from "../lib/layers";

/**
 * ช่องกรอกค่าของ 1 หัวข้อตามชนิด: text → input, number → input ตัวเลข, choice → select, boolean → select ว่าง/ใช่/ไม่ใช่
 * ค่าว่าง = undefined (ยังไม่มีข้อมูล)
 */
export default function FieldInput({
  field,
  value,
  onChange,
  className,
  id,
  autoFocus,
  onKeyDown,
  onBlur,
}: {
  field: LayerField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue | undefined) => void;
  className: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
}) {
  const common = { id, autoFocus, onKeyDown, onBlur, "aria-label": field.label };
  if (field.type === "number") {
    return (
      <input
        {...common}
        type="number"
        step="any"
        inputMode="decimal"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          // พิมพ์ไม่เป็นตัวเลข (validity.badInput) ไม่เปลี่ยนค่า — ผู้ใช้เห็นกรอบแดง และตอนบันทึกตรวจด้วย badInputLabel
          if (!e.target.validity.badInput) onChange(e.target.value === "" ? undefined : Number(e.target.value));
        }}
        className={`${className} invalid:!border-destructive invalid:!ring-destructive/30`}
      />
    );
  }
  if (field.type === "choice" || field.type === "boolean") {
    const options = field.type === "choice" ? (field.options ?? []) : ["true", "false"];
    const current = value === undefined ? "" : String(value);
    return (
      <select
        {...common}
        value={current}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : field.type === "boolean" ? raw === "true" : raw);
        }}
        className={className}
      >
        <option value="">—</option>
        {/* ค่าเดิมที่ไม่อยู่ในตัวเลือกแล้ว (ถูกเอาออกจากหัวข้อ) ยังเลือกค้างไว้ได้ */}
        {field.type === "choice" && current && !options.includes(current) && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {field.type === "boolean" ? (o === "true" ? "ใช่" : "ไม่ใช่") : o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      {...common}
      type="text"
      maxLength={500}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
