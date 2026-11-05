import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import SearchBox from "../SearchBox";

type Props = {
  /** idle = โลโก้ + ค้นหา, drawing = Cancel/undo/redo/Next, form = Cancel/Done (กรอกข้อมูลหลังวาด) */
  mode: "idle" | "drawing" | "form";
  mapRef: React.MutableRefObject<L.Map | null>;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevMode, setPrevMode] = useState(p.mode);
  if (prevMode !== p.mode) {
    setPrevMode(p.mode);
    setMenuOpen(false);
  }
  const searchRef = useRef<HTMLDivElement>(null);
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

  const toggleSearch = () => {
    const next = !searchOpen;
    setSearchOpen(next);
    if (next) requestAnimationFrame(() => searchRef.current?.querySelector("input")?.focus());
  };

  return (
    <header className="relative shrink-0 z-40 bg-white border-b border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.03)] pt-safe">
      {p.mode === "idle" && (
        <>
          <div className="h-14 px-4 flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-700 text-white shadow-sm shrink-0">
              <span className="material-symbols-outlined text-[22px]">map</span>
            </span>
            <span className="flex-1 min-w-0 font-semibold text-slate-900 tracking-tight truncate">Web Mapping</span>
            <button
              type="button"
              aria-label="ค้นหาสถานที่"
              title="ค้นหาสถานที่"
              aria-pressed={searchOpen}
              onClick={toggleSearch}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                searchOpen ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">{searchOpen ? "close" : "search"}</span>
            </button>
          </div>
          {/* ไม่ unmount ตอนปิด เพื่อให้หมุดผลค้นหาไม่หาย */}
          <div ref={searchRef} className={`absolute inset-x-0 top-full z-50 px-3 pt-2 ${searchOpen ? "" : "hidden"}`}>
            <SearchBox mapRef={p.mapRef} className="relative w-full" onPicked={() => setSearchOpen(false)} />
          </div>
        </>
      )}

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
