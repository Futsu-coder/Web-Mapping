import { useRef, useState } from "react";
import {
  emailOf,
  isValidUsername,
  normalizeUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_TAKEN,
} from "../../../shared/auth";
import { signup } from "../api";
import { message } from "../lib/featureMeta";
import { markActive } from "../lib/idleLogout";
import { supabase } from "../lib/supabase";

type Tab = "login" | "signup";
type Field = "username" | "password";

const INVALID_LOGIN = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
const NETWORK_ERROR = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
const RATE_LIMITED = "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";

/** ตรวจฟอร์มเองแทน tooltip ของเบราว์เซอร์ — คืนช่องแรกที่ผิดพร้อมข้อความ */
function validate(tab: Tab, name: string, password: string): { field: Field; msg: string } | null {
  if (!name) return { field: "username", msg: "กรุณากรอกชื่อผู้ใช้" };
  if (tab === "signup" && !isValidUsername(name))
    return { field: "username", msg: "ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว และห้ามเป็นตัวเลขล้วน" };
  if (!password) return { field: "password", msg: "กรุณากรอกรหัสผ่าน" };
  if (tab === "signup" && password.length < PASSWORD_MIN)
    return { field: "password", msg: `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัวอักษร` };
  if (tab === "signup" && password.length > PASSWORD_MAX)
    return { field: "password", msg: `รหัสผ่านต้องไม่เกิน ${PASSWORD_MAX} ตัวอักษร` };
  return null;
}

/** หน้าต่าง เข้าสู่ระบบ / สมัคร (username + password) — สำเร็จแล้ว App รู้เองจาก onAuthStateChange */
export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<Field | null>(null);

  // ปิดเฉพาะเมื่อ "กดและปล่อย" บนพื้นหลังเอง — ลากเมาส์จากในช่องออกมานอกกล่องต้องไม่ปิด
  const downOnBackdrop = useRef(false);

  const clearError = () => {
    setError(null);
    setErrorField(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    const name = normalizeUsername(username);
    const invalid = validate(tab, name, password);
    if (invalid) {
      setError(invalid.msg);
      setErrorField(invalid.field);
      document.getElementById(invalid.field === "username" ? "auth-username" : "auth-password")?.focus();
      return;
    }
    setBusy(true);
    clearError();
    try {
      if (tab === "signup") {
        try {
          await signup(name, password);
        } catch (err) {
          const msg = message(err);
          if (msg === USERNAME_TAKEN) setErrorField("username");
          // fetch ล้ม (เน็ตหลุด) หรือ server/proxy ตอบ 5xx → ข้อความไทยแทนข้อความดิบ
          if (err instanceof TypeError || /^5\d\d\b/.test(msg)) throw new Error(NETWORK_ERROR, { cause: err });
          throw err;
        }
        // บัญชีสร้างแล้ว — ถ้าล็อกอินต่อพัง ผู้ใช้กดเข้าสู่ระบบซ้ำได้เลย ไม่ต้องสมัครใหม่
        setTab("login");
      }
      // ต้องตั้งก่อน login สำเร็จ ไม่งั้นเวลาของบัญชีที่ logout ไปนานแล้วจะทำให้หลุดทันที
      markActive();
      const { error } = await supabase.auth.signInWithPassword({ email: emailOf(name), password });
      if (error) {
        if (error.status === 429) throw new Error(RATE_LIMITED);
        if (error.name === "AuthRetryableFetchError") throw new Error(NETWORK_ERROR);
        const invalid = error.message === "Invalid login credentials";
        if (invalid) setErrorField("password");
        throw new Error(invalid ? INVALID_LOGIN : error.message);
      }
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls = (f: Field) =>
    `block w-full pl-10 py-2 sm:py-2.5 rounded-xl text-base md:text-sm text-slate-800 placeholder-slate-400 outline-none transition-all duration-150 ${
      f === "password" ? "pr-10" : "pr-3.5"
    } ${
      errorField === f
        ? "border border-rose-500 ring-[3px] ring-rose-500/20 bg-rose-50/20"
        : "border border-slate-300 bg-white focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
    }`;
  // flex ต้องอยู่บน div ครอบ — .material-symbols-outlined ตั้ง display:inline-block ซึ่งชนะ utility ของ Tailwind
  const iconWrapCls = "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400";
  const isLogin = tab === "login";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3 sm:p-4"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="w-full max-w-[420px] max-h-full overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100"
      >
        <div className="pt-5 px-5 pb-2 text-center sm:pt-6 sm:px-6">
          <div className="mx-auto flex items-center justify-center w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 ring-4 ring-teal-50/50 mb-2.5 sm:w-12 sm:h-12 sm:ring-8 sm:mb-3.5">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">map</span>
          </div>
          <h2 id="auth-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </h2>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            {isLogin
              ? "เข้าสู่ระบบเพื่อจัดการและบันทึกข้อมูลเชิงพื้นที่ของคุณ"
              : "เริ่มต้นสร้างและจัดการข้อมูลแผนที่ของคุณ"}
          </p>
        </div>

        <div className="px-5 pt-3 sm:px-6 sm:pt-4">
          <div className="grid grid-cols-2 border-b border-slate-200">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={busy}
                onClick={() => {
                  setTab(t);
                  clearError();
                }}
                className={`relative pb-2.5 sm:pb-3 text-sm text-center transition-colors disabled:cursor-not-allowed ${
                  tab === t ? "font-semibold text-teal-700" : "font-medium text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
                {tab === t && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-teal-700 rounded-full" />}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} noValidate className="p-5 pt-4 space-y-3 sm:p-6 sm:pt-5 sm:space-y-4">
          {!supabase && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SUPABASE_ANON_KEY) จึงยังเข้าสู่ระบบไม่ได้
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
            >
              <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0">warning</span>
              <div className="flex-1 leading-relaxed">
                <span className="font-medium">{isLogin ? "เข้าสู่ระบบไม่สำเร็จ:" : "สมัครสมาชิกไม่สำเร็จ:"}</span>{" "}
                {error}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="auth-username" className="block text-sm font-semibold text-slate-700">
              ชื่อผู้ใช้
            </label>
            <div className="relative">
              <div className={iconWrapCls}>
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
              <input
                id="auth-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorField === "username") clearError();
                }}
                autoFocus
                autoComplete="username"
                required
                maxLength={20}
                placeholder={isLogin ? "กรอกชื่อผู้ใช้" : "กรอกชื่อผู้ใช้ของคุณ"}
                aria-invalid={errorField === "username"}
                className={inputCls("username")}
              />
            </div>
            {!isLogin && (
              <p className="text-xs text-slate-500 leading-relaxed pt-0.5">
                a-z, 0-9, _ ยาว 3–20 ตัว (ห้ามเป็นตัวเลขล้วน)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="block text-sm font-semibold text-slate-700">
              รหัสผ่าน
            </label>
            <div className="relative">
              <div className={iconWrapCls}>
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </div>
              <input
                id="auth-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorField === "password") clearError();
                }}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={isLogin ? undefined : PASSWORD_MIN}
                maxLength={isLogin ? undefined : PASSWORD_MAX}
                placeholder={isLogin ? "กรอกรหัสผ่านของคุณ" : "กรอกรหัสผ่าน"}
                aria-invalid={errorField === "password"}
                className={inputCls("password")}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[18px]">{showPw ? "visibility_off" : "visibility"}</span>
              </button>
            </div>
            {!isLogin && (
              <p className="text-xs text-slate-500 leading-relaxed pt-0.5">อย่างน้อย {PASSWORD_MIN} ตัวอักษร</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 sm:py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy || !supabase}
              className="h-10 sm:h-[46px] px-5 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold bg-teal-700 text-white shadow-md shadow-teal-700/20 hover:bg-teal-800 active:bg-teal-900 transition-all disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>{isLogin ? "กำลังเข้าสู่ระบบ..." : "กำลังสมัคร..."}</span>
                </>
              ) : isLogin ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  <span>เข้าสู่ระบบ</span>
                </>
              ) : (
                <span>สมัครและเข้าสู่ระบบ</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
