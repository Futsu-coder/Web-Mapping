import { useState, type ReactNode } from "react";
import { invite, leaveGroup, renameGroup, type Me } from "../api";
import { message } from "../lib/featureMeta";

/**
 * แถบบน: ยังไม่ login = ปุ่มเข้าสู่ระบบ / login แล้ว = ชื่อ, UserID (คัดลอกได้), เมนู group, ออกจากระบบ
 */
export default function Navbar({
  me,
  hiddenOwners,
  onToggleOwner,
  onLogin,
  onLogout,
  onRefresh,
  bell,
  search,
}: {
  /** ปุ่มค้นหาบนมือถือ (วางก่อนกระดิ่ง) */
  search?: ReactNode;
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    if (!me) return;
    await navigator.clipboard.writeText(`#${me.user.userNo}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isOwner = me?.group.ownerId === me?.user.id;

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center gap-2 z-40 relative">
      <span className="flex items-center justify-center w-8 h-8 rounded-md bg-teal-700 text-white">
        <span className="material-symbols-outlined text-[18px]">map</span>
      </span>
      <span className={`font-semibold text-slate-900 tracking-tight ${me ? "hidden sm:inline" : ""}`}>Web Mapping</span>

      <div className="ml-auto flex items-center gap-2">
        {search}
        {!me ? (
          <button
            type="button"
            onClick={onLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-700 text-white hover:bg-teal-800"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            เข้าสู่ระบบ
          </button>
        ) : (
          <>
            {bell}
            <button
              type="button"
              onClick={() => {
                setMenuOpen((o) => !o);
                if (!menuOpen) void onRefresh();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-700 border border-slate-200 hover:bg-slate-50 max-w-[35vw] sm:max-w-[45vw]"
              aria-expanded={menuOpen}
            >
              <span className="material-symbols-outlined text-[18px] text-teal-700">groups</span>
              <span className="truncate">
                {isOwner && "👑 "}
                {me.group.name}
              </span>
              <span className="text-xs text-slate-400 shrink-0">({me.members.length})</span>
            </button>

            <div className="hidden sm:flex items-center gap-1 text-sm text-slate-700">
              <span className="font-medium">{me.user.username}</span>
              <button
                type="button"
                onClick={() => void copyId()}
                title="คัดลอก UserID ไว้ให้คนอื่นเชิญเรา"
                className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-600 hover:bg-teal-50 hover:text-teal-800"
              >
                {copied ? "คัดลอกแล้ว ✓" : `#${me.user.userNo}`}
              </button>
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </>
        )}
      </div>

      {me && menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <GroupMenu
            me={me}
            isOwner={isOwner}
            hiddenOwners={hiddenOwners}
            onToggleOwner={onToggleOwner}
            onRefresh={onRefresh}
            onCopyId={copyId}
            copied={copied}
          />
        </>
      )}
    </header>
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
}: {
  me: Me;
  isOwner: boolean;
  hiddenOwners: Set<string>;
  onToggleOwner: (userId: string) => void;
  onRefresh: () => Promise<void>;
  onCopyId: () => Promise<void>;
  copied: boolean;
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

  const leave = () => {
    if (!window.confirm(`ออกจาก "${me.group.name}"? feature ที่คุณวาดไว้จะอยู่กับ group นี้ต่อ`)) return;
    void run(async () => {
      await leaveGroup();
      await onRefresh();
    });
  };

  return (
    <div className="absolute right-4 top-14 mt-1 z-50 w-[min(22rem,calc(100vw-2rem))] bg-white border border-slate-200 rounded-xl shadow-xl text-sm">
      <div className="px-4 py-3 border-b border-slate-200">
        {renaming ? (
          <form onSubmit={saveName} className="flex gap-1.5">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
              autoFocus
              className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-teal-700"
            />
            <button type="submit" disabled={busy || !groupName.trim()} className="px-2 py-1 rounded bg-teal-700 text-white text-xs disabled:opacity-50">
              บันทึก
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 truncate">{me.group.name}</span>
            {isOwner && (
              <button
                type="button"
                title="เปลี่ยนชื่อ group"
                aria-label="เปลี่ยนชื่อ group"
                onClick={() => setRenaming(true)}
                className="text-slate-400 hover:text-teal-700"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-0.5">
          {isOwner ? "คุณเป็นเจ้าของ group — แก้/ลบ feature ของทุกคนได้" : "แก้/ลบได้เฉพาะ feature ของคุณ"}
        </p>
        <button type="button" onClick={() => void onCopyId()} className="sm:hidden mt-1 text-xs text-teal-700">
          UserID ของคุณ: #{me.user.userNo} {copied ? "✓" : "(แตะเพื่อคัดลอก)"}
        </button>
      </div>

      <ul className="max-h-60 overflow-y-auto py-1">
        {me.members.map((m) => {
          const self = m.id === me.user.id;
          const hidden = hiddenOwners.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-2 px-4 py-1.5">
              <span className="flex-1 min-w-0 truncate">
                {m.id === me.group.ownerId && "👑 "}
                {m.username}
                <span className="ml-1 font-mono text-xs text-slate-400">#{m.userNo}</span>
                {self && <span className="ml-1 text-xs text-teal-700">(คุณ)</span>}
              </span>
              {!self && (
                <button
                  type="button"
                  onClick={() => onToggleOwner(m.id)}
                  title={hidden ? "แสดง feature ของคนนี้" : "ซ่อน feature ของคนนี้ (เฉพาะจอคุณ)"}
                  aria-label={hidden ? "แสดง feature ของคนนี้" : "ซ่อน feature ของคนนี้"}
                  className={`p-1 rounded ${hidden ? "text-slate-400" : "text-teal-700 hover:bg-slate-100"}`}
                >
                  <span className="material-symbols-outlined text-[18px]">{hidden ? "visibility_off" : "visibility"}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={sendInvite} className="px-4 py-3 border-t border-slate-200 space-y-1.5">
        <label htmlFor="invite-target" className="text-xs font-semibold text-slate-600">
          เชิญสมาชิก
        </label>
        <div className="flex gap-1.5">
          <input
            id="invite-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="UserID (#1024) หรือ username"
            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-700"
          />
          <button
            type="submit"
            disabled={busy || !target.trim()}
            className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium disabled:opacity-50"
          >
            เชิญ
          </button>
        </div>
        {note && (
          <p role="status" className={`text-xs ${note.ok ? "text-emerald-700" : "text-red-700"}`}>
            {note.ok ? "✓ " : "⚠️ "}
            {note.text}
          </p>
        )}
      </form>

      {me.members.length > 1 && (
        <div className="px-4 py-2.5 border-t border-slate-200">
          <button type="button" onClick={leave} disabled={busy} className="text-xs text-red-700 hover:underline disabled:opacity-50">
            ออกจาก group
          </button>
        </div>
      )}
    </div>
  );
}
