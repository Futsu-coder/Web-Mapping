import { useState } from "react";
import { EyeIcon, EyeOffIcon, Loader2Icon, LockIcon, LogInIcon, TriangleAlertIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

  const invalidCls = "border-destructive ring-[3px] ring-destructive/20 focus-visible:border-destructive";
  const isLogin = tab === "login";

  return (
    // Radix Dialog จัดการ Esc / focus trap / ปิดเมื่อกดพื้นหลังให้ (กด-ปล่อยบนพื้นหลังเอง)
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[calc(100%-1.5rem)] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[26.25rem]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("auth-username")?.focus();
        }}
      >
        <DialogHeader className="items-center px-6 pt-6 pb-2 text-center sm:text-center">
          <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LogInIcon className="size-6" />
          </div>
          <DialogTitle className="text-xl font-bold">{isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isLogin ? "เข้าสู่ระบบเพื่อจัดการและบันทึกข้อมูลเชิงพื้นที่ของคุณ" : "เริ่มต้นสร้างและจัดการข้อมูลแผนที่ของคุณ"}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(t) => {
            setTab(t as Tab);
            clearError();
          }}
          className="px-6 pt-3"
        >
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="login" disabled={busy} className="h-9">
              เข้าสู่ระบบ
            </TabsTrigger>
            <TabsTrigger value="signup" disabled={busy} className="h-9">
              สมัครสมาชิก
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6 pt-5">
          {!supabase && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SUPABASE_ANON_KEY) จึงยังเข้าสู่ระบบไม่ได้
            </p>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <TriangleAlertIcon className="size-4.5 shrink-0 text-red-600" />
              <div className="flex-1 leading-relaxed">
                <span className="font-medium">{isLogin ? "เข้าสู่ระบบไม่สำเร็จ:" : "สมัครสมาชิกไม่สำเร็จ:"}</span> {error}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-username">ชื่อผู้ใช้</Label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorField === "username") clearError();
                }}
                autoComplete="username"
                required
                maxLength={20}
                placeholder={isLogin ? "กรอกชื่อผู้ใช้" : "กรอกชื่อผู้ใช้ของคุณ"}
                aria-invalid={errorField === "username"}
                className={cn("h-11 pl-10 text-base md:text-sm", errorField === "username" && invalidCls)}
              />
            </div>
            {!isLogin && <p className="text-xs text-muted-foreground">a-z, 0-9, _ ยาว 3–20 ตัว (ห้ามเป็นตัวเลขล้วน)</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password">รหัสผ่าน</Label>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
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
                className={cn("h-11 px-10 text-base md:text-sm", errorField === "password" && invalidCls)}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOffIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}
              </button>
            </div>
            {!isLogin && <p className="text-xs text-muted-foreground">อย่างน้อย {PASSWORD_MIN} ตัวอักษร</p>}
          </div>

          <DialogFooter className="flex-row items-center justify-end gap-3 border-t pt-4 sm:justify-end">
            <Button type="button" variant="ghost" className="h-11" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={busy || !supabase} className="h-11 px-5">
              {busy ? (
                <>
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                  {isLogin ? "กำลังเข้าสู่ระบบ..." : "กำลังสมัคร..."}
                </>
              ) : isLogin ? (
                <>
                  <LogInIcon data-icon="inline-start" />
                  เข้าสู่ระบบ
                </>
              ) : (
                "สมัครและเข้าสู่ระบบ"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
