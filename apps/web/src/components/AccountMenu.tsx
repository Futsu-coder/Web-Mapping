import { useState, type ReactNode } from "react";
import { BellIcon, CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, LogInIcon, LogOutIcon, PencilIcon, UsersIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { invite, leaveGroup, renameGroup, type Me } from "../api";
import { message } from "../lib/featureMeta";
import { ListSkeleton, ProfileMenuSkeleton } from "./LoadingPill";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * บัญชี: ยังไม่ login = ปุ่มเข้าสู่ระบบ / login แล้ว = กระดิ่ง + avatar เปิดเมนู
 * (ชื่อ + UserID คัดลอกได้, group, สมาชิก + ซ่อน feature ของสมาชิก, เชิญ, ออกจาก group, ออกจากระบบ)
 * ตำแหน่งบนจอให้ parent จัดเอง
 */
export default function AccountMenu({
  me,
  hiddenOwners,
  onToggleOwner,
  onLogin,
  onLogout,
  onRefresh,
  bell,
  loading = false,
  failed = false,
  className,
}: {
  /** กระดิ่งการแจ้งเตือน (แสดงเมื่อ login แล้ว) */
  bell?: ReactNode;
  me: Me | null;
  /** สมาชิกที่ซ่อน feature ไว้ (ซ่อนแค่บนจอเรา) */
  hiddenOwners: Set<string>;
  onToggleOwner: (userId: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  /** โหลด me ใหม่ (หลังเชิญ / ออกจาก group / เปลี่ยนชื่อ) */
  onRefresh: () => Promise<void>;
  /** ข้อมูลยังโหลดไม่ครบ (บัญชี/feature/layer) → กดเปิดเมนูได้ แต่เนื้อหาเป็น skeleton */
  loading?: boolean;
  /** โหลดไม่สำเร็จ (ค้างเป็นแถบเทา) → ใต้แถบเทามีปุ่มออกจากระบบ */
  failed?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const copyId = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(`#${me.user.userNo}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* เบราว์เซอร์ไม่อนุญาตคลิปบอร์ด — ข้าม */
    }
  };

  // บัญชียังไม่มา: แคปซูลหน้าตาเดียวกับของจริง กระดิ่ง/avatar กดเปิดได้ แต่ข้างในเป็นแถบเทา (ไม่แวบเป็นปุ่มเข้าสู่ระบบ)
  // โครงเดียวกับ branch จริงด้านล่าง (bell → Popover ที่ใช้ open เดียวกัน) เมนูที่เปิดค้างไว้จะไม่ปิดเองตอนบัญชีมา
  if (!me && loading) {
    return (
      <div className={cn("flex h-10 items-center gap-0.5 rounded-full border border-black/5 bg-card p-1 shadow-float", className)}>
        {bell ?? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-full" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
                <BellIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={12} className="menu-drop w-[min(24rem,calc(100vw-1.5rem))] gap-0 rounded-xl border-black/5 p-0 text-sm shadow-float">
              <div className="border-b border-black/5 px-4 py-3 font-semibold">การแจ้งเตือน</div>
              <ListSkeleton loading rows={3} delay={0} className="flex flex-col gap-2 p-3" />
            </PopoverContent>
          </Popover>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-label="บัญชีและกลุ่ม" className="h-8 gap-2 rounded-full pr-3 pl-0">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="hidden h-4 w-20 sm:block" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={12} className="menu-drop w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-xl border-black/5 p-0 text-sm shadow-float">
            <ProfileMenuSkeleton onLogout={failed ? onLogout : undefined} />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
  if (!me) {
    return (
      <Button onClick={onLogin} className={cn("h-10 rounded-full px-4 shadow-float", className)}>
        <LogInIcon data-icon="inline-start" />
        เข้าสู่ระบบ
      </Button>
    );
  }

  const isOwner = me.group.ownerId === me.user.id;
  const confirmLeave = async () => {
    setLeaveError(null);
    try {
      await leaveGroup();
      await onRefresh();
      setLeaveOpen(false);
      setOpen(false);
    } catch (err) {
      setLeaveError(message(err));
    }
  };

  return (
    <div className={cn("flex h-10 items-center gap-0.5 rounded-full border border-black/5 bg-card p-1 shadow-float", className)}>
      {bell}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) void onRefresh();
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="บัญชีและกลุ่ม" className="h-8 gap-2 rounded-full pr-3 pl-0">
            {loading ? (
              // บัญชีมาแล้วแต่ยังรอข้อมูลอื่น → แถบเทาต่อ (โผล่ชื่อจริงพร้อมส่วนอื่นเมื่อโหลดครบ)
              <>
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
              </>
            ) : (
              <>
                <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {me.user.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{me.user.username}</span>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={12} className="menu-drop w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-xl border-black/5 p-0 text-sm shadow-float">
          {loading ? (
            <ProfileMenuSkeleton onLogout={failed ? onLogout : undefined} />
          ) : (
            <GroupMenu
              me={me}
              isOwner={isOwner}
              hiddenOwners={hiddenOwners}
              onToggleOwner={onToggleOwner}
              onRefresh={onRefresh}
              onCopyId={copyId}
              copied={copied}
              onAskLeave={() => {
                setLeaveError(null);
                setLeaveOpen(true);
              }}
              onLogout={onLogout}
            />
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ออกจาก &quot;{me.group.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>feature ที่คุณวาดไว้จะอยู่กับ group นี้ต่อ</AlertDialogDescription>
          </AlertDialogHeader>
          {leaveError && (
            <p role="alert" className="text-sm text-destructive">
              {leaveError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // รอผลก่อนปิด เพื่อโชว์ error ได้
                void confirmLeave();
              }}
            >
              ออกจาก group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GroupMenu({
  me,
  isOwner,
  hiddenOwners,
  onToggleOwner,
  onRefresh,
  onCopyId,
  copied,
  onAskLeave,
  onLogout,
}: {
  me: Me;
  isOwner: boolean;
  hiddenOwners: Set<string>;
  onToggleOwner: (userId: string) => void;
  onRefresh: () => Promise<void>;
  onCopyId: () => Promise<void>;
  copied: boolean;
  onAskLeave: () => void;
  onLogout: () => void;
}) {
  const [target, setTarget] = useState("");
  const [groupName, setGroupName] = useState(me.group.name);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNote(null);
    try {
      const text = await fn();
      if (text) setNote({ ok: true, text });
    } catch (err) {
      setNote({ ok: false, text: message(err) });
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    void run(async () => {
      const r = await invite(target);
      setTarget("");
      return `ส่งคำเชิญถึง ${r.username} (#${r.userNo}) แล้ว`;
    });
  };

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await renameGroup(groupName);
      await onRefresh();
      setRenaming(false);
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{me.user.username}</div>
          <button
            type="button"
            onClick={() => void onCopyId()}
            title="คัดลอก UserID ไว้ให้คนอื่นเชิญเรา"
            className="mt-0.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-accent"
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
            {copied ? "คัดลอกแล้ว" : `#${me.user.userNo}`}
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOutIcon data-icon="inline-start" />
          ออกจากระบบ
        </Button>
      </div>

      <div className="border-b border-black/5 px-4 py-3">
        {renaming ? (
          <form onSubmit={saveName} className="flex gap-1.5">
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={50} autoFocus aria-label="ชื่อ group" />
            <Button type="submit" disabled={busy || !groupName.trim()}>
              บันทึก
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <UsersIcon className="size-4 text-primary" />
            <span className="truncate font-semibold">{me.group.name}</span>
            {isOwner && (
              <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label="เปลี่ยนชื่อ group" onClick={() => setRenaming(true)}>
                <PencilIcon />
              </Button>
            )}
          </div>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isOwner ? "คุณเป็นเจ้าของ group แก้/ลบ feature ของทุกคนได้" : "แก้/ลบได้เฉพาะ feature ของคุณ"}
        </p>
      </div>

      <ul className="max-h-60 overflow-y-auto py-1">
        {me.members.map((m) => {
          const self = m.id === me.user.id;
          const hidden = hiddenOwners.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-2 px-4 py-1">
              <span className="min-w-0 flex-1 truncate">
                {m.id === me.group.ownerId && "👑 "}
                {m.username}
                <span className="ml-1 font-mono text-xs text-muted-foreground">#{m.userNo}</span>
                {self && <span className="ml-1 text-xs text-primary">(คุณ)</span>}
              </span>
              {!self && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8", hidden && "text-muted-foreground")}
                  onClick={() => onToggleOwner(m.id)}
                  title={hidden ? "แสดง feature ของคนนี้" : "ซ่อน feature ของคนนี้ (เฉพาะจอคุณ)"}
                  aria-label={hidden ? "แสดง feature ของคนนี้" : "ซ่อน feature ของคนนี้"}
                >
                  {hidden ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={sendInvite} className="flex flex-col gap-1.5 border-t border-black/5 px-4 py-3">
        <Label htmlFor="invite-target">เชิญสมาชิก</Label>
        <div className="flex gap-1.5">
          <Input
            id="invite-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="UserID (#1024) หรือ username"
          />
          <Button type="submit" disabled={busy || !target.trim()}>
            เชิญ
          </Button>
        </div>
        {note && (
          <p role="status" className={cn("text-xs", note.ok ? "text-emerald-700" : "text-destructive")}>
            {note.text}
          </p>
        )}
      </form>

      {me.members.length > 1 && (
        <div className="border-t border-black/5 px-4 py-2.5">
          <Button variant="link" className="h-auto p-0 text-xs text-destructive" onClick={onAskLeave} disabled={busy}>
            ออกจาก group
          </Button>
        </div>
      )}
    </>
  );
}
