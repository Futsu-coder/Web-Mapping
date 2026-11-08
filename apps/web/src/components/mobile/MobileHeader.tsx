import { useEffect, useRef, useState } from "react";

type Props = {
  /** drawing = Cancel/undo/redo/Next, form = Cancel/Done (กรอกข้อมูลหลังวาด) — โหมดปกติใช้ Navbar */
  mode: "drawing" | "form";
  formId: string;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onNext: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canNext: boolean;
};

function IconButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-sm active:scale-95 transition-all disabled:opacity-40"
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}

const cancelCls =
  "px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium text-[13px] shadow-sm active:scale-95 transition-all";
const primaryCls =
  "px-4 py-2 rounded-lg bg-teal-700 text-white font-semibold text-[13px] shadow-sm active:scale-95 transition-all ml-1 disabled:opacity-40";

export default function MobileHeader(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevMode, setPrevMode] = useState(p.mode);
  if (prevMode !== p.mode) {
    setPrevMode(p.mode);
    setMenuOpen(false);
  }
  const menuRef = useRef<HTMLDivElement>(null);

  // แตะนอกเมนู "..." = ปิดเมนู
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuOpen]);

  return (
    <header className="relative shrink-0 z-40 bg-white border-b border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.03)] pt-safe">
      {p.mode === "drawing" && (
        <div className="h-14 px-3 flex items-center justify-between gap-2">
          <button type="button" className={cancelCls} onClick={p.onCancel}>
            Cancel
          </button>
          <div ref={menuRef} className="relative flex items-center gap-1.5">
            <IconButton label="เมนูเพิ่มเติม" icon="more_horiz" onClick={() => setMenuOpen((o) => !o)} />
            <IconButton label="Undo" icon="undo" disabled={!p.canUndo} onClick={p.onUndo} />
            <IconButton label="Redo" icon="redo" disabled={!p.canRedo} onClick={p.onRedo} />
            <button type="button" className={primaryCls} disabled={!p.canNext} onClick={p.onNext}>
              Next
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-lg shadow-lg p-1 z-50">
                <button
                  type="button"
                  disabled={!p.canUndo}
                  onClick={() => {
                    p.onClear();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                  ล้างทุกจุด
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {p.mode === "form" && (
        <div className="h-14 px-3 flex items-center justify-between gap-2">
          <button type="button" className={cancelCls} onClick={p.onCancel}>
            Cancel
          </button>
          <button type="submit" form={p.formId} className={primaryCls}>
            Done
          </button>
        </div>
      )}
    </header>
  );
}
