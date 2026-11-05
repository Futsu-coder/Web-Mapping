import { useState } from "react";
import { emailOf, isValidUsername, normalizeUsername, PASSWORD_MIN } from "../../../shared/auth";
import { signup } from "../api";
import { message } from "../lib/featureMeta";
import { markActive } from "../lib/idleLogout";
import { supabase } from "../lib/supabase";

type Tab = "login" | "signup";

/** หน้าต่าง เข้าสู่ระบบ / สมัคร (username + password) — สำเร็จแล้ว App รู้เองจาก onAuthStateChange */
export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    const name = normalizeUsername(username);
    if (tab === "signup" && !isValidUsername(name)) {
      setError("ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว และห้ามเป็นตัวเลขล้วน");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (tab === "signup") await signup(name, password);
      // ต้องตั้งก่อน login สำเร็จ ไม่งั้นเวลาของบัญชีที่ logout ไปนานแล้วจะทำให้หลุดทันที
      markActive();
      const { error } = await supabase.auth.signInWithPassword({ email: emailOf(name), password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : error.message);
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="เข้าสู่ระบบ"
        className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-slate-200">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 -mb-px ${
                tab === t ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-5 space-y-3">
          {!supabase && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SUPABASE_ANON_KEY) จึงยังเข้าสู่ระบบไม่ได้
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">ชื่อผู้ใช้</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
              maxLength={20}
              className={inputCls}
            />
            {tab === "signup" && (
              <span className="block text-[11px] text-slate-500">a-z, 0-9, _ ยาว 3–20 ตัว (ห้ามเป็นตัวเลขล้วน)</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              required
              minLength={tab === "signup" ? PASSWORD_MIN : undefined}
              className={inputCls}
            />
            {tab === "signup" && (
              <span className="block text-[11px] text-slate-500">อย่างน้อย {PASSWORD_MIN} ตัวอักษร</span>
            )}
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              ⚠️ {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy || !supabase}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "กำลังดำเนินการ…" : tab === "login" ? "เข้าสู่ระบบ" : "สมัครและเข้าสู่ระบบ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
