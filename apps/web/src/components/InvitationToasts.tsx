import type { Invitation } from "../api";

/** การ์ดคำเชิญเข้า group มุมขวาล่าง — ข้อมูลมาจาก useInvitations (ใช้ร่วมกับกระดิ่ง) */
export default function InvitationToasts({
  invitations,
  busyId,
  error,
  onAnswer,
}: {
  invitations: Invitation[];
  busyId: number | null;
  error: string | null;
  onAnswer: (inv: Invitation, action: "accept" | "reject") => void;
}) {
  if (invitations.length === 0 && !error) return null;

  return (
    <div className="fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom,0px))] md:bottom-4 right-4 z-50 w-[min(20rem,calc(100vw-2rem))] space-y-2" aria-live="polite">
      {invitations.map((inv) => (
        <div key={inv.id} className="animate-invite-in bg-white border border-slate-200 rounded-xl shadow-lg p-3">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-teal-700 text-[20px]">group_add</span>
            <p className="flex-1 text-sm text-slate-700">
              <strong className="text-slate-900">{inv.inviterName}</strong> ชวนคุณเข้า{" "}
              <strong className="text-slate-900">{inv.groupName}</strong>
            </p>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 ml-7">ยอมรับแล้วจะย้ายออกจาก group ปัจจุบัน</p>
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => onAnswer(inv, "reject")}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              ปฏิเสธ
            </button>
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => onAnswer(inv, "accept")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
            >
              ยอมรับ
            </button>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 shadow">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
