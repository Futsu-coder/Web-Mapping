import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon, MailIcon, UsersIcon, type LucideIcon } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  clearNotifications,
  listNotifications,
  markNotificationsRead,
  type AppNotification,
  type Invitation,
  type NotificationKind,
} from "../api";
import { message } from "../lib/featureMeta";
import { subscribeNotifications } from "../lib/realtime";

const ICON: Record<NotificationKind, LucideIcon> = {
  invitation: MailIcon,
  member: UsersIcon,
};

/** ข้อความของแต่ละการแจ้งเตือน */
function describe(n: AppNotification) {
  const who = <strong>{n.actorName}</strong>;
  const what = <strong>{n.subject}</strong>;
  switch (`${n.kind}:${n.action}`) {
    case "invitation:invited":
      return <>{who} ชวนคุณเข้า {what}</>;
    case "invitation:accepted":
      return <>{who} ยอมรับคำเชิญเข้า {what}</>;
    case "invitation:rejected":
      return <>{who} ปฏิเสธคำเชิญเข้า {what}</>;
    case "member:joined":
      return <>{who} เข้าร่วม group</>;
    case "member:left":
      return <>{who} ออกจาก group</>;
    case "member:owner":
      return <>คุณเป็นเจ้าของ {what} แทน {who}</>;
    default:
      return <>{who} {n.action} {n.subject}</>;
  }
}

function timeAgo(iso: string) {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "เมื่อสักครู่";
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * กระดิ่งการแจ้งเตือน (อยู่ในกลุ่มบัญชีมุมขวาบน): log การแจ้งเตือนจาก database (เด้งทันทีด้วย Realtime)
 * เปิดแล้วถือว่าอ่านทั้งหมด (รายการที่เพิ่งเห็นยังไฮไลต์อยู่จนกว่าจะปิด)
 */
export default function NotificationBell({
  userId,
  invitations,
  busyInvitationId,
  onAnswer,
}: {
  userId: string;
  /** คำเชิญที่ยังรอตอบ — ตอบจากในกระดิ่งได้เลย */
  invitations: Invitation[];
  busyInvitationId: number | null;
  onAnswer: (inv: Invitation, action: "accept" | "reject") => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const openRef = useRef(false);
  /** ถือว่าอ่านแล้วทั้งหมด: บอก server + จำ id ที่เพิ่งเห็นไว้ไฮไลต์ */
  const readAll = useCallback((list: AppNotification[]) => {
    const unreadIds = list.filter((n) => !n.readAt).map((n) => n.id);
    if (!unreadIds.length) return list;
    setFresh((s) => new Set([...s, ...unreadIds]));
    setUnread(0);
    markNotificationsRead().catch((err) => setError(message(err)));
    const now = new Date().toISOString();
    return list.map((n) => (n.readAt ? n : { ...n, readAt: now }));
  }, []);

  const load = useCallback(() => {
    listNotifications()
      .then((r) => {
        // เปิดค้างไว้แล้วมีรายการใหม่เข้ามา → อ่านแล้วทันที
        if (openRef.current) {
          setItems(readAll(r.items));
        } else {
          setItems(r.items);
          setUnread(r.unread);
        }
      })
      .catch((err) => setError(message(err)));
  }, [readAll]);

  useEffect(() => {
    load();
    return subscribeNotifications(userId, load);
  }, [userId, load]);

  // เปิด = ถือว่าอ่านทั้งหมด / ปิด = เลิกไฮไลต์รายการที่เพิ่งเห็น
  const onOpenChange = (next: boolean) => {
    openRef.current = next;
    if (next) setItems(readAll(items));
    else setFresh(new Set());
    setOpen(next);
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const clearAll = () => {
    clearNotifications()
      .then(() => {
        setItems([]);
        setUnread(0);
        setConfirmClear(false);
      })
      .catch((err) => {
        setError(message(err));
        setConfirmClear(false);
      });
  };

  const pending = new Map(invitations.map((inv) => [inv.id, inv]));

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative size-10 rounded-full"
            title="การแจ้งเตือน"
            aria-label={unread ? `การแจ้งเตือน (ยังไม่อ่าน ${unread})` : "การแจ้งเตือน"}
          >
            <BellIcon />
            {unread > 0 && (
              <span className="absolute top-1 right-1 h-4 min-w-4 rounded-full bg-red-600 px-1 text-center text-[0.625rem] leading-4 font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="flex max-h-[70vh] w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-0 rounded-xl p-0 text-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">การแจ้งเตือน</span>
            {items.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmClear(true)}>
                ล้างทั้งหมด
              </Button>
            )}
          </div>

          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-muted-foreground">ยังไม่มีการแจ้งเตือน</li>}
            {items.map((n) => {
              const inv = n.kind === "invitation" && n.action === "invited" && n.refId !== null ? pending.get(n.refId) : undefined;
              const Icon = ICON[n.kind];
              return (
                <li key={n.id} className={cn("flex gap-3 px-4 py-2.5", fresh.has(n.id) && "bg-primary/10")}>
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p>{describe(n)}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    {inv && (
                      <div className="mt-1.5 flex gap-2">
                        <Button size="sm" disabled={busyInvitationId === inv.id} onClick={() => onAnswer(inv, "accept")}>
                          ยอมรับ
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyInvitationId === inv.id} onClick={() => onAnswer(inv, "reject")}>
                          ปฏิเสธ
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {error && (
            <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ล้างการแจ้งเตือนทั้งหมด?</AlertDialogTitle>
            <AlertDialogDescription>ลบแล้วเรียกคืนไม่ได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clearAll();
              }}
            >
              ล้างทั้งหมด
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
