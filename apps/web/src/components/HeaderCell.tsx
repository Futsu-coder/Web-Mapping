import { useEffect, useRef, useState } from "react";
import { FIELD_TYPE_LABEL, type FieldType, type LayerField } from "../lib/layers";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronDownIcon, PencilIcon, Rows3Icon, ShapesIcon, SigmaIcon, Trash2Icon } from "lucide-react";

/** ฟอร์มย่อยในเมนูที่เปิดอยู่ */
type Panel = null | "rename" | "type" | "delete";

/**
 * หัวคอลัมน์ของตาราง: คลิกชื่อ = เมนู (เรียง / เปลี่ยนชื่อ / เปลี่ยนชนิด / แปลงเป็นตารางย่อย / ลบ)
 * เมนูแสดงเฉพาะคำสั่งที่ส่ง callback มา — คอลัมน์ระบบ (ชื่อ, ขนาด, คอลัมน์สรุป) มีแค่เรียง
 */
export default function HeaderCell({
  label,
  numeric,
  computed,
  sortDir,
  onSort,
  taken = [],
  field,
  onRename,
  onChangeType,
  onConvertToTable,
  onDelete,
}: {
  label: string;
  numeric?: boolean;
  /** คอลัมน์ที่ระบบนับให้ (แก้ไม่ได้) */
  computed?: boolean;
  sortDir: 1 | -1 | null;
  /** เลือกทิศทางการเรียง (null = ไม่เรียง) */
  onSort: (dir: 1 | -1 | null) => void;
  /** ชื่อที่ใช้ไม่ได้ตอนเปลี่ยนชื่อ (คอลัมน์อื่น) */
  taken?: string[];
  /** หัวข้อของคอลัมน์นี้ (ใช้แสดงชนิดปัจจุบัน) */
  field?: LayerField;
  onRename?: (label: string) => void;
  /** เปลี่ยนชนิด → ค่าเดิมของคอลัมน์ถูกล้าง */
  onChangeType?: (type: FieldType, options?: string[]) => void;
  /** ย้ายคอลัมน์นี้ไปเป็นตารางย่อย (ค่าเดิมกลายเป็นแถวแรกของแต่ละ feature) */
  onConvertToTable?: () => void;
  onDelete?: () => void;
}) {
  // ตำแหน่งเมนู (fixed ตามปุ่ม — ไม่ให้ถูกกล่องเลื่อนของตารางตัด) / null = ปิด
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const open = pos !== null;
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTableCellElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /** เปิดเมนูใต้ปุ่ม — ที่ว่างด้านล่างไม่พอ (ตารางอยู่ล่างจอ) เปิดขึ้นด้านบนแทน */
  const openMenu = (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - 248);
    setPos(
      window.innerHeight - r.bottom < 320
        ? { left, bottom: window.innerHeight - r.top + 4, maxHeight: r.top - 8 }
        : { left, top: r.bottom + 4, maxHeight: window.innerHeight - r.bottom - 8 },
    );
  };

  const close = () => {
    setPos(null);
    setPanel(null);
    setError(null);
  };

  // คลิกนอกเมนู / Esc / เลื่อนตาราง (เมนู fixed จะไม่ตามไป) = ปิด
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const rename = () => {
    const next = draft.trim();
    if (!next || next === label) return close();
    if (taken.some((l) => l.toLowerCase() === next.toLowerCase())) return setError(`มีคอลัมน์ "${next}" แล้ว`);
    onRename?.(next);
    close();
  };

  const changeType = () => {
    if (type === "choice") {
      const list = [...new Set(options.split(",").map((o) => o.trim()).filter(Boolean))];
      if (!list.length) return setError("ใส่ตัวเลือกอย่างน้อย 1 ค่า");
      onChangeType?.(type, list);
    } else {
      onChangeType?.(type);
    }
    close();
  };

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const item =
    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs font-normal text-slate-700 hover:bg-slate-100";
  const inputCls =
    "w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-base md:text-sm font-normal text-slate-900 focus:outline-none focus:border-teal-700";
  const hasEdit = !!(onRename || onChangeType || onConvertToTable || onDelete);

  return (
    <th
      ref={ref}
      className={`px-3 py-1.5 border-b border-slate-200 whitespace-nowrap ${numeric ? "text-right" : "text-left"} ${
        computed ? "bg-teal-50/60" : ""
      }`}
      title={computed ? "ระบบนับจากตารางย่อยให้เอง (แก้ไม่ได้) — คลิกตัวเลขเพื่อเปิดตารางย่อย" : undefined}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => (open ? close() : openMenu(e.currentTarget))}
        className={`inline-flex items-center gap-0.5 px-1 -mx-1 rounded text-xs font-semibold hover:bg-slate-200/70 ${
          open ? "bg-slate-200/70 text-slate-900" : "text-slate-600"
        }`}
      >
        {computed && <SigmaIcon className="size-[14px] shrink-0 text-teal-700" />}
        {label}
        {sortDir === 1 ? (
          <ArrowUpIcon className="size-[15px] shrink-0 text-slate-400" />
        ) : sortDir === -1 ? (
          <ArrowDownIcon className="size-[15px] shrink-0 text-slate-400" />
        ) : (
          <ChevronDownIcon className="size-[15px] shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={pos}
          className="fixed z-50 w-60 overflow-y-auto p-1 bg-white border border-slate-200 rounded-lg shadow-lg text-left whitespace-normal"
        >
          {panel === null && (
            <>
              <button type="button" role="menuitem" className={item} onClick={run(() => onSort(1))}>
                <ArrowUpIcon className="size-[16px] shrink-0 text-slate-500" />
                เรียงน้อย → มาก
              </button>
              <button type="button" role="menuitem" className={item} onClick={run(() => onSort(-1))}>
                <ArrowDownIcon className="size-[16px] shrink-0 text-slate-500" />
                เรียงมาก → น้อย
              </button>
              {sortDir !== null && (
                <button type="button" role="menuitem" className={item} onClick={run(() => onSort(null))}>
                  <ArrowUpDownIcon className="size-[16px] shrink-0 text-slate-500" />
                  เลิกเรียง
                </button>
              )}
              {hasEdit && <div className="h-px bg-slate-200 my-1" />}
              {onRename && (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setDraft(label);
                    setPanel("rename");
                  }}
                >
                  <PencilIcon className="size-[16px] shrink-0 text-slate-500" />
                  เปลี่ยนชื่อ
                </button>
              )}
              {onChangeType && (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setType(field?.type ?? "text");
                    setOptions(field?.options?.join(", ") ?? "");
                    setPanel("type");
                  }}
                >
                  <ShapesIcon className="size-[16px] shrink-0 text-slate-500" />
                  เปลี่ยนชนิด
                  {field && <span className="ml-auto text-[11px] text-slate-400">{FIELD_TYPE_LABEL[field.type]}</span>}
                </button>
              )}
              {onConvertToTable && (
                <button type="button" role="menuitem" className={item} onClick={run(onConvertToTable)}>
                  <Rows3Icon className="size-[16px] shrink-0 text-teal-700" />
                  <span>
                    แปลงเป็นตารางย่อย
                    <span className="block text-[11px] text-slate-400">หลายค่าต่อ feature — ค่าเดิมย้ายไปเป็นแถวแรก</span>
                  </span>
                </button>
              )}
              {onDelete && (
                <button type="button" role="menuitem" className={`${item} text-red-700 hover:bg-red-50`} onClick={() => setPanel("delete")}>
                  <Trash2Icon className="size-[16px] shrink-0" />
                  ลบคอลัมน์
                </button>
              )}
            </>
          )}

          {panel === "rename" && (
            <form
              className="p-1.5 space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
            >
              <input
                autoFocus
                value={draft}
                maxLength={60}
                aria-label="ชื่อคอลัมน์ใหม่"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                className={inputCls}
              />
              {error && <p className="text-[11px] font-normal text-red-700">{error}</p>}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setPanel(null)} className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100">
                  กลับ
                </button>
                <button type="submit" className="px-2.5 py-1 rounded-md text-xs font-medium bg-teal-700 text-white hover:bg-teal-800">
                  บันทึก
                </button>
              </div>
            </form>
          )}

          {panel === "type" && (
            <form
              className="p-1.5 space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                changeType();
              }}
            >
              <select autoFocus value={type} aria-label="ชนิดใหม่" onChange={(e) => setType(e.target.value as FieldType)} className={inputCls}>
                {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              {type === "choice" && (
                <input
                  value={options}
                  placeholder="ตัวเลือก คั่นด้วย ,"
                  aria-label="ตัวเลือก"
                  onChange={(e) => setOptions(e.target.value)}
                  className={inputCls}
                />
              )}
              <p className="text-[11px] font-normal text-amber-700">เปลี่ยนชนิด = ค่าเดิมในคอลัมน์นี้จะถูกล้าง</p>
              {error && <p className="text-[11px] font-normal text-red-700">{error}</p>}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setPanel(null)} className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100">
                  กลับ
                </button>
                <button type="submit" className="px-2.5 py-1 rounded-md text-xs font-medium bg-teal-700 text-white hover:bg-teal-800">
                  เปลี่ยน
                </button>
              </div>
            </form>
          )}

          {panel === "delete" && (
            <div className="p-1.5 space-y-1.5">
              <p className="text-xs font-normal text-slate-700">
                ลบคอลัมน์ "{label}" และค่าทั้งหมดในคอลัมน์นี้?
              </p>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setPanel(null)} className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100">
                  กลับ
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={run(() => onDelete?.())}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                >
                  ลบ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </th>
  );
}
