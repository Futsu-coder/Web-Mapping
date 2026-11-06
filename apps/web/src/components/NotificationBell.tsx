import { useCallback, useEffect, useRef, useState } from "react";
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

const ICON: Record<NotificationKind, string> = {
  invitation: "mail",
  member: "group",
};

/** ข้อความของแต่ละการแจ้งเตือน */
function describe(n: AppNotification) {
  const who = <strong className="text-slate-900">{n.actorName}</strong>;
  const what = <strong className="text-slate-900">{n.subject}</strong>;
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
 * กระดิ่งใน Navbar: log การแจ้งเตือนจาก database (เด้งทันทีด้วย Realtime)
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** ตำแหน่งใต้ไอคอนกระดิ่ง: ขอบซ้าย panel เริ่มที่ไอคอนแล้วกางไปทางขวา */
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const measure = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.left, top: r.bottom + 4 });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

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

  const toggle = () => {
    openRef.current = !open;
    if (!open) measure();
    if (open) setFresh(new Set());
    else setItems(readAll(items));
    setOpen(!open);
  };

  const clearAll = () => {
    if (!window.confirm("ล้างการแจ้งเตือนทั้งหมด?")) return;
    clearNotifications()
      .then(() => {
        setItems([]);
        setUnread(0);
      })
      .catch((err) => setError(message(err)));
  };

  const pending = new Map(invitations.map((inv) => [inv.id, inv]));

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title="การแจ้งเตือน"
        aria-label={unread ? `การแจ้งเตือน (ยังไม่อ่าน ${unread})` : "การแจ้งเตือน"}
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-4 text-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={toggle} />
          <div
            className={`z-50 bg-white border border-slate-200 rounded-xl shadow-xl text-sm flex flex-col max-h-[70vh] ${
              anchor ? "fixed" : "absolute left-0 top-11 w-[min(24rem,calc(100vw-2rem))]"
            }`}
            style={
              anchor
                ? { left: anchor.left, top: anchor.top, width: `min(24rem, calc(100vw - ${anchor.left}px - 8px))` }
                : undefined
            }
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <span className="font-semibold text-slate-900">การแจ้งเตือน</span>
              {items.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs text-slate-500 hover:text-red-700">
                  ล้างทั้งหมด
                </button>
              )}
            </div>

            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
              {items.length === 0 && <li className="px-4 py-8 text-center text-slate-500">ยังไม่มีการแจ้งเตือน</li>}
              {items.map((n) => {
                const inv = n.kind === "invitation" && n.action === "invited" && n.refId !== null ? pending.get(n.refId) : undefined;
                return (
                  <li key={n.id} className={`flex gap-3 px-4 py-2.5 ${fresh.has(n.id) ? "bg-teal-50/70" : ""}`}>
                    <span className="material-symbols-outlined text-[20px] text-teal-700 mt-0.5">{ICON[n.kind]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700">{describe(n)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                      {inv && (
                        <div className="flex gap-2 mt-1.5">
                          <button
                            type="button"
                            disabled={busyInvitationId === inv.id}
                            onClick={() => onAnswer(inv, "accept")}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            ยอมรับ
                          </button>
                          <button
                            type="button"
                            disabled={busyInvitationId === inv.id}
                            onClick={() => onAnswer(inv, "reject")}
                            className="px-2.5 py-1 rounded-lg text-xs text-slate-600 border border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {error && (
              <p role="alert" className="px-4 py-2 text-xs text-red-800 bg-red-50 border-t border-red-200">
                ⚠️ {error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
